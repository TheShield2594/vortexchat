"use client"

import { useEffect, useMemo, useState } from "react"
import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  acknowledgeRiskLabel?: string
  entitySummary?: string
  loadingLabel?: string
  isLoading?: boolean
  onConfirm: () => Promise<void> | void
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  acknowledgeRiskLabel,
  entitySummary,
  loadingLabel,
  isLoading = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)

  useEffect(() => {
    if (!open) {
      setRiskAcknowledged(false)
    }
  }, [open])

  const canConfirm = useMemo(
    () => !isLoading && (acknowledgeRiskLabel ? riskAcknowledged : true),
    [acknowledgeRiskLabel, isLoading, riskAcknowledged]
  )

  async function handleConfirm() {
    if (!canConfirm) return
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Keep dialog open so users can retry when the action fails.
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border border-red-500/20 bg-[#1e1f22] p-6 text-[#f2f3f5] shadow-2xl shadow-black/40 duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:slide-in-from-top-[46%] data-[state=closed]:slide-out-to-top-[48%]">
          <div className="flex flex-col gap-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialog.Title className="text-lg font-semibold text-white">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-[#b5bac1]">{description}</AlertDialog.Description>
            {entitySummary && (
              <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#dcddde]">
                “{entitySummary}”
              </div>
            )}
          </div>

          {acknowledgeRiskLabel && (
            <label
              htmlFor="confirm-action-risk-ack"
              className="mt-4 flex items-start gap-2 rounded-md border border-white/10 bg-black/20 p-3 text-sm text-[#dcddde]"
            >
              <input
                id="confirm-action-risk-ack"
                type="checkbox"
                className="mt-1 h-4 w-4 accent-red-500"
                checked={riskAcknowledged}
                onChange={(event) => setRiskAcknowledged(event.target.checked)}
              />
              <span>{acknowledgeRiskLabel}</span>
            </label>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button
                type="button"
                variant="ghost"
                className="text-[#b5bac1] hover:bg-white/10 hover:text-white"
                disabled={isLoading}
              >
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              type="button"
              className="bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {isLoading ? loadingLabel ?? "Working…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
