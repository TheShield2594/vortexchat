-- Migration: Fix issues found during migration verification audit
-- Addresses:
-- 1. SECURITY DEFINER functions missing SET search_path = '' (regression from 00048/00049 hardening)
-- 2. NULL in CHECK IN-list (dead code) in user_activity_log.ref_type
-- 3. Deprecated auth.users columns in system bot migration (is_super_admin, instance_id)

-- ============================================================
-- 1. Fix search_path on SECURITY DEFINER functions
-- 00053: reorder_channels – uses SET search_path = public (should be '')
-- 00054: join_server_by_invite – uses SET search_path = public (should be '')
-- 00065: auto_archive_inactive_threads – missing SET search_path entirely
-- 00065: create_thread_from_message – missing SET search_path entirely
-- 00058: prune_activity_log – missing SET search_path (trigger function hardening)
-- ============================================================

ALTER FUNCTION public.reorder_channels(UUID, JSONB) SET search_path = '';
ALTER FUNCTION public.join_server_by_invite(TEXT) SET search_path = '';
ALTER FUNCTION public.auto_archive_inactive_threads() SET search_path = '';
ALTER FUNCTION public.create_thread_from_message(UUID, TEXT, INTEGER) SET search_path = '';

-- ============================================================
-- 2. Fix NULL in CHECK IN-list on user_activity_log.ref_type
-- NULL inside IN(...) is dead code; replace with proper OR IS NULL
-- ============================================================

ALTER TABLE public.user_activity_log
  DROP CONSTRAINT IF EXISTS user_activity_log_ref_type_check;

ALTER TABLE public.user_activity_log
  ADD CONSTRAINT user_activity_log_ref_type_check
  CHECK (ref_type IS NULL OR ref_type IN ('channel', 'server', 'message', 'file'));

-- ============================================================
-- 3. Fix system bot auth.users row for newer Supabase versions
-- Remove deprecated is_super_admin column reference.
-- Use a conditional block so this is safe on both old and new schemas.
-- ============================================================

DO $$
BEGIN
  -- Only attempt the fix if the row exists and the column still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'is_super_admin'
  ) THEN
    -- Column exists (older Supabase), nothing to do – original migration works fine
    NULL;
  ELSE
    -- Column was removed (newer Supabase). Re-insert without deprecated columns
    -- if the row is somehow missing.
    IF NOT EXISTS (
      SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'
    ) THEN
      INSERT INTO auth.users (
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        banned_until
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        'authenticated',
        'authenticated',
        'automod@system.internal',
        '',
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"system","providers":["system"]}',
        '{}',
        'infinity'::timestamptz
      );
    END IF;
  END IF;
END;
$$;

-- Also fix search_path on prune_activity_log (from 00058, missed by 00048/00049)
ALTER FUNCTION public.prune_activity_log() SET search_path = '';
