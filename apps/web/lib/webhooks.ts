interface WebhookChannel {
  id: string
  name: string
}

export async function createWebhook(serverId: string, channelId: string, name: string) {
  return fetch(`/api/servers/${serverId}/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, name: name.trim() || "Webhook" }),
  })
}

export async function deleteWebhook(serverId: string, webhookId: string) {
  return fetch(`/api/servers/${serverId}/webhooks?webhookId=${encodeURIComponent(webhookId)}`, { method: "DELETE" })
}

export function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text)
}

export function formatChannelName(channelId: string, channels: WebhookChannel[]) {
  return channels.find((channel) => channel.id === channelId)?.name ?? "Unknown"
}
