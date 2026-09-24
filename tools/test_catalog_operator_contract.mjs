import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyCatalogPreparation, verifyCatalogRecipients } from '../showroom/src/products/ecommerce/operator-review-contract.ts'
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
