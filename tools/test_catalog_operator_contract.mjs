import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyCatalogExpiredAbsence, verifyCatalogReconciliation, verifyCatalogPreparation, verifyCatalogRecipients, verifyCatalogPreparationReceipt, verifyCatalogWithdrawal, readCatalogCommand, retainCatalogCommand, clearCatalogCommand } from '../showroom/src/products/ecommerce/operator-review-contract.ts'
import { storefrontPreviewDigest, STOREFRONT_PREVIEW_SCHEMA } from '../showroom/src/products/ecommerce/storefront-model.ts'
import { COMMERCE_WORKSPACE_SCHEMA } from '../showroom/src/core/commerce-workspace.ts'
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12,'0')}`
const row = n => ({grantId:id(n),label:'ဆိုင် Customer'})
const listing = rows => ({recipients:rows,nextAfter:null,order:'grant_id_ascending',accessGranted:false})
test('recipients are bounded, ordered, private, cursor-bound and cloned', () => {
  const input=listing([row(1)]), result=verifyCatalogRecipients(input)
  result.recipients[0].label='changed'; assert.notEqual(input.recipients[0].label,'changed')
  const full=listing(Array.from({length:50},(_,i)=>row(i+1)));full.nextAfter=id(50)
  assert.equal(verifyCatalogRecipients(full).nextAfter,id(50))
  assert.equal(verifyCatalogRecipients(listing([row(51)]),id(50)).recipients.length,1)
  for(const bad of [listing([row(2),row(1)]),listing([row(1),row(1)]),listing(Array.from({length:51},(_,i)=>row(i+1))),
    listing([{...row(1),actorId:'private'}]),listing([{...row(1),label:'bad\nlabel'}]),
    {...input,nextAfter:id(1)},{...input,accessGranted:true},{...full,nextAfter:id(49)}]) assert.throws(()=>verifyCatalogRecipients(bad))
  assert.throws(()=>verifyCatalogRecipients(input,id(1)))
  assert.throws(()=>verifyCatalogRecipients(input,'bad'))
})
test('saved preparation verifies exact catalog digest and forbids write claims', async () => {
  const preview={schema:STOREFRONT_PREVIEW_SCHEMA,mode:'browser-local-preview',sourceCatalogSchema:COMMERCE_WORKSPACE_SCHEMA,
    storeName:'ဆိုင်',summary:'Prepared catalog',currency:'MMK',items:[{sku:'A',name:'Tea',variant:null,unitPriceMmk:500,availability:'available'}]}
  const input={status:'saved_source_preview',sourceVersion:1,contentRevision:0,preview,previewDigest:await storefrontPreviewDigest(preview),
    readAt:'2026-09-25T00:00:00+00:00',reviewCreated:false,publicationAuthorized:false,deploymentAuthorized:false}
  const result=await verifyCatalogPreparation(input);result.preview.items[0].name='changed'
  assert.equal(input.preview.items[0].name,'Tea')
  for(const patch of [{sourceVersion:0},{sourceVersion:true},{contentRevision:-1},{readAt:'tomorrow'},
    {reviewCreated:true},{publicationAuthorized:true},{deploymentAuthorized:true},{previewDigest:'bad'},{actorId:'private'}])
    await assert.rejects(verifyCatalogPreparation({...input,...patch}))
  const changed=structuredClone(input);changed.preview.items[0].unitPriceMmk++
  await assert.rejects(verifyCatalogPreparation(changed))
})

test('preparation receipt binds request, exact microsecond expiry and saved source', () => {
  const command={reviewId:id(1),recipientGrantId:id(2),expectedVersion:4,contentRevision:2,
    previewDigest:'sha256:'+'a'.repeat(64),readAt:'2026-09-25T00:00:00.123456Z',expiresAt:'2026-09-26T00:00:00.123456Z'}
  const receipt={reviewId:id(1),sourceVersion:4,contentRevision:2,previewDigest:command.previewDigest,
    preparedAt:'2026-09-25T00:00:01+00:00',expiresAt:command.expiresAt,status:'prepared_preview',persisted:true,replayed:false,
    publicationAuthorized:false,deploymentAuthorized:false}
  assert.equal(verifyCatalogPreparationReceipt(receipt,command).reviewId,id(1))
  assert.equal(verifyCatalogPreparationReceipt({...receipt,replayed:true,expiresAt:'2026-09-26T00:00:00.123456+00:00'},command).replayed,true)
  for(const patch of [{reviewId:id(3)},{sourceVersion:5},{contentRevision:3},{previewDigest:'sha256:'+'b'.repeat(64)},
    {preparedAt:'2026-09-25T00:00:00.123455Z'},{preparedAt:command.expiresAt},
    {expiresAt:'2026-09-26T00:00:00.123457Z'},{persisted:false},{replayed:'yes'},
    {publicationAuthorized:true},{deploymentAuthorized:true},{recipientActorId:'private'}])
    assert.throws(()=>verifyCatalogPreparationReceipt({...receipt,...patch},command))
  const late='2026-10-26T00:00:00Z'
  assert.throws(()=>verifyCatalogPreparationReceipt({...receipt,expiresAt:late},{...command,expiresAt:late}))
})
test('withdrawal receipt cannot confirm another review or publication', () => {
  const receipt={reviewId:id(1),status:'revoked',persisted:true,replayed:false,publicationAuthorized:false,deploymentAuthorized:false}
  assert.equal(verifyCatalogWithdrawal(receipt,id(1)).status,'revoked')
  for(const patch of [{reviewId:id(2)},{status:'active'},{persisted:false},{replayed:1},{publicationAuthorized:true},{deploymentAuthorized:true},{extra:1}])
    assert.throws(()=>verifyCatalogWithdrawal({...receipt,...patch},id(1)))
})

test('uncertain preparation retains one exact command and refuses storage conflicts', () => {
  const map=new Map(), storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)}
  const command={reviewId:id(1),recipientGrantId:id(2),expectedVersion:1,contentRevision:0,previewDigest:'sha256:'+'a'.repeat(64),readAt:'2026-09-25T00:00:00Z',expiresAt:'2026-09-26T00:00:00Z'}
  retainCatalogCommand(storage,'identity-a',command)
  assert.deepEqual(readCatalogCommand(storage,'identity-a'),command)
  retainCatalogCommand(storage,'identity-a',command)
  assert.throws(()=>retainCatalogCommand(storage,'identity-a',{...command,reviewId:id(3)}))
  assert.throws(()=>clearCatalogCommand(storage,'identity-a',{...command,reviewId:id(3)}))
  assert.equal(readCatalogCommand(storage,'identity-b'),null)
  clearCatalogCommand(storage,'identity-a',command);assert.equal(readCatalogCommand(storage,'identity-a'),null)
  map.set('identity-a','broken');assert.equal(readCatalogCommand(storage,'identity-a'),'unavailable')
  assert.throws(()=>retainCatalogCommand(storage,'identity-a',command))
  const denied={getItem:()=>{throw Error('denied')},setItem:()=>{throw Error('denied')}}
  assert.equal(readCatalogCommand(denied,'key'),'unavailable')
  assert.throws(()=>retainCatalogCommand(denied,'key',command))
})


test('reconciliation binds retained assignment and distinguishes inactive from uncertain',()=>{
 const command={reviewId:id(1),recipientGrantId:id(2),expectedVersion:4,contentRevision:2,
  previewDigest:'sha256:'+'a'.repeat(64),readAt:'2026-09-25T00:00:00Z',expiresAt:'2026-09-26T00:00:00.123456Z'}
 const row={reviewId:id(1),sourceVersion:4,contentRevision:2,previewDigest:command.previewDigest,
  preparedAt:'2026-09-25T00:00:01Z',expiresAt:command.expiresAt,readAt:'2026-09-25T01:00:00Z',status:'active',publicationAuthorized:false,deploymentAuthorized:false}
 for(const status of ['active','stale','revoked']) assert.equal(verifyCatalogReconciliation({...row,status},command).status,status)
 assert.equal(verifyCatalogReconciliation({...row,status:'expired',readAt:command.expiresAt},command).status,'expired')
 const result=verifyCatalogReconciliation(row,command);result.status='revoked';assert.equal(row.status,'active')
 for(const patch of [{status:'missing'},{status:'expired'},{status:['active']},{status:null},{reviewId:id(3)},{sourceVersion:5},
  {contentRevision:3},{previewDigest:'sha256:'+'b'.repeat(64)},{expiresAt:'2026-09-26T00:00:00.123455Z'},
  {readAt:'2026-09-25T00:00:00Z'},{readAt:command.expiresAt},{publicationAuthorized:true},{deploymentAuthorized:true},{recipientActorId:'private'}])
  assert.throws(()=>verifyCatalogReconciliation({...row,...patch},command))
 for(const missing of [null,{}, {status:'not_found'}])assert.throws(()=>verifyCatalogReconciliation(missing,command))
})


test('expired absence proves only the original request expiry after server time',()=>{
 const command={reviewId:id(1),recipientGrantId:id(2),expectedVersion:4,contentRevision:2,
  previewDigest:'sha256:'+'a'.repeat(64),readAt:'2026-09-25T00:00:00Z',expiresAt:'2026-09-26T00:00:00.123456Z'}
 const row={reviewId:id(1),status:'absent_expired',expiresAt:command.expiresAt,readAt:command.expiresAt,
  publicationAuthorized:false,deploymentAuthorized:false}
 assert.equal(verifyCatalogExpiredAbsence(row,command).status,'absent_expired')
 assert.equal(verifyCatalogExpiredAbsence({...row,expiresAt:'2026-09-26T00:00:00.123456+00:00'},command).reviewId,id(1))
 for(const patch of [{reviewId:id(2)},{status:'missing'},{expiresAt:'2026-09-26T00:00:00.123455Z'},
  {readAt:'2026-09-26T00:00:00.123455Z'},{readAt:'bad'},{publicationAuthorized:true},{deploymentAuthorized:true},{extra:1}])
  assert.throws(()=>verifyCatalogExpiredAbsence({...row,...patch},command))
 for(const patch of [{reviewId:'bad'},{expiresAt:'bad'},{expectedVersion:0},{recipientGrantId:'bad'},{previewDigest:'bad'}])
  assert.throws(()=>verifyCatalogExpiredAbsence(row,{...command,...patch}))
})
