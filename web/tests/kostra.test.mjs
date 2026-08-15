import test from 'node:test'
import assert from 'node:assert/strict'

import { choroplethColor, mapValue, parseKostraRoute } from '../src/kostra/model.js'
import { SEKSJONER } from '../src/fellestall/design.js'

test('KOSTRA-kartet ligger på hovedsiden rett under Utforsk staten', () => {
  const utforsk = SEKSJONER.findIndex((section) => section.id === 'utforsk')
  assert.equal(SEKSJONER[utforsk].navn, 'Utforsk staten')
  assert.equal(SEKSJONER[utforsk + 1].id, 'kommuner')
})

test('KOSTRA-ruter skiller fylkesdrill fra detaljsider', () => {
  assert.deepEqual(parseKostraRoute('#kostra'), { page: 'map', countyCode: null })
  assert.deepEqual(parseKostraRoute('#kostra/fylke/03'), { page: 'map', countyCode: '03' })
  assert.deepEqual(parseKostraRoute('#kostra/fylke/03/detaljer'), { page: 'detail', kind: 'county', code: '0300' })
  assert.deepEqual(parseKostraRoute('#kostra/kommune/0301'), { page: 'detail', kind: 'municipality', code: '0301' })
})

test('kartverdi velger beløp eller per innbygger uten å tolke null som null kroner', () => {
  const index = { values: { expenses: { 2025: { 'municipality:0301': { amount: 12.5, perCapita: 44 } } } } }
  assert.equal(mapValue(index, 'expenses', 2025, 'municipality:0301', 'amount'), 12.5)
  assert.equal(mapValue(index, 'expenses', 2025, 'municipality:0301', 'perCapita'), 44)
  assert.equal(mapValue(index, 'expenses', 2024, 'municipality:0301', 'amount'), null)
})

test('koropletfarge har egen mangler-data-farge og fem lesbare trinn', () => {
  const values = [10, 20, 30, 40, 50]
  assert.equal(choroplethColor(null, values), '#E3DED4')
  assert.notEqual(choroplethColor(10, values), choroplethColor(50, values))
})
