"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  emphasizeRiskLabel?: string
  entitySummary?: string
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
  emphasizeRiskLabel,
  entitySummary,
  isLoading = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [riskConfirmed, setRiskConfirmed] = useState(false)

  useEffect(() => {
    if (!open) {
      setRiskConfirmed(false)
    }
  }, [open])

  const canConfirm = useMemo(
    () => !isLoading && (emphasizeRiskLabel ? riskConfirmed : true),
    [emphasizeRiskLabel, isLoading, riskConfirmed]
  )

  async function handleConfirm() {
    if (!canConfirm) return
    await onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-red-500/20 bg-[#1e1f22] text-[#f2f3f5] shadow-2xl shadow-black/40 data-[state=open]:duration-300 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-[46%]">
        <DialogHeader className="gap-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="text-lg text-white">{title}</DialogTitle>
          <DialogDescription className="text-[#b5bac1]">{description}</DialogDescription>
          {entitySummary && (
            <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#dcddde]">
              “{entitySummary}”
            </div>
          )}
        </DialogHeader>

        {emphasizeRiskLabel && (
          <label className="flex items-start gap-2 rounded-md border border-white/10 bg-black/20 p-3 text-sm text-[#dcddde]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-red-500"
              checked={riskConfirmed}
              onChange={(event) => setRiskConfirmed(event.target.checked)}
            />
            <span>{emphasizeRiskLabel}</span>
          </label>
        )}

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="text-[#b5bac1] hover:bg-white/10 hover:text-white"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className="bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {isLoading ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
