import { NextRequest, NextResponse } from "next/server"
import { requireServerPermission } from "@/lib/server-auth"
import Anthropic from "@anthropic-ai/sdk"

type Params = { params: Promise<{ serverId: string; channelId: string }> }

const client = new Anthropic()

/**
 * POST /api/servers/[serverId]/channels/[channelId]/summarize
 *
 * AI-powered channel catch-up summary.
 * Fetches recent messages and summarises them with Claude.
 * Requires VIEW_CHANNELS permission.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { serverId, channelId } = await params
  const { supabase, user, error } = await requireServerPermission(serverId, "VIEW_CHANNELS")
  if (error) return error

  // Optional: since=ISO timestamp passed by client (user's last read time)
  let since: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body.since === "string") since = body.since
  } catch {
    // ignore parse errors
  }

  // Verify channel belongs to this server
  const { data: channel } = await supabase
    .from("channels")
    .select("id, name, server_id")
    .eq("id", channelId)
    .eq("server_id", serverId)
    .single()

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 })
  }

  // Fetch recent messages (up to 150, or since last read)
  let query = supabase
    .from("messages")
    .select(`
      id,
      content,
      created_at,
      author:users!author_id(username, display_name),
      deleted_at
    `)
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(150)

  if (since) {
    query = query.gte("created_at", since)
  }

  const { data: messages, error: msgError } = await query

  if (msgError) {
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 })
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({
      summary: "No new messages to summarize.",
      highlights: [],
      messageCount: 0,
    })
  }

  // Reverse so they're chronological for the prompt
  const chronological = [...messages].reverse()

  const transcript = chronological
    .map((m) => {
      const author = Array.isArray(m.author) ? m.author[0] : m.author
      const name = (author as { display_name?: string; username?: string } | null)?.display_name
        || (author as { username?: string } | null)?.username
        || "Unknown"
      return `[${name}]: ${m.content}`
    })
    .join("\n")

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "AI summarization is not configured (missing ANTHROPIC_API_KEY)" }, { status: 503 })
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: `You are a helpful assistant that summarizes chat channel conversations.
Return your response as JSON with this exact shape:
{
  "summary": "2-4 sentence overview of what was discussed",
  "highlights": ["key point 1", "key point 2", "key point 3"],
  "topics": ["topic1", "topic2"]
}
Be concise and factual. Only include information from the conversation.`,
      messages: [
        {
          role: "user",
          content: `Summarize this conversation from the #${channel.name} channel (${chronological.length} messages):\n\n${transcript}`,
        },
      ],
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}"
    let parsed: { summary: string; highlights: string[]; topics: string[] }
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { summary: text, highlights: [], topics: [] }
    }

    return NextResponse.json({
      summary: parsed.summary ?? "",
      highlights: parsed.highlights ?? [],
      topics: parsed.topics ?? [],
      messageCount: chronological.length,
      since: since ?? chronological[0]?.created_at ?? null,
    })
  } catch (aiError: unknown) {
    console.error("AI summarization failed", aiError)
    return NextResponse.json({ error: "AI summarization failed" }, { status: 500 })
  }
}
