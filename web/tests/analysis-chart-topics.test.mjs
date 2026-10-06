import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runWorkflow } from '../../scripts/analyser/workflow.mjs'
import { topicKey, topicBlocked, currentAnalyses, cooldownEnd } from '../src/analyser/topics.js'
import { graphPlan, seriesGraph } from '../src/analyser/chart-plan.js'
import { validateArticle, contentHash } from '../../scripts/analyser/schema.mjs'
import {
  replacementDraft,
  replacementSource,
  assertPublicationTopic,
} from '../../scripts/analyser/replacement.mjs'
import { nextReport } from '../../scripts/analyser/candidates.mjs'
const published = JSON.parse(
  readFileSync(new URL('../src/analyser/publications.json', import.meta.url)),
)
const source = published.findLast((a) => a.report.scopeId === 'state')
const series = {
  kind: 'series',
  afterSection: 1,
  mode: 'index',
  title: 'Priser, folketall og statens utgifter',
  series: [
    { source: 'fellestall', id: 'expenditure', label: 'Statens utgifter' },
    { source: 'ssb', id: 'Priser', label: 'Konsumpriser' },
    { source: 'ssb', id: 'Befolkning', label: 'Folkemengde' },
  ],
}
const draft = () => replacementDraft(source, '2026-10-06T09:00:00Z')

test('one to seven graphs, frozen SSB and mixed index values, no arbitrary points', () => {
  const a = draft()
  a.copy.graphs = [series]
  validateArticle(a)
  const data = seriesGraph(series, a.report)
  assert.equal(data.years[0], 2014)
  assert.equal(data.years.at(-1), 2025)
  assert.deepEqual(
    data.series.map((s) => s.values[0]),
    [100, 100, 100],
  )
  assert.ok(Math.abs(data.series[1].values.at(-1) - (100 * 100) / 71.1) < 1e-10)
  assert.ok(Math.abs(data.series[2].values.at(-1) - (100 * 5594340) / 5109056) < 1e-10)
  a.copy.graphs = Array.from({ length: 7 }, () => structuredClone(series))
  validateArticle(a)
  a.copy.graphs.push(series)
  assert.throws(() => validateArticle(a), /én til syv/)
  a.copy.graphs = []
  assert.throws(() => validateArticle(a), /én til syv/)
  a.copy.graphs = [{ ...series, values: [999] }]
  assert.throws(() => validateArticle(a), /egne verdier/)
})
test('units, common annual period, missing values and zero bases are enforced', () => {
  const a = draft()
  assert.throws(() => seriesGraph({ ...series, mode: 'values' }, a.report), /Ulike enheter/)
  const single = { ...series, mode: 'values', series: [{ source: 'ssb', id: 'Priser' }] }
  assert.equal(seriesGraph(single, a.report).unit, 'indeks')
  assert.throws(
    () => seriesGraph({ ...single, series: [{ source: 'ssb', id: 'Unknown' }] }, a.report),
    /frosne/,
  )
  a.report.ssbEvidence.find((e) => e.id === 'Priser').rows.shift()
  assert.equal(seriesGraph(series, a.report).baseYear, 2015)
  assert.deepEqual(
    seriesGraph(series, a.report).series.map((s) => s.values[0]),
    [100, 100, 100],
  )
  a.report.ssbEvidence.find((e) => e.id === 'Priser').rows[0].value = 0
  assert.throws(() => seriesGraph(series, a.report), /positiv/)
  const b = draft()
  b.report.ssbEvidence.find((e) => e.id === 'Priser').rows.splice(4, 1)
  assert.throws(() => seriesGraph(series, b.report), /sammenhengende/)
  const c = draft()
  c.report.ssbEvidence.find((e) => e.id === 'Priser').rows[0].value = null
  assert.throws(() => seriesGraph(series, c.report), /Ugyldig/)
})
test('new graph references and placement invalidate old exact-version approval', () => {
  const a = structuredClone(source)
  a.copy.graphs = [series]
  assert.throws(() => validateArticle(a, { published: true }), /godkjenning/)
  a.copy.graphs = [{ ...series, afterSection: 99 }]
  assert.throws(() => validateArticle(a), /seksjon/)
  assert.notEqual(contentHash(a), contentHash(source))
  const legacyCopy = structuredClone(source.copy)
  delete legacyCopy.graphs
  assert.equal(graphPlan(legacyCopy, source.report).length, 3)
})
test('two calendar years depend on question and scope, never heading, period or numeric corrections', () => {
  const r = source.report
  const old = { ...source, publishedAt: '2026-10-06T09:00:00Z' }
  assert.equal(
    topicBlocked({ ...r, start: 2020, rows: r.rows.slice(6) }, [old], '2028-10-06T08:59:59Z'),
    true,
  )
  assert.equal(topicBlocked(r, [old], '2028-10-06T09:00:00Z'), false)
  assert.equal(topicKey({ ...r, dataHash: 'b'.repeat(64) }), topicKey(r))
  assert.equal(topicBlocked({ ...r, scopeId: 'u-02' }, [old], '2026-10-07T09:00:00Z'), false)
  assert.notEqual(topicKey({ ...r, question: 'pension-expenditure' }), topicKey(r))
  assert.equal(
    topicKey({ ...r, question: 'pension-expenditure' }),
    topicKey({ ...r, scopeId: 'u-09', question: 'pension-expenditure' }),
  )
  assert.throws(() => topicKey({ ...r, question: 'renamed-title' }), /Problemstillingen/)
  assert.equal(
    new Date(cooldownEnd({ publishedAt: '2024-02-29T12:00:00Z' })).toISOString(),
    '2026-02-28T12:00:00.000Z',
  )
})
test('separate budget year, phase and proposal/outcome are narrow distinct events', () => {
  const r = {
    kind: 'budget-comparison',
    year: 2027,
    phase: 'initial',
    comparison: 'previous-budget-to-proposal',
    scopeId: 'budget-2027-hash',
  }
  assert.equal(topicKey(r), topicKey({ ...r, scopeId: 'different-hash' }))
  for (const change of [
    { year: 2028 },
    { phase: 'revised' },
    { comparison: 'proposal-to-adopted-budget' },
  ])
    assert.notEqual(topicKey(r), topicKey({ ...r, ...change }))
})
test('latest article replaces duplicate library entry but immutable originals remain valid', () => {
  published.forEach((a) => validateArticle(a, { published: true }))
  const visible = currentAnalyses(published)
  assert.equal(visible.filter((a) => a.report.scopeId === 'state').length, 1)
  assert.ok(visible.some((a) => a.slug === source.slug))
  assert.ok(published.filter((a) => a.report.scopeId === 'state').length >= 2)
  assert.equal(
    nextReport(new URL('../public/data/', import.meta.url).pathname, published, {
      at: '2026-10-06T12:00:00Z',
    }).scopeId,
    'u-02',
  )
})
test('explicit replacement binds original hash and still needs a fresh human approval', () => {
  const a = draft()
  a.copy.graphs = [series]
  validateArticle(a)
  assert.deepEqual(a.report, source.report)
  assert.equal(a.status, 'draft')
  assert.equal(a.approval, undefined)
  assert.throws(() => validateArticle(a, { published: true }), /godkjenning/)
  assert.equal(replacementSource(published, a.replaces).slug, source.slug)
  assert.throws(
    () => replacementSource(published, { ...a.replaces, contentHash: 'b'.repeat(64) }),
    /endret/,
  )
  assert.throws(
    () =>
      replacementSource(published, {
        slug: published[0].slug,
        contentHash: contentHash(published[0]),
      }),
    /erstattet/,
  )
  assertPublicationTopic({ ...a, publishedAt: '2026-10-06T12:00:00Z' }, published)
  assert.throws(
    () =>
      assertPublicationTopic(
        { ...a, replaces: undefined, publishedAt: '2026-10-06T12:00:00Z' },
        published,
      ),
    /to årene/,
  )
})

test('an approved replacement publishes the tested graph version while preserving all original approvals', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'replacement-publish-'))
  const publicationPath = join(dir, 'publications.json')
  let article = draft()
  article.copy.graphs = [structuredClone(series)]
  const review = {
    id: 44,
    state: 'APPROVED',
    user: { login: 'Lippen1995' },
    commit_id: 'a'.repeat(40),
    submitted_at: new Date(
      Math.max(...published.map((a) => Date.parse(a.publishedAt))) + 60000,
    ).toISOString(),
  }
  const event = { pull_request: { number: 44 }, review }
  const commits = []
  const pr = {
    state: 'open',
    number: 44,
    head: {
      sha: review.commit_id,
      ref: 'analysis/weekly-2026-10-06-state-revision',
      repo: { full_name: 'owner/repo' },
    },
    base: { sha: 'b'.repeat(40), ref: 'main' },
  }
  const draftPath = `editorial/drafts/${article.slug}.json`
  const g = {
    root: '/repos/owner/repo',
    repository: 'owner/repo',
    permission: async () => true,
    api: async (path) =>
      path.endsWith('/pulls/44')
        ? pr
        : path.endsWith('/git/ref/heads/main')
          ? { object: { sha: pr.base.sha } }
          : assert.fail(path),
    pages: async (path) =>
      path.endsWith('/files')
        ? [{ filename: draftPath, status: 'added' }]
        : path.endsWith('/reviews')
          ? [review]
          : [],
    content: async (path) => ({ value: structuredClone(path === draftPath ? article : published) }),
    commit: async (...args) => {
      commits.push(args)
      return 'c'.repeat(40)
    },
  }
  const run = (command) =>
    runWorkflow({ command, event, g, reviewer: 'Lippen1995', publicationPath })
  try {
    await run('stage')
    const staged = JSON.parse(readFileSync(publicationPath, 'utf8'))
    assert.deepEqual(staged.slice(0, published.length), published)
    assert.equal(staged.at(-1).approval.contentHash, contentHash(article))
    article.copy.graphs[0].afterSection = 2
    await assert.rejects(run('publish'), /Testet og godkjent/)
    assert.equal(commits.length, 0)
    article.copy.graphs[0].afterSection = 1
    await run('publish')
    assert.equal(commits.length, 1)
    assert.deepEqual(commits[0][2][publicationPath].slice(0, published.length), published)
    assert.equal(commits[0][4].mergeParent, review.commit_id)
    assert.equal(currentAnalyses(staged).filter((a) => a.report.scopeId === 'state').length, 1)
    const later = new Date(source.publishedAt)
    later.setUTCFullYear(later.getUTCFullYear() + 3)
    const late = { ...staged.at(-1), publishedAt: later.toISOString() }
    assert.equal(
      currentAnalyses([...published, late]).some((a) => a.slug === source.slug),
      false,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
