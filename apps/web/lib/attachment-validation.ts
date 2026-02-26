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

/**
 * Magic bytes signatures for server-side MIME type detection.
 * Used to verify that a file's actual content matches its claimed extension/type.
 */
const MAGIC_BYTES: Array<{ bytes: number[]; offset: number; mime: string }> = [
  // Images
  { bytes: [0xFF, 0xD8, 0xFF], offset: 0, mime: "image/jpeg" },
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0, mime: "image/png" },
  { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0, mime: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, mime: "image/webp" }, // RIFF header (WebP)
  // PDF
  { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0, mime: "application/pdf" },
  // ZIP (also covers docx, xlsx, etc.)
  { bytes: [0x50, 0x4B, 0x03, 0x04], offset: 0, mime: "application/zip" },
  // Video
  { bytes: [0x00, 0x00, 0x00], offset: 0, mime: "video/mp4" }, // ftyp box (partial)
  { bytes: [0x1A, 0x45, 0xDF, 0xA3], offset: 0, mime: "video/webm" },
  // Audio
  { bytes: [0x49, 0x44, 0x33], offset: 0, mime: "audio/mpeg" }, // ID3 tag
  { bytes: [0xFF, 0xFB], offset: 0, mime: "audio/mpeg" }, // MPEG sync
  { bytes: [0x4F, 0x67, 0x67, 0x53], offset: 0, mime: "audio/ogg" },
  // Executables (to detect masquerading)
  { bytes: [0x4D, 0x5A], offset: 0, mime: "application/x-msdownload" }, // PE/MZ exe
  { bytes: [0x7F, 0x45, 0x4C, 0x46], offset: 0, mime: "application/x-elf" }, // ELF binary
]

/** MIME types that indicate executable content, always rejected regardless of extension. */
const EXECUTABLE_MIMES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-elf",
  "application/x-executable",
  "application/x-dosexec",
])

/**
 * Map of file extension to expected MIME type prefixes for mismatch detection.
 * If a file claims to be .jpg but magic bytes say it is an executable, reject it.
 */
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  mp3: ["audio/mpeg"],
  ogg: ["audio/ogg"],
  zip: ["application/zip"],
}

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

/**
 * Detect MIME type from file content using magic bytes.
 * Returns the detected MIME type or null if no match is found.
 */
export function detectMimeFromBytes(buffer: Uint8Array): string | null {
  for (const sig of MAGIC_BYTES) {
    if (buffer.length < sig.offset + sig.bytes.length) continue
    let match = true
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) {
        match = false
        break
      }
    }
    if (match) return sig.mime
  }
  return null
}

/**
 * Server-side validation of attachment content using magic bytes.
 * Fetches the first bytes of each attachment URL and verifies:
 * 1. The detected MIME type is not an executable
 * 2. If the extension has a known MIME mapping, the actual content matches
 *
 * Returns { valid: true } if all attachments pass, or { valid: false, error } on failure.
 *
 * NOTE: This function should only be called server-side. It fetches attachment content
 * from signed URLs to inspect the file headers.
 *
 * // TODO: AV scanning requires external service integration
 */
export async function validateAttachmentContent(
  attachments: AttachmentInput[]
): Promise<{ valid: boolean; error?: string; failedFilename?: string }> {
  for (const attachment of attachments) {
    try {
      // Fetch first 16 bytes — enough for all magic byte signatures
      const response = await fetch(attachment.url, {
        headers: { Range: "bytes=0-15" },
      })

      if (!response.ok) {
        // If range requests are not supported, try a full fetch with abort
        const fallbackResponse = await fetch(attachment.url)
        if (!fallbackResponse.ok) {
          return {
            valid: false,
            error: `Unable to verify attachment content: ${attachment.filename}`,
            failedFilename: attachment.filename,
          }
        }
        const fullBuffer = new Uint8Array(await fallbackResponse.arrayBuffer())
        const headerBytes = fullBuffer.slice(0, 16)
        const result = checkBytes(headerBytes, attachment)
        if (!result.valid) return result
        continue
      }

      const buffer = new Uint8Array(await response.arrayBuffer())
      const result = checkBytes(buffer, attachment)
      if (!result.valid) return result
    } catch {
      // If we can't fetch the file, skip content validation rather than blocking
      // (the client-side validation already ran)
      console.warn("Attachment content validation skipped (fetch failed):", attachment.filename)
    }
  }

  return { valid: true }
}

function checkBytes(
  buffer: Uint8Array,
  attachment: AttachmentInput
): { valid: boolean; error?: string; failedFilename?: string } {
  const detectedMime = detectMimeFromBytes(buffer)

  // Block executables masquerading as other file types
  if (detectedMime && EXECUTABLE_MIMES.has(detectedMime)) {
    return {
      valid: false,
      error: `File "${attachment.filename}" appears to be an executable and has been rejected for safety.`,
      failedFilename: attachment.filename,
    }
  }

  // Check extension/content mismatch
  const ext = attachment.filename.split(".").pop()?.toLowerCase()
  if (ext && detectedMime && EXTENSION_MIME_MAP[ext]) {
    const expectedMimes = EXTENSION_MIME_MAP[ext]
    if (!expectedMimes.some((expected) => detectedMime.startsWith(expected))) {
      return {
        valid: false,
        error: `File "${attachment.filename}" content does not match its extension (.${ext}). Detected: ${detectedMime}`,
        failedFilename: attachment.filename,
      }
    }
  }

  return { valid: true }
}
