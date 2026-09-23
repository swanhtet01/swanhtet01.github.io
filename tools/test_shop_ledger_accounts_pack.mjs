// Ledger chart of accounts: a trade pack may RENAME and ADD leaf accounts, but
// can never remove a core account or re-type a core role. Also pins the third
// account-mapping generation (11 ledger roles) the way the legacy-4 / current-7
// generations are validated in commerce-workspace.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        coreLedgerAccounts, extendLedgerChart, validateLedgerChart,
        ledgerAccountRoles, ledgerRoleType, cashAccountCodeForMethod, ledgerAccountCodeForRole,
      } from './shop-ledger-accounts.ts'
      export { commerceAccountRoles, validateCommerceState, createSeedCommerce } from './commerce-workspace.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ledger-accounts-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})

const {
  coreLedgerAccounts, extendLedgerChart, validateLedgerChart,
  ledgerAccountRoles, ledgerRoleType, cashAccountCodeForMethod, ledgerAccountCodeForRole,
  commerceAccountRoles, validateCommerceState, createSeedCommerce,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// 1. The core chart is generationally sound and Burmese-labelled.
{
  const core = coreLedgerAccounts()
  check(validateLedgerChart(core) === null, 'the core chart validates')
  check(ledgerAccountRoles.length === 11, `the ledger names 11 roles (third generation), got ${ledgerAccountRoles.length}`)
  for (const role of ['accounts_receivable', 'accounts_payable', 'purchases_expense', 'cash_over_short']) {
    check(ledgerAccountRoles.includes(role), `ledger extends CommerceAccountRole with ${role}`)
    check(!commerceAccountRoles.includes(role), `${role} is genuinely new, not already a commerce role`)
  }
  for (const role of commerceAccountRoles) check(ledgerAccountRoles.includes(role), `ledger still carries the existing role ${role}`)
  check(core.every((a) => a.type === ledgerRoleType(a.role)), 'every core account has its role canonical type')
  check(core.every((a) => typeof a.nameMy === 'string' && a.nameMy.length > 0), 'every core account carries a Burmese label')
  check(core.every((a) => a.packId === undefined), 'core accounts carry no packId')
}

// 2. payment_clearing splits into cash/wallet leaves by method label.
{
  check(cashAccountCodeForMethod('KBZPay') === 'cash_kbz_wallet', 'KBZPay routes to the KBZ wallet leaf')
  check(cashAccountCodeForMethod('WavePay') === 'cash_wave_wallet', 'WavePay routes to the Wave wallet leaf')
  check(cashAccountCodeForMethod('AYA Pay') === 'cash_aya_wallet', 'AYA Pay routes to the AYA wallet leaf')
  check(cashAccountCodeForMethod('MMQR') === 'cash_mmqr_clearing', 'MMQR routes to the interoperable QR clearing leaf')
  check(cashAccountCodeForMethod('Cash') === 'cash_drawer', 'Cash routes to the drawer leaf')
  check(cashAccountCodeForMethod('Voucher') === 'cash_other_clearing', 'an unknown method routes to the other-clearing leaf (total, never unresolved)')
  check(ledgerAccountCodeForRole('accounts_receivable') === 'accounts_receivable', 'AR resolves to its single leaf')
  check(ledgerAccountCodeForRole('payment_clearing', 'KBZPay') === 'cash_kbz_wallet', 'payment_clearing resolves by method')
}

// 3. A valid pack RENAMES and ADDS -- roles and types are preserved.
{
  const result = extendLedgerChart({
    packId: 'restaurant',
    renamedAccounts: [{ code: 'purchases_expense', name: 'Kitchen purchases', nameMy: 'မီးဖိုချောင် ဝယ်ယူစရိတ်' }],
    addedAccounts: [{ code: 'spoilage_writeoff', role: 'purchases_expense', type: 'expense', name: 'Spoilage write-off' }],
  })
  check(result.ok === true, 'the restaurant pack extension is accepted')
  const purchases = result.accounts.find((a) => a.code === 'purchases_expense')
  check(purchases.name === 'Kitchen purchases', 'the rename took effect')
  check(purchases.role === 'purchases_expense' && purchases.type === 'expense', 'the renamed leaf keeps its role and type')
  const added = result.accounts.find((a) => a.code === 'spoilage_writeoff')
  check(added && added.packId === 'restaurant', 'the added leaf is tagged with the pack id')
  check(added.type === 'expense', 'the added leaf inherits its role type')
  check(validateLedgerChart(result.accounts) === null, 'the extended chart still validates')
  // Every core role survives the extension -- removal is structurally impossible.
  for (const role of ledgerAccountRoles) check(result.accounts.some((a) => a.role === role), `core role ${role} survives the extension`)
}

// 4. A pack CANNOT re-type a core role.
{
  const result = extendLedgerChart({
    packId: 'attacker',
    addedAccounts: [{ code: 'fake_income', role: 'sales_revenue', type: 'expense', name: 'Re-typed income' }],
  })
  check(result.ok === false && result.reason.startsWith('role_type_mismatch'), 'an addition that re-types a core role is refused')
}

// 5. A pack CANNOT rename an account that does not exist, nor collide with a core code.
{
  const missing = extendLedgerChart({ packId: 'p', renamedAccounts: [{ code: 'no_such_account', name: 'X' }] })
  check(missing.ok === false && missing.reason.startsWith('unknown_account'), 'renaming an unknown account is refused')
  const collision = extendLedgerChart({ packId: 'p', addedAccounts: [{ code: 'accounts_payable', role: 'accounts_payable', type: 'liability', name: 'Dup' }] })
  check(collision.ok === false && collision.reason.startsWith('duplicate_account'), 'adding over an existing core code is refused')
}

// 6. There is no removal operation -- validateLedgerChart catches a dropped role.
{
  const withoutTax = coreLedgerAccounts().filter((a) => a.role !== 'tax_payable')
  check(validateLedgerChart(withoutTax) === `removed_role:tax_payable`, 'a chart missing a core role fails validation')
  const retyped = coreLedgerAccounts().map((a) => a.role === 'sales_revenue' ? { ...a, type: 'expense' } : a)
  check(validateLedgerChart(retyped).startsWith('retyped_role'), 'a chart with a re-typed core role fails validation')
}

// 7. The account-mapping validation accepts the third (11-role) generation.
{
  const seed = createSeedCommerce()
  const mapping = {
    revision: 1,
    mappings: ledgerAccountRoles.map((role, index) => ({ accountRole: role, externalAccountCode: `4${String(1000 + index)}` })),
    proof: { actionId: 'ACT-MAP-1', capturedAt: '2026-07-01T00:00:00.000Z', actor: 'Swan', reason: 'Map ledger roles', evidenceReference: 'EV-MAP-1' },
  }
  const validated = validateCommerceState({ ...seed, accountMappingConfigurations: [mapping] })
  check(validated.accountMappingConfigurations.length === 1, 'an 11-role account mapping is accepted as the third generation')
  check(validated.accountMappingConfigurations[0].mappings.length === 11, 'all 11 ledger roles are carried')
  // A mapping of a wrong length (10) is refused, exactly like a malformed 4/7 generation.
  const short = { ...mapping, mappings: mapping.mappings.slice(0, 10) }
  assert.throws(() => validateCommerceState({ ...seed, accountMappingConfigurations: [short] }), /mappings must cover every account role/)
  checks += 1
}

console.log(JSON.stringify({ ok: true, checks }))
