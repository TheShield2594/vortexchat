-- Migration: Add Discord-like channel type parity
-- Extends channel type check constraint to include: forum, stage, announcement, media
-- Adds metadata fields for new channel types

-- 1. Drop the existing type check constraint
--    PostgreSQL auto-names inline CHECK constraints as <table>_<column>_check
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_type_check;

-- 2. Add updated constraint with all channel types
ALTER TABLE public.channels
  ADD CONSTRAINT channels_type_check
  CHECK (type IN ('text', 'voice', 'category', 'forum', 'stage', 'announcement', 'media'));

-- 3. Add metadata fields for new channel types
--    forum_guidelines: pinned message/rules shown at top of forum channels
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS forum_guidelines TEXT;

--    last_post_at: tracks last thread/post activity in forum channels
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS last_post_at TIMESTAMPTZ;

-- 4. Index for sorting forum channels by activity
CREATE INDEX IF NOT EXISTS idx_channels_last_post_at
  ON public.channels(last_post_at DESC NULLS LAST)
  WHERE type = 'forum';

-- Notes:
-- - Existing text/voice/category channels are unaffected (backward compatible).
-- - forum: thread-based posting channel; supports topic + forum_guidelines.
-- - stage: broadcast-style voice channel; supports topic as description.
-- - announcement: read-only (for non-mods) news/announcements channel; uses text message infrastructure.
-- - media: media-focused text channel; existing attachment infrastructure handles uploads.

-- ============================================================
-- Moderation: Verification, Screening, AutoMod, Timeouts
-- ============================================================

-- Server-level moderation settings (columns on servers table)
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS verification_level          SMALLINT NOT NULL DEFAULT 0
    CHECK (verification_level BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS explicit_content_filter     SMALLINT NOT NULL DEFAULT 0
    CHECK (explicit_content_filter BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS default_message_notifications SMALLINT NOT NULL DEFAULT 0
    CHECK (default_message_notifications BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS screening_enabled           BOOLEAN  NOT NULL DEFAULT FALSE;

-- Trigger function that refreshes updated_at on any row update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.screening_configs (
  server_id        UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'Server Rules',
  description      TEXT,
  rules_text       TEXT NOT NULL DEFAULT '',
  require_acceptance BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_screening_configs_updated_at
  BEFORE UPDATE ON public.screening_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.screening_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "server members can view screening config"
  ON public.screening_configs FOR SELECT
  USING (public.is_server_member(server_id));

CREATE POLICY "server owner manages screening config"
  ON public.screening_configs FOR ALL
  USING (public.is_server_owner(server_id));

CREATE TABLE IF NOT EXISTS public.member_screening (
  server_id    UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

ALTER TABLE public.member_screening ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own screening status"
  ON public.member_screening FOR SELECT
  USING (user_id = auth.uid() OR public.is_server_owner(server_id));

CREATE POLICY "users can accept screening"
  ON public.member_screening FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_server_member(server_id));

CREATE POLICY "server owner can manage screening records"
  ON public.member_screening FOR ALL
  USING (public.is_server_owner(server_id));

-- Member Timeouts
CREATE TABLE IF NOT EXISTS public.member_timeouts (
  server_id        UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  timed_out_until  TIMESTAMPTZ NOT NULL,
  moderator_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

ALTER TABLE public.member_timeouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "server members can view timeouts"
  ON public.member_timeouts FOR SELECT
  USING (public.is_server_member(server_id));

CREATE POLICY "system manages timeouts"
  ON public.member_timeouts FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.servers
      WHERE id = member_timeouts.server_id
        AND owner_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_member_timeouts_expiry
  ON public.member_timeouts(server_id, timed_out_until);

-- AutoMod Rules
CREATE TABLE IF NOT EXISTS public.automod_rules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id    UUID        NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  trigger_type TEXT        NOT NULL CHECK (trigger_type IN ('keyword_filter', 'mention_spam', 'link_spam')),
  config       JSONB       NOT NULL DEFAULT '{}',
  actions      JSONB       NOT NULL DEFAULT '[]',
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_automod_rules_updated_at
  BEFORE UPDATE ON public.automod_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.automod_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "server members can view automod rules"
  ON public.automod_rules FOR SELECT
  USING (public.is_server_member(server_id));

CREATE POLICY "server owner manages automod rules"
  ON public.automod_rules FOR ALL
  USING (public.is_server_owner(server_id));

CREATE INDEX IF NOT EXISTS idx_automod_rules_server
  ON public.automod_rules(server_id) WHERE enabled = TRUE;

CREATE OR REPLACE FUNCTION public.is_member_timed_out(
  p_server_id UUID,
  p_user_id   UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_timeouts mt
    WHERE mt.server_id = p_server_id
      AND mt.user_id   = p_user_id
      AND mt.timed_out_until > NOW()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_passed_screening(
  p_server_id UUID,
  p_user_id   UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN NOT (SELECT COALESCE(screening_enabled, FALSE) FROM public.servers WHERE id = p_server_id) THEN TRUE
      ELSE EXISTS (
        SELECT 1 FROM public.member_screening
        WHERE server_id = p_server_id AND user_id = p_user_id
      )
    END;
$$;

-- ============================================================
-- Expand permissions toward Discord-level granularity
-- ============================================================
ALTER TABLE public.server_members
  ADD COLUMN IF NOT EXISTS timeout_until TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_server_members_timeout_until
  ON public.server_members (server_id, user_id, timeout_until)
  WHERE timeout_until IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'server_members'
      AND policyname  = 'Moderators can update member timeout'
  ) THEN
    CREATE POLICY "Moderators can update member timeout"
      ON public.server_members FOR UPDATE
      USING (
        public.is_server_owner(server_id) OR
        public.has_permission(server_id, 16384) -- MODERATE_MEMBERS
      )
      WITH CHECK (
        public.is_server_owner(server_id) OR
        public.has_permission(server_id, 16384)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_timeout(
  p_server_id     UUID,
  p_member_id     UUID,
  p_timeout_until TIMESTAMPTZ,
  p_moderator_id  UUID DEFAULT NULL,
  p_reason        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_server_owner(p_server_id) OR
    public.has_permission(p_server_id, 16384)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING ERRCODE = '42501',
            DETAIL  = 'MODERATE_MEMBERS permission required to set timeouts';
  END IF;

  IF p_timeout_until IS NULL THEN
    DELETE FROM public.member_timeouts
    WHERE server_id = p_server_id
      AND user_id   = p_member_id;
  ELSE
    INSERT INTO public.member_timeouts
      (server_id, user_id, timed_out_until, moderator_id, reason, created_at)
    VALUES
      (p_server_id, p_member_id, p_timeout_until,
       COALESCE(p_moderator_id, auth.uid()), p_reason, NOW())
    ON CONFLICT (server_id, user_id) DO UPDATE SET
      timed_out_until = EXCLUDED.timed_out_until,
      moderator_id    = EXCLUDED.moderator_id,
      reason          = EXCLUDED.reason;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_member_timeout TO authenticated;

UPDATE public.roles
SET    permissions = permissions | 262144   -- USE_APPLICATION_COMMANDS
WHERE  is_default = TRUE
  AND  (permissions & 128) = 0;

-- ============================================================
-- Threads: Discord-style threads as first-class entities
-- ============================================================
CREATE TABLE IF NOT EXISTS public.threads (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_channel_id     UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  starter_message_id    UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  owner_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  archived              BOOLEAN NOT NULL DEFAULT FALSE,
  locked                BOOLEAN NOT NULL DEFAULT FALSE,
  auto_archive_duration INTEGER NOT NULL DEFAULT 1440,
  archived_at           TIMESTAMPTZ,
  message_count         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_parent_channel_id ON public.threads(parent_channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_owner_id          ON public.threads(owner_id);
CREATE INDEX IF NOT EXISTS idx_threads_archived          ON public.threads(parent_channel_id, archived);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);

CREATE TABLE IF NOT EXISTS public.thread_members (
  thread_id   UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_members_user_id ON public.thread_members(user_id);

CREATE TABLE IF NOT EXISTS public.thread_read_states (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  thread_id    UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mention_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_read_states_user ON public.thread_read_states(user_id);

CREATE TRIGGER threads_updated_at
  BEFORE UPDATE ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_thread_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE public.threads
    SET message_count = message_count + 1,
        updated_at    = NOW()
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_thread_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_thread_message();

CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.thread_read_states (user_id, thread_id, last_read_at, mention_count)
  VALUES (auth.uid(), p_thread_id, NOW(), 0)
  ON CONFLICT (user_id, thread_id) DO UPDATE
    SET last_read_at  = NOW(),
        mention_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.create_thread_from_message(
  p_message_id UUID,
  p_name       TEXT
)
RETURNS public.threads AS $$
DECLARE
  v_msg    public.messages%ROWTYPE;
  v_thread public.threads%ROWTYPE;
BEGIN
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  INSERT INTO public.threads (parent_channel_id, starter_message_id, owner_id, name)
  VALUES (v_msg.channel_id, p_message_id, auth.uid(), p_name)
  RETURNING * INTO v_thread;

  INSERT INTO public.thread_members (thread_id, user_id)
  VALUES (v_thread.id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN v_thread;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_read_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_select" ON public.threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.channels c
      JOIN public.server_members sm ON sm.server_id = c.server_id
      WHERE c.id = public.threads.parent_channel_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "threads_insert" ON public.threads
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.channels c
      JOIN public.server_members sm ON sm.server_id = c.server_id
      WHERE c.id = parent_channel_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "threads_update" ON public.threads
  FOR UPDATE USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.channels c
      WHERE c.id = public.threads.parent_channel_id
        AND public.is_server_owner(c.server_id)
    )
  );

CREATE POLICY "threads_delete" ON public.threads
  FOR DELETE USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.channels c
      WHERE c.id = public.threads.parent_channel_id
        AND public.is_server_owner(c.server_id)
    )
  );

CREATE POLICY "thread_members_select" ON public.thread_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.threads t
      JOIN public.channels c ON c.id = t.parent_channel_id
      JOIN public.server_members sm ON sm.server_id = c.server_id
      WHERE t.id = public.thread_members.thread_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "thread_members_insert" ON public.thread_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.threads t
      JOIN public.channels c ON c.id = t.parent_channel_id
      JOIN public.server_members sm ON sm.server_id = c.server_id
      WHERE t.id = thread_id
        AND sm.user_id = auth.uid()
        AND t.locked = FALSE
    )
  );

CREATE POLICY "thread_members_delete" ON public.thread_members
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "thread_read_states_select" ON public.thread_read_states
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "thread_read_states_insert" ON public.thread_read_states
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "thread_read_states_update" ON public.thread_read_states
  FOR UPDATE USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_read_states;
