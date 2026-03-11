"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, Users } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { useMobileLayout } from "@/hooks/use-mobile-layout"

interface Props {
  serverId: string
  sidebar: React.ReactNode
  memberList: React.ReactNode
  children: React.ReactNode
}

/**
 * On mobile, switches between channel sidebar view and channel content view.
 * - /channels/:serverId → shows channel sidebar full-screen
 * - /channels/:serverId/:channelId → shows channel content full-screen with back button
 * On desktop, renders all panels inline.
 * Only one branch mounts at a time — children and memberList never duplicate.
 */
export function ServerMobileLayout({ serverId, sidebar, memberList, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useMobileLayout()
  const { activeChannelId, channels, memberListOpen, setMemberListOpen } = useAppStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      channels: s.channels,
      memberListOpen: s.memberListOpen,
      setMemberListOpen: s.setMemberListOpen,
    }))
  )

  // On mobile, use local state for the member list overlay so that entering
  // a channel always shows messages first. Desktop uses the persisted store value.
  const [mobileMemberListOpen, setMobileMemberListOpen] = useState(false)

  // Reset mobile member list whenever the channel route changes
  const routeChannelSegment = pathname.split("/").filter(Boolean)[2]
  useEffect(() => {
    if (isMobile) {
      setMobileMemberListOpen(false)
      setMemberListOpen(false)
    }
  }, [isMobile, routeChannelSegment, setMemberListOpen])

  // Sync local mobile state when the store is toggled externally
  // (e.g. chat-area header button, keyboard shortcut)
  useEffect(() => {
    if (isMobile) {
      setMobileMemberListOpen(memberListOpen)
    }
  }, [isMobile, memberListOpen])

  // Determine if we are viewing a channel (not just the server root)
  const pathParts = pathname.split("/").filter(Boolean)
  // /channels/:serverId/:channelId = 3+ parts after split
  const isInChannel = pathParts.length >= 3 && pathParts[0] === "channels" && pathParts[1] === serverId && !!pathParts[2]
  // Special server sub-pages that aren't channels (settings, moderation, events)
  const specialPaths = ["settings", "moderation", "events"]
  const isSpecialPage = isInChannel && specialPaths.includes(pathParts[2])

  // Resolve the channel name — prefer the route param, fall back to store
  const routeChannelId = pathParts[2]
  const channelName = (() => {
    const serverChannels = channels[serverId]
    if (!serverChannels) return "channel"
    if (routeChannelId) {
      const ch = serverChannels.find((c) => c.id === routeChannelId)
      if (ch) return ch.name
    }
    if (activeChannelId) {
      const ch = serverChannels.find((c) => c.id === activeChannelId)
      if (ch) return ch.name
    }
    return "channel"
  })()

  // ========== DESKTOP LAYOUT — all panels inline ==========
  if (!isMobile) {
    return (
      <div className="flex flex-1 overflow-hidden">
        {/* Channel sidebar */}
        <div className="flex-shrink-0 h-full">{sidebar}</div>
        {/* Channel content */}
        <main id="main-content" className="flex flex-1 overflow-hidden">
          {children}
        </main>
        {/* Member list */}
        {memberList}
      </div>
    )
  }

  // ========== MOBILE LAYOUT — shows sidebar OR content ==========
  if (isInChannel && !isSpecialPage) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile channel header with back button */}
        <div
          className="flex items-center gap-2 px-2 py-2 border-b flex-shrink-0"
          style={{
            background: "var(--theme-bg-secondary)",
            borderColor: "var(--theme-bg-tertiary)",
          }}
        >
          <button
            type="button"
            onClick={() => router.push(`/channels/${serverId}`)}
            className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
            style={{ color: "var(--theme-text-secondary)" }}
            aria-label="Back to channels"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span
            className="flex-1 text-sm font-semibold truncate"
            style={{ color: "var(--theme-text-primary)" }}
          >
            # {channelName}
          </span>
          <button
            type="button"
            onClick={() => {
              setMobileMemberListOpen((v) => {
                const next = !v
                setMemberListOpen(next)
                return next
              })
            }}
            className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
            style={{ color: mobileMemberListOpen ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
            aria-label="Toggle member list"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
        {/* Channel content area or mobile member list */}
        {mobileMemberListOpen ? (
          <div className="flex-1 overflow-hidden">{memberList}</div>
        ) : (
          <main id="main-content" className="flex flex-1 overflow-hidden">
            {children}
          </main>
        )}
      </div>
    )
  }

  if (isSpecialPage) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Special pages (settings/moderation/events) */}
        <div
          className="flex items-center gap-2 px-2 py-2 border-b flex-shrink-0"
          style={{
            background: "var(--theme-bg-secondary)",
            borderColor: "var(--theme-bg-tertiary)",
          }}
        >
          <button
            type="button"
            onClick={() => router.push(`/channels/${serverId}`)}
            className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
            style={{ color: "var(--theme-text-secondary)" }}
            aria-label="Back to server"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold capitalize" style={{ color: "var(--theme-text-primary)" }}>
            {pathParts[2]}
          </span>
        </div>
        <main id="main-content" className="flex flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    )
  }

  // Channel sidebar shown full-screen on mobile
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">{sidebar}</div>
    </div>
  )
}
