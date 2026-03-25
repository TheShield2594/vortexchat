import { NextRequest, NextResponse } from "next/server"

/**
 * Web Share Target handler.
 * Receives shared content from the OS share sheet and redirects to the chat view.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData()
    const title = formData.get("title") as string | null
    const text = formData.get("text") as string | null
    const url = formData.get("url") as string | null
    const files = formData.getAll("media")

    const baseUrl = new URL("/channels/me", req.url)

    if (files.length > 0) {
      baseUrl.searchParams.set("share_files", "1")
      return NextResponse.redirect(baseUrl, 303)
    }

    if (text) baseUrl.searchParams.set("share_text", text)
    if (url) baseUrl.searchParams.set("share_url", url)
    if (title) baseUrl.searchParams.set("share_title", title)

    return NextResponse.redirect(baseUrl, 303)
  } catch {
    return NextResponse.json({ error: "Failed to process shared content" }, { status: 400 })
  }
}
