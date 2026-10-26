create or replace function public.is_order_operator(_order_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operator_assignments a where a.order_id = _order_id and a.operator_id = _user_id)
$$;

create or replace function public.is_order_owner(_order_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.id = _order_id and o.user_id = _user_id)
$$;

revoke all on function public.is_order_operator(uuid, uuid) from public, anon;
revoke all on function public.is_order_owner(uuid, uuid) from public, anon;
grant execute on function public.is_order_operator(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_order_owner(uuid, uuid) to authenticated, service_role;

drop policy if exists orders_select_operator on public.orders;
create policy orders_select_operator on public.orders for select to authenticated
  using (public.is_order_operator(id, auth.uid()));

drop policy if exists assignment_select_customer on public.operator_assignments;
create policy assignment_select_customer on public.operator_assignments for select to authenticated
  using (public.is_order_owner(order_id, auth.uid()));

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items for select to authenticated
  using (public.is_order_owner(order_id, auth.uid()));

drop policy if exists order_items_select_operator on public.order_items;
create policy order_items_select_operator on public.order_items for select to authenticated
  using (public.is_order_operator(order_id, auth.uid()));

drop policy if exists osh_select_own on public.order_status_histories;
create policy osh_select_own on public.order_status_histories for select to authenticated
  using (public.is_order_owner(order_id, auth.uid()));

drop policy if exists history_select_operator on public.order_status_histories;
create policy history_select_operator on public.order_status_histories for select to authenticated
  using (public.is_order_operator(order_id, auth.uid()));

drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own on public.invoices for select to authenticated
  using (public.is_order_owner(order_id, auth.uid()));

drop policy if exists sod_select_own on public.service_order_details;
create policy sod_select_own on public.service_order_details for select to authenticated
  using (public.is_order_owner(order_id, auth.uid()));

drop policy if exists service_details_select_operator on public.service_order_details;
create policy service_details_select_operator on public.service_order_details for select to authenticated
  using (public.is_order_operator(order_id, auth.uid()));

drop policy if exists progress_select_customer on public.job_progress;
create policy progress_select_customer on public.job_progress for select to authenticated
  using (is_public and public.is_order_owner(order_id, auth.uid()));

drop policy if exists result_select_customer on public.job_results;
create policy result_select_customer on public.job_results for select to authenticated
  using (public.is_order_owner(order_id, auth.uid()));

drop policy if exists revision_select_operator on public.job_revisions;
create policy revision_select_operator on public.job_revisions for select to authenticated
  using (public.is_order_operator(order_id, auth.uid()));