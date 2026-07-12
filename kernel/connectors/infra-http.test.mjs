// SSRF-guard tests for the generic HTTP connector. IP-literal cases need no network. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateUrl } from './infra-http.mjs'

test('infra-http blocks loopback / private / link-local / CGNAT / metadata IP literals + non-https', async () => {
  const blocked = [
    'https://127.0.0.1/', 'https://10.0.0.5/x', 'https://192.168.1.1/', 'https://172.16.0.1/',
    'https://169.254.169.254/latest/meta-data/', 'https://100.64.0.1/', 'https://[::1]/',
    'https://0.0.0.0/', 'http://example.com/', 'ftp://example.com/',
  ]
  for (const u of blocked) assert.ok(await validateUrl(u), `should block ${u}`)
})

test('infra-http permits a public IP literal over https', async () => {
  assert.equal(await validateUrl('https://1.1.1.1/'), null)
})
