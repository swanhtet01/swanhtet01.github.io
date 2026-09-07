import { createHash } from 'node:crypto'

// In-memory migration tests only. This never connects to a hosted database and
// does not replace the separate PostgreSQL 17 concurrency/restart rehearsal.
export async function verifySelfServeAttemptBudget(database, requireCheck) {
  const check = (name, condition) => requireCheck(`durable attempt budget: ${name}`, condition)
  const scalar = async (sql, parameters = []) => (await database.query(sql, parameters)).rows[0]?.value
  const rejects = async (sql, parameters, code) => {
    try { await database.query(sql, parameters); return false } catch (error) { return error.code === code }
  }
  const signatures = [
    'app_private.mark_self_serve_claim_conflict(timestamptz)',
    'app_private.reserve_self_serve_attempt()',
  ]
  const functions = (await database.query(`
    select proname, pg_get_function_identity_arguments(oid) as args,
      pg_get_function_result(oid) as result, prosecdef, proconfig, prosrc,
      prolang = (select oid from pg_language where lanname = 'plpgsql') as plpgsql,
      proowner = 'postgres'::regrole as trusted_owner
    from pg_proc where pronamespace = 'app_private'::regnamespace
      and proname in ('mark_self_serve_claim_conflict', 'reserve_self_serve_attempt')
    order by proname
  `)).rows
  const expected = [
    ['mark_self_serve_claim_conflict', 'admitted_at timestamp with time zone', 'boolean',
      'd902f0e70d50e88b6a39d56f7861bc59a321a9c4c082ce10c52e0ff38c5c85e0'],
    ['reserve_self_serve_attempt', '', 'timestamp with time zone',
      '8016584555caf9481fff296068465644a57e05be54c09b72152d1c09ae3594ee'],
  ]
  check('exact invoker function signatures, bodies and empty search paths',
    functions.length === expected.length && functions.every((row, index) => {
      const item = expected[index]
      return row.proname === item[0] && row.args === item[1] && row.result === item[2] &&
        createHash('sha256').update(row.prosrc.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex') === item[3] &&
        row.prosecdef === false && row.plpgsql && row.trusted_owner &&
        JSON.stringify(row.proconfig) === JSON.stringify(['search_path=""'])
    }))

  for (const role of ['anon', 'authenticated', 'service_role', 'supermega_trial_backend']) {
    for (const signature of signatures) {
      check(`${role} exact execute privilege for ${signature}`,
        await scalar('select has_function_privilege($1, $2, $3) as value', [role, signature, 'EXECUTE']) ===
        (role === 'supermega_trial_backend'))
    }
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      check(`${role} exact ${privilege} table privilege`,
        await scalar('select has_table_privilege($1, $2, $3) as value',
          [role, 'app_private.self_serve_attempt_budgets', privilege]) ===
        (role === 'supermega_trial_backend' && ['SELECT', 'INSERT'].includes(privilege)))
    }
    for (const column of ['actor_id', 'attempts', 'claim_conflicts']) {
      check(`${role} exact ${column} update privilege`,
        await scalar('select has_column_privilege($1, $2, $3, $4) as value',
          [role, 'app_private.self_serve_attempt_budgets', column, 'UPDATE']) ===
        (role === 'supermega_trial_backend' && column !== 'actor_id'))
    }
  }

  const columns = (await database.query(`
    select column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'app_private' and table_name = 'self_serve_attempt_budgets'
    order by ordinal_position
  `)).rows
  check('exact privacy-minimal columns', JSON.stringify(columns) === JSON.stringify([
    { column_name: 'actor_id', data_type: 'uuid', udt_name: 'uuid', is_nullable: 'NO', column_default: null },
    { column_name: 'attempts', data_type: 'ARRAY', udt_name: '_timestamptz', is_nullable: 'NO', column_default: "'{}'::timestamp with time zone[]" },
    { column_name: 'claim_conflicts', data_type: 'ARRAY', udt_name: '_timestamptz', is_nullable: 'NO', column_default: "'{}'::timestamp with time zone[]" },
  ]))
  const constraint = await scalar(`
    select pg_get_constraintdef(oid, true) as value from pg_constraint
    where conrelid = 'app_private.self_serve_attempt_budgets'::regclass
      and conname = 'self_serve_attempt_budget_bounded' and convalidated
  `)
  check('exact bounded array constraint', constraint ===
    'CHECK (cardinality(attempts) <= 5 AND cardinality(claim_conflicts) <= cardinality(attempts) AND array_position(attempts, NULL::timestamp with time zone) IS NULL AND array_position(claim_conflicts, NULL::timestamp with time zone) IS NULL AND claim_conflicts <@ attempts)')

  const actor = '10000000-0000-4000-8000-000000000001'
  const other = '10000000-0000-4000-8000-000000000002'
  const context = async (id, kind) => database.query(
    "select set_config('app.actor_id', $1, false), set_config('app.actor_kind', $2, false)", [id, kind])
  await database.exec('set role supermega_trial_backend')
  try {
    for (const [id, kind] of [['', 'human'], [actor, 'agent'], [actor, '']]) {
      await context(id, kind)
      check('missing or nonhuman actor cannot reserve',
        await rejects('select app_private.reserve_self_serve_attempt()', [], 'P0001'))
      check('missing or nonhuman actor cannot mark conflict',
        await rejects('select app_private.mark_self_serve_claim_conflict(now())', [], 'P0001'))
    }
    await context(actor, 'human')
    const stamps = []
    for (let index = 0; index < 5; index++) {
      // Retain PostgreSQL microseconds as text; JS Date would truncate admission identity.
      const stamp = await scalar('select app_private.reserve_self_serve_attempt()::text as value')
      check(`admission ${index + 1} retained`, typeof stamp === 'string' && !stamps.includes(stamp))
      stamps.push(stamp)
    }
    check('sixth admission refused', await scalar('select app_private.reserve_self_serve_attempt() as value') === null)
    const retained = await scalar('select attempts::text as value from app_private.self_serve_attempt_budgets')
    check('exact five retained admissions', await scalar('select cardinality(attempts) as value from app_private.self_serve_attempt_budgets') === 5)
    for (let index = 0; index < 2; index++) {
      check('admitted conflict marking is idempotent', await scalar(
        'select app_private.mark_self_serve_claim_conflict($1::timestamptz) as value', [stamps[0]]) === true)
    }
    check('conflict retained only once', await scalar('select cardinality(claim_conflicts) as value from app_private.self_serve_attempt_budgets') === 1)
    check('unadmitted conflict refused', await scalar("select app_private.mark_self_serve_claim_conflict('2000-01-01Z'::timestamptz) as value") === false)
    check('conflicts do not refund admissions', await scalar('select attempts::text as value from app_private.self_serve_attempt_budgets') === retained)
    check('actor reassignment denied', await rejects('update app_private.self_serve_attempt_budgets set actor_id = $1::uuid', [other], '42501'))
    check('deletion denied', await rejects('delete from app_private.self_serve_attempt_budgets', [], '42501'))
    check('foreign actor insertion denied', await rejects('insert into app_private.self_serve_attempt_budgets(actor_id) values ($1::uuid)', [other], '42501'))
    for (const assignment of [
      'attempts = array_append(attempts, now())',
      'attempts = array[null]::timestamptz[], claim_conflicts = array[]::timestamptz[]',
      'claim_conflicts = array[null]::timestamptz[]',
      "claim_conflicts = array['2000-01-01Z'::timestamptz]",
    ]) {
      check('invalid bounded arrays rejected', await rejects(`update app_private.self_serve_attempt_budgets set ${assignment}`, [], '23514'))
    }
    await context(other, 'human')
    check('other actor cannot read budget', await scalar('select count(*)::int as value from app_private.self_serve_attempt_budgets') === 0)
    check('other actor cannot update budget', (await database.query(
      'update app_private.self_serve_attempt_budgets set attempts = array[]::timestamptz[], claim_conflicts = array[]::timestamptz[] returning actor_id')).rows.length === 0)
    check('other actor cannot claim original admission', await scalar(
      'select app_private.mark_self_serve_claim_conflict($1::timestamptz) as value', [stamps[0]]) === false)
    check('other actor has independent admission', typeof await scalar('select app_private.reserve_self_serve_attempt()::text as value') === 'string')
    await context(actor, 'agent')
    check('nonhuman actor cannot read human budget', await scalar('select count(*)::int as value from app_private.self_serve_attempt_budgets') === 0)
    await context(actor, 'human')
    await database.exec(`update app_private.self_serve_attempt_budgets
      set attempts = array[now() - interval '25 hours'], claim_conflicts = array[now() - interval '25 hours']`)
    check('expired admission capacity returns', typeof await scalar('select app_private.reserve_self_serve_attempt()::text as value') === 'string')
    check('expired attempts and conflict diagnostics pruned', await scalar(`select cardinality(attempts) = 1 and cardinality(claim_conflicts) = 0 as value from app_private.self_serve_attempt_budgets`) === true)
    await database.exec(`update app_private.self_serve_attempt_budgets set attempts = array[now() + interval '1 day']`)
    check('future retained clock fails closed', await rejects('select app_private.reserve_self_serve_attempt()', [], 'P0001'))
  } finally {
    await database.exec('reset role')
    await context('', '')
  }
}
