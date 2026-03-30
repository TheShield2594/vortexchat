"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Circle, Clipboard, Pencil, ChevronRight, Users } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import { useAppStore } from "@/lib/stores/app-store"
import { useShallow } from "zustand/react/shallow"
import { createClientSupabaseClient } from "@/lib/supabase/client"
import { STATUS_OPTIONS, getStatusColor } from "@/lib/utils/status-options"
import type { UserRow } from "@/types/database"

interface Props {
  user: UserRow
  children: React.ReactNode
  isStatusExpired: boolean
}

/** Discord-style popover shown when clicking the user area in the bottom-left panel. */
export function UserPopover({ user, children, isStatusExpired }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { setCurrentUser } = useAppStore(
    useShallow((s) => ({ setCurrentUser: s.setCurrentUser }))
  )
  const supabase = useMemo(() => createClientSupabaseClient(), [])
  const [open, setOpen] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)

  const displayName = user.display_name || user.username
  const initials = displayName.slice(0, 2).toUpperCase()
  const customStatusText = !isStatusExpired
    ? [user.status_emoji, user.status_message].filter(Boolean).join(" ").trim()
    : ""

  const currentStatusOption = STATUS_OPTIONS.find((s) => s.value === user.status) ?? STATUS_OPTIONS[0]

  async function handleSetStatus(status: UserRow["status"]): Promise<void> {
    try {
      const latestUser = useAppStore.getState().currentUser
      if (!latestUser) return
      const { error } = await supabase
        .from("users")
        .update({ status })
        .eq("id", latestUser.id)
      if (error) throw error
      setCurrentUser({ ...latestUser, status })
      setShowStatusMenu(false)
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update status",
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowStatusMenu(false) }}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[280px] p-0 overflow-hidden"
        style={{
          background: "var(--theme-bg-primary)",
          border: "1px solid var(--theme-bg-tertiary)",
        }}
      >
        {/* Banner */}
        <div
          className="h-[60px] relative"
          style={{
            background: /^#[0-9a-f]{6}$/i.test(user.banner_color ?? "")
              ? user.banner_color!
              : "var(--theme-accent)",
          }}
        />

        {/* Avatar */}
        <div className="px-3 -mt-6 relative z-10">
          <div className="relative inline-block">
            <Avatar className="w-[52px] h-[52px] ring-[3px]" style={{ "--tw-ring-color": "var(--theme-bg-primary)" } as React.CSSProperties}>
              {user.avatar_url && <AvatarImage src={user.avatar_url} />}
              <AvatarFallback style={{ background: "var(--theme-accent)", color: "white", fontSize: "18px" }}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-[3px]"
              style={{
                background: getStatusColor(user.status),
                borderColor: "var(--theme-bg-primary)",
              }}
            />
          </div>
        </div>

        {/* User info */}
        <div className="px-3 pt-1.5 pb-2">
          <div className="font-bold text-base" style={{ color: "var(--theme-text-bright)" }}>
            {displayName}
          </div>
          <div className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            {user.username}{user.custom_tag ? `#${user.custom_tag}` : ""}
          </div>
          {customStatusText && (
            <div className="text-xs mt-1" style={{ color: "var(--theme-text-secondary)" }}>
              {customStatusText}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-2 border-t" style={{ borderColor: "var(--theme-bg-tertiary)" }} />

        {/* Menu items */}
        <div className="p-1.5 space-y-0.5">
          {/* Online status */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStatusMenu((v) => !v)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:brightness-110"
              style={{
                color: "var(--theme-text-primary)",
                background: showStatusMenu ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "transparent",
              }}
            >
              <Circle
                className="w-3.5 h-3.5 fill-current flex-shrink-0"
                style={{ color: currentStatusOption.color }}
              />
              <span className="flex-1 text-left">{currentStatusOption.label}</span>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
            </button>

            {showStatusMenu && (
              <div
                className="absolute left-full top-0 ml-1 w-44 rounded-lg p-1 shadow-xl z-50"
                style={{
                  background: "var(--theme-bg-secondary)",
                  border: "1px solid var(--theme-bg-tertiary)",
                }}
              >
                {STATUS_OPTIONS.map(({ value, label, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSetStatus(value)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors hover:brightness-110"
                    style={{
                      color: "var(--theme-text-primary)",
                      background: user.status === value ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "transparent",
                    }}
                  >
                    <Circle className="w-3 h-3 fill-current flex-shrink-0" style={{ color }} />
                    {label}
                    {user.status === value && (
                      <span className="ml-auto text-xs" style={{ color: "var(--theme-text-muted)" }}>&#10003;</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Set custom status */}
          <button
            type="button"
            onClick={() => { setOpen(false); router.push("/settings/profile") }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:brightness-110"
            style={{ color: "var(--theme-text-primary)", background: "transparent" }}
          >
            <Circle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
            <span className="flex-1 text-left">
              {customStatusText ? "Edit Custom Status" : "Set a Custom Status"}
            </span>
          </button>

          {/* Divider */}
          <div className="mx-1 border-t" style={{ borderColor: "var(--theme-bg-tertiary)" }} />

          {/* Switch Accounts */}
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:brightness-110"
            style={{ color: "var(--theme-text-primary)", background: "transparent" }}
            onClick={() => {
              toast({ title: "Switch Accounts", description: "Multi-account support coming soon." })
            }}
          >
            <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
            <span className="flex-1 text-left">Switch Accounts</span>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
          </button>

          {/* Copy User ID */}
          <button
            type="button"
            onClick={async (): Promise<void> => {
              try {
                await navigator.clipboard.writeText(user.id)
                toast({ title: "User ID copied!" })
              } catch {
                toast({ variant: "destructive", title: "Failed to copy" })
              }
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:brightness-110"
            style={{ color: "var(--theme-text-primary)", background: "transparent" }}
          >
            <Clipboard className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
            <span className="flex-1 text-left">Copy User ID</span>
          </button>
        </div>

        {/* Edit Profile button */}
        <div className="p-2 pt-0">
          <button
            type="button"
            onClick={() => { setOpen(false); router.push("/settings/profile") }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: "var(--theme-accent)", color: "white" }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
