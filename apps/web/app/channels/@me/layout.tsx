import { FriendsSidebar } from "@/components/dm/friends-sidebar"

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Friends sidebar: fixed-width left panel */}
      <div className="w-64 flex-shrink-0 overflow-hidden" style={{ background: "#2b2d31" }}>
        <FriendsSidebar />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
