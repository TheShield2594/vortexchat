"use client"

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import type { RoleRow } from "@/types/database"

interface UserProfileData {
  username: string
  display_name: string | null
  avatar_url: string | null
  status_message: string | null
  bio: string | null
  banner_color: string | null
  custom_tag: string | null
}

interface UserProfilePopoverProps {
  user: UserProfileData | null
  displayName: string
  status?: string
  roles?: RoleRow[]
  side?: "left" | "right" | "top" | "bottom"
  align?: "start" | "center" | "end"
  children: React.ReactNode
}

function getStatusColor(status?: string) {
  switch (status) {
    case "online": return "#23a55a"
    case "idle": return "#f0b132"
    case "dnd": return "#f23f43"
    default: return "#80848e"
  }
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "online": return "Online"
    case "idle": return "Idle"
    case "dnd": return "Do Not Disturb"
    case "invisible": return "Invisible"
    default: return "Offline"
  }
}

export function UserProfilePopover({
  user,
  displayName,
  status,
  roles = [],
  side = "left",
  align = "start",
  children,
}: UserProfilePopoverProps) {
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-72 p-0 overflow-hidden"
        style={{ background: "#232428", borderColor: "#1e1f22" }}
      >
        {/* Banner */}
        <div
          className="h-16"
          style={{ background: user?.banner_color ?? "#5865f2" }}
        />

        {/* Avatar + Info */}
        <div className="px-3 pb-3">
          <div className="relative -mt-6 mb-2">
            <Avatar className="w-14 h-14 ring-4" style={{ "--tw-ring-color": "#232428" } as React.CSSProperties}>
              {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
              <AvatarFallback
                style={{ background: "#5865f2", color: "white", fontSize: "18px" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-[3px]"
              style={{
                background: getStatusColor(status),
                borderColor: "#232428",
              }}
            />
          </div>

          {/* Name */}
          <div className="font-bold text-white text-base">{displayName}</div>
          <div className="text-sm" style={{ color: "#b5bac1" }}>
            {user?.username}
          </div>
          {user?.custom_tag && (
            <div className="text-xs mt-0.5" style={{ color: "#949ba4" }}>
              {user.custom_tag}
            </div>
          )}

          {/* Divider */}
          <div className="my-2 border-t" style={{ borderColor: "#1e1f22" }} />

          {/* Status */}
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: getStatusColor(status) }}
            />
            <span className="text-xs" style={{ color: "#b5bac1" }}>
              {getStatusLabel(status)}
            </span>
          </div>

          {user?.status_message && (
            <div className="text-xs mb-2" style={{ color: "#dcddde" }}>
              {user.status_message}
            </div>
          )}

          {/* Bio */}
          {user?.bio && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#b5bac1" }}>
                About Me
              </div>
              <div className="text-sm" style={{ color: "#dcddde" }}>
                {user.bio}
              </div>
            </>
          )}

          {/* Roles */}
          {roles.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider mt-2 mb-1" style={{ color: "#b5bac1" }}>
                Roles
              </div>
              <div className="flex flex-wrap gap-1">
                {roles.map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                    style={{ background: "#1e1f22", color: role.color || "#dcddde" }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: role.color || "#dcddde" }}
                    />
                    {role.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
