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
