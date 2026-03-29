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
      .from("dm_attachments")
      .select("id, url, dm_id, filename, content_type")
      .eq("id", attachmentId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 500 })
    if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

    // Get the DM to find the channel
    const { data: dm } = await supabase
      .from("direct_messages")
      .select("dm_channel_id")
      .eq("id", attachment.dm_id)
      .maybeSingle()

    if (!dm) return NextResponse.json({ error: "Attachment not accessible" }, { status: 403 })

    // Verify the user is a member of this DM channel
    const { data: membership } = await supabase
      .from("dm_channel_members")
      .select("user_id")
      .eq("dm_channel_id", dm.dm_channel_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Extract the storage path from the URL and create a fresh signed URL
    const storagePath = extractStoragePath(attachment.url)
    if (storagePath) {
      const { data: signedData, error: signError } = await supabase.storage
        .from("attachments")
        .createSignedUrl(storagePath, 3600) // 1 hour expiry

      if (!signError && signedData?.signedUrl) {
        return NextResponse.redirect(signedData.signedUrl)
      }
    }

    // Fallback to stored URL
    return NextResponse.redirect(attachment.url)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** Extract the storage path from a Supabase storage URL */
function extractStoragePath(url: string): string | null {
  try {
    const parsed = new URL(url)
    // Supabase storage URLs contain /object/public/bucketname/ or /object/sign/bucketname/
    const match = parsed.pathname.match(/\/object\/(?:public|sign)\/attachments\/(.+)/)
    if (match?.[1]) return decodeURIComponent(match[1])

    // Also handle /storage/v1/object/ pattern
    const altMatch = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/attachments\/(.+)/)
    if (altMatch?.[1]) return decodeURIComponent(altMatch[1])

    return null
  } catch {
    return null
  }
}
