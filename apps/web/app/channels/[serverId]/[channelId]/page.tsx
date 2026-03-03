import { notFound, redirect } from "next/navigation"
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server"
import { ChatArea } from "@/components/chat/chat-area"
import { VoiceChannel } from "@/components/voice/voice-channel"
import { AnnouncementChannel } from "@/components/channels/announcement-channel"
import { ForumChannel } from "@/components/channels/forum-channel"
import { MediaChannel } from "@/components/channels/media-channel"
import { hydrateReplyTo, MESSAGE_PROJECTION } from "@/lib/messages/hydration"
import { computePermissions, hasPermission } from "@vortex/shared"
import type { RoleRow } from "@/types/database"

interface Props {
  params: Promise<{ serverId: string; channelId: string }>
}

/** Channel types that store messages in the messages table */
const MESSAGE_CHANNEL_TYPES = ["text", "announcement", "forum", "media"] as const

/** Channel types that use voice/WebRTC infrastructure */
const VOICE_CHANNEL_TYPES = ["voice", "stage"] as const

/** Server-rendered channel page that fetches channel data, messages, and read-state, then delegates to the appropriate channel-type component. */
export default async function ChannelPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise

  const [supabase, { data: { user }, error }] = await Promise.all([
    createServerSupabaseClient(),
    getAuthUser(),
  ])

  if (error || !user) redirect("/login")

  // Fetch channel, messages, read-state, server ownership, and member roles in parallel
  const [{ data: channel }, { data: messagesData }, { data: readState }, { data: server }, { data: memberRoles }] = await Promise.all([
    supabase
      .from("channels")
      .select("*")
      .eq("id", params.channelId)
      .eq("server_id", params.serverId)
      .single(),
    supabase
      .from("messages")
      .select(MESSAGE_PROJECTION)
      .eq("channel_id", params.channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("read_states")
      .select("last_read_at")
      .eq("user_id", user.id)
      .eq("channel_id", params.channelId)
      .maybeSingle(),
    supabase
      .from("servers")
      .select("owner_id")
      .eq("id", params.serverId)
      .single(),
    supabase
      .from("member_roles")
      .select("role_id, roles(*)")
      .eq("server_id", params.serverId)
      .eq("user_id", user.id),
  ])

  if (!channel) notFound()

  // Compute canManageMessages server-side (avoids 2 client-side Supabase queries)
  const isOwner = server?.owner_id === user.id
  type MemberRoleWithRole = { role_id: string; roles: RoleRow | null }
  const roleBitmasks = ((memberRoles ?? []) as unknown as MemberRoleWithRole[])
    .map((mr) => mr.roles?.permissions ?? 0)
  const effectivePerms = computePermissions(roleBitmasks)
  const canManageMessages = isOwner || hasPermission(effectivePerms, "MANAGE_MESSAGES")

  // Filter messages to only text-based channel types
  let messages: any[] = []
  if ((MESSAGE_CHANNEL_TYPES as readonly string[]).includes(channel.type)) {
    const raw = (messagesData ?? []).reverse()
    messages = await hydrateReplyTo(supabase, raw)
  }

  // Voice and Stage channels use the WebRTC voice infrastructure
  if ((VOICE_CHANNEL_TYPES as readonly string[]).includes(channel.type)) {
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

  // Announcement channels
  if (channel.type === "announcement") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <AnnouncementChannel
          channel={channel}
          initialMessages={messages}
          currentUserId={user.id}
          serverId={params.serverId}
        />
      </div>
    )
  }

  // Forum channels
  if (channel.type === "forum") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <ForumChannel
          channel={channel}
          initialMessages={messages}
          currentUserId={user.id}
          serverId={params.serverId}
        />
      </div>
    )
  }

  // Media channels
  if (channel.type === "media") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <MediaChannel
          channel={channel}
          initialMessages={messages}
          currentUserId={user.id}
          serverId={params.serverId}
        />
      </div>
    )
  }

  // Default: text channel
  const initialLastReadAt = readState?.last_read_at ?? null

  return (
    <div className="flex flex-1 overflow-hidden">
      <ChatArea
        key={channel.id}
        channel={channel}
        initialMessages={messages}
        currentUserId={user.id}
        serverId={params.serverId}
        initialLastReadAt={initialLastReadAt}
        canManageMessages={canManageMessages}
      />
    </div>
  )
}
