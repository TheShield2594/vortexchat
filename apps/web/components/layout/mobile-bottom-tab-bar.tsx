"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, MessagesSquare, Users, UserRound } from "lucide-react"
import { cn } from "@/lib/utils/cn"

const TABS = [
  { href: "/channels/discover", label: "Discover", icon: Compass },
  { href: "/channels/me", label: "DMs", icon: MessagesSquare },
  { href: "/channels/friends", label: "Friends", icon: Users },
  { href: "/channels/profile", label: "Profile", icon: UserRound },
]

function isTabActive(href: string, pathname: string): boolean {
  if (href === "/channels/me") return pathname.startsWith("/channels/me")
  if (href === "/channels/friends") return pathname.startsWith("/channels/friends")
  if (href === "/channels/profile") return pathname.startsWith("/channels/profile")
  // Discover tab is active for the discover page and any server channel pages
  if (href === "/channels/discover") {
    return (
      pathname.startsWith("/channels/discover") ||
      // Server channel routes: /channels/[serverId]/... (not /me, /friends, /profile, /discover)
      (pathname.startsWith("/channels/") &&
        !pathname.startsWith("/channels/me") &&
        !pathname.startsWith("/channels/friends") &&
        !pathname.startsWith("/channels/profile") &&
        !pathname.startsWith("/channels/discover"))
    )
  }
  return pathname === href
}

export function MobileBottomTabBar() {
  const pathname = usePathname()

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
          return (
            <li key={label}>
              <Link
                href={href}
                className={cn("h-full w-full flex flex-col items-center justify-center gap-1 text-[11px]", active && "font-semibold")}
                style={{ color: active ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
