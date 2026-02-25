const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"]
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/json",
])
const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "msi",
  "bat",
  "cmd",
  "scr",
  "com",
  "ps1",
  "js",
  "jar",
  "vbs",
  "dll",
  "sh",
])

export interface AttachmentInput {
  url: string
  filename: string
  size: number
  content_type: string
  width?: number
  height?: number
}

export function validateAttachments(attachments: AttachmentInput[]): { valid: boolean; error?: string } {
  for (const attachment of attachments) {
    if (!attachment.url || !attachment.filename || !attachment.content_type) {
      return { valid: false, error: "Attachment metadata is incomplete." }
    }

    if (!Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > MAX_ATTACHMENT_BYTES) {
      return { valid: false, error: `Attachment size must be between 1B and ${MAX_ATTACHMENT_BYTES} bytes.` }
    }

    const ext = attachment.filename.split(".").pop()?.toLowerCase()
    if (ext && BLOCKED_EXTENSIONS.has(ext)) {
      return { valid: false, error: `.${ext} files are blocked for safety.` }
    }

    const mime = attachment.content_type.toLowerCase()
    const mimeAllowed = ALLOWED_MIME_TYPES.has(mime) || ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))
    if (!mimeAllowed) {
      return { valid: false, error: `Unsupported attachment MIME type: ${attachment.content_type}` }
    }
  }

  return { valid: true }
}
