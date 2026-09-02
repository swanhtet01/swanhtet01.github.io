// Fleet-wide credential contract for every connector in kernel/connectors/.
//
// CLAUDE.md states one rule every connector must obey: absent its key it fails closed and
// makes NO network call. Until this file that rule was asserted only where someone had
// written a dedicated test (~11 of 64 credentialed connectors). This file asserts it for
// all of them from one manifest, plus the companion rule that a PRESENT credential never
// escapes through an error path (returned envelope, thrown error, or console output).
//
// Per credentialed connector:
//   1. fail-closed  — with the credential absent (every var, then each required var on its
//                     own, then each documented partial), configured() is false, health()
//                     and every capability refuse with a config-shaped reason, and the
//                     injected fetch is never invoked.
//   2. no-leak      — with fake credentials present, four fetch stubs (HTTP 500 JSON body,
//                     HTTP 500 malformed body, transport failure, timeout abort) drive every
//                     health/capability path; the credential values must not appear in any
//                     result, thrown error (message/stack/props), or console line.
//
// The completeness test at the bottom pins the manifest to the registry: a connector added
// without a manifest entry (or a no-credential declaration) fails the suite.
//
// Fixtures are deliberately unrealistic (`fake-<var>-not-real`); a value that a scanner or
// a reader could mistake for a live key is a bug in this file. Connectors with a dedicated
// *.test.mjs beside them are still in the manifest — this file overlaps them on exactly the
// two invariants above so the completeness assertion has one place to look, and leaves
// their request-shape tests untouched. `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { inspect } from 'node:util'

import registry from './index.mjs'
import { credsConfigured, getAccessToken, resetTokenCache } from './_google-auth.mjs'
import { getOAuthAccessToken, oauthConfigured, resetOAuthTokenCache } from './_google-oauth.mjs'
import { resetPayPalTokenCacheForTests } from './payment-paypal.mjs'

// ---- fixtures ---------------------------------------------------------------

function fake(name) {
  return `fake-${name.toLowerCase().replace(/_/g, '-')}-not-real`
}

function fakeEnv(vars, values = {}) {
  const env = {}
  for (const name of vars) env[name] = values[name] ?? fake(name)
  for (const [name, value] of Object.entries(values)) if (!(name in env)) env[name] = value
  return env
}

// A throwaway RSA key so the service-account JWT path actually signs; the PEM body is the
// probe that must never surface. Generated per run — nothing here is a real credential.
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const SA_PRIVATE_KEY_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' })
const SA_PROBE = SA_PRIVATE_KEY_PEM.split('\n').filter((line) => line && !line.startsWith('-----'))[1]
const SA_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'fake-project-not-real',
  client_email: 'fake-sa-not-real@example.test',
  private_key: SA_PRIVATE_KEY_PEM,
  token_uri: 'https://oauth2.googleapis.com/token',
})

const GOOGLE_OAUTH_VARS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN']
const GOOGLE_VARS = ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_WORKSPACE_SUBJECT', ...GOOGLE_OAUTH_VARS]
const GOOGLE_SECRETS = ['GOOGLE_SERVICE_ACCOUNT_JSON', ...GOOGLE_OAUTH_VARS]
const OAUTH_ENV = fakeEnv(GOOGLE_OAUTH_VARS)
const SUBJECT = 'owner-not-real@example.test'
const MESSAGES = [{ role: 'user', content: 'ping' }]
const MARKER = 'supermega-action:00000000-0000-4000-8000-000000000000'
// Webhook-URL credentials whose host/path shape the connector's configured() insists on. Built
// as templates with the token in `${…}` (the integration-zapier.test.mjs idiom) so the source
// never contains a scanner-shaped literal — GitGuardian flagged the inline form on first push.
const ZAPIER_HOOK_URL = `https://hooks.zapier.com/hooks/catch/000000/${fake('ZAPIER_HOOK_TOKEN')}/`
const DISCORD_WEBHOOK_URL = `https://discord.com/api/webhooks/000000/${fake('DISCORD_WEBHOOK_TOKEN')}`

// Google Workspace connectors share _google-auth: a service account OR an OAuth user trio.
function googleWorkspace(key, { optional = [], values = {}, calls }) {
  return {
    key,
    creds: ['GOOGLE_SERVICE_ACCOUNT_JSON'],
    values: { GOOGLE_SERVICE_ACCOUNT_JSON: SA_JSON, ...values },
    anyOf: [['GOOGLE_SERVICE_ACCOUNT_JSON']],
    optional: [...GOOGLE_VARS, ...optional],
    secrets: GOOGLE_SECRETS,
    probes: { GOOGLE_SERVICE_ACCOUNT_JSON: SA_PROBE },
    variants: [{ name: 'OAuth user credentials', env: { ...OAUTH_ENV, GOOGLE_WORKSPACE_SUBJECT: SUBJECT } }],
    partials: [
      { name: 'OAuth trio missing the refresh token', env: fakeEnv(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']) },
      { name: 'OAuth trio missing the client secret', env: fakeEnv(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_REFRESH_TOKEN']) },
    ],
    calls,
  }
}

// ---- the manifest -----------------------------------------------------------
//
//   key       registry key (kernel/connectors/<key>.mjs)
//   creds     env vars set in the default "present" scenario; each is individually required
//             unless it appears in an anyOf group
//   values    overrides / extra env for the present scenario (format-constrained fixtures,
//             non-secret config the capability needs)
//   anyOf     groups where at least one member must be present; the group is removed as a
//             unit in the fail-closed pass
//   optional  further env the connector reads — tracked and cleared, never required
//   secrets   the vars whose VALUES must never surface (subset of the env above)
//   probes    per-var substring to search for instead of the raw value
//   variants  extra present-scenario envs (alternate auth paths) — all run the no-leak pass
//   partials  extra absent-scenario envs that must still fail closed
//   calls     [name, (connector) => promise] with VALID input so the credential gate is the
//             only thing standing between the call and the network
//   network   false when the connector has no network path at all (health is config-only)
//   failClosed false for the one connector whose credential is optional (documented below)
const MANIFEST = [
  // ---- ai ----
  { key: 'ai-anthropic', creds: ['ANTHROPIC_API_KEY'], optional: ['ANTHROPIC_MODEL'], secrets: ['ANTHROPIC_API_KEY'],
    calls: [['complete', (c) => c.complete({ messages: 'ping' })]] },
  { key: 'ai-cohere', creds: ['COHERE_API_KEY'], secrets: ['COHERE_API_KEY'],
    calls: [['chat', (c) => c.chat({ messages: MESSAGES })]] },
  { key: 'ai-deepseek', creds: ['DEEPSEEK_API_KEY'], optional: ['DEEPSEEK_BASE_URL'], secrets: ['DEEPSEEK_API_KEY'],
    calls: [['complete', (c) => c.complete({ prompt: 'ping' })]] },
  { key: 'ai-fireworks', creds: ['FIREWORKS_API_KEY'], secrets: ['FIREWORKS_API_KEY'],
    calls: [['chat', (c) => c.chat({ messages: MESSAGES })]] },
  // Wraps gateway.mjs; health is a config check by design (a live ping would spend tokens).
  { key: 'ai-gateway', creds: ['ANTHROPIC_API_KEY'], anyOf: [['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']], optional: ['CLAUDE_API_KEY'],
    secrets: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'], network: false,
    variants: [{ name: 'CLAUDE_API_KEY alias', env: fakeEnv(['CLAUDE_API_KEY']) }], calls: [] },
  { key: 'ai-gemini', creds: ['GEMINI_API_KEY'], secrets: ['GEMINI_API_KEY'],
    calls: [
      ['generate', (c) => c.generate({ prompt: 'ping' })],
      ['transcribeAudio', (c) => c.transcribeAudio({ b64: 'cGluZw==', mimeType: 'audio/ogg' })],
      ['extractFromImage', (c) => c.extractFromImage({ b64: 'cGluZw==' })],
    ] },
  { key: 'ai-groq', creds: ['GROQ_API_KEY'], secrets: ['GROQ_API_KEY'],
    calls: [['complete', (c) => c.complete({ messages: MESSAGES })]] },
  { key: 'ai-mistral', creds: ['MISTRAL_API_KEY'], secrets: ['MISTRAL_API_KEY'],
    calls: [['complete', (c) => c.complete({ prompt: 'ping' })]] },
  { key: 'ai-openai', creds: ['OPENAI_API_KEY'], optional: ['OPENAI_ORG_ID'], secrets: ['OPENAI_API_KEY'],
    calls: [['chat', (c) => c.chat(MESSAGES)]] },
  { key: 'ai-openrouter', creds: ['OPENROUTER_API_KEY'], optional: ['OPENROUTER_MODEL'], secrets: ['OPENROUTER_API_KEY'],
    calls: [['complete', (c) => c.complete({ messages: MESSAGES })]] },
  { key: 'ai-perplexity', creds: ['PERPLEXITY_API_KEY'], secrets: ['PERPLEXITY_API_KEY'],
    calls: [['chat', (c) => c.chat({ messages: MESSAGES })]] },
  { key: 'ai-together', creds: ['TOGETHER_API_KEY'], secrets: ['TOGETHER_API_KEY'],
    calls: [['chat', (c) => c.chat({ messages: MESSAGES })]] },
  // Vertex needs a service account specifically (OAuth user creds are not accepted).
  { key: 'ai-vertex', creds: ['GOOGLE_SERVICE_ACCOUNT_JSON'], values: { GOOGLE_SERVICE_ACCOUNT_JSON: SA_JSON },
    anyOf: [['GOOGLE_SERVICE_ACCOUNT_JSON']],
    optional: [...GOOGLE_VARS, 'VERTEX_PROJECT_ID', 'GCP_PROJECT_ID', 'VERTEX_LOCATION', 'VERTEX_MODEL'],
    secrets: GOOGLE_SECRETS, probes: { GOOGLE_SERVICE_ACCOUNT_JSON: SA_PROBE },
    partials: [{ name: 'OAuth user creds only (Vertex requires a service account)', env: { ...OAUTH_ENV, VERTEX_PROJECT_ID: 'fake-project-not-real' } }],
    calls: [['generate', (c) => c.generate({ prompt: 'ping' })]] },

  // ---- commerce ----
  { key: 'commerce-lazada', creds: ['LAZADA_APP_KEY', 'LAZADA_APP_SECRET', 'LAZADA_ACCESS_TOKEN'],
    secrets: ['LAZADA_APP_SECRET', 'LAZADA_ACCESS_TOKEN'], calls: [['getSeller', (c) => c.getSeller()]] },
  { key: 'commerce-shopee', creds: ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY', 'SHOPEE_SHOP_ID', 'SHOPEE_ACCESS_TOKEN'],
    secrets: ['SHOPEE_PARTNER_KEY', 'SHOPEE_ACCESS_TOKEN'], calls: [['getShopInfo', (c) => c.getShopInfo()]] },
  { key: 'commerce-shopify', creds: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ACCESS_TOKEN'],
    values: { SHOPIFY_STORE_DOMAIN: 'fake-store-not-real.myshopify.com' }, secrets: ['SHOPIFY_ACCESS_TOKEN'],
    calls: [
      ['listOrders', (c) => c.listOrders({ limit: 5 })],
      ['listProducts', (c) => c.listProducts({ limit: 5 })],
      ['getOrder', (c) => c.getOrder('1001')],
    ] },
  { key: 'commerce-square', creds: ['SQUARE_ACCESS_TOKEN'], secrets: ['SQUARE_ACCESS_TOKEN'],
    calls: [['listLocations', (c) => c.listLocations()]] },
  { key: 'commerce-tiktok-shop', creds: ['TIKTOK_SHOP_APP_KEY', 'TIKTOK_SHOP_APP_SECRET', 'TIKTOK_SHOP_ACCESS_TOKEN'],
    secrets: ['TIKTOK_SHOP_APP_SECRET', 'TIKTOK_SHOP_ACCESS_TOKEN'], calls: [['listOrders', (c) => c.listOrders({ pageSize: 5 })]] },
  { key: 'commerce-woocommerce', creds: ['WOOCOMMERCE_URL', 'WOOCOMMERCE_KEY', 'WOOCOMMERCE_SECRET'],
    values: { WOOCOMMERCE_URL: 'https://fake-store-not-real.example' }, secrets: ['WOOCOMMERCE_KEY', 'WOOCOMMERCE_SECRET'],
    calls: [
      ['listProducts', (c) => c.listProducts({ perPage: 5 })],
      ['listOrders', (c) => c.listOrders({ perPage: 5 })],
      ['getOrder', (c) => c.getOrder('1001')],
      ['updateOrder', (c) => c.updateOrder('1001', { status: 'completed' })],
    ] },

  // ---- crm / data ----
  { key: 'crm-pipedrive', creds: ['PIPEDRIVE_ACCESS_TOKEN'], anyOf: [['PIPEDRIVE_ACCESS_TOKEN', 'PIPEDRIVE_API_TOKEN']],
    optional: ['PIPEDRIVE_API_TOKEN'], secrets: ['PIPEDRIVE_ACCESS_TOKEN', 'PIPEDRIVE_API_TOKEN'],
    variants: [{ name: 'legacy api_token query auth', env: fakeEnv(['PIPEDRIVE_API_TOKEN']) }],
    calls: [['listDeals', (c) => c.listDeals({ limit: 5 })]] },
  { key: 'data-airtable', creds: ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID'], secrets: ['AIRTABLE_API_KEY'],
    calls: [
      ['listRecords', (c) => c.listRecords('Leads', { maxRecords: 1 })],
      ['getRecord', (c) => c.getRecord('Leads', 'rec1')],
      ['createRecord', (c) => c.createRecord('Leads', { Name: 'x' })],
      ['updateRecord', (c) => c.updateRecord('Leads', 'rec1', { Name: 'y' })],
      ['deleteRecord', (c) => c.deleteRecord('Leads', 'rec1')],
    ] },
  { key: 'data-box', creds: ['BOX_ACCESS_TOKEN'], secrets: ['BOX_ACCESS_TOKEN'],
    calls: [['listFolder', (c) => c.listFolder({ folderId: '0' })]] },
  googleWorkspace('data-calendar', {
    optional: ['GOOGLE_CALENDAR_ID'], values: { GOOGLE_WORKSPACE_SUBJECT: SUBJECT },
    calls: [
      ['createEvent', (c) => c.createEvent({ summary: 'Sync', start: '2026-09-02T10:00:00Z', end: '2026-09-02T11:00:00Z' })],
      ['listEvents', (c) => c.listEvents({ maxResults: 1 })],
    ] }),
  { key: 'data-clickup', creds: ['CLICKUP_ACCESS_TOKEN'], anyOf: [['CLICKUP_ACCESS_TOKEN', 'CLICKUP_API_TOKEN']],
    optional: ['CLICKUP_API_TOKEN'], secrets: ['CLICKUP_ACCESS_TOKEN', 'CLICKUP_API_TOKEN'],
    variants: [{ name: 'legacy CLICKUP_API_TOKEN', env: fakeEnv(['CLICKUP_API_TOKEN']) }],
    calls: [
      ['listTasks', (c) => c.listTasks({ listId: '123' })],
      ['findTaskByMarker', (c) => c.findTaskByMarker({ listId: '123', marker: MARKER })],
      ['createTask', (c) => c.createTask({ listId: '123', name: 'Follow up', marker: MARKER })],
    ] },
  googleWorkspace('data-drive', {
    optional: ['GOOGLE_SHARED_DRIVE_ID'],
    calls: [
      ['firstSharedDriveId', (c) => c.firstSharedDriveId()],
      ['findByName', (c) => c.findByName('Proposals')],
      ['ensureFolder', (c) => c.ensureFolder('Proposals')],
      ['uploadOrUpdate', (c) => c.uploadOrUpdate({ name: 'notes.txt', content: 'hello' })],
      ['shareWithUser', (c) => c.shareWithUser('file-1', SUBJECT)],
      ['getFile', (c) => c.getFile('file-1')],
      ['trashFile', (c) => c.trashFile('file-1')],
    ] }),
  { key: 'data-dropbox', creds: ['DROPBOX_ACCESS_TOKEN'], secrets: ['DROPBOX_ACCESS_TOKEN'],
    calls: [['listFolder', (c) => c.listFolder({ path: '' })]] },
  { key: 'data-ga4', creds: ['GA4_ACCESS_TOKEN', 'GA4_PROPERTY_ID'], secrets: ['GA4_ACCESS_TOKEN'],
    calls: [['runReport', (c) => c.runReport({})]] },
  googleWorkspace('data-gmail', {
    values: { GOOGLE_WORKSPACE_SUBJECT: SUBJECT },
    calls: [
      ['send', (c) => c.send({ to: 'lead-not-real@example.test', subject: 'Hello', text: 'Hi', subjectUser: SUBJECT })],
      ['search', (c) => c.search('is:unread', { maxResults: 1, subjectUser: SUBJECT })],
    ] }),
  { key: 'data-google-contacts', creds: ['GOOGLE_CONTACTS_TOKEN'], secrets: ['GOOGLE_CONTACTS_TOKEN'],
    calls: [['listContacts', (c) => c.listContacts({ pageSize: 5 })]] },
  { key: 'data-hubspot', creds: ['HUBSPOT_ACCESS_TOKEN'], secrets: ['HUBSPOT_ACCESS_TOKEN'],
    calls: [
      ['listContacts', (c) => c.listContacts({ limit: 5 })],
      ['createContact', (c) => c.createContact({ email: 'lead-not-real@example.test' })],
      ['listDeals', (c) => c.listDeals({ limit: 5 })],
      ['createDeal', (c) => c.createDeal({ dealname: 'Pilot' })],
    ] },
  // Mailchimp derives the datacenter from the key suffix; configured() needs a `-dcN` tail.
  { key: 'data-mailchimp', creds: ['MAILCHIMP_API_KEY'], values: { MAILCHIMP_API_KEY: 'fake-mailchimp-api-key-not-real-us1' },
    secrets: ['MAILCHIMP_API_KEY'], calls: [['addSubscriber', (c) => c.addSubscriber({ listId: 'list1', email: 'lead-not-real@example.test' })]] },
  { key: 'data-notion', creds: ['NOTION_API_KEY'], secrets: ['NOTION_API_KEY'],
    calls: [
      ['queryDatabase', (c) => c.queryDatabase('db-1')],
      ['createPage', (c) => c.createPage('db-1', { Name: { title: [] } })],
      ['updatePage', (c) => c.updatePage('page-1', { Name: { title: [] } })],
    ] },
  { key: 'data-onedrive', creds: ['ONEDRIVE_ACCESS_TOKEN'], secrets: ['ONEDRIVE_ACCESS_TOKEN'],
    calls: [['listFiles', (c) => c.listFiles({ path: '' })]] },
  { key: 'data-quickbooks', creds: ['QUICKBOOKS_ACCESS_TOKEN', 'QUICKBOOKS_REALM_ID'], secrets: ['QUICKBOOKS_ACCESS_TOKEN'],
    calls: [['companyInfo', (c) => c.companyInfo()]] },
  googleWorkspace('data-sheets', {
    calls: [
      ['readRange', (c) => c.readRange('sheet-1', 'Sheet1!A1:B2')],
      ['appendRow', (c) => c.appendRow('sheet-1', 'Sheet1!A1', ['a', 'b'])],
    ] }),
  // Wraps store.mjs, whose mode is fixed at import (memory under test) — no network path here.
  { key: 'data-supabase', creds: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    values: { SUPABASE_URL: 'https://fake-project-not-real.example' },
    anyOf: [['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']], optional: ['SUPABASE_SERVICE_KEY'],
    secrets: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'], network: false, calls: [] },
  { key: 'data-xero', creds: ['XERO_ACCESS_TOKEN', 'XERO_TENANT_ID'], secrets: ['XERO_ACCESS_TOKEN'],
    calls: [['listContacts', (c) => c.listContacts({ page: 1 })]] },
  { key: 'data-zoho-books', creds: ['ZOHO_BOOKS_ACCESS_TOKEN', 'ZOHO_BOOKS_ORG_ID'], secrets: ['ZOHO_BOOKS_ACCESS_TOKEN'],
    calls: [['listInvoices', (c) => c.listInvoices({ page: 1 })]] },

  // ---- integration ----
  // The generic webhook takes its endpoint per call and is configured() by design; its only
  // secret (the HMAC signing key) is optional, so it gets the no-leak pass but no fail-closed
  // pass. Targets are public IP literals so the SSRF guard needs no DNS.
  { key: 'integration-webhook', failClosed: false, creds: ['WEBHOOK_HMAC_SECRET'],
    values: { WEBHOOK_DEFAULT_URL: 'https://1.1.1.1/default-hook-not-real' }, optional: ['WEBHOOK_DEFAULT_URL'],
    secrets: ['WEBHOOK_HMAC_SECRET'],
    calls: [
      ['send', (c) => c.send('https://1.1.1.1/hook-not-real', { event: 'ping' })],
      ['send (default url)', (c) => c.send(undefined, { event: 'ping' })],
    ] },
  { key: 'integration-zapier', creds: ['ZAPIER_HOOK_URL'],
    values: { ZAPIER_HOOK_URL: ZAPIER_HOOK_URL },
    secrets: ['ZAPIER_HOOK_URL'], calls: [['send', (c) => c.send({ event: 'ping' })]] },

  // ---- logistics / marketing ----
  { key: 'logistics-jnt', creds: ['JNT_API_ACCOUNT', 'JNT_PRIVATE_KEY'], secrets: ['JNT_PRIVATE_KEY'],
    calls: [['trackParcel', (c) => c.trackParcel({ billCode: 'JT0001' })]] },
  { key: 'logistics-ninjavan', creds: ['NINJAVAN_ACCESS_TOKEN'], secrets: ['NINJAVAN_ACCESS_TOKEN'],
    calls: [
      ['trackOrder', (c) => c.trackOrder({ trackingId: 'NV0001' })],
      ['createOrder', (c) => c.createOrder({})],
    ] },
  { key: 'marketing-meta-ads', creds: ['META_ADS_ACCESS_TOKEN', 'META_ADS_ACCOUNT_ID'],
    values: { META_ADS_ACCOUNT_ID: 'act_000000000' }, secrets: ['META_ADS_ACCESS_TOKEN'],
    calls: [['listCampaigns', (c) => c.listCampaigns()]] },

  // ---- messaging ----
  { key: 'messaging-discord', creds: ['DISCORD_WEBHOOK_URL'],
    values: { DISCORD_WEBHOOK_URL: DISCORD_WEBHOOK_URL },
    secrets: ['DISCORD_WEBHOOK_URL'], calls: [['send', (c) => c.send({ content: 'ping' })]] },
  { key: 'messaging-facebook', creds: ['FACEBOOK_PAGE_ACCESS_TOKEN'], optional: ['FACEBOOK_DEFAULT_RECIPIENT_ID'],
    secrets: ['FACEBOOK_PAGE_ACCESS_TOKEN'], calls: [['send', (c) => c.send('ping', { recipientId: '1' })]] },
  { key: 'messaging-instagram', creds: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ID'], secrets: ['INSTAGRAM_ACCESS_TOKEN'],
    calls: [['send', (c) => c.send({ recipientId: '1', text: 'ping' })]] },
  { key: 'messaging-line-notify', creds: ['LINE_NOTIFY_TOKEN'], secrets: ['LINE_NOTIFY_TOKEN'],
    calls: [['send', (c) => c.send('ping')]] },
  { key: 'messaging-line', creds: ['LINE_CHANNEL_ACCESS_TOKEN'], values: fakeEnv(['LINE_CHANNEL_SECRET']),
    optional: ['LINE_CHANNEL_SECRET'], secrets: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET'],
    calls: [
      ['send', (c) => c.send({ to: 'U1', text: 'ping' })],
      ['broadcast', (c) => c.broadcast({ text: 'ping' })],
      // verifyWebhook is gated by LINE_CHANNEL_SECRET, not the access token — tested on its own below.
    ] },
  // Resend's health checks the `re_` prefix before declaring the key well-formed.
  { key: 'messaging-resend', creds: ['RESEND_API_KEY'], values: { RESEND_API_KEY: 're_fake-resend-api-key-not-real' },
    optional: ['RESEND_FROM_EMAIL', 'RESEND_FROM_NAME'], secrets: ['RESEND_API_KEY'],
    calls: [['send', (c) => c.send({ to: 'lead-not-real@example.test', subject: 'Hello', text: 'Hi' })]] },
  { key: 'messaging-slack', creds: ['SLACK_WEBHOOK_URL'],
    values: { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/FAKE/NOT/REAL-fake-slack-webhook-not-real' },
    optional: ['SLACK_BOT_TOKEN'], secrets: ['SLACK_WEBHOOK_URL', 'SLACK_BOT_TOKEN'],
    variants: [{ name: 'webhook plus bot token', env: { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/FAKE/NOT/REAL-fake-slack-webhook-not-real', SLACK_BOT_TOKEN: fake('SLACK_BOT_TOKEN') } }],
    calls: [
      ['send (webhook)', (c) => c.send('ping')],
      ['send (channel)', (c) => c.send('ping', { channel: '#ops' })],
    ] },
  { key: 'messaging-sms', creds: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'],
    values: { TWILIO_ACCOUNT_SID: 'ACfake-not-real', TWILIO_FROM: '+15550000000' }, secrets: ['TWILIO_AUTH_TOKEN'],
    calls: [['send', (c) => c.send('+15550000001', 'ping')]] },
  { key: 'messaging-teams', creds: ['TEAMS_WEBHOOK_URL'],
    values: { TEAMS_WEBHOOK_URL: 'https://example.webhook.office.com/webhookb2/fake-teams-webhook-not-real' },
    secrets: ['TEAMS_WEBHOOK_URL'], calls: [['send', (c) => c.send('ping')]] },
  { key: 'messaging-telegram', creds: ['TELEGRAM_BOT_TOKEN'], values: { TELEGRAM_CHAT_ID: '123456' },
    optional: ['TELEGRAM_CHAT_ID', 'TELEGRAM_ALERT_CHAT_ID'], secrets: ['TELEGRAM_BOT_TOKEN'],
    calls: [
      ['send', (c) => c.send('ping', { chatId: '123456' })],
      ['readOwnerUpdates', (c) => c.readOwnerUpdates({ startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-02T00:00:00Z' })],
    ] },
  { key: 'messaging-viber', creds: ['VIBER_AUTH_TOKEN'], optional: ['VIBER_BOT_NAME', 'VIBER_DEFAULT_RECEIVER'],
    secrets: ['VIBER_AUTH_TOKEN'], calls: [['send', (c) => c.send('ping', { receiver: 'r1' })]] },
  { key: 'messaging-whatsapp', creds: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'], optional: ['WHATSAPP_DEFAULT_RECIPIENT'],
    secrets: ['WHATSAPP_ACCESS_TOKEN'], calls: [['send', (c) => c.send('ping', { to: '15550000001' })]] },
  { key: 'messaging-zalo', creds: ['ZALO_ACCESS_TOKEN'], secrets: ['ZALO_ACCESS_TOKEN'],
    calls: [['send', (c) => c.send({ userId: 'u1', text: 'ping' })]] },

  // ---- payment ----
  { key: 'payment-2c2p', creds: ['TWOCTWOP_MERCHANT_ID', 'TWOCTWOP_SECRET_KEY'], optional: ['TWOCTWOP_ENV'],
    secrets: ['TWOCTWOP_SECRET_KEY'],
    calls: [['createPayment', (c) => c.createPayment({ invoiceNo: 'INV-1', amount: 1000, currencyCode: 'MMK' })]] },
  { key: 'payment-ayapay', creds: ['AYAPAY_MERCHANT_ID', 'AYAPAY_API_KEY', 'AYAPAY_SECRET'], optional: ['AYAPAY_NOTIFY_URL', 'AYAPAY_SANDBOX'],
    secrets: ['AYAPAY_API_KEY', 'AYAPAY_SECRET'],
    calls: [
      ['createQR', (c) => c.createQR({ amount: 1000, orderId: 'ORD-1' })],
      ['queryPayment', (c) => c.queryPayment({ orderId: 'ORD-1' })],
    ] },
  { key: 'payment-cbpay', creds: ['CBPAY_MERCHANT_CODE', 'CBPAY_API_KEY', 'CBPAY_SECRET'], optional: ['CBPAY_NOTIFY_URL', 'CBPAY_SANDBOX'],
    secrets: ['CBPAY_API_KEY', 'CBPAY_SECRET'],
    calls: [
      ['createQR', (c) => c.createQR({ amount: 1000, orderId: 'ORD-1' })],
      ['queryPayment', (c) => c.queryPayment({ orderId: 'ORD-1' })],
    ] },
  { key: 'payment-dinger', creds: ['DINGER_API_KEY', 'DINGER_MERCHANT_ID'], secrets: ['DINGER_API_KEY'],
    calls: [
      ['checkStatus', (c) => c.checkStatus({ transactionId: 'TX-1', orderId: 'ORD-1' })],
      ['createPayment', (c) => c.createPayment({ amount: 1000, method: 'kbzpay', orderId: 'ORD-1' })],
    ] },
  { key: 'payment-kbzpay', creds: ['KBZPAY_APP_ID', 'KBZPAY_MERCH_CODE', 'KBZPAY_APP_SECRET'], optional: ['KBZPAY_NOTIFY_URL', 'KBZPAY_SANDBOX'],
    secrets: ['KBZPAY_APP_SECRET'],
    calls: [
      ['createQR', (c) => c.createQR({ amount: 1000, orderId: 'ORD-1' })],
      ['queryPayment', (c) => c.queryPayment({ orderId: 'ORD-1' })],
      // verifyNotify is a module export (not on the connector object); payment-kbzpay.test.mjs covers it.
    ] },
  // Skeleton: credentials are checked, createIntent() is not built yet — no network path.
  { key: 'payment-onepay', creds: ['ONEPAY_MERCHANT_ID', 'ONEPAY_API_KEY', 'ONEPAY_SECRET_KEY'], optional: ['ONEPAY_SANDBOX'],
    secrets: ['ONEPAY_API_KEY', 'ONEPAY_SECRET_KEY'], network: false, calls: [] },
  { key: 'payment-paypal', creds: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'], secrets: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
    calls: [['listTransactions', (c) => c.listTransactions({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-02T00:00:00Z' })]] },
  // Stripe's configured() insists on the sk_live_/sk_test_ prefix; hyphens keep this fixture
  // outside every published key-scanner pattern.
  { key: 'payment-stripe', creds: ['STRIPE_SECRET_KEY'],
    values: { STRIPE_SECRET_KEY: 'sk_test_fake-stripe-secret-key-not-real', STRIPE_WEBHOOK_SECRET: 'whsec_fake-stripe-webhook-secret-not-real' },
    optional: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL'], secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    calls: [['createCheckout', (c) => c.createCheckout({ amount: 49, ref: 'PRJ-1' })]] },
  { key: 'payment-wavepay', creds: ['WAVEPAY_MERCHANT_ID', 'WAVEPAY_STORE_ID', 'WAVEPAY_SECRET_KEY'], secrets: ['WAVEPAY_SECRET_KEY'],
    calls: [
      ['createQR', (c) => c.createQR({ amount: 1000, orderId: 'ORD-1' })],
      ['queryPayment', (c) => c.queryPayment({ orderId: 'ORD-1' })],
      // verifyNotify is a module export (not on the connector object); payment-wavepay.test.mjs covers it.
    ] },
]

// Connectors with no credential at all. Each must report configured() === true; anything the
// registry holds that is in neither list fails the completeness test below.
const NO_CREDENTIAL = {
  'commerce-barcode': 'pure EAN-13 transform, no provider',
  'payment-mmqr': 'pure EMVCo transform, no provider',
  'infra-http': 'generic SSRF-guarded client; the caller supplies the URL (see infra-http.test.mjs)',
  'data-cbm-rate': 'public Central Bank endpoint, no auth',
}

// ---- harness ------------------------------------------------------------------

const TRACKED = [...new Set(MANIFEST.flatMap((entry) => [
  ...entry.creds,
  ...Object.keys(entry.values || {}),
  ...(entry.optional || []),
  ...(entry.anyOf || []).flat(),
  ...(entry.variants || []).flatMap((variant) => Object.keys(variant.env)),
  ...(entry.partials || []).flatMap((partial) => Object.keys(partial.env)),
]).concat(GOOGLE_VARS))]

const originalFetch = globalThis.fetch
const originalEnv = new Map(TRACKED.map((key) => [key, process.env[key]]))

function resetCaches() {
  resetTokenCache()
  resetOAuthTokenCache()
  resetPayPalTokenCacheForTests()
}

function applyEnv(env) {
  for (const key of TRACKED) delete process.env[key]
  for (const [key, value] of Object.entries(env)) process.env[key] = value
}

function presentEnv(entry) {
  return fakeEnv(entry.creds, entry.values || {})
}

function without(env, keys) {
  const copy = { ...env }
  for (const key of keys) delete copy[key]
  return copy
}

function recordingFetch(handler) {
  const calls = []
  const stub = async (url, options) => {
    calls.push({ url: String(url), method: options?.method || 'GET' })
    return handler()
  }
  stub.calls = calls
  return stub
}

function captureConsole() {
  const lines = []
  const saved = {}
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[method] = console[method]
    console[method] = (...args) => { lines.push(args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg))).join(' ')) }
  }
  return { lines, restore() { for (const [method, fn] of Object.entries(saved)) console[method] = fn } }
}

async function outcome(run) {
  try { return { value: await run() } } catch (error) { return { threw: error } }
}

const CRASH_TYPES = [TypeError, RangeError, ReferenceError]
const CONFIG_REFUSAL = /not_configured|missing|not set|skeleton/i

// A fetch that fails the test loudly if anything reaches it while the credential is absent.
const FORBIDDEN = () => { throw new Error('network_forbidden: fetch reached with the credential absent') }

const STUBS = {
  'HTTP 500 with a JSON error body': () => ({
    ok: false, status: 500, statusText: 'Internal Server Error',
    async json() { return { error: { message: 'upstream said no' }, message: 'upstream said no', errors: ['upstream said no'] } },
    async text() { return '{"message":"upstream said no"}' },
  }),
  'HTTP 500 with a malformed body': () => ({
    ok: false, status: 500, statusText: 'Internal Server Error',
    async json() { throw new SyntaxError('Unexpected token < in JSON at position 0') },
    async text() { return '<html>upstream exploded</html>' },
  }),
  'transport failure': () => { throw Object.assign(new TypeError('fetch failed'), { cause: new Error('connect ECONNRESET') }) },
  'timeout abort': () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) },
}

async function assertFailsClosed(entry, connector, env, label) {
  applyEnv(env)
  resetCaches()
  const fetchStub = recordingFetch(FORBIDDEN)
  globalThis.fetch = fetchStub
  const capture = captureConsole()
  const where = `${entry.key} [${label}]`
  try {
    assert.equal(connector.configured(), false, `${where}: configured() must be false`)
    assert.equal(registry.list().find((row) => row.key === entry.key)?.configured, false, `${where}: registry must list it unconfigured`)
    const health = await connector.health()
    assert.equal(health?.ok, false, `${where}: health() must be ok:false, got ${inspect(health)}`)
    assert.match(String(health.detail ?? health.reason ?? ''), CONFIG_REFUSAL, `${where}: health() must name the missing config, got ${inspect(health)}`)
    for (const [name, run] of entry.calls) {
      const result = await outcome(() => run(connector))
      if ('threw' in result) {
        // Convention B (core Google connectors): a thrown DOMAIN error is a refusal; a
        // TypeError/RangeError/ReferenceError means garbage reached raw JS.
        assert.ok(result.threw instanceof Error && !CRASH_TYPES.some((T) => result.threw instanceof T),
          `${where}: ${name} crashed instead of refusing: ${inspect(result.threw)}`)
        assert.match(String(result.threw.message), CONFIG_REFUSAL, `${where}: ${name} threw a non-config error: ${result.threw.message}`)
      } else {
        assert.equal(result.value?.ok, false, `${where}: ${name} must refuse with ok:false, got ${inspect(result.value)}`)
        assert.match(String(result.value.reason ?? result.value.detail ?? ''), CONFIG_REFUSAL,
          `${where}: ${name} must name the missing config, got ${inspect(result.value)}`)
      }
    }
  } finally {
    capture.restore()
  }
  assert.equal(fetchStub.calls.length, 0,
    `${where}: fetch was invoked ${fetchStub.calls.length}x with the credential absent — ${inspect(fetchStub.calls)}`)
}

async function assertNoLeak(entry, connector, variant) {
  applyEnv(variant.env)
  const where = `${entry.key} [${variant.name}]`
  assert.equal(connector.configured(), true, `${where}: fixture must satisfy configured()`)
  const probes = entry.secrets
    .filter((name) => variant.env[name] !== undefined)
    .map((name) => [name, entry.probes?.[name] ?? variant.env[name]])
  assert.ok(probes.length > 0, `${where}: variant sets no secret to probe for`)
  for (const [name, probe] of probes) assert.ok(probe.length >= 12, `${where}: probe for ${name} is too short to be meaningful`)

  const transcript = []
  let networkCalls = 0
  for (const [stubName, stub] of Object.entries(STUBS)) {
    resetCaches()
    const fetchStub = recordingFetch(stub)
    globalThis.fetch = fetchStub
    const capture = captureConsole()
    try {
      transcript.push({ stub: stubName, health: await outcome(() => connector.health()) })
      for (const [name, run] of entry.calls) {
        transcript.push({ stub: stubName, call: name, result: await outcome(() => run(connector)) })
      }
    } finally {
      capture.restore()
    }
    transcript.push({ stub: stubName, console: capture.lines })
    networkCalls += fetchStub.calls.length
  }
  // util.inspect renders thrown errors with stack, cause, and own props (status/body/...), so
  // this haystack is every observable surface the caller or a log sink could see.
  const haystack = inspect(transcript, { depth: 25, breakLength: Infinity, maxStringLength: Infinity, maxArrayLength: Infinity })
  for (const [name, probe] of probes) {
    assert.ok(!haystack.includes(probe), `${where}: ${name} leaked through an error path:\n${haystack.slice(0, 4000)}`)
  }
  if (entry.network !== false) {
    assert.ok(networkCalls > 0, `${where}: no stub was ever reached — the leak pass did not exercise a network path`)
  }
}

beforeEach(() => {
  for (const key of TRACKED) delete process.env[key]
  resetCaches()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetCaches()
})

// ---- per-connector contract ---------------------------------------------------

for (const entry of MANIFEST) {
  const connector = registry.get(entry.key)
  entry.calls ||= []

  if (entry.failClosed !== false) {
    test(`${entry.key}: fails closed without its credential and makes zero network calls`, async () => {
      assert.ok(connector, `${entry.key} is not registered`)
      const full = presentEnv(entry)
      const grouped = new Set((entry.anyOf || []).flat())
      await assertFailsClosed(entry, connector, {}, 'all env absent')
      for (const name of entry.creds) {
        if (grouped.has(name)) continue
        await assertFailsClosed(entry, connector, without(full, [name]), `${name} absent`)
      }
      for (const group of entry.anyOf || []) {
        await assertFailsClosed(entry, connector, without(full, group), `${group.join('/')} absent`)
      }
      for (const partial of entry.partials || []) {
        await assertFailsClosed(entry, connector, partial.env, partial.name)
      }
    })
  }

  test(`${entry.key}: never leaks its credential through an error path`, async () => {
    assert.ok(connector, `${entry.key} is not registered`)
    await assertNoLeak(entry, connector, { name: 'default credentials', env: presentEnv(entry) })
    for (const variant of entry.variants || []) await assertNoLeak(entry, connector, variant)
  })
}

// ---- shared Google auth helpers (the credential path behind five connectors) --------

test('_google-auth and _google-oauth fail closed with no credential and touch no network', async () => {
  const fetchStub = recordingFetch(FORBIDDEN)
  globalThis.fetch = fetchStub
  assert.equal(credsConfigured(), false)
  assert.equal(oauthConfigured(), false)
  await assert.rejects(getAccessToken(['scope']), /google_creds_missing_or_invalid/)
  await assert.rejects(getOAuthAccessToken(['scope']), /google_oauth_not_configured/)
  assert.equal(fetchStub.calls.length, 0)
})

test('_google-auth refuses before the network when the credential is present but unusable', async () => {
  const fetchStub = recordingFetch(FORBIDDEN)
  globalThis.fetch = fetchStub
  const unusable = [
    ['GOOGLE_SERVICE_ACCOUNT_JSON is not JSON', { GOOGLE_SERVICE_ACCOUNT_JSON: 'not-json-not-real' }],
    ['GOOGLE_SERVICE_ACCOUNT_JSON lacks private_key', { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'x@example.test' }) }],
    ['GOOGLE_APPLICATION_CREDENTIALS points at a missing file', { GOOGLE_APPLICATION_CREDENTIALS: '/nonexistent/fake-not-real.json' }],
  ]
  for (const [label, env] of unusable) {
    applyEnv(env)
    resetCaches()
    // credsConfigured() is a cheap presence check by design; the parse happens at token time
    // and must still stop short of the token endpoint.
    assert.equal(credsConfigured(), true, label)
    await assert.rejects(getAccessToken(['scope']), /google_creds_missing_or_invalid/, label)
  }
  assert.equal(fetchStub.calls.length, 0)
})

test('_google-oauth never echoes the client secret or refresh token on a token-endpoint failure', async () => {
  applyEnv(OAUTH_ENV)
  const transcript = []
  for (const [stubName, stub] of Object.entries(STUBS)) {
    resetOAuthTokenCache()
    globalThis.fetch = recordingFetch(stub)
    transcript.push({ stub: stubName, result: await outcome(() => getOAuthAccessToken(['scope'])) })
  }
  const haystack = inspect(transcript, { depth: 25, breakLength: Infinity, maxStringLength: Infinity })
  for (const name of GOOGLE_OAUTH_VARS) assert.ok(!haystack.includes(OAUTH_ENV[name]), `${name} leaked: ${haystack.slice(0, 2000)}`)
})

// ---- capabilities gated by a second credential ------------------------------------

test('messaging-line verifyWebhook fails closed without LINE_CHANNEL_SECRET and never needs the network', () => {
  const fetchStub = recordingFetch(FORBIDDEN)
  globalThis.fetch = fetchStub
  const line = registry.get('messaging-line')
  applyEnv(fakeEnv(['LINE_CHANNEL_ACCESS_TOKEN']))
  assert.deepEqual(line.verifyWebhook('{}', 'not-a-signature'), { ok: false, reason: 'LINE_CHANNEL_SECRET not set' })
  applyEnv(fakeEnv(['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET']))
  const rejected = line.verifyWebhook('{}', 'not-a-signature')
  assert.deepEqual(rejected, { ok: false, reason: 'signature_mismatch' })
  assert.ok(!inspect(rejected).includes(fake('LINE_CHANNEL_SECRET')))
  assert.equal(fetchStub.calls.length, 0)
})

// ---- completeness ---------------------------------------------------------------

test('every registered connector is classified: credentialed (in the manifest) or declared credential-free', () => {
  const registered = registry.list().map((row) => row.key).sort()
  const manifestKeys = MANIFEST.map((entry) => entry.key)
  assert.equal(new Set(manifestKeys).size, manifestKeys.length, 'duplicate manifest entry')
  const classified = [...manifestKeys, ...Object.keys(NO_CREDENTIAL)].sort()
  assert.deepEqual(registered, classified,
    'a connector is registered without a fail-closed contract entry (or a manifest entry names nothing registered)')
  assert.equal(registry.registrationErrors.length, 0)
  for (const [key, why] of Object.entries(NO_CREDENTIAL)) {
    assert.equal(registry.get(key).configured(), true, `${key} is declared credential-free (${why}) but reports unconfigured`)
  }
  for (const entry of MANIFEST) {
    for (const name of entry.secrets) {
      assert.ok(TRACKED.includes(name), `${entry.key}: secret ${name} is not a tracked env var`)
    }
  }
})
