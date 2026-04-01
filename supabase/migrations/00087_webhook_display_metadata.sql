-- Add dedicated columns for webhook display metadata instead of prefixing message content.
-- This separates identity metadata from message body, fixing issues with reply previews,
-- search results, and copied text that previously included the **[WebhookName]** prefix.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS webhook_display_name TEXT,
  ADD COLUMN IF NOT EXISTS webhook_avatar_url TEXT;

COMMENT ON COLUMN public.messages.webhook_display_name IS
  'Display name override for webhook messages. Non-null only when webhook_id is set.';
COMMENT ON COLUMN public.messages.webhook_avatar_url IS
  'Avatar URL override for webhook messages. Non-null only when webhook_id is set.';
