create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  username text,
  display_name text,
  profile_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_connections_provider_check check (provider in ('steam', 'github', 'x', 'twitch', 'youtube', 'reddit', 'website'))
);

create unique index if not exists user_connections_user_provider_unique
  on public.user_connections(user_id, provider);

create unique index if not exists user_connections_provider_user_unique
  on public.user_connections(provider, provider_user_id);

create index if not exists user_connections_user_id_idx
  on public.user_connections(user_id);

create or replace function public.set_user_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_connections_updated_at_trigger on public.user_connections;
create trigger set_user_connections_updated_at_trigger
before update on public.user_connections
for each row execute function public.set_user_connections_updated_at();

alter table public.user_connections enable row level security;

drop policy if exists "Users can view own connections" on public.user_connections;
create policy "Users can view own connections"
on public.user_connections
for select
using (auth.uid() = user_id);

drop policy if exists "Users can manage own connections" on public.user_connections;
create policy "Users can manage own connections"
on public.user_connections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
