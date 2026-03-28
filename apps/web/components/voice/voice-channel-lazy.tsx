"use client"

import dynamic from "next/dynamic"

/** Client-side lazy wrapper for VoiceChannel — keeps the ~600 KB livekit-client
 *  dependency out of the initial JS bundle by disabling SSR. */
export const VoiceChannelLazy = dynamic(
  () => import("@/components/voice/voice-channel").then((m) => m.VoiceChannel),
  { ssr: false },
)
