-- claim_queued_actions: atomic batch-claim stored procedure
-- Fixes the TOCTOU race in action-runner.js where a SELECT then a separate PATCH
-- allows two concurrent workers to claim the same queued row.
-- Workers should call this RPC instead of the current fetchQueued() + updateAction() pattern.

create or replace function public.claim_queued_actions(batch_size int default 10)
returns table (
  id            uuid,
  lead_id       text,
  action_type   text,
  payload       jsonb,
  status        text,
  created_at    timestamptz,
  -- extended columns present in the unified schema (null when not populated)
  action_id     text,
  task_id       text,
  run_id        text,
  priority      text,
  owner         text,
  title         text,
  next_step     text,
  due_at        timestamptz,
  approval_required     boolean,
  approval_state        text,
  notification_channel  text,
  notification_status   text,
  chat_id       text,
  message_id    text,
  args          text,
  raw_text      text,
  source        text
)
language plpgsql
as $$
begin
  return query
    update public.supermega_pipeline_actions a
    set
      status     = 'processing',
      updated_at = now()
    where a.id in (
      select s.id
      from public.supermega_pipeline_actions s
      where s.status = 'queued'
      order by s.created_at asc
      limit batch_size
      for update skip locked
    )
    returning
      a.id,
      a.lead_id,
      a.action_type,
      a.payload,
      a.status,
      a.created_at,
      a.action_id,
      a.task_id,
      a.run_id,
      a.priority,
      a.owner,
      a.title,
      a.next_step,
      a.due_at,
      a.approval_required,
      a.approval_state,
      a.notification_channel,
      a.notification_status,
      a.chat_id,
      a.message_id,
      a.args,
      a.raw_text,
      a.source;
end $$;

comment on function public.claim_queued_actions(int) is
  'Atomically claims up to batch_size queued pipeline actions in a single statement. '
  'Uses FOR UPDATE SKIP LOCKED so concurrent workers cannot claim the same row twice. '
  'Callers receive rows already marked processing and should finish by patching status '
  'to ''done'' or ''failed'' via the REST API (updateAction in action-runner.js).';

-- Allow the service-role key (used by Vercel functions) and the anon key to call this RPC.
-- RLS on supermega_pipeline_actions still applies to the underlying UPDATE.
grant execute on function public.claim_queued_actions(int) to service_role;
grant execute on function public.claim_queued_actions(int) to anon;
