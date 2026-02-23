import type { LucideIcon } from "lucide-react"

interface Props {
  icon: LucideIcon
  title: string
  description: string
  hint?: string
}

export function BrandedEmptyState({ icon: Icon, title, description, hint }: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#232428] px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5865f2]/20 text-[#9da7ff]">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm" style={{ color: "#b5bac1" }}>{description}</p>
      {hint && <p className="mt-3 text-xs" style={{ color: "#949ba4" }}>{hint}</p>}
    </div>
  )
}

