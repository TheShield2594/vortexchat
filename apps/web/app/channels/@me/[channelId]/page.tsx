import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { DMChannelArea } from "@/components/dm/dm-channel-area"

interface Props {
  params: { channelId: string }
}

export default async function DMChannelPage({ params }: Props) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return <DMChannelArea channelId={params.channelId} currentUserId={user.id} />
}
