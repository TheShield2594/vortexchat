import type { AttachmentScanState } from "@/lib/attachment-malware"

export function isAttachmentDownloadAllowed(scanState: AttachmentScanState | null | undefined): boolean {
  return scanState === "clean"
}
