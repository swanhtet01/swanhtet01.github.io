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

// The v4-mapped IPv6 form (::ffff:0:0/96) embeds an IPv4 address in its last 32 bits,
// and that embedded address can be written in either dotted-decimal (::ffff:127.0.0.1)
// or plain hex (::ffff:7f00:1) -- both resolve to the identical loopback/private
// address at the network layer. A regex that only matched the dotted form let the hex
// form of the same address straight through.
test('infra-http blocks the hex form of a v4-mapped IPv6 private/loopback/metadata address', async () => {
  const blocked = [
    'https://[::ffff:7f00:1]/',            // 127.0.0.1, minimal hex form
    'https://[::ffff:7F00:0001]/',         // same address, uppercase + leading zeros
    'https://[0:0:0:0:0:ffff:7f00:1]/',    // same address, fully expanded (no ::)
    'https://[::ffff:a9fe:a9fe]/',         // 169.254.169.254 -- cloud metadata, hex form
    'https://[::ffff:a00:1]/',             // 10.0.0.1 -- private range, hex form
  ]
  for (const u of blocked) assert.ok(await validateUrl(u), `should block ${u}`)
})

test('infra-http still permits a public v4-mapped IPv6 address (dotted or hex)', async () => {
  assert.equal(await validateUrl('https://[::ffff:8.8.8.8]/'), null)
  assert.equal(await validateUrl('https://[::ffff:808:808]/'), null) // 8.8.8.8 in hex
})

test('infra-http permits a real public IPv6 literal', async () => {
  assert.equal(await validateUrl('https://[2606:4700:4700::1111]/'), null)
})

test('infra-http rejects a malformed IPv6-looking host without throwing', async () => {
  assert.ok(await validateUrl('https://[not:a:valid:address]/'))
})
