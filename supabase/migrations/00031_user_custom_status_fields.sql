alter table if exists public.users
  add column if not exists status_emoji text,
  add column if not exists status_expires_at timestamptz;
