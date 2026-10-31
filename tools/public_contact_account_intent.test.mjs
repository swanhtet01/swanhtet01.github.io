import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

import {
  canonicalContactLanguageSearch,
  isManagedAccountHelpQuery,
  managedAccountHelpCopy,
} from './public_contact_account_intent.mjs'

const products = ['guide', 'shop', 'website', 'ecommerce']
const exact = (product = 'guide') => new URLSearchParams({
  product,
  template: 'managed-account',
  utm_source: 'app',
  utm_medium: 'business_setup',
})

test('exact guide and Shop account handoffs are recognized in the browser-safe helper', () => {
  const embedded = runInNewContext(`(${isManagedAccountHelpQuery.toString()})`)
  for (const product of ['guide', 'shop']) {
    assert.equal(isManagedAccountHelpQuery(exact(product), products), true)
    assert.equal(embedded(exact(product), products), true)
  }
})

test('near misses, duplicate authority fields and unknown products stay ordinary contact intent', () => {
  const searches = [
    '?product=shop&template=managed-account&utm_source=app',
    '?product=shop&template=managed-account&utm_source=app&utm_medium=other',
    '?product=shop&template=managed-account&template=managed-account&utm_source=app&utm_medium=business_setup',
    '?product=shop&product=guide&template=managed-account&utm_source=app&utm_medium=business_setup',
    '?product=unknown&template=managed-account&utm_source=app&utm_medium=business_setup',
  ]
  for (const search of searches) {
    assert.equal(isManagedAccountHelpQuery(new URLSearchParams(search), products), false)
  }
})

test('language switching preserves exact tuples but cannot canonicalize duplicates into authority', () => {
  const names = ['product', 'template', 'service', 'utm_source', 'utm_medium']
  assert.equal(canonicalContactLanguageSearch(exact('shop'), names),
    'product=shop&template=managed-account&utm_source=app&utm_medium=business_setup')
  const duplicate = new URLSearchParams('?product=shop&template=managed-account&template=managed-account&utm_source=app&utm_medium=business_setup')
  const switched = new URLSearchParams(canonicalContactLanguageSearch(duplicate, names))
  assert.equal(switched.has('template'), false)
  assert.equal(isManagedAccountHelpQuery(switched, products), false)
})

test('English and Burmese account-help copy is support-only and makes no access promise', () => {
  assert.match(managedAccountHelpCopy.en.heading, /help.*account/i)
  assert.match(managedAccountHelpCopy.en.lede, /does not create an account or grant access/)
  assert.match(managedAccountHelpCopy.my.heading, /အကောင့်/)
  assert.match(managedAccountHelpCopy.my.lede, /အကောင့်ဖန်တီးပေးခြင်း သို့မဟုတ် အသုံးပြုခွင့်ပေးခြင်း မရှိပါ/)
})
