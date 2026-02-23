import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getMemberPermissions, hasPermission } from "@/lib/permissions"
import type { Database } from "@/types/database"
import { validateInstallPermissions } from "@/lib/apps/runtime"

async function canManageApps(
  supabase: SupabaseClient<Database>,
  serverId: string,
  userId: string
) {
  const { isAdmin, permissions } = await getMemberPermissions(supabase, serverId, userId)
  return {
    allowed: isAdmin
      || hasPermission(permissions, "MANAGE_WEBHOOKS")
      || hasPermission(permissions, "USE_APPLICATION_COMMANDS"),
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("server_app_installs")
    .select("id, app_id, install_scopes, granted_permissions, installed_at, app_catalog(name, slug, trust_badge)")
    .eq("server_id", serverId)
    .order("installed_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const manager = await canManageApps(supabase, serverId, user.id)
  if (!manager.allowed) return NextResponse.json({ error: "Missing permissions to install apps." }, { status: 403 })

  let parsedBody: { appId?: string; requestedPermissions?: string[] }
  try {
    parsedBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { appId, requestedPermissions } = parsedBody
  if (!appId) return NextResponse.json({ error: "appId required" }, { status: 400 })

  const { data: app, error: appError } = await supabase
    .from("app_catalog")
    .select("id, install_scopes, permissions")
    .eq("id", appId)
    .single()

  if (appError || !app) return NextResponse.json({ error: "App not found" }, { status: 404 })

  const requested = Array.isArray(requestedPermissions) && requestedPermissions.length > 0
    ? requestedPermissions
    : app.permissions

  const isValidPermissions = validateInstallPermissions(requested, app.permissions)
  if (!isValidPermissions) {
    return NextResponse.json({ error: "Invalid permission selection for install." }, { status: 400 })
  }
  const validatedPermissions = requested

  const { data, error } = await supabase
    .from("server_app_installs")
    .insert({
      app_id: app.id,
      server_id: serverId,
      installed_by: user.id,
      install_scopes: app.install_scopes,
      granted_permissions: validatedPermissions,
    })
    .select("id, app_id, install_scopes, granted_permissions, installed_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.rpc("bump_app_usage", {
    p_app_id: app.id,
    p_server_id: serverId,
    p_metric_key: "app.install",
    p_metric_value: 1,
  })

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const manager = await canManageApps(supabase, serverId, user.id)
  if (!manager.allowed) return NextResponse.json({ error: "Missing permissions to uninstall apps." }, { status: 403 })

  const appId = req.nextUrl.searchParams.get("appId")
  if (!appId) return NextResponse.json({ error: "appId required" }, { status: 400 })

  const { error } = await supabase
    .from("server_app_installs")
    .delete()
    .eq("server_id", serverId)
    .eq("app_id", appId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.rpc("bump_app_usage", {
    p_app_id: appId,
    p_server_id: serverId,
    p_metric_key: "app.uninstall",
    p_metric_value: 1,
  })

  return NextResponse.json({ ok: true })
}
