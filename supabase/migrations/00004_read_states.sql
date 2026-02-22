-- Read States Migration
-- Tracks the last-read position per user per channel.

CREATE TABLE IF NOT EXISTS public.read_states (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mention_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS read_states_user_idx ON public.read_states (user_id);
CREATE INDEX IF NOT EXISTS read_states_channel_idx ON public.read_states (channel_id);

-- RLS
ALTER TABLE public.read_states ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own read states
CREATE POLICY "read_states_select" ON public.read_states
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "read_states_insert" ON public.read_states
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "read_states_update" ON public.read_states
  FOR UPDATE USING (user_id = auth.uid());

-- Enable realtime for read_states so sidebar updates in real time
ALTER PUBLICATION supabase_realtime ADD TABLE public.read_states;

-- ============================================================
-- Add mentions column to messages for @mention tracking
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mention_everyone BOOLEAN NOT NULL DEFAULT FALSE;

-- Helper function: upsert read state and reset mention count
CREATE OR REPLACE FUNCTION public.mark_channel_read(p_channel_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.read_states (user_id, channel_id, last_read_at, mention_count)
  VALUES (auth.uid(), p_channel_id, NOW(), 0)
  ON CONFLICT (user_id, channel_id) DO UPDATE
    SET last_read_at = NOW(), mention_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
