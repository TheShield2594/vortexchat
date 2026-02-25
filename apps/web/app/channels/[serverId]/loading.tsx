import { Skeleton } from "@/components/ui/skeleton"

export default function ServerLoading() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-60 flex-shrink-0 border-r px-3 py-4" style={{ background: "var(--theme-bg-secondary)", borderColor: "var(--theme-bg-tertiary)" }}>
        <Skeleton className="mb-4 h-8 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
      </aside>

      <main className="flex-1 border-r px-4 py-4" style={{ background: "var(--theme-bg-primary)", borderColor: "var(--theme-bg-tertiary)" }}>
        <Skeleton className="mb-4 h-10 w-full" />
        <div className="space-y-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </main>

      <aside className="w-60 flex-shrink-0 px-3 py-4" style={{ background: "var(--theme-bg-secondary)" }}>
        <Skeleton className="mb-3 h-3 w-20" />
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
