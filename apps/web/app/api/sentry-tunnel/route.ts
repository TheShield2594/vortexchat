import { NextRequest, NextResponse } from "next/server"

/**
 * Sentry tunnel endpoint — proxies Sentry envelopes through the first-party
 * domain so ad blockers don't intercept them.
 *
 * @see https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option
 */

// Derive allowed host and project ID from the same DSN the client SDK uses,
// so there is no risk of the server-side allowlist drifting out of sync.
function parseDsnEnv(): { host: string; projectId: string } | null {
  const raw = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!raw) return null
  try {
    const url = new URL(raw)
    return { host: url.hostname, projectId: url.pathname.replace(/\//g, "") }
  } catch {
    return null
  }
}

const UPSTREAM_TIMEOUT_MS = 5_000

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const allowed = parseDsnEnv()
    if (!allowed) {
      return NextResponse.json({ error: "Sentry DSN not configured" }, { status: 503 })
    }

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
    if (dsn.hostname !== allowed.host) {
      return NextResponse.json({ error: "Invalid Sentry host" }, { status: 403 })
    }

    const projectId = dsn.pathname.replace(/\//g, "")
    if (projectId !== allowed.projectId) {
      return NextResponse.json({ error: "Invalid Sentry project" }, { status: 403 })
    }

    const upstreamUrl = `https://${allowed.host}/api/${allowed.projectId}/envelope/`

    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      body: envelope,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    return new NextResponse(upstreamRes.body, { status: upstreamRes.status })
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return NextResponse.json({ error: "Upstream timeout" }, { status: 504 })
    }
    console.error("Sentry tunnel error:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Tunnel error" }, { status: 500 })
  }
}
