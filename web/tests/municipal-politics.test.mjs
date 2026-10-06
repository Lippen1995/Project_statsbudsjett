import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const politics = JSON.parse(readFileSync(new URL('../src/kostra/municipal-politics.json', import.meta.url)))
const index = JSON.parse(readFileSync(new URL('../public/data/kostra/index.json', import.meta.url)))

test('politisk ledelse knyttes til en ekte kommune, med dato og egne kilder for ordfører og samarbeid', () => {
  const active = index.entities.filter((item) => item.kind === 'municipality' && item.active !== false)
  assert.deepEqual(Object.keys(politics.municipalities).sort(), active.map((item) => item.code).sort())
  assert.equal(politics.municipalityCount, active.length)
  for (const [code, record] of Object.entries(politics.municipalities)) {
    const entity = index.entities.find((item) => item.id === `municipality:${code}`)
    assert.equal(entity?.name, record.name)
    assert.match(record.sourceFetchedAt, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(Number.isFinite(Date.parse(record.sourceFetchedAt)))
    assert.ok(record.mayor.name && record.mayor.party)
    assert.equal(new URL(record.mayor.source).protocol, 'https:')
    assert.ok(record.government.label && record.government.note)
    assert.equal(new Set(record.government.parties).size, record.government.parties.length)
    assert.ok(record.government.sources.length > 0)
    for (const source of record.government.sources) {
      assert.ok(source.label)
      assert.equal(new URL(source.url).protocol, 'https:')
    }
  }
})

test('valgoppgjør har unike partier og mandater som summerer til hele kommunestyret', () => {
  for (const record of Object.values(politics.municipalities)) {
    if (!record.election) continue
    const { year, totalSeats, source, results } = record.election
    assert.ok(Number.isInteger(year) && year <= Number(record.sourceFetchedAt.slice(0, 4)))
    assert.equal(new URL(source).protocol, 'https:')
    assert.equal(new Set(results.map((row) => row.party)).size, results.length)
    assert.ok(results.every((row) => row.party && Number.isInteger(row.seats) && row.seats > 0))
    assert.equal(results.reduce((sum, row) => sum + row.seats, 0), totalSeats)
  }
})

test('byråd skilles fra støttepartier og Stavanger hevdes ikke å ha en fast koalisjon', () => {
  const records = politics.municipalities
  assert.equal(records['4601'].mayor.name, 'Marit Warncke')
  assert.equal(records['4601'].executive.name, 'Chris Jørgen Knudsen Rødland')
  assert.deepEqual(records['4601'].government.parties, ['Høyre', 'Fremskrittspartiet', 'Senterpartiet'])
  assert.equal(records['1103'].government.kind, 'case-cooperation')
  assert.deepEqual(records['5001'].government.parties, ['Høyre', 'Venstre', 'Miljøpartiet De Grønne'])
  for (const record of Object.values(records)) {
    assert.ok(['source-reported', 'cabinet', 'case-cooperation', 'coalition'].includes(record.government.kind))
    if (record.government.kind !== 'source-reported') assert.match(record.verifiedAt, /^\d{4}-\d{2}-\d{2}$/)
  }
})
