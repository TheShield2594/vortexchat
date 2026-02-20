export default function ChannelLoading() {
  return (
    <div className="flex flex-1 flex-col bg-vortex-bg-primary">
      {/* Header skeleton */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-vortex-bg-tertiary">
        <div className="w-5 h-5 rounded bg-vortex-bg-tertiary animate-pulse" />
        <div className="w-32 h-4 rounded bg-vortex-bg-tertiary animate-pulse" />
      </div>
      {/* Messages skeleton */}
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-vortex-bg-tertiary animate-pulse flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="w-24 h-3 rounded bg-vortex-bg-tertiary animate-pulse" />
              <div className="w-3/4 h-3 rounded bg-vortex-bg-tertiary animate-pulse" />
              <div className="w-1/2 h-3 rounded bg-vortex-bg-tertiary animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
