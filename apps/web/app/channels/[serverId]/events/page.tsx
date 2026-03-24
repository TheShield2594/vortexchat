import { redirect, notFound } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { EventsCalendar } from "@/components/events/events-calendar"
import { hasPermission } from "@vortex/shared"

export default async function ServerEventsPage({ params: paramsPromise }: { params: Promise<{ serverId: string }> }) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const [{ data: member }, { data: server }, { data: channels }, { data: roles }] = await Promise.all([
    supabase
      .from("server_members")
      .select("server_id")
      .eq("server_id", params.serverId)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("servers")
      .select("owner_id")
      .eq("id", params.serverId)
      .single(),
    supabase
      .from("channels")
      .select("id,name,type")
      .eq("server_id", params.serverId),
    supabase
      .from("roles")
      .select("permissions")
      .eq("server_id", params.serverId)
      .in("id", (
        await supabase
          .from("member_roles")
          .select("role_id")
          .eq("user_id", user.id)
      ).data?.map((r) => r.role_id) ?? []),
  ])

  if (!member) notFound()

  const isOwner = server?.owner_id === user.id
  const userPermissions = (roles ?? []).reduce((acc, r) => acc | r.permissions, 0)
  const canManageEvents = isOwner || hasPermission(userPermissions, "MANAGE_EVENTS")

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950">
      <EventsCalendar serverId={params.serverId} channels={channels ?? []} canManageEvents={canManageEvents} currentUserId={user.id} />
    </main>
  )
}
