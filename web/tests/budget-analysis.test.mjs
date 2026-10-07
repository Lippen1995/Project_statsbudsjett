import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, copyFileSync } from 'node:fs'
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
import { seriesGraph } from '../src/analyser/chart-plan.js'
import { deliverScheduled } from '../../scripts/analyser/handoff.mjs'
import { replacementDraft } from '../../scripts/analyser/replacement.mjs'
import { contentHash } from '../../scripts/analyser/schema.mjs'
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
test('explicit revised baseline uses revised amounts, never falls back, and is hash-bound', () => {
  const f = fixture()
  try {
    const tree = JSON.parse(readFileSync(`${f.dir}/utgifter.json`))
    tree[0].children[0].children[0].serier[2026].revidert = 12
    f.put('utgifter.json', tree)
    const r = nextBudgetReport(f.dir, [], {
      baselineSeries: 'revidert', eligible: (r) => r.comparison === 'previous-budget-to-proposal',
    })
    validateBudgetReport(r)
    assert.equal(r.beforeLabel, 'Revidert budsjett 2026')
    assert.equal(r.facts.beforeTotal.value, 12)
    assert.equal(r.facts.absoluteChange.value, 3)
    assert.equal(r.facts.departmentAChange.value, 3)
    assert.equal(r.factsVersion, 2)
    const tampered = structuredClone(r)
    delete tampered.baselineSeries
    assert.throws(() => validateBudgetReport(tampered), /avgrensning/)
    delete tree[0].children[0].children[0].serier[2026].revidert
    f.put('utgifter.json', tree)
    assert.equal(nextBudgetReport(f.dir, [], {
      baselineSeries: 'revidert', eligible: (r) => r.comparison === 'previous-budget-to-proposal',
    }), null)
    assert.equal(nextBudgetReport(f.dir, [], {
      eligible: (r) => r.comparison === 'previous-budget-to-proposal',
    }).facts.beforeTotal.value, 10)
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})
test('budget document quotes and source text are verified and included in report hash', () => {
  const f = fixture()
  try {
    const tree = JSON.parse(readFileSync(`${f.dir}/utgifter.json`))
    tree[0].children[0].children[0].serier[2026].revidert = 12
    f.put('utgifter.json', tree)
    const text = 'Dette er et kildeutdrag om finansieringen av sykehusene.'
    const sha256 = createHash('sha256').update(text).digest('hex')
    mkdirSync(`${f.dir}/budget-research/2027`, { recursive: true })
    writeFileSync(`${f.dir}/budget-research/2027/${sha256}.txt`, text)
    f.put('budget-research/2027/index.json', { version: 1, year: 2027, documents: [{
      path: `${sha256}.txt`, sha256, text: undefined, quote: text,
      url: 'https://www.regjeringen.no/no/dokumenter/sykehus/', name: 'Helseproposisjonen',
      retrievedAt: '2026-10-07T08:00:00Z',
    }] })
    const r = nextBudgetReport(f.dir, [], {
      baselineSeries: 'revidert', eligible: (r) => r.comparison === 'previous-budget-to-proposal',
    })
    validateBudgetReport(r)
    assert.equal(r.facts.documentAQuote.text, text)
    r.budgetDocuments[0].text += ' Endret.'
    assert.throws(() => validateBudgetReport(r), /kontrolleres/)
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})
test('budget reports with actual archived SSB series validate their combined hash and support historical charts', () => {
  const f = fixture()
  try {
    const e = JSON.parse(
      readFileSync(new URL('../public/data/ssb-research/index.json', import.meta.url)),
    ).extracts[0]
    f.put('ssb-research/index.json', { version: 1, extracts: [{ ...e, scope: 'budget:2027' }] })
    copyFileSync(new URL('../public/data/' + e.path, import.meta.url), f.dir + '/' + e.path)
    const r = nextBudgetReport(f.dir, [])
    validateBudgetReport(r)
    const data = seriesGraph(
      { kind: 'series', mode: 'values', series: [{ source: 'ssb', id: e.id }] },
      r,
    )
    assert.equal(data.years.at(-1), 2025)
    assert.equal(r.year, 2027)
    r.ssbEvidence[0].rows[0].value += 1
    assert.throws(() => validateBudgetReport(r), /samsvarer/)
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
})
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

test('verified party priorities preserve original context, freeze citations and reject source tampering', () => {
  const f = fixture()
  try {
    const before = nextBudgetReport(f.dir, [])
    const quote = 'Fjerne formuesskatten på arbeidende kapital for å styrke norsk eierskap.'
    const text = 'Partiprogram 2025–2029. ' + quote
    const hash = (value) => createHash('sha256').update(value).digest('hex')
    const sourceHash = hash(text),
      rawHash = hash(text)
    const documentPath = `party-research/documents/${sourceHash}.json`,
      rawPath = `party-research/raw/${rawHash}.html`
    f.put(documentPath, { url: 'https://hoyre.no/politikk/partiprogram/', text })
    mkdirSync(`${f.dir}/party-research/raw`, { recursive: true })
    writeFileSync(`${f.dir}/${rawPath}`, text)
    const priorities = [
      {
        id: 'formuesskatt',
        party: 'H',
        kind: 'programme',
        period: [2025, 2029],
        quote,
        url: 'https://hoyre.no/politikk/partiprogram/',
        sourceDate: null,
        referenceYear: null,
        recordKeys: ['0100-01'],
        sourceHash,
        rawHash,
        documentPath,
        rawPath,
        retrievedAt: '2026-10-06T10:00:00Z',
      },
    ]
    const path = 'party-research/2027/initial/' + hash('snapshot') + '.json'
    const digest = f.put(path, priorities)
    f.put('party-research/index.json', {
      version: 1,
      snapshots: [{ year: 2027, phase: 'initial', path, hash: digest }],
    })
    const report = nextBudgetReport(f.dir, [])
    validateBudgetReport(before)
    validateBudgetReport(report)
    assert.notEqual(report.dataHash, before.dataHash)
    assert.deepEqual(report.rows, before.rows)
    assert.equal(report.facts.priorityAQuote.text, quote)
    assert.equal(report.facts.priorityAPeriod.text, '2025–2029')
    assert.equal(report.partyPriorities[0].sourceDate, null)
    assert.ok(report.sources.some((s) => s.url === priorities[0].url))
    const article = {
      report,
      copy: { title: 'Budsjett', lead: 'Innledning', conclusion: 'Vurdering',
        linkedin: 'Innlegg', sections: [] },
      slug: 'test', createdAt: '2026-10-06',
    }
    const review = renderReview(article)
    assert.ok(review.includes('## Kontrollerte partiprioriteringer'))
    assert.ok(review.includes('H · Partiprogram · programperiode 2025–2029 · poster 0100-01'))
    assert.ok(review.includes(quote))
    assert.ok(review.includes('publiseringsdato ikke bekreftet'))
    assert.notEqual(contentHash(article), contentHash({ ...article, report: before }))
    const changed = structuredClone(report)
    changed.partyPriorities[0].quote = 'En endret lovnad om formuesskatt og norske arbeidsplasser.'
    assert.throws(() => validateBudgetReport(changed), /fakta|datagrunnlag/i)
    f.put(documentPath, { url: priorities[0].url, text: 'En helt annen tekst' })
    assert.throws(() => nextBudgetReport(f.dir, []), /Partikilden/)
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
})

test('revised-baseline handoff rebuilds the same report and coexists with an older state review without duplicates', async () => {
  const f = fixture()
  try {
    const tree = JSON.parse(readFileSync(`${f.dir}/utgifter.json`))
    tree[0].children[0].children[0].serier[2026].revidert = 12
    f.put('utgifter.json', tree)
    const report = nextBudgetReport(f.dir, [], {
      baselineSeries: 'revidert',
      eligible: (r) => r.comparison === 'previous-budget-to-proposal',
    })
    const state = JSON.parse(
      readFileSync(new URL('../src/analyser/publications.json', import.meta.url)),
    ).findLast((a) => a.report.scopeId === 'state')
    let existing = replacementDraft(state, '2026-10-07T09:00:00Z')
    const copy = {
      title: 'Budsjettforslagets prioriteringer',
      description: 'En kontrollert prøve av leveringsflyten.',
      lead: 'Forslaget viser {{fact:afterTotal}}.',
      conclusion: 'Forslaget krever videre vurdering.',
      linkedin: 'Hva innebærer endringen i forslaget?',
      sections: Array.from({ length: 4 }, (_, i) => ({
        heading: ['Bakgrunn', 'Prioriteringer', 'Virkninger', 'Avgrensninger'][i],
        factIds: ['afterTotal'],
        paragraphs: [
          Array(12)
            .fill(
              'Regjeringens forslag må vurderes mot et sammenlignbart grunnlag og konkrete tiltak.',
            )
            .join(' ') + ' Summen er {{fact:afterTotal}}.',
        ],
      })),
    }
    const article = {
      ...articleMetadata(report, '2026-10-07'),
      report,
      copy,
      status: 'draft',
      createdAt: '2026-10-07T09:00:00Z',
    }
    const calls = [],
      writes = []
    const pr = {
      number: 27,
      state: 'open',
      head: {
        ref: 'analysis/weekly-state',
        sha: 'c'.repeat(40),
        repo: { full_name: 'owner/repo' },
      },
      base: { ref: 'main' },
      requested_reviewers: [{ login: 'reviewer' }],
    }
    const g = {
      root: '/repos/owner/repo',
      repository: 'owner/repo',
      permission: async () => true,
      content: async (path) => ({
        value:
          path === 'editorial/handoff/weekly.json'
            ? { mode: 'budget-day', article }
            : path === 'web/src/analyser/publications.json'
              ? []
              : existing,
      }),
      pages: async (path) =>
        path.startsWith('/pulls?')
          ? [pr]
          : path.endsWith('/files')
            ? [{ filename: 'editorial/drafts/existing.json', status: 'added' }]
            : [],
      api: async (path, options = {}) => {
        calls.push({ path, ...options })
        return path.endsWith('/pulls/27')
          ? pr
          : path.endsWith('/git/ref/heads/main')
            ? { object: { sha: 'b'.repeat(40) } }
            : path.includes('/git/ref/heads/analysis/')
              ? null
              : path.endsWith('/pulls')
                ? { number: 29 }
                : {}
      },
      commit: async (...args) => {
        writes.push(args)
        return 'd'.repeat(40)
      },
    }
    const run = () =>
      deliverScheduled({
        g,
        actor: 'agent',
        reviewer: 'reviewer',
        dataDir: f.dir,
        now: () => article.createdAt,
        input: {
          mode: 'weekly',
          sourceCommit: 'a'.repeat(40),
          sourcePath: 'editorial/handoff/weekly.json',
        },
      })
    await run()
    assert.equal(writes.length, 1)
    const delivered = Object.values(writes[0][2])[0]
    assert.deepEqual(delivered.report, report)
    assert.equal(delivered.approval, undefined)
    assert.ok(calls.some((c) => c.path.endsWith('/pulls/29/requested_reviewers')))
    existing = delivered
    writes.length = 0
    calls.length = 0
    await run()
    assert.equal(writes.length, 0)
    assert.equal(
      calls.some((c) => c.method === 'POST'),
      false,
    )
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
})

test('negotiation focus is distinct, source-bound and cannot turn outcome analysis into a second proposal', () => {
  const f = fixture()
  const digest = (text) => createHash('sha256').update(text).digest('hex')
  try {
    const evidence = JSON.parse(readFileSync(new URL('../public/data/negotiation-research/2027.json', import.meta.url)))
    f.put('negotiation-research/2027.json', evidence)
    const priorities = [
      { id: 'spnorgespris', party: 'Sp', quote: 'Senterpartiet sier klart nei til regjeringens forslag om å øke norgesprisen på strøm fra 40 til 45 øre per kilowattime.', url: 'https://www.senterpartiet.no/aktuelt/norgespris' },
      { id: 'venstreskatt', party: 'V', quote: 'Venstre vil gi minst 5 000 kroner mer enn regjeringen foreslår til alle som jobber', url: 'https://www.venstre.no/artikkel/skatt' },
    ].map((p) => {
      const sourceHash = digest(p.quote), raw = JSON.stringify({ text: p.quote }), rawHash = digest(raw)
      const documentPath = `party-research/documents/${sourceHash}.json`, rawPath = `party-research/raw/${rawHash}.html`
      f.put(documentPath, { url: p.url, text: p.quote })
      mkdirSync(`${f.dir}/party-research/raw`, { recursive: true })
      writeFileSync(`${f.dir}/${rawPath}`, raw)
      return { ...p, kind: 'stated-priority', sourceHash, rawHash, documentPath, rawPath, recordKeys: [], retrievedAt: '2026-10-07T10:00:00Z' }
    })
    const raw = JSON.stringify(priorities), path = `party-research/2027/initial/${digest(raw)}.json`
    f.put(path, priorities)
    f.put('party-research/index.json', { version: 1, snapshots: [{ year: 2027, phase: 'initial', hash: digest(raw), path }] })
    const ordinary = nextBudgetReport(f.dir, [], { eligible: (r) => r.comparison === 'previous-budget-to-proposal' })
    const options = { question: 'budget-negotiations' }
    const political = nextBudgetReport(f.dir, [{ report: ordinary }], options)
    assert.equal(political.comparison, 'previous-budget-to-proposal')
    assert.equal(political.question, 'budget-negotiations')
    assert.notEqual(political.dataHash, ordinary.dataHash)
    assert.equal(political.facts.mandateLeft.value, 88)
    assert.equal(political.facts.birthReduction.value, 25548)
    assert.equal(political.facts.taxNet.value, 1)
    validateBudgetReport(political)
    assert.equal(nextBudgetReport(f.dir, [{ report: political }], options), null)
    assert.throws(() => nextBudgetReport(f.dir, [], { question: 'renamed-budget' }), /Ukjent/)
    const tampered = structuredClone(political)
    tampered.negotiationEvidence.parliament.raw += ' '
    assert.throws(() => validateBudgetReport(tampered), /original|datagrunnlag/)
    const changed = structuredClone(political)
    changed.facts.mandateLeft.value++
    assert.throws(() => validateBudgetReport(changed), /fakta/)
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})
