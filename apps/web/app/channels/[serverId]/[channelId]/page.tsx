import { notFound, redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ChatArea } from "@/components/chat/chat-area"
import { VoiceChannel } from "@/components/voice/voice-channel"
import { MemberList } from "@/components/layout/member-list"

interface Props {
  params: Promise<{ serverId: string; channelId: string }>
}

export default async function ChannelPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) redirect("/login")

  // Fetch channel
  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("id", params.channelId)
    .eq("server_id", params.serverId)
    .single()

  if (!channel) notFound()

  // Fetch initial messages (for text channels)
  let messages: any[] = []
  if (channel.type === "text") {
    const { data } = await supabase
      .from("messages")
      .select(`
        *,
        author:users!messages_author_id_fkey(*),
        attachments(*),
        reactions(*)
      `)
      .eq("channel_id", params.channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)

    messages = (data ?? []).reverse()
  }

  if (channel.type === "voice") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <VoiceChannel
          channelId={channel.id}
          channelName={channel.name}
          serverId={params.serverId}
          currentUserId={user.id}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <ChatArea
        channel={channel}
        initialMessages={messages}
        currentUserId={user.id}
        serverId={params.serverId}
      />
      <MemberList serverId={params.serverId} />
    </div>
  )
}
