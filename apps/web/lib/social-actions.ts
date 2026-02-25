interface ToastFn {
  (props: { variant?: "default" | "destructive"; title?: string }): void
}

interface RouterLike {
  push: (href: string) => void
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json()
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid server response")
  }
  return payload as Record<string, unknown>
}

/** Opens/creates a DM channel with a user and routes to the DM on success. */
export async function openDmChannel(userId: string, router: RouterLike, toast: ToastFn): Promise<void> {
  const response = await fetch("/api/dm/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: [userId] }),
  })

  const payload = await parseJsonResponse(response)

  if (response.ok) {
    const channelId = payload.id
    if (typeof channelId !== "string") {
      throw new Error("Missing DM channel id")
    }
    router.push(`/channels/me/${channelId}`)
    return
  }

  const message = typeof payload.error === "string" ? payload.error : "Failed to open DM"
  toast({ variant: "destructive", title: message })
}

/** Sends a friend request and shows toast feedback (409 remains non-destructive). */
export async function sendFriendRequest(username: string, toast: ToastFn): Promise<void> {
  const response = await fetch("/api/friends", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })

  const payload = await parseJsonResponse(response)
  const title =
    typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : "Request failed"

  toast({
    variant: response.ok || response.status === 409 ? "default" : "destructive",
    title,
  })
}
