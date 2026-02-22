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
-- 2. Helper SQL function: resolve effective permission bitmask
--    for a member across all their assigned roles.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_member_permissions(
  p_server_id UUID,
  p_user_id   UUID
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT BIT_OR(r.permissions)
      FROM   public.member_roles mr
      JOIN   public.roles        r  ON r.id = mr.role_id
      WHERE  mr.server_id = p_server_id
        AND  mr.user_id   = p_user_id
    ),
    0
  );
$$;

-- Grant execute to authenticated users so the function can be called
-- from client-side Supabase RPC when needed.
GRANT EXECUTE ON FUNCTION public.get_member_permissions(UUID, UUID)
  TO authenticated;

-- ============================================================
-- 3. Data compatibility: grant USE_APPLICATION_COMMANDS (262144)
--    to all existing @everyone roles so existing servers don't
--    lose that capability after the upgrade.
-- ============================================================
UPDATE public.roles
SET    permissions = permissions | 262144   -- USE_APPLICATION_COMMANDS
WHERE  is_default = TRUE
  AND  (permissions & 128) = 0;            -- skip existing ADMINISTRATOR roles
