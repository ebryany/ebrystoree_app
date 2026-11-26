-- Additive, idempotent migration for mobile push notification tokens and dispatch log.
-- Apply only with explicit approval on target Supabase environment.

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  app_version text,
  device_label text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_push_tokens_user_token_key unique (user_id, token)
);

create index if not exists idx_user_push_tokens_active_user
  on public.user_push_tokens (user_id)
  where revoked_at is null;

alter table public.user_push_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens' and policyname = 'user_push_tokens_select_own'
  ) then
    create policy user_push_tokens_select_own
      on public.user_push_tokens for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens' and policyname = 'user_push_tokens_insert_own'
  ) then
    create policy user_push_tokens_insert_own
      on public.user_push_tokens for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens' and policyname = 'user_push_tokens_update_own'
  ) then
    create policy user_push_tokens_update_own
      on public.user_push_tokens for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens' and policyname = 'user_push_tokens_delete_own'
  ) then
    create policy user_push_tokens_delete_own
      on public.user_push_tokens for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.push_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  attempts int not null default 1,
  provider_message_id text,
  error text,
  dispatched_at timestamptz not null default now(),
  constraint push_dispatch_log_notif_token_key unique (notification_id, token_hash)
);

create index if not exists idx_push_dispatch_log_dispatched
  on public.push_dispatch_log (dispatched_at desc);

alter table public.push_dispatch_log enable row level security;
-- Server-only via service_role; no client RLS policies granted.
