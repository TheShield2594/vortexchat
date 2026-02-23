import { redirect, notFound } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { EventsCalendar } from "@/components/events/events-calendar"

export default async function ServerEventsPage({ params: paramsPromise }: { params: Promise<{ serverId: string }> }) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: member } = await supabase
    .from("server_members")
    .select("server_id")
    .eq("server_id", params.serverId)
    .eq("user_id", user.id)
    .single()

  if (!member) notFound()

  const { data: channels } = await supabase
    .from("channels")
    .select("id,name")
    .eq("server_id", params.serverId)

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950">
      <EventsCalendar serverId={params.serverId} channels={channels ?? []} />
    </main>
  )
}
