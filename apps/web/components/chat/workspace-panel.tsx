"use client"

import { useEffect, useState } from "react"
import { CheckSquare, FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

type Task = { id: string; title: string; status: string; due_date: string | null }
type Doc = { id: string; title: string; updated_at: string }

export function WorkspacePanel({ channelId, open }: { channelId: string; open: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [taskTitle, setTaskTitle] = useState("")
  const [docTitle, setDocTitle] = useState("")

  async function load() {
    const [tasksRes, docsRes] = await Promise.all([
      fetch(`/api/channels/${channelId}/tasks`),
      fetch(`/api/channels/${channelId}/docs`),
    ])
    if (tasksRes.ok) setTasks((await tasksRes.json()).tasks ?? [])
    if (docsRes.ok) setDocs((await docsRes.json()).docs ?? [])
  }

  useEffect(() => { if (open) void load() }, [open, channelId])
  if (!open) return null

  return (
    <aside className="w-80 border-l border-white/10 bg-[#1f2126] p-3 overflow-y-auto">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-white"><CheckSquare className="w-4 h-4" /> Tasks</div>
        <div className="flex gap-2 mb-2">
          <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="New task" className="flex-1 bg-black/30 rounded px-2 py-1 text-sm" />
          <Button size="sm" onClick={async () => {
            await fetch(`/api/channels/${channelId}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: taskTitle }) })
            setTaskTitle("")
            await load()
          }}><Plus className="w-3 h-3" /></Button>
        </div>
        <div className="space-y-1">
          {tasks.map((task) => (
            <div key={task.id} className="rounded bg-black/20 p-2 text-xs text-zinc-200">
              <div className="font-medium">{task.title}</div>
              <div className="text-zinc-400">{task.status}{task.due_date ? ` • due ${new Date(task.due_date).toLocaleDateString()}` : ""}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-white"><FileText className="w-4 h-4" /> Docs & Notes</div>
        <div className="flex gap-2 mb-2">
          <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="New note" className="flex-1 bg-black/30 rounded px-2 py-1 text-sm" />
          <Button size="sm" onClick={async () => {
            await fetch(`/api/channels/${channelId}/docs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: docTitle, content: "" }) })
            setDocTitle("")
            await load()
          }}><Plus className="w-3 h-3" /></Button>
        </div>
        <div className="space-y-1">
          {docs.map((doc) => (
            <div key={doc.id} className="rounded bg-black/20 p-2 text-xs text-zinc-200">
              <div className="font-medium">{doc.title}</div>
              <div className="text-zinc-400">updated {new Date(doc.updated_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
