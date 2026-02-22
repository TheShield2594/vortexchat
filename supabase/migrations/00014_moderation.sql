-- ============================================================
-- Moderation: Verification, Screening, AutoMod, Timeouts
-- ============================================================

-- ============================================================
-- Server-level moderation settings (columns on servers table)
-- ============================================================
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS verification_level          SMALLINT NOT NULL DEFAULT 0
    CHECK (verification_level BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS explicit_content_filter     SMALLINT NOT NULL DEFAULT 0
    CHECK (explicit_content_filter BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS default_message_notifications SMALLINT NOT NULL DEFAULT 0
    CHECK (default_message_notifications BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS screening_enabled           BOOLEAN  NOT NULL DEFAULT FALSE;

-- verification_level:
--   0 = NONE        (unrestricted)
--   1 = LOW         (verified email)
--   2 = MEDIUM      (member for >5 min)
--   3 = HIGH        (member for >10 min)
--   4 = VERY_HIGH   (verified phone)

-- explicit_content_filter:
--   0 = DISABLED
--   1 = MEMBERS_WITHOUT_ROLES
--   2 = ALL_MEMBERS

-- default_message_notifications:
--   0 = ALL_MESSAGES
--   1 = ONLY_MENTIONS

-- ============================================================
-- Membership Screening
-- ============================================================
-- Trigger function that refreshes updated_at on any row update.
-- Attached to screening_configs and automod_rules after their definitions.
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

-- Track which members have passed screening
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

-- ============================================================
-- Member Timeouts
-- ============================================================
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

-- Only the service role (API server) or the server owner may mutate timeouts.
-- The previous USING(TRUE) was overly permissive: any authenticated user could
-- insert, update, or delete any timeout record.
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

-- ============================================================
-- AutoMod Rules
-- ============================================================
-- trigger_type values:
--   'keyword_filter'   – blocked keyword list
--   'mention_spam'     – too many @mentions in one message
--   'link_spam'        – too many links in one message or per time window
CREATE TABLE IF NOT EXISTS public.automod_rules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id    UUID        NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  trigger_type TEXT        NOT NULL CHECK (trigger_type IN ('keyword_filter', 'mention_spam', 'link_spam')),
  -- For keyword_filter:  { "keywords": ["word1","word2"], "regex_patterns": [] }
  -- For mention_spam:    { "mention_threshold": 5 }
  -- For link_spam:       { "link_threshold": 3 }
  config       JSONB       NOT NULL DEFAULT '{}',
  -- Actions array, each element: { "type": "block_message"|"timeout_member"|"alert_channel", "duration_seconds": 60, "channel_id": "uuid" }
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

-- ============================================================
-- Audit log: additional action types are free-form text,
-- no schema change needed — just document the new ones:
--   'member_timeout'        – user was timed out
--   'member_timeout_remove' – timeout removed
--   'member_kick'           – user was kicked
--   'automod_block'         – automod blocked a message
--   'automod_timeout'       – automod timed out a user
--   'automod_alert'         – automod alerted mod channel
--   'automod_rule_created'  – new automod rule added
--   'automod_rule_updated'  – automod rule changed
--   'automod_rule_deleted'  – automod rule removed
--   'screening_accepted'    – member accepted screening rules
--   'moderation_settings_updated' – server mod settings changed
-- ============================================================

-- Helper function: check if a member is currently timed out
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

-- Helper function: check if a member has passed screening
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
      -- If screening is not enabled, everyone passes
      WHEN NOT (SELECT COALESCE(screening_enabled, FALSE) FROM public.servers WHERE id = p_server_id) THEN TRUE
      -- Otherwise check the member_screening table
      ELSE EXISTS (
        SELECT 1 FROM public.member_screening
        WHERE server_id = p_server_id AND user_id = p_user_id
      )
    END;
$$;
