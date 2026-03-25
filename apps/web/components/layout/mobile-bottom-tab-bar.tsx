"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, MessagesSquare, Bell, UserRound } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { useAppStore } from "@/lib/stores/app-store"
import { isFullScreenChannel } from "@/lib/utils/navigation"

const TABS = [
  { href: "/channels/servers", label: "Servers", icon: LayoutGrid },
  { href: "/channels/me", label: "Messages", icon: MessagesSquare },
  { href: "/channels/notifications", label: "Notifications", icon: Bell },
  { href: "/channels/you", label: "You", icon: UserRound },
]

function isTabActive(href: string, pathname: string): boolean {
  if (href === "/channels/servers") return pathname.startsWith("/channels/servers")
  if (href === "/channels/me") {
    return pathname.startsWith("/channels/me") || pathname.startsWith("/channels/friends")
  }
  if (href === "/channels/notifications") return pathname.startsWith("/channels/notifications")
  if (href === "/channels/you") {
    return pathname.startsWith("/channels/you") || pathname.startsWith("/channels/profile")
  }
  return pathname === href
}

export function MobileBottomTabBar() {
  const pathname = usePathname()
  const notificationUnreadCount = useAppStore((s) => s.notificationUnreadCount)
  const dmUnreadCount = useAppStore((s) => s.dmUnreadCount)
  const serverHasUnread = useAppStore((s) => s.serverHasUnread)
  const serverUnreadCount = Object.values(serverHasUnread).filter(Boolean).length

  // Hide the bottom nav when viewing a channel (full-screen message view)
  if (isFullScreenChannel(pathname)) return null

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur supports-[backdrop-filter]:bg-black/70"
      style={{
        background: "color-mix(in srgb, var(--theme-bg-secondary) 92%, transparent)",
        borderColor: "var(--theme-bg-tertiary)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Mobile sections"
    >
      <ul className="grid grid-cols-4 h-16">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isTabActive(href, pathname)
          const showNotifBadge = href === "/channels/notifications" && notificationUnreadCount > 0
          const showDmBadge = href === "/channels/me" && dmUnreadCount > 0
          const showServerBadge = href === "/channels/servers" && serverUnreadCount > 0
          const badgeCount = showNotifBadge ? notificationUnreadCount : showDmBadge ? dmUnreadCount : showServerBadge ? serverUnreadCount : 0
          return (
            <li key={label}>
              <Link
                href={href}
                onClick={() => navigator.vibrate?.(10)}
                aria-current={active ? "page" : undefined}
                className={cn("h-full w-full flex flex-col items-center justify-center gap-1 text-[11px]", active && "font-semibold")}
                style={{ color: active ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {badgeCount > 0 && (
                    <span
                      className="absolute -top-1 -right-2 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[10px] font-bold px-0.5"
                      style={{ background: "var(--theme-danger)", color: "white" }}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
