create table if not exists public.telegram_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null,
  sent_at timestamptz not null default now(),
  unique (order_id, event)
);

grant all on public.telegram_dispatch_log to service_role;
alter table public.telegram_dispatch_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='job_results_staff_write') then
    create policy job_results_staff_write on storage.objects
      for all to authenticated
      using (bucket_id = 'job-results' and public.has_permission(auth.uid(), 'orders.fulfill'))
      with check (bucket_id = 'job-results' and public.has_permission(auth.uid(), 'orders.fulfill'));
  end if;
end $$;