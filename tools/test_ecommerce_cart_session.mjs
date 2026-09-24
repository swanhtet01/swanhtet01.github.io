import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readSessionCart,saveSessionCart} from '../showroom/src/products/ecommerce/cart-session.ts'
const items=[{sku:'tea',onHand:3}]
const lines=[{sku:'tea',quantity:2}]
function memory(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}}
test('restores quantities for matching account/catalog only',()=>{for(const scope of ['local/catalog-a','company-a/user-a/catalog-a']){const s=memory();saveSessionCart(s,scope,lines,100);assert.deepEqual(readSessionCart(s,scope,items,200),lines);assert.deepEqual(readSessionCart(s,scope+'changed',items,200),[]);assert.equal(s.data.size,0)}})
test('expired and unavailable stock never restore',()=>{const s=memory();saveSessionCart(s,'a',lines,100);assert.deepEqual(readSessionCart(s,'a',[{sku:'tea',onHand:1}],200),[]);assert.deepEqual(readSessionCart(s,'a',items,3600100),[])})
test('clear after confirmation removes cart and strips extra data on save',()=>{const s=memory();saveSessionCart(s,'a',[{...lines[0],price:55,phone:'private'}],100);assert.ok(![...s.data.values()][0].includes('private'));saveSessionCart(s,'a',[],200);assert.equal(s.data.size,0)})
test('malformed and duplicate lines are rejected; storage failure is reported',()=>{const s=memory();assert.equal(saveSessionCart(s,'a',[...lines,...lines]),false);s.setItem('supermega.ecommerce.cart-session.v1','{');assert.deepEqual(readSessionCart(s,'a',items),[]);const blocked={getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}};assert.deepEqual(readSessionCart(blocked,'a',items),[]);assert.equal(saveSessionCart(blocked,'a',lines),false)})
