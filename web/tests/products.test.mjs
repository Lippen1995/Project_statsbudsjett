import test from 'node:test'
import assert from 'node:assert/strict'
import {productVisibility,productRoute,productMetadata,PRODUCT_PATHS} from '../src/products/launch.mjs'
test('one launch setting controls navigation, index and sitemap while direct routes remain available',()=>{
  assert.deepEqual(productVisibility(false),{navigation:false,robots:'noindex, nofollow',sitemap:[]})
  assert.deepEqual(productVisibility(true),{navigation:true,robots:'index, follow',sitemap:PRODUCT_PATHS})
  for(const path of PRODUCT_PATHS) {
    assert.ok(productRoute(path).page)
    assert.deepEqual(productRoute(path),productRoute(path.slice(0,-1)))
    assert.equal(productMetadata(productRoute(path),false).robots,'noindex, nofollow')
    assert.equal(productMetadata(productRoute(path),true).robots,'index, follow')
  }
  assert.equal(productRoute('/hjelper-deg/ukjent').notFound,true)
  assert.equal(productMetadata({notFound:true},true).robots,'noindex, nofollow')
})
