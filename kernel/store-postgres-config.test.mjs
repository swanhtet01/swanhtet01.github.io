import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { postgresPoolConfig } from './store-postgres-config.mjs'
import { createRequire } from 'node:module'

const base = 'postgresql://fixture:synthetic@db.example.com/fixture'
test('remote TLS verifies certificates without a connection-string override', () => {
  for (const suffix of ['', '?sslmode=require', '?sslmode=verify-full']) {
    const config = postgresPoolConfig(base + suffix)
    assert.equal(config.ssl.rejectUnauthorized, true)
    assert.equal('connectionString' in config, false)
    assert.equal(config.connectionTimeoutMillis, 10000)
  }
})
test('plaintext and override options are rejected for remote hosts', () => {
  for (const suffix of ['sslmode=disable', 'sslmode=no-verify', 'sslmode=prefer', 'sslmode=verify-ca', 'ssl=false', 'sslrootcert=ignored', 'host=localhost', 'sslmode=require&sslmode=disable']) {
    assert.throws(() => postgresPoolConfig(base + '?' + suffix), /postgres_/)
  }
})
test('only exact loopback hosts allow local plaintext testing', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(postgresPoolConfig(`postgres://fixture:synthetic@${host}/fixture?sslmode=disable`).ssl, false)
    assert.equal(postgresPoolConfig(`postgres://fixture:synthetic@${host}/fixture?sslmode=verify-full`).ssl.rejectUnauthorized, true)
  }
  assert.throws(() => postgresPoolConfig('postgres://fixture:synthetic@localhost.example.com/fixture?sslmode=disable'))
})
test('explicit fields preserve encoded credentials and approved CA without leaking errors', () => {
  const ca = '-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----'
  const config = postgresPoolConfig('postgres://fixture:p%40ss%3Aword@db.example.com:6543/fixture?application_name=console', ca)
  assert.equal(config.password, 'p@ss:word')
  assert.equal(config.port, 6543)
  assert.equal(config.ssl.ca, ca)
  assert.equal(config.application_name, 'console')
  assert.throws(() => postgresPoolConfig('not-a-url'), /^Error: postgres_connection_invalid$/)
  assert.throws(() => postgresPoolConfig(base, 'not-a-certificate'), /postgres_ca_invalid/)
})
test('store pool uses the guarded config', async () => {
  const source = await readFile(new URL('./store.mjs', import.meta.url), 'utf8')
  assert.ok(source.includes('new pgmod.Pool(postgresPoolConfig(CONN,'))
  assert.equal(source.includes('rejectUnauthorized: false'), false)
})

test('installed pg driver retains explicit remote verification despite PGSSLMODE', () => {
  const require = createRequire(import.meta.url)
  const { Client } = require('pg')
  const prior = process.env.PGSSLMODE
  try {
    process.env.PGSSLMODE = 'disable'
    for (const suffix of ['', '?sslmode=require', '?sslmode=verify-full']) {
      const client = new Client(postgresPoolConfig(base + suffix))
      assert.equal(client.connectionParameters.host, 'db.example.com')
      assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true)
      assert.equal(client.connectionParameters.password, 'synthetic')
    }
  } finally {
    if (prior === undefined) delete process.env.PGSSLMODE
    else process.env.PGSSLMODE = prior
  }
})
