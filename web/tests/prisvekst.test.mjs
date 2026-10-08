import test from 'node:test'
import assert from 'node:assert/strict'
import { prisvekstRader } from '../src/fellestall/prisvekst.js'

test('siste budsjett erstattes av regnskap, observerte nevnere overstyrer anslag', () => {
  const data = { meta: { regnskap_aar: [2025], budsjett_aar: [2025, 2026, 2027, 2028] },
    kpi: {2025:100}, befolkning: {2025:10,2026:11},
    prisvekstAnslag: {kpi:{2026:103,2027:106},befolkning:{2026:99,2027:12}} }
  const rot = [{l:'p',s:{2025:[10,20,30,40],2026:[0,20,30,null],2027:[0,null,null,40],2028:[0,null,null,50]}}]
  let r = prisvekstRader(data,rot)
  assert.deepEqual(r.map(x=>x.type),['Regnskap','Revidert budsjett','Regjeringens budsjettforslag'])
  assert.equal(r[1].perInnbygger,30e6/11)
  data.meta.regnskap_aar.push(2026)
  r = prisvekstRader(data,rot)
  assert.equal(r[1].budsjett,false)
  assert.equal(r[1].perInnbygger,0)
})
