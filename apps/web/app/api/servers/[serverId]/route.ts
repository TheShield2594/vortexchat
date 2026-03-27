import { NextRequest, NextResponse } from "next/server"
import { hasPermission } from "@vortex/shared"
import { aggregateMemberPermissions } from "@/lib/server-auth"
import { detectMimeFromBytes } from "@/lib/attachment-validation"
import { requireAuth, insertAuditLog } from "@/lib/utils/api-helpers"

type Params = { params: Promise<{ serverId: string }> }

/**
 * PATCH /api/servers/[serverId]
 *
 * Editable fields: name, icon (via multipart form), description
 * Permission: server owner OR ADMINISTRATOR
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id, name, description, icon_url")
    .eq("id", serverId)
    .single()

  if (!server)
    return NextResponse.json({ error: "Server not found" }, { status: 404 })

  const isOwner = server.owner_id === user.id

  if (!isOwner) {
    // Check for ADMINISTRATOR permission
    const { data: memberRoles } = await supabase
      .from("member_roles")
      .select("roles(permissions)")
      .eq("user_id", user.id)
      .eq("server_id", serverId)

    const permissions = aggregateMemberPermissions(memberRoles)
    if (!hasPermission(permissions, "ADMINISTRATOR"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const contentType = req.headers.get("content-type") ?? ""
  const isMultipart = contentType.includes("multipart/form-data")

  let name: string | undefined
  let description: string | undefined
  let regenerateInvite = false
  let iconFile: File | null = null

  if (isMultipart) {
    const formData = await req.formData()
    const nameVal = formData.get("name")
    const descVal = formData.get("description")
    const iconVal = formData.get("icon")

    if (nameVal !== null) name = String(nameVal)
    if (descVal !== null) description = String(descVal)
    if (iconVal instanceof File && iconVal.size > 0) iconFile = iconVal
    if (formData.get("regenerate_invite") === "true") regenerateInvite = true
  } else {
    const body = await req.json().catch(() => ({}))
    if ("name" in body) name = String(body.name)
    if ("description" in body) description = String(body.description)
    if (body.regenerate_invite === true) regenerateInvite = true
  }

  const updates: Record<string, unknown> = {}
  const changes: Record<string, { old: unknown; new: unknown }> = {}

  // Validate name
  if (name !== undefined) {
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 100) {
      return NextResponse.json({ error: "name must be 1–100 characters" }, { status: 400 })
    }
    updates.name = trimmed
    changes.name = { old: server.name, new: trimmed }
  }

  // Validate description
  if (description !== undefined) {
    const trimmed = description.trim()
    if (trimmed.length > 1024) {
      return NextResponse.json({ error: "description must be 0–1024 characters" }, { status: 400 })
    }
    updates.description = trimmed || null
    changes.description = { old: server.description, new: trimmed || null }
  }

  // Handle icon upload
  if (iconFile) {
    const ALLOWED_ICON_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"]
    const ALLOWED_ICON_EXTS = ["png", "jpg", "jpeg", "gif", "webp"]
    const MAX_ICON_SIZE = 2 * 1024 * 1024 // 2 MB

    if (!ALLOWED_ICON_TYPES.includes(iconFile.type)) {
      return NextResponse.json({ error: "Icon must be PNG, JPEG, GIF, or WebP" }, { status: 400 })
    }
    const rawExt = (iconFile.name.split(".").pop() ?? "").toLowerCase()
    if (!ALLOWED_ICON_EXTS.includes(rawExt)) {
      return NextResponse.json({ error: "Icon file extension not allowed" }, { status: 400 })
    }
    if (iconFile.size > MAX_ICON_SIZE) {
      return NextResponse.json({ error: "Icon must be 2 MB or smaller" }, { status: 400 })
    }

    // Verify magic bytes match claimed type
    const headerSlice = iconFile.slice(0, 16)
    const headerBytes = new Uint8Array(await headerSlice.arrayBuffer())
    const detectedMime = detectMimeFromBytes(headerBytes)
    if (detectedMime && !ALLOWED_ICON_TYPES.includes(detectedMime)) {
      return NextResponse.json({ error: "Icon file content does not match an allowed image type" }, { status: 400 })
    }

    const ext = rawExt || "png"
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from("server-icons")
      .upload(path, iconFile, { upsert: true })

    if (uploadError)
      return NextResponse.json({ error: `Icon upload failed: ${uploadError.message}` }, { status: 500 })

    const { data: urlData } = supabase.storage
      .from("server-icons")
      .getPublicUrl(path)

    // Delete old icon from storage if one exists
    if (server.icon_url) {
      try {
        const url = new URL(server.icon_url)
        const oldPath = url.pathname.split("/server-icons/").pop()
        if (oldPath) {
          await supabase.storage.from("server-icons").remove([oldPath])
        }
      } catch {
        // Ignore cleanup errors — old file may already be gone
      }
    }

    updates.icon_url = urlData.publicUrl
    changes.icon_url = { old: server.icon_url, new: urlData.publicUrl }
  }

  // Handle invite code regeneration (owner only)
  if (regenerateInvite) {
    if (!isOwner)
      return NextResponse.json({ error: "Only the server owner can regenerate the invite code" }, { status: 403 })

    const newCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
    updates.invite_code = newCode
    changes.invite_code = { old: "[redacted]", new: "[redacted]" }
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })

  const { data: updated, error: dbErr } = await supabase
    .from("servers")
    .update(updates)
    .eq("id", serverId)
    .select()
    .single()

  if (dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Audit log
  await insertAuditLog(supabase, {
    server_id: serverId,
    actor_id: user.id,
    action: "server_update",
    target_id: serverId,
    target_type: "server",
    changes,
  })

  return NextResponse.json(updated)
}

/**
 * DELETE /api/servers/[serverId]
 *
 * Deletes the server and all associated data (channels, messages, roles, etc.).
 * Permission: server owner only
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { serverId } = await params
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  try {
    const { data: server } = await supabase
      .from("servers")
      .select("owner_id, name")
      .eq("id", serverId)
      .single()

    if (!server)
      return NextResponse.json({ error: "Server not found" }, { status: 404 })

    if (server.owner_id !== user.id)
      return NextResponse.json({ error: "Only the server owner can delete the server" }, { status: 403 })

    // Audit log before deletion (so we have a record even if cascade is partial)
    await insertAuditLog(supabase, {
      server_id: serverId,
      actor_id: user.id,
      action: "server_delete",
      target_id: serverId,
      target_type: "server",
      changes: { name: { old: server.name, new: null } },
    })

    // Delete associated data in dependency order
    // Channels, messages, roles, members, invites are cleaned up here
    // to avoid relying solely on DB cascade/triggers
    await supabase.from("messages").delete().eq("server_id", serverId)
    await supabase.from("channels").delete().eq("server_id", serverId)
    await supabase.from("member_roles").delete().eq("server_id", serverId)
    await supabase.from("roles").delete().eq("server_id", serverId)
    await supabase.from("members").delete().eq("server_id", serverId)
    await supabase.from("invites").delete().eq("server_id", serverId)
    await supabase.from("automod_rules").delete().eq("server_id", serverId)
    await supabase.from("screening_config").delete().eq("server_id", serverId)
    await supabase.from("moderation_settings").delete().eq("server_id", serverId)
    await supabase.from("webhooks").delete().eq("server_id", serverId)
    await supabase.from("custom_emojis").delete().eq("server_id", serverId)

    const { error: deleteError } = await supabase
      .from("servers")
      .delete()
      .eq("id", serverId)

    if (deleteError)
      return NextResponse.json({ error: "Failed to delete server" }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete server" }, { status: 500 })
  }
}
