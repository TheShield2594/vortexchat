"use client"

import { useRef, useEffect } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import type { MemberForMention } from "@/lib/stores/app-store"

interface Props {
  members: MemberForMention[]
  selectedIndex: number
  query: string
  onSelect: (member: MemberForMention) => void
}

function getMatchConfidence(member: MemberForMention, query: string): "Exact" | "Strong" | "Weak" {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return "Strong"

  const options = [member.nickname, member.display_name, member.username]
    .filter(Boolean)
    .map((value) => value!.toLowerCase())

  if (options.some((value) => value === normalized)) return "Exact"
  if (options.some((value) => value.startsWith(normalized))) return "Strong"
  return "Weak"
}

export function MentionSuggestions({ members, selectedIndex, query, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  if (members.length === 0) return null

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Mention suggestions"
      className="rounded-lg shadow-xl overflow-y-auto max-h-52 py-1"
      style={{
        background: "var(--theme-bg-secondary)",
        border: "1px solid var(--theme-bg-tertiary)",
      }}
    >
      {members.map((member, i) => {
        const displayName = member.nickname || member.display_name || member.username
        const initials = displayName.slice(0, 2).toUpperCase()
        const isSelected = i === selectedIndex
        const confidence = getMatchConfidence(member, query)
        const confidenceTone =
          confidence === "Exact" ? "#3ba55d" : confidence === "Strong" ? "var(--theme-accent)" : "#faa81a"

        return (
          <button
            key={member.user_id}
            role="option"
            aria-selected={isSelected}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors"
            style={{
              background: isSelected ? "rgba(88,101,242,0.2)" : "transparent",
              color: "var(--theme-text-normal)",
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(member)
            }}
          >
            <Avatar className="w-6 h-6">
              {member.avatar_url && <AvatarImage src={member.avatar_url} />}
              <AvatarFallback
                style={{ background: "var(--theme-accent)", color: "white", fontSize: "10px" }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">{displayName}</span>
            {displayName !== member.username && (
              <span className="text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>
                {member.username}
              </span>
            )}
            <span
              className="ml-auto text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ color: confidenceTone, background: `${confidenceTone}26` }}
            >
              {confidence}
            </span>
          </button>
        )
      })}
    </div>
  )
}
