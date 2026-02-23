"use client"

import { useState } from "react"
import { Loader2, MessageSquare } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import type { ThreadRow } from "@/types/database"

interface Props {
  open: boolean
  onClose: () => void
  messageId: string
  /** Called with the newly created thread so the parent can open the thread panel */
  onCreated: (thread: ThreadRow) => void
}

export function CreateThreadModal({ open, onClose, messageId, onCreated }: Props) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create thread")
      toast({ title: "Thread created!" })
      setName("")
      onCreated(data as ThreadRow)
      onClose()
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ background: "#313338", border: "1px solid #1e1f22", color: "white" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MessageSquare className="w-5 h-5" style={{ color: "#5865f2" }} />
            Create Thread
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label style={{ color: "#b5bac1" }}>Thread Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) handleCreate()
              }}
              placeholder="e.g. Discussion about this"
              autoFocus
              style={{ background: "#1e1f22", border: "1px solid #4e5058", color: "white" }}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              style={{ color: "#b5bac1" }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || loading}
              style={{ background: "#5865f2", color: "white" }}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Thread
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
