"use client"

import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, Users } from "lucide-react"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"

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
 * On desktop, renders all panels inline (handled by CSS).
 */
export function ServerMobileLayout({ serverId, sidebar, memberList, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { activeChannelId, channels, toggleMemberList, memberListOpen } = useAppStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      channels: s.channels,
      toggleMemberList: s.toggleMemberList,
      memberListOpen: s.memberListOpen,
    }))
  )

  // Determine if we are viewing a channel (not just the server root)
  const pathParts = pathname.split("/").filter(Boolean)
  // /channels/:serverId/:channelId = 3+ parts after split
  const isInChannel = pathParts.length >= 3 && pathParts[0] === "channels" && pathParts[1] === serverId && !!pathParts[2]
  // Special server sub-pages that aren't channels (settings, moderation, events)
  const specialPaths = ["settings", "moderation", "events"]
  const isSpecialPage = isInChannel && specialPaths.includes(pathParts[2])

  // Resolve the active channel name from the store
  const channelName = (() => {
    if (!activeChannelId) return "channel"
    const serverChannels = channels[serverId]
    if (!serverChannels) return "channel"
    const ch = serverChannels.find((c) => c.id === activeChannelId)
    return ch?.name ?? "channel"
  })()

  return (
    <>
      {/* ========== DESKTOP LAYOUT — always shows all panels ========== */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Channel sidebar */}
        <div className="flex-shrink-0">{sidebar}</div>
        {/* Channel content */}
        <main id="main-content" className="flex flex-1 overflow-hidden">
          {children}
        </main>
        {/* Member list */}
        {memberList}
      </div>

      {/* ========== MOBILE LAYOUT — shows sidebar OR content ========== */}
      <div className="md:hidden flex flex-1 flex-col overflow-hidden">
        {isInChannel && !isSpecialPage ? (
          <>
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
                onClick={() => toggleMemberList()}
                className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: memberListOpen ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
                aria-label="Toggle member list"
              >
                <Users className="w-5 h-5" />
              </button>
            </div>
            {/* Channel content area or mobile member list */}
            {memberListOpen ? (
              <div className="flex-1 overflow-hidden">{memberList}</div>
            ) : (
              <main className="flex flex-1 overflow-hidden">
                {children}
              </main>
            )}
          </>
        ) : isSpecialPage ? (
          <>
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
            <main className="flex flex-1 overflow-hidden">
              {children}
            </main>
          </>
        ) : (
          /* Channel sidebar shown full-screen on mobile */
          <div className="flex-1 overflow-hidden">{sidebar}</div>
        )}
      </div>
    </>
  )
}
