const inFlight = new Map<string, Promise<void>>()

export async function sendReactionMutation(params: {
  messageId: string
  emoji: string
  remove: boolean
  nonce: string
}): Promise<void> {
  const key = `${params.messageId}:${params.emoji}:${params.remove ? "remove" : "add"}`
  const running = inFlight.get(key)
  if (running) return running

  const request = fetch(`/api/messages/${params.messageId}/reactions`, {
    method: params.remove ? "DELETE" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ emoji: params.emoji, nonce: params.nonce }),
  }).then(async (res) => {
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload.error || "Failed to update reaction")
    }
  }).finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, request)
  return request
}
