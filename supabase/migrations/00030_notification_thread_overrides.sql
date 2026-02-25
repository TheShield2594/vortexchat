-- Add thread-level notification overrides with deterministic precedence
alter table if exists public.notification_settings
  add column if not exists thread_id uuid references public.threads(id) on delete cascade;

-- Prevent impossible mixed scopes and allow explicit hierarchy levels
alter table if exists public.notification_settings
  drop constraint if exists notification_settings_scope_check;

alter table if exists public.notification_settings
  add constraint notification_settings_scope_check
  check (
    (
      server_id is null and channel_id is null and thread_id is null
    )
    or (
      server_id is not null and channel_id is null and thread_id is null
    )
    or (
      channel_id is not null and thread_id is null
    )
    or (
      thread_id is not null
    )
  );

create unique index if not exists notification_settings_user_thread_unique
  on public.notification_settings (user_id, thread_id)
  where thread_id is not null;
