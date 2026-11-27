-- Additive, idempotent migration for per-device push preferences and chat event dispatch deduplication.
-- Depends on 20261127060000_mobile_push_tokens.sql.
-- Apply ONLY with explicit owner approval on target Supabase environment.

alter table if exists public.user_push_tokens
  add column if not exists push_preferences jsonb not null default
    '{"orders":true,"payments":true,"chat":true,"wallet":true,"store":true,"promo":true,"muted":false}'::jsonb;

alter table if exists public.push_dispatch_log
  alter column notification_id drop not null;

alter table if exists public.push_dispatch_log
  add column if not exists event_key text;

update public.push_dispatch_log
set event_key = 'notif:' || notification_id::text
where event_key is null and notification_id is not null;

create unique index if not exists idx_push_dispatch_log_event_token_unique
  on public.push_dispatch_log (event_key, token_hash)
  where event_key is not null;
