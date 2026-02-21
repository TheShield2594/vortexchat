import { FriendsSidebar } from "@/components/dm/friends-sidebar"

export default function DirectMessagesHome() {
  return (
    <div className="flex-1 overflow-hidden" style={{ background: '#313338' }}>
      <FriendsSidebar />
    </div>
  )
}
