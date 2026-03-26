import { NextRequest, NextResponse } from "next/server"
import { isAttachmentDownloadAllowed } from "@/lib/attachment-access"
import { requireAuth } from "@/lib/utils/api-helpers"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const { attachmentId } = await params
  const { supabase, user, error: authError } = await requireAuth()
  if (authError) return authError

  const { data: attachment, error } = await supabase
    .from("attachments")
    .select("id, url, scan_state, quarantined_reason, message_id")
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

  if (!isAttachmentDownloadAllowed(attachment.scan_state)) {
    return NextResponse.json(
      {
        error: "Attachment is not available until malware scan succeeds.",
        scanState: attachment.scan_state,
        reason: attachment.quarantined_reason,
      },
      { status: 423 }
    )
  }

  return NextResponse.redirect(attachment.url)
}
