import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildOilReport, validateOilReport } from '../../scripts/analyser/oil-report.mjs'
import { buildUkraineEvidence } from '../../scripts/analyser/ukraine-evidence.mjs'
const root = new URL('../public/data', import.meta.url).pathname
const sha = (s) => createHash('sha256').update(s).digest('hex')
test('Nansen programme history separates frames from selected cash and revised posts', () => {
  const r = validateOilReport(buildOilReport(root, 2027))
  assert.deepEqual(r.ukraineEvidence.programmeRows.map(({ total, military, civil }) => [total, military, civil]), [[84.9, 72.5, 12.4], [85, 70, 15], [85, null, null]])
  assert.equal(r.facts.ukraineAnnualFrameChange.value, 0)
  assert.equal(r.facts.ukraineMilitaryCashStart.text, '41,2 mrd. kr')
  assert.equal(r.facts.ukraineMilitaryBudgetPrevious.text, '67,2 mrd. kr')
  assert.equal(r.ukraineEvidence.postRows.length, 9)
  assert.equal(r.ukraineEvidence.postRows.filter((p) => p.category === 'capital').length, 4)
  assert.ok(r.ukraineEvidence.postRows.every((p) => !/Fredssenter|garanti|flyktning/i.test(p.name)))
  assert.deepEqual(r.ukraineEvidence.rnbReconciliation.map((r) => r.proposedMillion), [48462.2, 18776.6, 14382.6])
})
test('RNB validates transfers without treating both sides as new spending', () => {
  const e = buildUkraineEvidence(root, 2027, 85)
  assert.equal(e.militaryReallocationMillion, 19387.7)
  const net = e.rnbReconciliation.slice(0, 2).reduce((n, p) => n + p.changeMillion, 0)
  assert.ok(Math.abs(net - 32.8) < 1e-8)
  assert.ok(e.notes.some((s) => s.includes('kontantutbetalinger')))
  assert.ok(e.notes.some((s) => s.includes('finansposter')))
})
test('unknown programme source, changed original and mismatched macro total fail closed', () => {
  assert.throws(() => buildUkraineEvidence(root, 2027, 86), /avstemmes/)
  const dir = mkdtempSync(join(tmpdir(), 'ukraine-source-'))
  try {
    cpSync(`${root}/oil-funds`, `${dir}/oil-funds`, { recursive: true })
    const path = `${dir}/oil-funds/ukraine/2026-programme.html`
    writeFileSync(path, readFileSync(path, 'utf8') + 'changed')
    assert.throws(() => buildUkraineEvidence(dir, 2027, 85), /originalkilden/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('even rehashed post snapshot cannot insert unrelated rows or change their category', () => {
  for (const change of [(p) => { p.rows[0].category = 'military' }, (p) => { p.rows[0].id = 'u-02-0255-73' }, (p) => { p.rows.find((r) => r.year === 2026).baselineMillion = 1 }]) {
    const dir = mkdtempSync(join(tmpdir(), 'ukraine-post-'))
    try {
      cpSync(`${root}/oil-funds`, `${dir}/oil-funds`, { recursive: true })
      const path = `${dir}/oil-funds/ukraine/posts.json`, posts = JSON.parse(readFileSync(path))
      change(posts)
      const raw = JSON.stringify(posts)
      writeFileSync(path, raw)
      const mp = `${dir}/oil-funds/ukraine/sources.json`, m = JSON.parse(readFileSync(mp))
      m.postsSha256 = sha(raw); writeFileSync(mp, JSON.stringify(m))
      assert.throws(() => buildUkraineEvidence(dir, 2027, 85), /Ukraina-post|RNB/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
})
