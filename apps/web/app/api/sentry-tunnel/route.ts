import { NextRequest, NextResponse } from "next/server"

/**
 * Sentry tunnel endpoint — proxies Sentry envelopes through the first-party
 * domain so ad blockers don't intercept them.
 *
 * @see https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option
 */

const SENTRY_HOST = "o4510545385029632.ingest.us.sentry.io"
const SENTRY_PROJECT_ID = "4510615628611584"

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const envelope = await request.text()
    const [header] = envelope.split("\n", 1)

    let dsn: URL
    try {
      const parsed: { dsn?: string } = JSON.parse(header)
      if (!parsed.dsn) {
        return NextResponse.json({ error: "Missing DSN in envelope header" }, { status: 400 })
      }
      dsn = new URL(parsed.dsn)
    } catch {
      return NextResponse.json({ error: "Invalid envelope header" }, { status: 400 })
    }

    // Validate that the envelope is destined for our Sentry project
    if (dsn.hostname !== SENTRY_HOST) {
      return NextResponse.json({ error: "Invalid Sentry host" }, { status: 403 })
    }

    const projectId = dsn.pathname.replace("/", "")
    if (projectId !== SENTRY_PROJECT_ID) {
      return NextResponse.json({ error: "Invalid Sentry project" }, { status: 403 })
    }

    const upstreamUrl = `https://${SENTRY_HOST}/api/${SENTRY_PROJECT_ID}/envelope/`

    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      body: envelope,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    })

    return new NextResponse(upstreamRes.body, { status: upstreamRes.status })
  } catch (e) {
    console.error("Sentry tunnel error:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Tunnel error" }, { status: 500 })
  }
}
