import { MessageSquare } from "lucide-react"

export default function DirectMessagesHome() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: '#313338' }}>
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <MessageSquare className="w-16 h-16" style={{ color: '#4e5058' }} />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">
          No DM selected
        </h2>
        <p style={{ color: '#b5bac1' }} className="text-sm">
          Select a friend to start a conversation
        </p>
      </div>
    </div>
  )
}
