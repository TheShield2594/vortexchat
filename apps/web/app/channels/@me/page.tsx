import { Users } from "lucide-react"

export default function DirectMessagesHome() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: '#313338' }}>
      <div className="text-center max-w-sm px-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: '#2b2d31' }}
        >
          <Users className="w-10 h-10" style={{ color: '#5865f2' }} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          It&apos;s quiet for now…
        </h2>
        <p style={{ color: '#b5bac1' }} className="text-sm leading-relaxed">
          Add friends using the panel on the left, then open a DM to start chatting.
        </p>
      </div>
    </div>
  )
}
