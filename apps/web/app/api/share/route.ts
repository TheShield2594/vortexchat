import { NextRequest, NextResponse } from "next/server"

/** Maximum length for shared text to keep redirect URLs under browser limits. */
const MAX_SHARE_TEXT_LENGTH = 1000

/** Type-safe extraction of a string field from FormData (rejects File values). */
function getStringField(formData: FormData, name: string): string | null {
  const value = formData.get(name)
  if (value === null) return null
  if (typeof value === "string") return value
  // FormData.get() can return a File object — reject it for string fields
  return null
}

/**
 * Web Share Target handler.
 * Receives shared content from the OS share sheet and redirects to the chat view.
 *
 * NOTE: File sharing is not yet implemented. The manifest share_target accepts
 * files so the OS share sheet shows VortexChat for media, but this handler
 * currently redirects with a flag rather than persisting the files.
 * TODO: Upload shared files to blob storage and include references in the
 * redirect URL so the chat input can attach them.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData()
    const title = getStringField(formData, "title")
    const text = getStringField(formData, "text")
    const url = getStringField(formData, "url")
    const files = formData.getAll("media")

    const baseUrl = new URL("/channels/me", req.url)

    if (files.length > 0) {
      // TODO: Upload files to blob storage and pass references in the redirect URL.
      // For now, redirect with a flag so the UI can show a "file sharing coming soon" message.
      baseUrl.searchParams.set("share_files", "1")
      return NextResponse.redirect(baseUrl, 303)
    }

    if (text) {
      const truncated = text.length > MAX_SHARE_TEXT_LENGTH
        ? text.slice(0, MAX_SHARE_TEXT_LENGTH)
        : text
      baseUrl.searchParams.set("share_text", truncated)
    }
    if (url) baseUrl.searchParams.set("share_url", url)
    if (title) baseUrl.searchParams.set("share_title", title)

    return NextResponse.redirect(baseUrl, 303)
  } catch {
    return NextResponse.json({ error: "Failed to process shared content" }, { status: 400 })
  }
}
