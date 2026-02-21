"use client"

import { useRef, useEffect } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import type { MemberForMention } from "@/lib/stores/app-store"

interface Props {
  members: MemberForMention[]
  selectedIndex: number
  onSelect: (member: MemberForMention) => void
}

export function MentionSuggestions({ members, selectedIndex, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  return (
    <div
      ref={listRef}
      className="rounded-lg shadow-xl overflow-y-auto max-h-52 py-1"
      style={{
        background: "#2b2d31",
        border: "1px solid #1e1f22",
      }}
    >
      {members.map((member, i) => {
        const displayName = member.nickname || member.display_name || member.username
        const initials = displayName.slice(0, 2).toUpperCase()
        const isSelected = i === selectedIndex

        return (
          <button
            key={member.user_id}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors"
            style={{
              background: isSelected ? "rgba(88,101,242,0.2)" : "transparent",
              color: "#dcddde",
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(member)
            }}
          >
            <Avatar className="w-6 h-6">
              {member.avatar_url && <AvatarImage src={member.avatar_url} />}
              <AvatarFallback
                style={{ background: "#5865f2", color: "white", fontSize: "10px" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">{displayName}</span>
            {displayName !== member.username && (
              <span className="text-xs truncate" style={{ color: "#949ba4" }}>
                {member.username}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
