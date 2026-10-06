import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildReport } from '../../scripts/analyser/report.mjs'
import {
  replacementDraft,
  replacementReport,
  assertPublicationTopic,
} from '../../scripts/analyser/replacement.mjs'
import { validateArticle, contentHash } from '../../scripts/analyser/schema.mjs'
import {
  validateDetailSelections,
  evidenceHash,
  observationSuffix,
} from '../../scripts/analyser/event-evidence.mjs'
import { seriesGraph } from '../src/analyser/chart-plan.js'
import { deliverScheduled } from '../../scripts/analyser/handoff.mjs'
const root = new URL('../../', import.meta.url).pathname
const published = JSON.parse(readFileSync(join(root, 'web/src/analyser/publications.json')))
// Use the original immutable article, including in the publication job's staged registry.
const source = published.find((a) => a.slug === 'utgifter-per-innbygger-u-01-2020-2025-2026-10-05')
const details = [
  { id: 'ukraina', nodeIds: ['u-01-0159-73'] },
  { id: 'driftud', nodeIds: ['u-01-0100-01'] },
  { id: 'driftbistand', nodeIds: ['u-01-0140-01'] },
  { id: 'driftsamlet', nodeIds: ['u-01-0100-01', 'u-01-0140-01'] },
  { id: 'utenrikstotal', nodeIds: ['u-01'] },
]
const make = () =>
  replacementDraft(source, '2026-10-06T09:00:00Z', {
    detailSelections: details,
    dataDir: join(root, 'web/public/data'),
  })
const graph = { kind: 'series', mode: 'values', series: [{ source: 'post', id: 'ukraina' }] }

test('post detail expansion preserves frozen annual totals, primary facts and original approval', () => {
  const before = JSON.stringify(source),
    a = make()
  validateArticle(a)
  assert.deepEqual(a.report.rows, source.report.rows)
  for (const [key, fact] of Object.entries(source.report.facts))
    assert.deepEqual(a.report.facts[key], fact)
  assert.equal(a.report.eventEvidence.version, 2)
  assert.equal(a.report.facts.driftudGrowthLastYear.text, '77,5 %')
  assert.equal(a.report.facts.driftsamletGrowthLastYear.text, '4,7 %')
  assert.equal(a.report.facts.utenrikstotalPeakYear.value, 2023)
  assert.equal(a.report.facts.utenrikstotalLastAmount.value, 58169.5)
  assert.equal(a.report.facts.ukrainaFirstRecordedAmount.value, 3995)
  assert.equal(a.report.facts.ukrainaLastAmount.value, 12153.9)
  assert.ok(a.report.detailSource.dataHash)
  assert.equal(a.approval, undefined)
  assert.notEqual(contentHash(a), contentHash(source))
  assert.equal(JSON.stringify(source), before)
  validateArticle(source, { published: true })
  assert.throws(() => validateArticle(a, { published: true }), /godkjenning/)
  // The original can already be superseded in a staged publication registry.
  assertPublicationTopic(a, [source])
  const bad = structuredClone(a)
  bad.report.rows[0].expenditure += 1
  assert.throws(() => assertPublicationTopic(bad, [source]), /hovedgrunnlaget/)
  const changedFact = make()
  changedFact.report.facts.nominalGrowth.value++
  assert.equal(JSON.stringify(source), before)
  assert.throws(() => assertPublicationTopic(changedFact, [source]), /hovedgrunnlaget/)
})

test('missing post observations are not fabricated as zero in facts or graphs', () => {
  const a = make()
  assert.equal(a.report.facts.ukrainaAmountA, undefined)
  assert.equal(a.report.facts.driftbistandLastAmount, undefined)
  assert.equal(a.report.facts.driftbistandContributionAmount, undefined)
  const data = seriesGraph(graph, a.report)
  assert.deepEqual(data.years, [2022, 2023, 2024, 2025])
  assert.deepEqual(data.series[0].values, [3995, 8727.9, 9698.2, 12153.9])
  const combined = seriesGraph(
    { ...graph, series: [{ source: 'post', id: 'driftsamlet' }] },
    a.report,
  )
  assert.equal(combined.series[0].values.at(-1), 4862.6)
  assert.equal(
    a.report.eventEvidence.items.find((i) => i.id === 'driftbistand').rows.at(-1).reported,
    false,
  )
  assert.equal(observationSuffix(26), 'AA')
})

test('post selection rejects duplicates, double-counted parents, excluded finance and another department', () => {
  for (const selections of [
    [{ id: 'one', nodeIds: ['u-01-0100', 'u-01-0100-01'] }],
    [{ id: 'one', nodeIds: ['u-01-0100-01', 'u-01-0100-01'] }],
    [{ id: 'one', nodeIds: ['u-01-0100-01'], values: [999] }],
    [
      { id: 'one', nodeIds: ['u-01-0100-01'] },
      { id: 'one', nodeIds: ['u-01-0179-21'] },
    ],
  ])
    assert.throws(() => validateDetailSelections(selections), /Ugyldig/)
  for (const id of ['u-17-1700-79', 'u-01-0100-90', 'u-01-9999-99'])
    assert.throws(
      () =>
        buildReport(join(root, 'web/public/data'), {
          departmentId: 'u-01',
          start: 2020,
          end: 2025,
          detailSelections: [{ id: 'one', nodeIds: [id] }],
        }),
      /avgrensning/,
    )
  const a = make()
  a.report.eventEvidence.items[0].rows.at(-1).expenditure++
  assert.throws(() => validateArticle(a), /hendelsesgrunnlag/)
  const b = make()
  b.report.detailSelections[0].nodeIds = ['u-01-0100-01']
  assert.throws(() => validateArticle(b), /samsvarer ikke/)
})

test('an updated total cannot be smuggled into a post-only replacement', () => {
  const dir = mkdtempSync(join(tmpdir(), 'post-immutability-'))
  try {
    for (const name of ['meta', 'utgifter', 'befolkning', 'kpi'])
      copyFileSync(join(root, `web/public/data/${name}.json`), join(dir, name + '.json'))
    const nodes = JSON.parse(readFileSync(join(dir, 'utgifter.json')))
    const department = nodes.find((n) => n.id === 'u-01')
    const post = department.children
      .find((n) => n.id === 'u-01-0159')
      .children.find((n) => n.id === 'u-01-0159-73')
    post.serier['2025'].regnskap++
    writeFileSync(join(dir, 'utgifter.json'), JSON.stringify(nodes))
    assert.throws(
      () => replacementReport(source, { detailSelections: details }, { dataDir: dir }),
      /Hovedserien har endret/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function deliveryFixture({ existingArticle = null } = {}) {
  const article = make(),
    writes = [],
    calls = []
  const existing = existingArticle
    ? {
        number: 27,
        state: 'open',
        head: {
          ref: 'analysis/weekly-existing',
          sha: 'c'.repeat(40),
          repo: { full_name: 'owner/repo' },
        },
        base: { ref: 'main' },
        requested_reviewers: [{ login: 'reviewer' }],
      }
    : null
  const path = 'editorial/drafts/existing.json'
  const g = {
    root: '/repos/owner/repo',
    repository: 'owner/repo',
    permission: async () => true,
    content: async (file, ref) => ({
      value:
        file === 'input.json'
          ? { mode: 'replacement', article }
          : file === 'web/src/analyser/publications.json'
            ? [source]
            : existingArticle,
    }),
    pages: async (route) =>
      route.startsWith('/pulls?')
        ? existing
          ? [existing]
          : []
        : route.endsWith('/files')
          ? [{ filename: path, status: 'added' }]
          : [],
    api: async (route, options = {}) => {
      calls.push({ route, ...options })
      if (route.endsWith('/pulls/27')) return existing
      if (route.endsWith('/git/ref/heads/main')) return { object: { sha: 'b'.repeat(40) } }
      if (route.includes('/git/ref/heads/analysis/')) return null
      if (route.endsWith('/pulls') && options.method === 'POST') return { number: 28 }
      return {}
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
      dataDir: join(root, 'web/public/data'),
      now: () => '2026-10-06T09:00:00Z',
      input: {
        mode: 'weekly',
        sourceCommit: 'a'.repeat(40),
        sourcePath: 'editorial/handoff/weekly.json',
      },
    })
  // Match the controlled source path without exposing other content to the test packet.
  const content = g.content
  g.content = async (file, ref) =>
    file === 'editorial/handoff/weekly.json' ? content('input.json', ref) : content(file, ref)
  return { article, g, run, writes, calls }
}

test('an explicit foreign replacement can coexist with a state review, but never duplicates the same source', async () => {
  const state = published.findLast((a) => a.report.scopeId === 'state')
  const stateDraft = replacementDraft(state, '2026-10-06T09:00:00Z')
  const f = deliveryFixture({ existingArticle: stateDraft })
  await f.run()
  assert.equal(f.writes.length, 1)
  const delivered = Object.values(f.writes[0][2])[0]
  assert.deepEqual(delivered.report, f.article.report)
  assert.deepEqual(delivered.replaces.detailSelections, details)
  assert.equal(delivered.status, 'draft')
  assert.equal(delivered.approval, undefined)
  assert.equal(f.writes[0][0].startsWith('analysis/weekly-'), true)
  assert.ok(f.calls.some((c) => c.route.endsWith('/pulls/28/requested_reviewers')))
  const same = deliveryFixture({ existingArticle: make() })
  await same.run()
  assert.equal(same.writes.length, 0)
  assert.equal(
    same.calls.some((c) => c.method === 'POST'),
    false,
  )
})

test('handoff rejects altered post facts before bot writes or requests approval', async () => {
  const f = deliveryFixture()
  const content = f.g.content
  f.g.content = async (file, ref) => {
    const result = await content(file, ref)
    if (file === 'editorial/handoff/weekly.json') {
      result.value = structuredClone(result.value)
      const item = result.value.article.report.eventEvidence.items.find((i) => i.id === 'ukraina')
      item.rows.at(-1).expenditure += 100
      result.value.article.report.eventEvidence.hash = evidenceHash(
        result.value.article.report.eventEvidence.items,
      )
    }
    return result
  }
  await assert.rejects(f.run(), /Fakta samsvarer/)
  assert.equal(f.writes.length, 0)
})
