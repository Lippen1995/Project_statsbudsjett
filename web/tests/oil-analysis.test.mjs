import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildOilReport, parseOilSource, validateOilReport } from '../../scripts/analyser/oil-report.mjs'
import { topicKey, topicBlocked } from '../src/analyser/topics.js'

const root = new URL('../../web/public/data', import.meta.url).pathname
const html = readFileSync(`${root}/oil-funds/2027.html`, 'utf8')
test('official macro table keeps nominal and fixed prices separate', () => {
  const r = validateOilReport(buildOilReport(root, 2027))
  assert.equal(r.facts.total.value, 608.4)
  assert.equal(r.facts.annualNominalChange.text, '25,0 mrd. kr')
  assert.equal(r.facts.annualRealGrowth.text, '0,8 %')
  assert.equal(r.facts.fundPercent.text, '2,7 %')
  assert.equal(r.incomeShare, null)
  assert.equal(r.rows[0].real, 545.7)
  assert.equal(topicKey(r), 'oil-funds:2027:proposal')
  assert.equal(topicBlocked(r, [{ report: r, createdAt: '2026-10-07T07:00:00Z' }], '2026-10-08T07:00:00Z'), true)
})
test('changed table format, year and amounts fail closed', () => {
  assert.throws(() => parseOilSource(html, 2028), /år|årsavgrensning/)
  assert.throws(() => parseOilSource(html.replace('Strukturelt oljekorrigert budsjettunderskudd, mrd. 2027-kroner', 'Ukjent tabellrad'), 2027), /tabellformat/)
  assert.throws(() => parseOilSource(html.replace('<p>603,5</p>', '<p>ukjent</p>'), 2027), /Ugyldige/)
})
test('frozen report rejects editorial tampering', () => {
  const r = buildOilReport(root, 2027)
  r.facts.total.value = 999
  assert.throws(() => validateOilReport(r), /endret/)
})
test('source archive rejects changed HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oil-analysis-'))
  try {
    mkdirSync(join(dir, 'oil-funds'))
    writeFileSync(join(dir, 'oil-funds/2027.json'), readFileSync(`${root}/oil-funds/2027.json`))
    writeFileSync(join(dir, 'oil-funds/2027.html'), html + 'changed')
    assert.throws(() => buildOilReport(dir, 2027), /kildearkiv/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
