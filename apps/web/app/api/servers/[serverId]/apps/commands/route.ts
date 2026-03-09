import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

/**
 * GET /api/servers/[serverId]/apps/commands
 *
 * Returns the list of slash commands available in a server — i.e. commands
 * belonging to apps that are currently installed on the server.
 * Used by the slash-command autocomplete in the message input.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify membership via RLS — if they can query server_app_installs they're a member
  const { data: installs, error: installsError } = await supabase
    .from("server_app_installs")
    .select("app_id")
    .eq("server_id", serverId)

  if (installsError) return NextResponse.json({ error: installsError.message }, { status: 500 })
  if (!installs || installs.length === 0) return NextResponse.json([])

  const appIds = installs.map((i) => i.app_id)

  const { data: commands, error: commandsError } = await supabase
    .from("app_commands")
    .select("id, app_id, command_name, description, app_catalog(name)")
    .in("app_id", appIds)
    .eq("enabled", true)

  if (commandsError) return NextResponse.json({ error: commandsError.message }, { status: 500 })

  const result = (commands ?? []).map((cmd) => ({
    id: cmd.id,
    appId: cmd.app_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appName: (cmd.app_catalog as any)?.name ?? cmd.app_id,
    commandName: cmd.command_name,
    description: cmd.description ?? null,
  }))

  return NextResponse.json(result)
}
