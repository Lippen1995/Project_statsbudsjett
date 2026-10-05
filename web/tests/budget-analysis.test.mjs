import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  nextBudgetReport,
  compareBudgetRecords,
  validateBudgetReport,
  budgetFacts,
} from '../../scripts/analyser/budget-report.mjs'
import { kompaktData, verdi } from '../src/fellestall/kompakt.js'
import { articleMetadata } from '../../scripts/analyser/article-metadata.mjs'
import { renderReview } from '../../scripts/analyser/render-review.mjs'
const record = (key, amount, department = '01') => ({
  key,
  chapter: key.split('-')[0],
  post: key.split('-')[1],
  department,
  departmentName: 'Departement',
  chapterName: 'Kapittel',
  postName: 'Post',
  amount,
})
function fixture() {
  const dir = mkdtempSync(`${tmpdir()}/budget-analysis-`)
  const put = (path, v) => {
    mkdirSync(`${dir}/${path.split('/').slice(0, -1).join('/')}`, { recursive: true })
    const raw = JSON.stringify(v)
    writeFileSync(`${dir}/${path}`, raw)
    return createHash('sha256').update(raw).digest('hex')
  }
  const proposal = {
    source: {
      url: 'https://www.regjeringen.no/2027.xlsx',
      page: 'https://www.regjeringen.no/no/statsbudsjett/2027/',
    },
    records: [record('0100-01', 15), record('0100-90', 1000)],
  }
  const outcome = {
    source: { dataUpdated: '2026-12-20T10:00:00Z' },
    records: [record('0100-01', 18, '02'), record('0101-01', 2), record('0100-90', 2000)],
  }
  const p = put('budsjettarkiv/proposal.json', proposal),
    o = put('budsjettarkiv/outcome.json', outcome)
  put('budsjettarkiv/index.json', {
    proposals: [
      {
        year: 2027,
        phase: 'initial',
        hash: p,
        path: 'budsjettarkiv/proposal.json',
        importedAt: '2026-10-07T10:00:00Z',
        outcome: { hash: o, path: 'budsjettarkiv/outcome.json' },
      },
    ],
  })
  put('meta.json', { oppdatert: '2026-12-20T10:00:00Z' })
  put('utgifter.json', [
    {
      id: 'u-01',
      navn: 'Departement',
      children: [
        {
          id: 'u-01-0100',
          navn: 'Kapittel',
          children: [{ id: 'u-01-0100-01', navn: 'Post', serier: { 2026: { saldert: 10 } } }],
        },
      ],
    },
  ])
  return { dir, put }
}
test('proposal to adoption follows chapter/post across ministries and excludes financing', () => {
  const f = fixture()
  try {
    const r = nextBudgetReport(f.dir, [])
    validateBudgetReport(r)
    assert.equal(r.comparison, 'proposal-to-adopted-budget')
    assert.equal(r.facts.beforeTotal.value, 15)
    assert.equal(r.facts.afterTotal.value, 20)
    assert.equal(r.rows.find((r) => r.id === '0100-01').change, 3)
    assert.equal(r.rows.find((r) => r.id === '0100-01').previousDepartment, '01')
    assert.equal(r.rows.find((r) => r.id === '0100-01').department, '02')
    assert.equal(articleMetadata(r, '2026-12-20').type, 'Forslag mot vedtak')
    assert.ok(
      !renderReview({
        report: r,
        copy: {
          title: 'Budsjett',
          lead: 'Innledning',
          description: 'Beskrivelse',
          conclusion: 'Vurdering',
          linkedin: 'Innlegg',
          sections: [],
        },
        slug: 'test',
        createdAt: '2026-12-20',
      }).includes('undefined'),
    )
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
})
test('new proposal compares to prior saldert and semantic duplicates are skipped', () => {
  const f = fixture()
  try {
    const adopted = nextBudgetReport(f.dir, [])
    const proposal = nextBudgetReport(f.dir, [{ report: adopted }])
    assert.equal(proposal.comparison, 'previous-budget-to-proposal')
    assert.equal(proposal.start, 2026)
    assert.equal(proposal.facts.beforeTotal.value, 10)
    assert.equal(proposal.facts.afterTotal.value, 15)
    assert.equal(nextBudgetReport(f.dir, [{ report: adopted }, { report: proposal }]), null)
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
})
test('tampered source, computed deltas and facts are rejected', () => {
  const f = fixture()
  try {
    const r = nextBudgetReport(f.dir, [])
    r.rows[0].change += 1
    assert.throws(() => validateBudgetReport(r), /regnestykket/)
    f.put('budsjettarkiv/proposal.json', { records: [record('0100-01', 999)] })
    assert.throws(() => nextBudgetReport(f.dir, []), /kilde er endret/)
    assert.throws(
      () => compareBudgetRecords([record('0100-01', 1), record('0100-01', 2)], []),
      /dupliserte/,
    )
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
})
test('website proposal series remains distinct from adopted data', () => {
  const data = kompaktData({
    meta: {},
    utgifter: [
      {
        id: 'u-01',
        navn: 'Dept',
        niva: 'departement',
        serier: { 2027: { saldert: null, revidert: null, forslag: 15 } },
      },
    ],
    inntekter: [],
  })
  assert.equal(verdi(data.utgifter[0], 2027, 3), 15)
  assert.equal(verdi(data.utgifter[0], 2027, 1), 0)
  assert.equal(verdi(data.utgifter[0], 2027, 2), 0)
})
