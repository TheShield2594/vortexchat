-- Migration 00014: Expand permissions toward Discord-level granularity
--
-- New permission bitmasks (mirrored from packages/shared/src/index.ts):
--   MANAGE_WEBHOOKS          = 4096   (1 << 12)
--   MANAGE_EVENTS            = 8192   (1 << 13)
--   MODERATE_MEMBERS         = 16384  (1 << 14)  — timeout users
--   CREATE_PUBLIC_THREADS    = 32768  (1 << 15)
--   CREATE_PRIVATE_THREADS   = 65536  (1 << 16)
--   SEND_MESSAGES_IN_THREADS = 131072 (1 << 17)
--   USE_APPLICATION_COMMANDS = 262144 (1 << 18)
--   MENTION_EVERYONE         = 524288 (1 << 19)
--
-- The get_member_permissions() helper was already introduced in migration
-- 00002 and correctly includes @everyone and the owner shortcut. This
-- migration deliberately does NOT redefine it to avoid clobbering that logic.
--
-- Existing roles keep their current bitmask values intact (additive — new
-- bits default to 0, so no previously-granted permissions are revoked).

-- ============================================================
-- 1. Add timeout support to server_members
-- ============================================================
ALTER TABLE public.server_members
  ADD COLUMN IF NOT EXISTS timeout_until TIMESTAMPTZ DEFAULT NULL;

-- Index to make "is this member timed-out?" lookups fast.
CREATE INDEX IF NOT EXISTS idx_server_members_timeout_until
  ON public.server_members (server_id, user_id, timeout_until)
  WHERE timeout_until IS NOT NULL;

-- ============================================================
-- 2. RLS: allow moderators to set/clear timeout_until on others
--
--    Wrapped in a DO block so replaying the migration is safe.
-- ============================================================
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

-- ============================================================
-- 3. SECURITY DEFINER function for applying / clearing timeouts
--
--    Runs with the schema owner's privileges so it can write to
--    member_timeouts without a broad UPDATE policy on that table.
--    The application (PATCH /api/servers/[id]/members) calls this
--    via supabase.rpc('set_member_timeout', ...) so all timeout
--    writes go through a single, permission-checked code path that
--    messages/route.ts will correctly observe.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_member_timeout(
  p_server_id     UUID,
  p_member_id     UUID,
  p_timeout_until TIMESTAMPTZ,   -- NULL to clear the timeout
  p_moderator_id  UUID DEFAULT NULL,
  p_reason        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller holds MODERATE_MEMBERS (16384) or is the server owner.
  IF NOT (
    public.is_server_owner(p_server_id) OR
    public.has_permission(p_server_id, 16384)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING ERRCODE = '42501',
            DETAIL  = 'MODERATE_MEMBERS permission required to set timeouts';
  END IF;

  IF p_timeout_until IS NULL THEN
    -- Clear the timeout
    DELETE FROM public.member_timeouts
    WHERE server_id = p_server_id
      AND user_id   = p_member_id;
  ELSE
    -- Upsert the timeout
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

-- Allow authenticated users to call the function; the function itself
-- enforces MODERATE_MEMBERS before making any changes.
GRANT EXECUTE ON FUNCTION public.set_member_timeout TO authenticated;

-- ============================================================
-- 4. Data compatibility: grant USE_APPLICATION_COMMANDS (262144)
--    to all existing @everyone roles so existing servers don't
--    lose that capability after the upgrade.
-- ============================================================
UPDATE public.roles
SET    permissions = permissions | 262144   -- USE_APPLICATION_COMMANDS
WHERE  is_default = TRUE
  AND  (permissions & 128) = 0;            -- skip existing ADMINISTRATOR roles
