import { cn } from "@/lib/utils/cn"

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/10", className)} aria-hidden="true" />
}

