"use client"

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"
import { useRouter } from "next/navigation"
import {
  Volume2, Mic, MicOff, Headphones, PhoneOff,
  Monitor, MonitorOff, Video, VideoOff, Radio, Settings,
  RotateCcw, X,
} from "lucide-react"
import { useVoice } from "@/lib/webrtc/use-voice"
import { usePushToTalk } from "@/hooks/use-push-to-talk"
import { useAppStore } from "@/lib/stores/app-store"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import type { UserRow } from "@/types/database"
import { cn } from "@/lib/utils/cn"
import {
  applyPresetToSettings,
  createDefaultAudioSettings,
  withEqBandGain,
  type AudioPreset,
  type VoiceAudioSettings,
} from "@/lib/voice/audio-settings"
import { useVoiceAudioStore } from "@/lib/stores/voice-audio-store"

interface VoiceParticipantInfo {
  user: UserRow
  selfStream: boolean
}

type VoiceSessionTone = "stable" | "listening" | "attention"

const TONE_STYLES: Record<VoiceSessionTone, { dot: string; badgeBg: string; badgeText: string }> = {
  stable: { dot: "#80848e", badgeBg: "rgba(128,132,142,0.18)", badgeText: "#c9ccd1" },
  listening: { dot: "#23a55a", badgeBg: "rgba(35,165,90,0.2)", badgeText: "#9ae6b4" },
  attention: { dot: "#f0b132", badgeBg: "rgba(240,177,50,0.2)", badgeText: "#ffd58a" },
}

function getVoiceSessionState(peerCount: number, speaking: boolean, hasError: boolean): {
  label: string
  detail: string
  tone: VoiceSessionTone
} {
  if (hasError) {
    return {
      label: "Needs attention",
      detail: "Audio setup needs a quick fix",
      tone: "attention",
    }
  }
  if (speaking) {
    return {
      label: "Speaking",
      detail: "Your voice is being sent clearly",
      tone: "listening",
    }
  }
  if (peerCount === 0) {
    return {
      label: "Ready",
      detail: "Waiting for others to join",
      tone: "stable",
    }
  }

  return {
    label: "Connected",
    detail: `Listening with ${peerCount} ${peerCount === 1 ? "person" : "people"}`,
    tone: "stable",
  }
}

interface Props {
  channelId: string
  channelName: string
  serverId: string
  currentUserId: string
}

const MAX_REMOTE_GAIN = 2

const PRESET_OPTIONS: Array<{ label: string; value: AudioPreset }> = [
  { label: "Voice Clarity", value: "voice-clarity" },
  { label: "Bass Boost", value: "bass-boost" },
  { label: "Broadcast", value: "broadcast" },
  { label: "Flat", value: "flat" },
]

function markCustomSettings(settings: VoiceAudioSettings, partial: Partial<VoiceAudioSettings>): VoiceAudioSettings {
  return { ...settings, ...partial, preset: "flat" }
}

export function VoiceChannel({ channelId, channelName, serverId, currentUserId }: Props) {
  const { currentUser, setVoiceChannel, channels } = useAppStore()
  const router = useRouter()
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantInfo[]>([])
  const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null)
  const [pttEnabled, setPttEnabled] = useState(false)
  const supabase = createClientSupabaseClient()

  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const outputAudioContextRef = useRef<AudioContext | null>(null)
  const closeDeviceMenu = useCallback(() => setDeviceMenuOpen(false), [])
  const {
    peers,
    muted,
    deafened,
    speaking,
    screenSharing,
    videoEnabled,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    toggleVideo,
    leaveChannel,
    localStream,
    screenStream,
    cameraStream,
    audioInputDevices,
    audioOutputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
    audioSettings,
    setAudioSettings,
    cpuBypassActive,
    audioInitError,
  } = useVoice(channelId, currentUserId, serverId)

  const { setParticipantVolume, setParticipantPan, getParticipantMix } = useVoiceAudioStore()

  usePushToTalk(
    pttEnabled,
    () => { if (muted) toggleMute() },
    () => { if (!muted) toggleMute() }
  )

  useEffect(() => {
    return () => {
      if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close().catch(() => undefined)
        outputAudioContextRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    async function joinVoiceState() {
      await supabase
        .from("voice_states")
        .upsert({
          user_id: currentUserId,
          channel_id: channelId,
          server_id: serverId,
          muted,
          deafened,
          speaking,
          self_stream: screenSharing,
        })
    }
    joinVoiceState()

    return () => {
      supabase.from("voice_states").delete().eq("user_id", currentUserId).eq("channel_id", channelId).then()
    }
  }, [channelId, currentUserId, serverId])

  useEffect(() => {
    supabase
      .from("voice_states")
      .update({ muted, deafened, speaking, self_stream: screenSharing })
      .eq("user_id", currentUserId)
      .eq("channel_id", channelId)
      .then()
  }, [muted, deafened, speaking, screenSharing])

  useEffect(() => {
    async function fetchParticipants() {
      const { data } = await supabase.from("voice_states").select("user_id, self_stream, users(*)").eq("channel_id", channelId)
      setVoiceParticipants(
        data?.flatMap((d: any) =>
          d.users ? [{ user: d.users as UserRow, selfStream: Boolean(d.self_stream) }] : []
        ) ?? []
      )
    }
    fetchParticipants()

    const channel = supabase
      .channel(`voice:${channelId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "voice_states", filter: `channel_id=eq.${channelId}`,
      }, fetchParticipants)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelId])

  function handleLeave() {
    leaveChannel()
    setVoiceChannel(null, null)
    const serverChannels = channels[serverId] ?? []
    const textChannel = serverChannels
      .filter((c) => c.type === "text")
      .sort((a, b) => a.position - b.position)[0]
    router.push(textChannel ? `/channels/${serverId}/${textChannel.id}` : `/channels/${serverId}`)
  }

  useEffect(() => {
    if (!spotlightUserId) return
    if (spotlightUserId === currentUserId && !screenSharing) {
      setSpotlightUserId(null)
      return
    }
    if (spotlightUserId !== currentUserId) {
      const peerInfo = voiceParticipants.find((p) => p.user.id === spotlightUserId)
      if (peerInfo && !peerInfo.selfStream) {
        setSpotlightUserId(null)
        return
      }
      const stillConnected = peers && Array.from(peers.values()).some((p) => p.userId === spotlightUserId)
      if (!stillConnected) {
        setSpotlightUserId(null)
      }
    }
  }, [spotlightUserId, currentUserId, screenSharing, voiceParticipants, peers])

  const peerArray = peers ? Array.from(peers.entries()) : []
  const hasVideo = videoEnabled || screenSharing || peerArray.some(([, { stream }]) => stream.getVideoTracks().length > 0)
  const sessionState = getVoiceSessionState(peerArray.length, speaking && !muted, Boolean(audioInitError))
  const activeTone = TONE_STYLES[sessionState.tone]

  const isLocalSpotlight = spotlightUserId === currentUserId
  const spotlightPeer = spotlightUserId && !isLocalSpotlight
    ? peerArray.find(([, { userId }]) => userId === spotlightUserId)
    : null
  const inSpotlight = spotlightUserId !== null

  let spotlightStream: MediaStream | null = null
  let spotlightDisplayName = ""
  if (isLocalSpotlight) {
    spotlightStream = screenStream.current
    spotlightDisplayName = currentUser?.display_name || currentUser?.username || "You"
  } else if (spotlightPeer) {
    const [, { stream: peerStream, userId }] = spotlightPeer
    spotlightStream = peerStream
    const info = voiceParticipants.find((p) => p.user.id === userId)
    spotlightDisplayName = info?.user.display_name || info?.user.username || "Unknown"
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col flex-1" style={{ background: "#313338" }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "#1e1f22" }}>
          <Volume2 className="w-5 h-5" style={{ color: "#23a55a" }} />
          <span className="font-semibold text-white">{channelName}</span>
          <div className="ml-1 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: activeTone.badgeBg, color: activeTone.badgeText }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: activeTone.dot }} />
              {sessionState.label}
            </span>
            <span className="text-xs" style={{ color: "#949ba4" }}>{sessionState.detail}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {cpuBypassActive && <span className="text-xs" style={{ color: "#f0b132" }}>CPU bypass enabled</span>}
            {audioInitError && <span className="text-xs" style={{ color: "#f0b132" }}>{audioInitError}</span>}
          </div>
        </div>

        {inSpotlight ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 relative flex items-center justify-center overflow-hidden" style={{ background: "#1e1f22" }}>
              <button
                onClick={() => setSpotlightUserId(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                style={{ background: "rgba(0,0,0,0.6)" }}
              >
                <X className="w-4 h-4 text-white" />
              </button>
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1 rounded-md" style={{ background: "rgba(0,0,0,0.6)" }}>
                <Monitor className="w-3.5 h-3.5" style={{ color: "#23a55a" }} />
                <span className="text-xs text-white">{spotlightDisplayName}&apos;s Screen</span>
              </div>
              <SpotlightVideo stream={spotlightStream} />
            </div>
            <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0" style={{ background: "#2b2d31", borderTop: "1px solid #1e1f22" }}>
              {currentUser && (
                <div className="w-48 flex-shrink-0">
                  <ParticipantTile
                    user={currentUser}
                    speaking={speaking}
                    muted={muted}
                    deafened={deafened}
                    audioStream={localStream.current}
                    cameraStream={videoEnabled ? cameraStream.current : null}
                    screenStream={screenSharing ? screenStream.current : null}
                    isLocal
                    compact
                    onViewStream={screenSharing && spotlightUserId !== currentUserId ? () => setSpotlightUserId(currentUserId) : undefined}
                  />
                </div>
              )}
              {peerArray.map(([peerId, { stream, speaking: pSpeaking, muted: pMuted, userId }]) => {
                const peerInfo = voiceParticipants.find((p) => p.user.id === userId)
                const peerIsScreenSharing = peerInfo?.selfStream ?? false
                return (
                  <div key={peerId} className="w-48 flex-shrink-0">
                    <ParticipantTile
                      user={peerInfo?.user}
                      speaking={pSpeaking}
                      muted={pMuted}
                      deafened={false}
                      audioStream={stream}
                      cameraStream={null}
                      screenStream={null}
                      isLocal={false}
                      remoteStream={stream}
                      compact
                      onViewStream={peerIsScreenSharing && spotlightUserId !== userId ? () => setSpotlightUserId(userId) : undefined}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
            {peerArray.length === 0 && !currentUser ? (
              <div className="text-center">
                <Volume2 className="w-16 h-16 mx-auto mb-4" style={{ color: "#4e5058" }} />
                <p className="text-white text-lg font-semibold mb-1">You&apos;re the only one here</p>
                <p style={{ color: "#949ba4" }} className="text-sm">Invite others to join this voice channel</p>
              </div>
            ) : (
              <div className="grid gap-4 w-full" style={{ gridTemplateColumns: hasVideo ? "repeat(auto-fill, minmax(320px, 1fr))" : "repeat(auto-fill, minmax(200px, 1fr))" }}>
                {currentUser && (
                  <ParticipantTile
                    user={currentUser}
                    speaking={speaking}
                    muted={muted}
                    deafened={deafened}
                    audioStream={localStream.current}
                    cameraStream={videoEnabled ? cameraStream.current : null}
                    screenStream={screenSharing ? screenStream.current : null}
                    isLocal
                    onViewStream={screenSharing ? () => setSpotlightUserId(currentUserId) : undefined}
                  />
                )}
                {peerArray.map(([peerId, { stream, speaking: pSpeaking, muted: pMuted, userId }]) => {
                  const peerInfo = voiceParticipants.find((p) => p.user.id === userId)
                  const peerIsScreenSharing = peerInfo?.selfStream ?? false
                  const mix = getParticipantMix(serverId, userId)
                  return (
                    <ParticipantTile
                      key={peerId}
                      user={peerInfo?.user}
                      speaking={pSpeaking}
                      muted={pMuted}
                      deafened={false}
                      audioStream={stream}
                      cameraStream={null}
                      screenStream={null}
                      isLocal={false}
                      remoteStream={stream}
                      onVolumeChange={(volume) => setParticipantVolume(serverId, userId, volume)}
                      onPanChange={(pan) => setParticipantPan(serverId, userId, pan)}
                      volume={mix.volume}
                      pan={mix.pan}
                      spatialEnabled={audioSettings.spatialAudioEnabled}
                      onViewStream={peerIsScreenSharing ? () => setSpotlightUserId(userId) : undefined}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="h-20 border-t px-6 flex items-center justify-center gap-3" style={{ borderColor: "#1e1f22", background: "#2b2d31" }}>
          <Tooltip><TooltipTrigger asChild><button onClick={toggleMute} className="w-12 h-12 rounded-full flex items-center justify-center transition-colors" style={{ background: muted ? "#f23f43" : "#4e5058" }}>{muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}</button></TooltipTrigger><TooltipContent>{muted ? "Unmute" : "Mute"}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button onClick={toggleDeafen} className="w-12 h-12 rounded-full flex items-center justify-center transition-colors" style={{ background: deafened ? "#f23f43" : "#4e5058" }}><Headphones className="w-5 h-5 text-white" /></button></TooltipTrigger><TooltipContent>{deafened ? "Undeafen" : "Deafen"}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button onClick={() => setPttEnabled((v) => !v)} className="w-12 h-12 rounded-full flex items-center justify-center transition-colors" style={{ background: pttEnabled ? "#5865f2" : "#4e5058" }} title="Push-to-Talk (Space)"><Radio className="w-5 h-5 text-white" /></button></TooltipTrigger><TooltipContent>{pttEnabled ? "Disable PTT" : "Enable Push-to-Talk (Space)"}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button onClick={toggleVideo} className="w-12 h-12 rounded-full flex items-center justify-center transition-colors" style={{ background: videoEnabled ? "#23a55a" : "#4e5058" }}>{videoEnabled ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}</button></TooltipTrigger><TooltipContent>{videoEnabled ? "Turn Off Camera" : "Turn On Camera"}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button onClick={toggleScreenShare} className="w-12 h-12 rounded-full flex items-center justify-center transition-colors" style={{ background: screenSharing ? "#23a55a" : "#4e5058" }}>{screenSharing ? <MonitorOff className="w-5 h-5 text-white" /> : <Monitor className="w-5 h-5 text-white" />}</button></TooltipTrigger><TooltipContent>{screenSharing ? "Stop Sharing" : "Share Screen"}</TooltipContent></Tooltip>

          <div className="relative">
            <Tooltip><TooltipTrigger asChild><button onClick={() => setDeviceMenuOpen((v) => !v)} className="w-12 h-12 rounded-full flex items-center justify-center transition-colors" style={{ background: deviceMenuOpen ? "#5865f2" : "#4e5058" }}><Settings className="w-5 h-5 text-white" /></button></TooltipTrigger><TooltipContent>Audio Settings</TooltipContent></Tooltip>
            {deviceMenuOpen && (
              <VoiceSettingsPanel
                audioInputDevices={audioInputDevices}
                audioOutputDevices={audioOutputDevices}
                selectedInputId={selectedInputId}
                selectedOutputId={selectedOutputId}
                setSelectedInputId={setSelectedInputId}
                setSelectedOutputId={setSelectedOutputId}
                settings={audioSettings}
                setSettings={setAudioSettings}
                onClose={closeDeviceMenu}
              />
            )}
          </div>

          <Tooltip><TooltipTrigger asChild><button onClick={handleLeave} className="w-12 h-12 rounded-full flex items-center justify-center transition-colors" style={{ background: "#f23f43" }}><PhoneOff className="w-5 h-5 text-white" /></button></TooltipTrigger><TooltipContent>Disconnect</TooltipContent></Tooltip>
        </div>

        {peerArray.map(([peerId, { stream, userId }], idx) => {
          const mix = getParticipantMix(serverId, userId)
          return (
            <RemoteAudio
              key={peerId}
              stream={stream}
              deafened={deafened}
              outputDeviceId={selectedOutputId}
              volume={Math.min(mix.volume * audioSettings.outputGain, MAX_REMOTE_GAIN)}
              pan={audioSettings.spatialAudioEnabled ? (mix.pan != null ? mix.pan : (idx % 2 === 0 ? -0.2 : 0.2)) : 0}
              sharedAudioContextRef={outputAudioContextRef}
            />
          )
        })}
      </div>
    </TooltipProvider>
  )
}

function VoiceSettingsPanel({
  audioInputDevices,
  audioOutputDevices,
  selectedInputId,
  selectedOutputId,
  setSelectedInputId,
  setSelectedOutputId,
  settings,
  setSettings,
  onClose,
}: {
  audioInputDevices: MediaDeviceInfo[]
  audioOutputDevices: MediaDeviceInfo[]
  selectedInputId: string | null
  selectedOutputId: string | null
  setSelectedInputId: (id: string | null) => void
  setSelectedOutputId: (id: string | null) => void
  settings: VoiceAudioSettings
  setSettings: (settings: VoiceAudioSettings) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null
      if (!panelRef.current || !target) return
      if (!panelRef.current.contains(target)) onClose()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  return (
    <div ref={panelRef} className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[360px] rounded-xl shadow-2xl p-4 space-y-4 z-50" style={{ background: "#2b2d31", border: "1px solid #1e1f22" }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Voice Settings</p>
        <button
          onClick={() => setSettings(createDefaultAudioSettings())}
          className="text-xs px-2 py-1 rounded inline-flex items-center gap-1"
          style={{ background: "#1e1f22", color: "#f2f3f5" }}
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs" style={{ color: "#b5bac1" }}>Profile</label>
        <select value={settings.preset} onChange={(e) => setSettings(applyPresetToSettings(e.target.value as AudioPreset, settings))} className="w-full px-2 py-1.5 rounded text-sm" style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}>
          {PRESET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: "#b5bac1" }}>Microphone (live preview)</label>
        <input type="range" min={0.2} max={2} step={0.01} value={settings.inputGain} onChange={(e) => setSettings(markCustomSettings(settings, { inputGain: Number(e.target.value) }))} className="w-full" />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: "#b5bac1" }}>Output gain</label>
        <input type="range" min={0.2} max={2} step={0.01} value={settings.outputGain} onChange={(e) => setSettings(markCustomSettings(settings, { outputGain: Number(e.target.value) }))} className="w-full" />
      </div>

      <div className="space-y-2">
        <label className="block text-xs" style={{ color: "#b5bac1" }}>EQ (6 bands)</label>
        <div className="grid grid-cols-3 gap-2">
          {settings.eqBands.map((band, idx) => (
            <div key={idx}>
              <p className="text-[10px]" style={{ color: "#949ba4" }}>{band.frequency}Hz</p>
              <input type="range" min={-12} max={12} step={0.5} value={band.gain} onChange={(e) => setSettings(withEqBandGain(settings, idx, Number(e.target.value)))} className="w-full" />
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between text-xs" style={{ color: "#b5bac1" }}>
        Bypass processing
        <input type="checkbox" checked={settings.bypassProcessing} onChange={(e) => setSettings({ ...settings, bypassProcessing: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between text-xs" style={{ color: "#b5bac1" }}>
        Auto bypass on CPU constraint
        <input type="checkbox" checked={settings.bypassOnCpuConstraint} onChange={(e) => setSettings({ ...settings, bypassOnCpuConstraint: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between text-xs" style={{ color: "#b5bac1" }}>
        Spatial pan
        <input type="checkbox" checked={settings.spatialAudioEnabled} onChange={(e) => setSettings({ ...settings, spatialAudioEnabled: e.target.checked })} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#b5bac1" }}>Microphone device</label>
          <select value={selectedInputId ?? ""} onChange={(e) => setSelectedInputId(e.target.value || null)} className="w-full px-2 py-1.5 rounded text-sm" style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}>
            <option value="">Default</option>
            {audioInputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}`}</option>)}
          </select>
        </div>
        {audioOutputDevices.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase mb-1" style={{ color: "#b5bac1" }}>Speaker device</label>
            <select value={selectedOutputId ?? ""} onChange={(e) => setSelectedOutputId(e.target.value || null)} className="w-full px-2 py-1.5 rounded text-sm" style={{ background: "#1e1f22", color: "#f2f3f5", border: "1px solid #3f4147" }}>
              <option value="">Default</option>
              {audioOutputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </div>
        )}
      </div>
      <p className="text-xs" style={{ color: "#4e5058" }}>Input device changes require rejoin. Presets and custom EQ are saved per user/profile.</p>
    </div>
  )
}

function ParticipantTile({
  user,
  speaking,
  muted,
  deafened,
  audioStream,
  cameraStream,
  screenStream,
  isLocal,
  remoteStream,
  onVolumeChange,
  onPanChange,
  volume,
  pan,
  spatialEnabled,
  onViewStream,
  compact,
}: {
  user?: UserRow | null
  speaking: boolean
  muted: boolean
  deafened: boolean
  audioStream: MediaStream | null
  cameraStream: MediaStream | null
  screenStream: MediaStream | null
  isLocal: boolean
  remoteStream?: MediaStream
  onVolumeChange?: (volume: number) => void
  onPanChange?: (pan: number) => void
  volume?: number
  pan?: number | null
  spatialEnabled?: boolean
  onViewStream?: () => void
  compact?: boolean
}) {
  const cameraRef = useRef<HTMLVideoElement>(null)
  const screenRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (cameraRef.current && cameraStream) cameraRef.current.srcObject = cameraStream
  }, [cameraStream])

  useEffect(() => {
    if (screenRef.current && screenStream) screenRef.current.srcObject = screenStream
  }, [screenStream])

  const remoteHasVideo = remoteStream && remoteStream.getVideoTracks().length > 0
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && remoteHasVideo) remoteVideoRef.current.srcObject = remoteStream
  }, [remoteStream, remoteHasVideo])

  const displayName = user?.display_name || user?.username || (isLocal ? "You" : "Unknown")
  const initials = displayName.slice(0, 2).toUpperCase()
  const showScreen = isLocal && !!screenStream
  const showCamera = isLocal && !!cameraStream && !showScreen
  const showRemoteVideo = !isLocal && remoteHasVideo

  return (
    <div
      className={cn(
        "group rounded-lg overflow-hidden flex flex-col relative transition-all duration-300",
        speaking && !muted ? "ring-2 ring-green-500/80" : "ring-1 ring-[#4e5058]/60"
      )}
      style={{
        background: "#1e1f22",
        minHeight: compact ? "100px" : (showScreen || showCamera || showRemoteVideo ? "240px" : "160px"),
      }}
    >
      {showScreen && <video ref={screenRef} autoPlay playsInline muted className="w-full flex-1 object-contain bg-black" />}
      {showCamera && <video ref={cameraRef} autoPlay playsInline muted className="w-full flex-1 object-cover bg-black" style={{ transform: "scaleX(-1)" }} />}
      {showRemoteVideo && <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full flex-1 object-cover bg-black" />}

      {!showScreen && !showCamera && !showRemoteVideo && (
        <div className="flex-1 flex items-center justify-center p-4">
          <Avatar className={compact ? "w-12 h-12" : "w-20 h-20"}>
            {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
            <AvatarFallback style={{ background: "#5865f2", color: "white", fontSize: compact ? "14px" : "24px" }}>{initials}</AvatarFallback>
          </Avatar>
        </div>
      )}

      {onViewStream && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" style={{ background: "rgba(0,0,0,0.4)" }}>
          <button
            onMouseDown={(e) => { e.preventDefault(); onViewStream() }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:brightness-110"
            style={{ background: "#5865f2" }}
          >
            <Monitor className="w-4 h-4" />
            View Stream
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(0,0,0,0.5)" }}>
        <span className={cn("font-medium text-white flex-1 truncate", compact ? "text-xs" : "text-sm")}>{displayName}</span>
        {speaking && !muted && !compact && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(35,165,90,0.2)", color: "#9ae6b4" }}>
            Speaking
          </span>
        )}
        {isLocal && <span className="text-xs px-1 rounded" style={{ background: "#5865f2", color: "white" }}>You</span>}
        {muted && <MicOff className="w-3 h-3 flex-shrink-0" style={{ color: "#f23f43" }} />}
        {deafened && <Headphones className="w-3 h-3 flex-shrink-0" style={{ color: "#f23f43" }} />}
      </div>

      {!isLocal && !compact && onVolumeChange && (
        <div className="px-3 pb-3 space-y-1">
          <label className="text-[10px]" style={{ color: "#949ba4" }}>Volume {(volume ?? 1).toFixed(2)}x</label>
          <input type="range" min={0} max={2} step={0.05} value={volume ?? 1} onChange={(e) => onVolumeChange(Number(e.target.value))} className="w-full" />
          {spatialEnabled && onPanChange && (
            <>
              <label className="text-[10px]" style={{ color: "#949ba4" }}>Pan {(pan ?? 0).toFixed(2)}</label>
              <input type="range" min={-1} max={1} step={0.05} value={pan ?? 0} onChange={(e) => onPanChange(Number(e.target.value))} className="w-full" />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function RemoteAudio({
  stream,
  deafened,
  outputDeviceId,
  volume,
  pan,
  sharedAudioContextRef,
}: {
  stream: MediaStream
  deafened: boolean
  outputDeviceId: string | null
  volume: number
  pan: number
  sharedAudioContextRef: MutableRefObject<AudioContext | null>
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const gainRef = useRef<GainNode | null>(null)
  const panRef = useRef<StereoPannerNode | null>(null)
  const hasWebAudioRef = useRef(false)

  useEffect(() => {
    if (!audioRef.current) return

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) {
      hasWebAudioRef.current = false
      return
    }

    hasWebAudioRef.current = true
    const context = sharedAudioContextRef.current ?? new AudioCtx()
    sharedAudioContextRef.current = context

    const source = context.createMediaStreamSource(stream)
    const gainNode = context.createGain()
    const panNode = context.createStereoPanner()
    source.connect(gainNode)
    gainNode.connect(panNode)
    panNode.connect(context.destination)
    gainRef.current = gainNode
    panRef.current = panNode

    return () => {
      source.disconnect()
      gainNode.disconnect()
      panNode.disconnect()
    }
  }, [stream])

  useEffect(() => {
    if (!audioRef.current || hasWebAudioRef.current) return
    audioRef.current.srcObject = stream
    audioRef.current.muted = deafened
  }, [stream, deafened])

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = deafened ? 0 : volume
    if (panRef.current) panRef.current.pan.value = pan
  }, [deafened, volume, pan])

  useEffect(() => {
    if (!outputDeviceId) return

    if (hasWebAudioRef.current && sharedAudioContextRef.current) {
      const maybeContextWithSink = sharedAudioContextRef.current as AudioContext & { setSinkId?: (id: string) => Promise<void> }
      if (maybeContextWithSink.setSinkId) {
        maybeContextWithSink.setSinkId(outputDeviceId).catch(() => {
          // graceful fallback to default sink
        })
      }
      return
    }

    if (!hasWebAudioRef.current && audioRef.current) {
      const maybeSetSink = audioRef.current as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
      maybeSetSink.setSinkId?.(outputDeviceId).catch(() => {
        // graceful fallback to default sink
      })
    }
  // sharedAudioContextRef is a stable ref object; only outputDeviceId should trigger rerouting.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputDeviceId])

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />
}

function SpotlightVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  if (!stream) return null
  return <video ref={ref} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />
}
