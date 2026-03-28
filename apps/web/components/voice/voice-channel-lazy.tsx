"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { VoiceChannel } from "@/components/voice/voice-channel"

type VoiceChannelProps = ComponentProps<typeof VoiceChannel>

/** Client-side lazy wrapper for VoiceChannel — keeps the ~600 KB livekit-client
 *  dependency out of the initial JS bundle by disabling SSR. */
export const VoiceChannelLazy = dynamic<VoiceChannelProps>(
  () => import("@/components/voice/voice-channel").then((m) => m.VoiceChannel),
  { ssr: false },
)
