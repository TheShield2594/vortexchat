export default function ChannelsLoading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-vortex-bg-primary">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-vortex-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-vortex-text-secondary">Loading...</span>
      </div>
    </div>
  )
}
