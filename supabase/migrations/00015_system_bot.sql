-- ============================================================
-- System / AutoMod bot user
--
-- A fixed, well-known user that the application uses to attribute
-- system-generated messages (e.g. AutoMod channel alerts) so they
-- don't appear to come from the violating member.
--
-- This user never authenticates; it has no password and its email
-- is an internal-only address.  The id is pinned so application
-- code can reference it as a constant.
-- ============================================================

DO $$
BEGIN
  -- Insert into auth.users only if the row doesn't already exist.
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'
  ) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'automod@system.internal',
      '',                 -- no password; this user never logs in
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"system","providers":["system"]}',
      '{}',
      FALSE
    );
  END IF;
END;
$$;

-- Matching public profile row (id FK → auth.users).
INSERT INTO public.users (id, username, display_name, status, avatar_url)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'automod',
  'AutoMod',
  'online',
  NULL
)
ON CONFLICT (id) DO NOTHING;
