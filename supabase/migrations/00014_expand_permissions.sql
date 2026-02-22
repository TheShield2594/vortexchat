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
--    The existing "Members can update own nickname" policy only allows
--    self-updates.  We need a second policy so that members holding
--    MODERATE_MEMBERS (16384) can update any member row in the server.
--    Application-level guards (API route) further restrict what fields
--    can be changed and prevent targeting owners/admins.
-- ============================================================
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

-- ============================================================
-- 3. Data compatibility: grant USE_APPLICATION_COMMANDS (262144)
--    to all existing @everyone roles so existing servers don't
--    lose that capability after the upgrade.
-- ============================================================
UPDATE public.roles
SET    permissions = permissions | 262144   -- USE_APPLICATION_COMMANDS
WHERE  is_default = TRUE
  AND  (permissions & 128) = 0;            -- skip existing ADMINISTRATOR roles
