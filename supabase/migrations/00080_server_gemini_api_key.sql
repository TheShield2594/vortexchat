-- Server-level Gemini API key
-- Each server owner provides their own Gemini API key for AI features
-- (channel summarization, voice post-call summaries).
-- AI features are unavailable for a server until its owner sets a key.

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT DEFAULT NULL;

-- Only server owners (and service role) should read this column.
-- RLS on the servers table already restricts row access; the column is
-- excluded from public select queries by the application layer.

COMMENT ON COLUMN public.servers.gemini_api_key IS
  'Server-specific Gemini API key provided by the server owner. NULL = use instance default.';
