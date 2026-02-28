"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, MessagesSquare, Search, Shield, UserRound } from "lucide-react"
import { cn } from "@/lib/utils/cn"

const TABS = [
  { href: "/channels/discover", label: "Servers", icon: Compass },
  { href: "/channels/me", label: "DMs", icon: MessagesSquare },
  { href: "/channels/friends", label: "Friends", icon: Shield },
  { href: "/channels/discover", label: "Search", icon: Search },
  { href: "/channels/profile", label: "Profile", icon: UserRound },
]

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
      <ul className="grid grid-cols-5 h-16">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/channels/me" && pathname.startsWith("/channels/me/"))
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
