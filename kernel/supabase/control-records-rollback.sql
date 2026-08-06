-- AI-009 rollback fixture. This is intentionally fail-closed: authority rows must be explicitly
-- reconciled and removed before the dedicated control plane can be dropped.

begin;

do $rollback$
declare
  has_rows boolean;
begin
  if to_regclass('public.supermega_control_records') is not null then
    execute 'select exists (select 1 from public.supermega_control_records limit 1)' into has_rows;
    if has_rows then
      raise exception 'control_records_require_explicit_reconciliation_before_rollback';
    end if;
  end if;
  if to_regclass('public.supermega_control_transitions') is not null then
    execute 'select exists (select 1 from public.supermega_control_transitions limit 1)' into has_rows;
    if has_rows then
      raise exception 'control_transition_history_requires_explicit_reconciliation_before_rollback';
    end if;
    execute 'drop trigger if exists supermega_control_transitions_immutable on public.supermega_control_transitions';
  end if;
end;
$rollback$;

drop function if exists public.supermega_reject_control_transition_mutation();
drop function if exists public.supermega_transition_control_record(text,text,text,boolean,bigint,text,text,text,text,jsonb,text);
drop function if exists public.supermega_put_control_record(text,text,text,text,text,jsonb,text);
drop table if exists public.supermega_control_transitions;
drop table if exists public.supermega_control_records;

commit;
