import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export default async function HomePage() {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    redirect("/channels/@me")
  } else {
    redirect("/login")
  }
}
