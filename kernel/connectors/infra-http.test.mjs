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

test('infra-http blocks IPv4-metadata-address embedded in IPv6 via every known bypass encoding', async () => {
  // 169.254.169.254 (cloud metadata) smuggled through NAT64 / v4-compatible / v4-mapped forms —
  // dotted-decimal and pure-hex alike. All parse as valid IPv6 (net.isIP === 6), so these are real
  // reachable bypass strings, not just theoretical ones.
  const blocked = [
    'https://[64:ff9b::a9fe:a9fe]/',              // NAT64, pure hex
    'https://[64:ff9b::169.254.169.254]/',        // NAT64, dotted
    'https://[::169.254.169.254]/',               // v4-compatible (deprecated), dotted
    'https://[::a9fe:a9fe]/',                     // v4-compatible (deprecated), pure hex
    'https://[::ffff:a9fe:a9fe]/',                // v4-mapped, pure hex
    'https://[0:0:0:0:0:ffff:169.254.169.254]/',  // v4-mapped, full 8-group, no :: compression
  ]
  for (const u of blocked) assert.ok(await validateUrl(u), `should block ${u}`)
})

test('infra-http does not false-positive on ordinary global-unicast IPv6 literals', async () => {
  // Their low 32 bits are not embedded IPv4 metadata — the general extractor is scoped to the
  // three known /96 embedding prefixes (::/96, ::ffff:0:0/96, 64:ff9b::/96) so these must pass.
  assert.equal(await validateUrl('https://[2606:4700:4700::1111]/'), null) // Cloudflare public DNS
  assert.equal(await validateUrl('https://[2001:4860:4860::8888]/'), null) // Google public DNS
})
