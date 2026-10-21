-- Synthetic, transaction-only RLS probe for preview aaonrwgghhdycwqbxuoi.
-- Execute only after the caller verifies branch ID 62223d8e-fae7-4520-b927-3e705037e026
-- maps to this project ref and passes that exact ref to Supabase SQL. The SQL
-- connection itself exposes no independently verifiable project identifier.
-- Never run on production. Every fixture write is rolled back.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres'
     OR (SELECT schema_version FROM app_private.trial_schema_meta
         WHERE component = 'private_trial_backend') <> 13
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations) NOT IN (20, 21)
     OR (SELECT count(*) FROM auth.users) <> 0
     OR (SELECT count(*) FROM app_private.workspace_access_controls) <> 0
     OR (SELECT count(*) FROM app_private.workspace_memberships) <> 0
     OR (SELECT count(*) FROM app_private.workspace_state) <> 0
     OR to_regprocedure('app_private.workspace_access_member_active(text)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_auth_members membership
       JOIN pg_roles role_record ON role_record.oid = membership.roleid
       JOIN pg_roles member_record ON member_record.oid = membership.member
       WHERE role_record.rolname = 'supermega_trial_backend'
         AND member_record.rolname = 'postgres'
         AND membership.admin_option
         AND NOT membership.inherit_option
         AND NOT membership.set_option
     )
  THEN
    RAISE EXCEPTION 'preview_rls_probe_preflight_failed';
  END IF;
END;
$preflight$;

-- Supabase's postgres role can administer this grant but cannot SET ROLE
-- by default. The temporary SET option rolls back with the fixtures.
GRANT supermega_trial_backend TO postgres WITH INHERIT FALSE, SET TRUE;

INSERT INTO app_private.workspace_access_controls
  (workspace_id, activation_id, authorization_id, authorization_contract,
   plan_digest, owner_actor_id, project_ref, release_commit, status)
VALUES
  ('sm-rls-probe-a-20261021', '10101010-1010-4010-8010-101010101010',
   '20202020-2020-4020-8020-202020202020', 'self_serve_claim_v1',
   repeat('a', 64), 'sm-rls-actor-a', 'aaonrwgghhdycwqbxuoi',
   '536309efcf0e7d61480a9fbfdb54db79d9601ded', 'active'),
  ('sm-rls-probe-b-20261021', '30303030-3030-4030-8030-303030303030',
   '40404040-4040-4040-8040-404040404040', 'self_serve_claim_v1',
   repeat('b', 64), 'sm-rls-actor-b', 'aaonrwgghhdycwqbxuoi',
   '536309efcf0e7d61480a9fbfdb54db79d9601ded', 'active');

INSERT INTO app_private.workspace_memberships
  (workspace_id, actor_id, actor_kind, status, capabilities)
VALUES
  ('sm-rls-probe-a-20261021', 'sm-rls-actor-a', 'human', 'active',
   ARRAY['commerce.read', 'commerce.write']),
  ('sm-rls-probe-b-20261021', 'sm-rls-actor-b', 'human', 'active',
   ARRAY['commerce.read', 'commerce.write']);

INSERT INTO app_private.workspace_state
  (workspace_id, surface, version, state_json, updated_by)
VALUES
  ('sm-rls-probe-a-20261021', 'commerce', 1, '{"probe":"a"}'::jsonb,
   'sm-rls-actor-a'),
  ('sm-rls-probe-b-20261021', 'commerce', 1, '{"probe":"b"}'::jsonb,
   'sm-rls-actor-b');

SET LOCAL ROLE supermega_trial_backend;
SELECT set_config('app.workspace_id', 'sm-rls-probe-a-20261021', true),
       set_config('app.actor_id', 'sm-rls-actor-a', true),
       set_config('app.actor_kind', 'human', true);

DO $actor_a$
DECLARE affected integer;
BEGIN
  IF current_user <> 'supermega_trial_backend'
     OR (SELECT count(*) FROM app_private.workspace_state) <> 1
     OR (SELECT state_json->>'probe' FROM app_private.workspace_state) <> 'a'
     OR (SELECT count(*) FROM app_private.workspace_memberships) <> 1
     OR (SELECT count(*) FROM app_private.workspace_access_controls) <> 1
     OR EXISTS (SELECT 1 FROM app_private.workspace_state
                WHERE workspace_id = 'sm-rls-probe-b-20261021')
  THEN
    RAISE EXCEPTION 'preview_rls_probe_actor_a_read_failed';
  END IF;

  UPDATE app_private.workspace_state
     SET state_json = '{"probe":"hijacked"}'::jsonb
   WHERE workspace_id = 'sm-rls-probe-b-20261021';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'preview_rls_probe_cross_tenant_write_allowed';
  END IF;
END;
$actor_a$;

DO $cross_tenant_insert$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO app_private.workspace_state
      (workspace_id, surface, version, state_json, updated_by)
    VALUES
      ('sm-rls-probe-b-20261021', 'setup', 1,
       '{"probe":"unauthorized"}'::jsonb, 'sm-rls-actor-a');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'preview_rls_probe_cross_tenant_insert_allowed';
  END IF;
END;
$cross_tenant_insert$;

SELECT set_config('app.workspace_id', 'sm-rls-probe-b-20261021', true);
DO $guessed_workspace$
BEGIN
  IF (SELECT count(*) FROM app_private.workspace_state) <> 0
     OR (SELECT count(*) FROM app_private.workspace_memberships) <> 0
     OR (SELECT count(*) FROM app_private.workspace_access_controls) <> 0
  THEN
    RAISE EXCEPTION 'preview_rls_probe_guessed_workspace_visible';
  END IF;
END;
$guessed_workspace$;

SELECT set_config('app.actor_id', 'sm-rls-actor-b', true);
DO $actor_b$
BEGIN
  IF (SELECT count(*) FROM app_private.workspace_state) <> 1
     OR (SELECT state_json->>'probe' FROM app_private.workspace_state) <> 'b'
     OR (SELECT count(*) FROM app_private.workspace_access_controls) <> 1
     OR EXISTS (SELECT 1 FROM app_private.workspace_state
                WHERE workspace_id = 'sm-rls-probe-a-20261021')
  THEN
    RAISE EXCEPTION 'preview_rls_probe_actor_b_read_failed';
  END IF;
END;
$actor_b$;

ROLLBACK;

DO $cleanup$
BEGIN
  IF (SELECT count(*) FROM app_private.workspace_access_controls) <> 0
     OR (SELECT count(*) FROM app_private.workspace_memberships) <> 0
     OR (SELECT count(*) FROM app_private.workspace_state) <> 0
     OR (SELECT count(*) FROM auth.users) <> 0
     OR EXISTS (
       SELECT 1 FROM pg_auth_members membership
       JOIN pg_roles role_record ON role_record.oid = membership.roleid
       JOIN pg_roles member_record ON member_record.oid = membership.member
       WHERE role_record.rolname = 'supermega_trial_backend'
         AND member_record.rolname = 'postgres'
         AND membership.set_option
     )
  THEN
    RAISE EXCEPTION 'preview_rls_probe_cleanup_failed';
  END IF;
END;
$cleanup$;

SELECT 'PASS' AS tenant_rls_probe, 0 AS fixture_rows_remaining;
