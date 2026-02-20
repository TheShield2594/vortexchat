import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"

interface Props {
  params: Promise<{ serverId: string }>
}

export default async function ServerHomePage({ params }: Props) {
  const { serverId } = await params
  const supabase = await createServerSupabaseClient()

  // Get first text channel in the server
  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("server_id", serverId)
    .eq("type", "text")
    .order("position", { ascending: true })
    .limit(1)
    .single()

  if (channel) {
    redirect(`/channels/${serverId}/${channel.id}`)
  }

  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: '#313338' }}>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-white mb-2">
          No channels yet
        </h2>
        <p style={{ color: '#b5bac1' }} className="text-sm">
          Create a channel to get started
        </p>
      </div>
    </div>
  )
}
