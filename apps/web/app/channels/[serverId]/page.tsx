import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { BrandedEmptyState } from "@/components/ui/branded-empty-state"
import { Hash } from "lucide-react"

interface Props {
  params: Promise<{ serverId: string }>
}

export default async function ServerHomePage({ params: paramsPromise }: Props) {
  const params = await paramsPromise
  const supabase = await createServerSupabaseClient()

  // Get first text channel in the server
  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("server_id", params.serverId)
    .eq("type", "text")
    .order("position", { ascending: true })
    .limit(1)
    .single()

  if (channel) {
    redirect(`/channels/${params.serverId}/${channel.id}`)
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6" style={{ background: 'var(--theme-bg-primary)' }}>
      <div className="w-full max-w-md">
        <BrandedEmptyState
          icon={Hash}
          title="Your server is ready"
          description="Create your first channel to start chatting with your team."
          hint="Tip: Open server settings or right-click the sidebar to add channels quickly."
        />
      </div>
    </div>
  )
}
