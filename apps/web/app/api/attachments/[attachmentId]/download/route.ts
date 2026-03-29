import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/utils/api-helpers"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
): Promise<NextResponse> {
  const { attachmentId } = await params
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  try {
    const { data: attachment, error } = await supabase
      .from("attachments")
      .select("id, url, message_id, filename")
      .eq("id", attachmentId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 500 })
    if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

    const { data: message } = await supabase
      .from("messages")
      .select("channel_id")
      .eq("id", attachment.message_id)
      .maybeSingle()

    if (!message) return NextResponse.json({ error: "Attachment not accessible" }, { status: 403 })

    const { data: channel } = await supabase
      .from("channels")
      .select("server_id")
      .eq("id", message.channel_id)
      .maybeSingle()

    if (!channel) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (channel.server_id) {
      const { data: member } = await supabase
        .from("server_members")
        .select("user_id")
        .eq("server_id", channel.server_id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Create a fresh signed URL from the storage path rather than using the
    // stored URL (which may have expired — signed URLs have a 7-day TTL).
    const storagePath = extractStoragePath(attachment.url)
    if (storagePath) {
      const { data: signedData, error: signError } = await supabase.storage
        .from("attachments")
        .createSignedUrl(storagePath, 3600) // 1 hour

      if (!signError && signedData?.signedUrl) {
        return NextResponse.redirect(signedData.signedUrl)
      }
    }

    // Fallback to stored URL if path extraction fails
    return NextResponse.redirect(attachment.url)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** Extract the storage path from a Supabase signed/public URL */
function extractStoragePath(url: string): string | null {
  try {
    const parsed = new URL(url)
    // Supabase signed URLs: /storage/v1/object/sign/attachments/...
    const signMatch = parsed.pathname.match(/\/(?:storage\/v1\/)?object\/sign\/attachments\/(.+)/)
    if (signMatch?.[1]) return decodeURIComponent(signMatch[1])

    // Supabase public URLs: /storage/v1/object/public/attachments/...
    const pubMatch = parsed.pathname.match(/\/(?:storage\/v1\/)?object\/public\/attachments\/(.+)/)
    if (pubMatch?.[1]) return decodeURIComponent(pubMatch[1])

    return null
  } catch {
    return null
  }
}
