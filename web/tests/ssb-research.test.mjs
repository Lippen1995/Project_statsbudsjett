import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { validateArticle } from '../../scripts/analyser/schema.mjs'
import { ssbEvidenceFacts, attachSsbEvidence } from '../../scripts/analyser/ssb-research.mjs'
const evidence = {
  id: 'Eldre',
  table: '07459',
  hash: 'a'.repeat(64),
  retrievedAt: '2026-10-05T12:00:00Z',
  unit: 'personer',
  title: 'Folkemengde',
  purpose: 'Undersøk demografi',
  selections: {},
  categories: {},
  rows: [
    { year: 2024, value: 100 },
    { year: 2025, value: 110 },
  ],
}
test('SSB computes absolute and percentage changes and handles zero base', () => {
  assert.equal(ssbEvidenceFacts([evidence]).ssbEldreGrowth.value, 10.000000000000009)
  assert.equal(ssbEvidenceFacts([evidence]).ssbEldreChange.value, 10)
  assert.equal(
    ssbEvidenceFacts([
      {
        ...evidence,
        rows: [
          { year: 2024, value: 0 },
          { year: 2025, value: 10 },
        ],
      },
    ]).ssbEldreGrowth,
    undefined,
  )
  assert.throws(() =>
    ssbEvidenceFacts([
      {
        ...evidence,
        rows: [
          { year: 2024, value: null },
          { year: 2025, value: 1 },
        ],
      },
    ]),
  )
})
test('SSB archive hashes, scopes and controlled paths are enforced', () => {
  const dir = mkdtempSync(`${tmpdir()}/ssb-context-`)
  try {
    mkdirSync(`${dir}/ssb-research`)
    const snapshot = {
      version: 1,
      table: evidence.table,
      url: 'https://www.ssb.no/statbank/table/07459/',
      title: evidence.title,
      retrievedAt: evidence.retrievedAt,
      selections: {},
      series: { unit: evidence.unit, rows: evidence.rows, categories: {} },
    }
    const raw = JSON.stringify(snapshot),
      hash = createHash('sha256').update(raw).digest('hex')
    writeFileSync(`${dir}/ssb-research/${hash}.json`, raw)
    const entry = {
      id: 'Eldre',
      scope: 'state',
      purpose: evidence.purpose,
      hash,
      path: `ssb-research/${hash}.json`,
    }
    writeFileSync(
      `${dir}/ssb-research/index.json`,
      JSON.stringify({ version: 1, extracts: [entry] }),
    )
    const report = {
      scopeId: 'state',
      kind: 'real-expenditure-per-capita',
      dataHash: 'b'.repeat(64),
      facts: {},
      sources: [],
      methodology: [],
      limitations: [],
    }
    const enriched = attachSsbEvidence(dir, report)
    assert.equal(enriched.facts.ssbEldreEnd.value, 110)
    assert.notEqual(enriched.dataHash, report.dataHash)
    assert.equal(enriched.sources[1].local, `/data/ssb-research/${hash}.json`)
    assert.equal(attachSsbEvidence(dir, { ...report, scopeId: 'u-01' }).ssbEvidence, undefined)
    writeFileSync(`${dir}/ssb-research/${hash}.json`, raw + ' ')
    assert.throws(() => attachSsbEvidence(dir, report), /hash/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('SSB facts are checked by the article schema and cannot be rewritten independently', () => {
  const article = JSON.parse(
    readFileSync(new URL('../../editorial/drafts/pilot.json', import.meta.url)),
  )
  article.report.ssbEvidence = [evidence]
  Object.assign(article.report.facts, ssbEvidenceFacts([evidence]))
  assert.doesNotThrow(() => validateArticle(article))
  article.report.facts.ssbEldreEnd.value = 111
  assert.throws(() => validateArticle(article), /Fakta/)
})
