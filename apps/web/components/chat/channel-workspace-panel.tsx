"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckSquare, FileText, Plus } from "lucide-react"
import type { ChannelDocRow, ChannelRow, ChannelTaskRow } from "@/types/database"
import { taskStatusLabel, type TaskStatus } from "@/lib/workspace"

interface Props {
  channel: ChannelRow
}

type ChannelTaskWithAssignee = ChannelTaskRow & {
  assignee?: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
}

export function ChannelWorkspacePanel({ channel }: Props) {
  const [tab, setTab] = useState<"tasks" | "docs">("tasks")
  const [tasks, setTasks] = useState<ChannelTaskWithAssignee[]>([])
  const [docs, setDocs] = useState<ChannelDocRow[]>([])
  const [taskTitle, setTaskTitle] = useState("")
  const [docTitle, setDocTitle] = useState("")

  useEffect(() => {
    fetch(`/api/channels/${channel.id}/tasks`)
      .then((r) => r.json())
      .then((d: { tasks?: ChannelTaskWithAssignee[] }) => setTasks(d.tasks ?? []))

    fetch(`/api/channels/${channel.id}/docs`)
      .then((r) => r.json())
      .then((d: { docs?: ChannelDocRow[] }) => setDocs(d.docs ?? []))
  }, [channel.id])

  const sortedTasks = useMemo(
    () => tasks.slice().sort((a, b) => Number(a.status === "done") - Number(b.status === "done")),
    [tasks]
  )

  async function createTask() {
    const trimmed = taskTitle.trim()
    if (!trimmed) return

    const res = await fetch(`/api/channels/${channel.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    })
    const data: { task?: ChannelTaskWithAssignee } = await res.json()
    if (data.task) setTasks((prev) => [data.task!, ...prev])
    setTaskTitle("")
  }

  async function createDoc() {
    const trimmed = docTitle.trim()
    if (!trimmed) return

    const res = await fetch(`/api/channels/${channel.id}/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed, content: "" }),
    })
    const data: { doc?: ChannelDocRow } = await res.json()
    if (data.doc) setDocs((prev) => [data.doc!, ...prev])
    setDocTitle("")
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    const res = await fetch(`/api/channels/${channel.id}/tasks?taskId=${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    const data: { task?: ChannelTaskWithAssignee } = await res.json()
    if (data.task) setTasks((prev) => prev.map((task) => (task.id === data.task!.id ? data.task! : task)))
  }

  return (
    <div className="w-80 border-l flex flex-col" style={{ borderColor: "#1e1f22", background: "#2b2d31" }}>
      <div className="flex p-2 gap-2 border-b" style={{ borderColor: "#1e1f22" }}>
        <button onClick={() => setTab("tasks")} className="px-2 py-1 text-xs rounded" style={{ background: tab === "tasks" ? "#5865f2" : "#1e1f22", color: "white" }}>
          <CheckSquare className="w-3 h-3 inline mr-1" />Tasks
        </button>
        <button onClick={() => setTab("docs")} className="px-2 py-1 text-xs rounded" style={{ background: tab === "docs" ? "#5865f2" : "#1e1f22", color: "white" }}>
          <FileText className="w-3 h-3 inline mr-1" />Docs
        </button>
      </div>

      {tab === "tasks" ? (
        <div className="p-3 space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="New task" className="flex-1 px-2 py-1 text-xs rounded" style={{ background: "#1e1f22", color: "#f2f3f5" }} />
            <button onClick={createTask} className="px-2 py-1 rounded" style={{ background: "#5865f2", color: "white" }}><Plus className="w-3 h-3" /></button>
          </div>
          {sortedTasks.map((task) => (
            <div key={task.id} className="p-2 rounded border text-xs" style={{ borderColor: "#1e1f22", color: "#b5bac1" }}>
              <div className="font-medium text-white">{task.title}</div>
              <div className="mt-1">{taskStatusLabel(task.status)}</div>
              <select
                value={task.status}
                onChange={(e) => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                className="mt-1 w-full px-1 py-1 rounded"
                style={{ background: "#1e1f22" }}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="New doc" className="flex-1 px-2 py-1 text-xs rounded" style={{ background: "#1e1f22", color: "#f2f3f5" }} />
            <button onClick={createDoc} className="px-2 py-1 rounded" style={{ background: "#5865f2", color: "white" }}><Plus className="w-3 h-3" /></button>
          </div>
          {docs.map((doc) => (
            <div key={doc.id} className="p-2 rounded border text-xs" style={{ borderColor: "#1e1f22", color: "#b5bac1" }}>
              <div className="font-medium text-white">{doc.title}</div>
              <p className="line-clamp-2 mt-1">{doc.content || "No content yet"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
