import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { buildReport } from '../analyser/report.mjs'

const dataDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url))

test('henter faktiske KOSTRA-verdier og beholder manglende år', async () => {
  const sources = await resolveSvenSources('Netto driftsutgifter for Stavanger og Sandnes i 2025 og 2026', dataDir)
  assert.equal(sources.length, 2)
  const stavanger = sources.find(source => source.id === 'kostra-net-expenses-1103')
  assert.match(stavanger.url, /\/12137\/$/)
  assert.deepEqual(JSON.parse(stavanger.text).data, [
    { year: 2025, netExpenditureThousandNok: 12271422, netExpenditureNokPerCapita: 80909 },
    { year: 2026, netExpenditureThousandNok: null, netExpenditureNokPerCapita: null },
  ])
})

test('statsoppslag bruker samme data og avgrensning som den redaksjonelle rapporten', async () => {
  const [source] = await resolveSvenSources('Hvor mye brukte staten i 2024 og 2025 ifølge statsregnskapet?', dataDir)
  const report = buildReport(dataDir, { start: 2024, end: 2025 })
  assert.equal(source.snapshotHash, report.dataHash)
  assert.deepEqual(JSON.parse(source.text).data, report.rows)
  await assert.rejects(resolveSvenSources('statsregnskapet i 2099', dataDir), /dekker|automatisk oppslag/i)
})

test('gir feil ved spørsmål uten støttet kildegrunnlag', async () => {
  await assert.rejects(resolveSvenSources('Hvor mye kostet den nye kraftlinjen?', dataDir), /Legg ved kilder/)
  await assert.rejects(resolveSvenSources('Hva var netto driftsutgifter i kommunen?', dataDir), /Oppgi kommunenavn/)
})

test('kommuneoppslag gir separate kilder for hvert etterspurt nøkkeltall', async () => {
  const sources = await resolveSvenSources('Netto lånegjeld og investeringsutgifter i Stavanger i 2025', dataDir)
  assert.deepEqual(sources.map(s => s.id), ['kostra-debt-1103', 'kostra-investments-1103'])
  assert.deepEqual(sources.map(s => JSON.parse(s.text).data[0].amountNokPerCapita), [79012, 13136])
})

test('oljepengeoppslag skiller mellom budsjettfaser og beholder primærkilden', async () => {
  const sources = await resolveSvenSources('Hva var oljepengebruken i 2026 og 2027?', dataDir)
  const rows = sources.flatMap(s => JSON.parse(s.text).data)
  assert.deepEqual(rows.filter(r => r.year === 2026).map(r => r.phase).sort(), ['forslag', 'revidert', 'saldert'])
  const proposal = sources.find(s => JSON.parse(s.text).data.some(r => r.year === 2027))
  assert.match(proposal.url, /^https:\/\/www\.regjeringen\.no\//)
  assert.equal(rows.find(r => r.year === 2027).structuralMillionNok, 608430)
})
