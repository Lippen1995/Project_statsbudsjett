import test from 'node:test'
import assert from 'node:assert/strict'
import { kartValg } from '../src/fellestall/kartvalg.js'

test('tilbyr alle faktiske år og budsjettformer uten falske framtidige regnskap', () => {
  const d = { meta:{regnskap_aar:[2014,2025],budsjett_aar:[2025,2026,2027],budsjettforslag:[{year:2027,label:'Regjeringens budsjettforslag'}]},utgifter:[{s:{2014:[1,null,null,null],2025:[2,3,4,null],2026:[0,5,6,null],2027:[0,null,null,7]}}] }
  assert.deepEqual(kartValg(d).map(o=>`${o.aar}:${o.si}`),['2014:0','2025:0','2025:1','2025:2','2026:1','2026:2','2027:3'])
  d.meta.budsjettforslag=[]
  assert.ok(!kartValg(d).some(o=>o.si===3))
})

test('ett forslagsår får regnskapshistorikk og siste budsjett som kontekst', async () => {
  const { kartHistorikk } = await import('../src/fellestall/kartvalg.js')
  const options = [{aar:2025,si:0},{aar:2025,si:1},{aar:2026,si:1},{aar:2026,si:2},{aar:2027,si:3}]
  assert.deepEqual(kartHistorikk(options,options[4]).map(o=>o.si),[0,2,3])
  assert.deepEqual(kartHistorikk(options,options[1]).map(o=>o.si),[1,1,3])
})
