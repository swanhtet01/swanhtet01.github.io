-- Explicit DENY policies for all three CRM tables.
-- RLS is already enabled in 20260625180000_crm_tables.sql.
-- Without explicit policies postgres defaults to implicit deny, but explicit
-- policies make the intent clear and prevent accidental grants from slipping through.
-- Service role bypasses RLS entirely and is unaffected by these policies.

create policy "deny_all_supermega_leads"
  on public.supermega_leads
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_supermega_pipeline_actions"
  on public.supermega_pipeline_actions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_supermega_sales_runs"
  on public.supermega_sales_runs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
