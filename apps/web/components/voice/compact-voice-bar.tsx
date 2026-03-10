"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { PhoneOff, Volume2 } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/use-toast"

/**
 * Persistent voice session indicator shown above the user panel in the channel
 * sidebar whenever the user is in a voice channel. Allows quick disconnect or
 * return-to-voice navigation without leaving the current text channel.
 */
export function CompactVoiceBar() {
  const { voiceChannelId, voiceServerId, voiceChannelName, setVoiceChannel } = useAppStore(
    useShallow((s) => ({
      voiceChannelId: s.voiceChannelId,
      voiceServerId: s.voiceServerId,
      voiceChannelName: s.voiceChannelName,
      setVoiceChannel: s.setVoiceChannel,
    }))
  )
  const router = useRouter()
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const { toast } = useToast()

  if (!voiceChannelId) return null

  async function handleDisconnect() {
    const userId = useAppStore.getState().currentUser?.id
    if (!userId || !voiceChannelId) return
    try {
      await supabase.from("voice_states").delete().eq("user_id", userId).eq("channel_id", voiceChannelId)
      const sid = useAppStore.getState().voiceServerId
      setVoiceChannel(null, null)
      if (sid) {
        const serverChannels = useAppStore.getState().channels[sid] ?? []
        const textChannel = serverChannels
          .filter((c) => c.type === "text")
          .sort((a, b) => a.position - b.position)[0]
        router.push(textChannel ? `/channels/${sid}/${textChannel.id}` : `/channels/${sid}`)
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to disconnect from voice" })
    }
  }

  return (
    <div className="px-2 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--theme-bg-tertiary)" }}>
      {/* Status line */}
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: "var(--theme-success)" }} />
        <span className="text-xs font-semibold flex-1" style={{ color: "var(--theme-success)" }}>Voice Connected</span>
      </div>
      {/* Channel name + actions */}
      <div className="flex items-center gap-1">
        <Volume2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
        <button
          onClick={() => voiceServerId && router.push(`/channels/${voiceServerId}/${voiceChannelId}`)}
          className="text-xs flex-1 text-left truncate hover:underline"
          style={{ color: "var(--theme-text-secondary)" }}
          title="Return to voice channel"
        >
          {voiceChannelName ?? "Voice channel"}
        </button>
        <button
          onClick={handleDisconnect}
          className="w-6 h-6 rounded flex items-center justify-center surface-hover-danger motion-interactive flex-shrink-0"
          style={{ color: "var(--theme-danger)" }}
          title="Disconnect from voice"
          aria-label="Disconnect from voice"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
