-- Migration: Add MANAGE_EMOJIS permission (bit 20 = 1048576)
-- Replaces ADMINISTRATOR-only gating on emoji storage and table RLS with
-- the new MANAGE_EMOJIS permission, so non-admin members with the right
-- role can upload/manage custom emojis.
--
-- NOTE: MANAGE_EMOJIS is NOT granted to default roles. Server admins must
-- explicitly enable it on roles via the role settings UI. Administrators
-- already bypass all permission checks so they don't need the explicit bit.

-- ── Backfill: grant MANAGE_EMOJIS to roles that already have ADMINISTRATOR ───
-- This ensures the RLS policies keep working for existing admin roles whose
-- permissions are checked at the DB level (where ADMINISTRATOR bypass is in
-- the app layer, not in the has_permission() SQL function).
UPDATE public.roles
SET    permissions = permissions | 1048576
WHERE  (permissions & 128) != 0;

-- ── Update server_emojis table RLS ───────────────────────────────────────────
-- Drop the old ADMINISTRATOR-only policy and create one using MANAGE_EMOJIS.
DROP POLICY IF EXISTS "Admins can manage emojis" ON server_emojis;

CREATE POLICY "Members with manage_emojis can manage emojis"
  ON server_emojis FOR ALL
  USING (
    public.has_permission(server_emojis.server_id, 1048576 /* MANAGE_EMOJIS */)
  );

-- ── Update storage RLS for server-emojis bucket ─────────────────────────────
-- Replace ADMINISTRATOR (128) with MANAGE_EMOJIS (1048576) on INSERT/UPDATE/DELETE.

DROP POLICY IF EXISTS "Admins can upload server emojis"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can update server emojis"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete server emojis"  ON storage.objects;

CREATE POLICY "Emoji managers can upload server emojis"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'server-emojis' AND
    public.has_permission(((storage.foldername(name))[1])::uuid, 1048576)
  );

CREATE POLICY "Emoji managers can update server emojis"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'server-emojis' AND
    public.has_permission(((storage.foldername(name))[1])::uuid, 1048576)
  );

CREATE POLICY "Emoji managers can delete server emojis"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'server-emojis' AND
    public.has_permission(((storage.foldername(name))[1])::uuid, 1048576)
  );
