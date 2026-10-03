import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReport } from '../../scripts/analyser/report.mjs'
import { contentHash, validateArticle } from '../../scripts/analyser/schema.mjs'
import {
  approveArticle,
  reviseArticle,
  assertReviewBranch,
} from '../../scripts/analyser/review.mjs'
import {
  linkedInPayload,
  assertLiveVersion,
  assertUnsent,
} from '../../scripts/analyser/linkedin.mjs'
import { filterAnalyses, factText } from '../src/analyser/model.js'
import { kompaktData, rot, sumRot } from '../src/fellestall/kompakt.js'
import { renderReview } from '../../scripts/analyser/render-review.mjs'
import { calculateFacts } from '../../scripts/analyser/facts.mjs'
import { annualChanges, largestAnnualChange, growthMeasures } from '../src/analyser/insights.js'
import { githubClient } from '../../scripts/analyser/github.mjs'
import { writeCopy } from '../../scripts/analyser/ai.mjs'
const root = new URL('../../', import.meta.url).pathname
const draft = () => JSON.parse(readFileSync(join(root, 'editorial/drafts/pilot.json')))
const approved = () =>
  approveArticle(draft(), {
    reviewer: 'test-reviewer',
    commitId: 'a'.repeat(40),
    currentHead: 'a'.repeat(40),
    approvedAt: '2026-10-02T13:00:00Z',
  })

test('analysens faktiske utgiftssum bruker samme avgrensning som forsiden', () => {
  const report = buildReport(join(root, 'web/public/data'))
  const data = kompaktData({
    utgifter: JSON.parse(readFileSync(join(root, 'web/public/data/utgifter.json'))),
    inntekter: [],
  })
  for (const row of report.rows)
    assert.ok(Math.abs(row.expenditure - sumRot(rot(data, 'utgifter', true), row.year)) < 0.000001)
})
test('befolkning og priser justeres multiplikativt, med kjente tall', () => {
  const dir = mkdtempSync(join(tmpdir(), 'analysis-data-'))
  try {
    const data = {
      meta: { regnskap_aar: [2020, 2021], oppdatert: '2026-10-01T00:00:00Z' },
      utgifter: [
        { id: 'ordinary', serier: { 2020: { regnskap: 100 }, 2021: { regnskap: 132 } } },
        { id: 'finance', fin: true, serier: { 2020: { regnskap: 999 }, 2021: { regnskap: 9999 } } },
      ],
      befolkning: { 2020: 100, 2021: 110 },
      kpi: { 2020: 100, 2021: 120 },
    }
    for (const [k, v] of Object.entries(data))
      writeFileSync(join(dir, k + '.json'), JSON.stringify(v))
    const r = buildReport(dir)
    assert.ok(Math.abs(r.facts.realPerCapitaGrowth.value) < 1e-10)
    assert.ok(Math.abs(r.facts.nominalGrowth.value - 32) < 1e-10)
    data.kpi[2021] = null
    writeFileSync(join(dir, 'kpi.json'), JSON.stringify(data.kpi))
    assert.throws(() => buildReport(dir), /Mangler befolkning eller KPI/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('årlig vekst bruker faste kroner og største endring velges også ved nedgang', () => {
  const rows = [
    { year: 2020, perCapita: 100, cpi: 100 },
    { year: 2021, perCapita: 120, cpi: 120 },
    { year: 2022, perCapita: 90, cpi: 120 },
    { year: 2023, perCapita: 108, cpi: 120 },
  ]
  const changes = annualChanges(rows)
  for (const [i, value] of [0, -25, 20].entries())
    assert.ok(Math.abs(changes[i].change - value) < 1e-10)
  assert.equal(largestAnnualChange(rows).year, 2022)
  assert.equal(largestAnnualChange(rows).previousYear, 2021)
  assert.equal(largestAnnualChange(rows).change, -25)
  assert.equal(largestAnnualChange(rows.slice(0, 2)).change, 0)
})
test('vekstgrafen skiller samlet regnskap, folketall og prisjustering', () => {
  const report = {
    rows: [
      { expenditure: 100, perCapita: 100, cpi: 100 },
      { expenditure: 132, perCapita: 120, cpi: 120 },
    ],
  }
  const measures = growthMeasures(report)
  for (const [i, value] of [32, 20, 0].entries())
    assert.ok(Math.abs(measures[i].value - value) < 1e-10)
})
test('nye faktum om tidsforløpet må stemme med hele tidsserien', () => {
  const a = draft()
  assert.equal(a.report.factsVersion, 2)
  assert.equal(a.report.facts.largestChangeYear.value, 2020)
  assert.equal(a.report.facts.previousYear.value, 2019)
  assert.equal(a.report.facts.growthBeforeChange.text, '3,7 %')
  assert.equal(a.report.facts.largestAnnualChange.text, '10,3 %')
  a.report.facts.largestChangeYear.value = 2019
  assert.throws(() => validateArticle(a), /Fakta samsvarer/)
  const b = draft()
  b.report.factsVersion = 3
  assert.throws(() => validateArticle(b), /Ukjent versjon/)
})
test('eldre frosne artikler uten utvidede faktum kan fortsatt valideres', () => {
  const a = draft()
  delete a.report.factsVersion
  a.report.facts = calculateFacts(a.report.rows[0], a.report.rows.at(-1))
  const legacyText = (text) =>
    text.replace(/\{\{fact:([A-Za-z]+)\}\}/g, (match, key) =>
      Object.hasOwn(a.report.facts, key) ? match : 'et beregnet tall',
    )
  for (const key of ['title', 'description', 'lead', 'conclusion', 'linkedin'])
    a.copy[key] = legacyText(a.copy[key])
  for (const section of a.copy.sections) {
    section.heading = legacyText(section.heading)
    section.paragraphs = section.paragraphs.map(legacyText)
    section.factIds = section.factIds.filter((key) => Object.hasOwn(a.report.facts, key))
  }
  assert.doesNotThrow(() => validateArticle(a))
  assert.equal(a.report.facts.nominalPerCapitaGrowth, undefined)
})
test('en tidsserie med manglende år avvises', () => {
  const a = draft()
  a.report.rows.splice(3, 1)
  assert.throws(() => validateArticle(a), /tidsserie/)
})
test('endrede grafverdier og feil faktatekst avvises', () => {
  const a = draft()
  a.report.rows[0].perCapita += 100
  assert.throws(() => validateArticle(a), /regnestykket/)
  const b = draft()
  b.report.facts.realPerCapitaGrowth.text = '0 %'
  assert.throws(() => validateArticle(b), /Fakta samsvarer/)
})
test('utkast kan ikke behandles som publiserte analyser', () =>
  assert.throws(() => validateArticle(draft(), { published: true }), /godkjenning/))
test('gamle godkjenninger og ubehandlede endringsønsker stopper publisering', () => {
  assert.throws(
    () =>
      approveArticle(draft(), {
        reviewer: 'test-reviewer',
        commitId: 'old',
        currentHead: 'new',
        approvedAt: '2026-10-02T13:00:00Z',
      }),
    /gjeldende versjon/,
  )
  assert.throws(
    () =>
      approveArticle(draft(), {
        reviewer: 'test-reviewer',
        commitId: 'same',
        currentHead: 'same',
        approvedAt: '2026-10-02T13:00:00Z',
        pendingFeedback: true,
      }),
    /Endringsønsker/,
  )
})
test('revisjon fjerner tidligere godkjenning og krever ny gjennomgang', () => {
  const article = approved(),
    copy = { ...article.copy, title: 'Dyrere kroner trenger en bedre målestokk' }
  const next = reviseArticle(article, copy, {
    feedbackId: 'comment-123',
    feedbackAt: '2026-10-02T14:00:00Z',
    generatedAt: '2026-10-02T14:01:00Z',
  })
  assert.equal(next.status, 'draft')
  assert.equal(next.approval, undefined)
  assert.equal(next.publishedAt, undefined)
  assert.notEqual(contentHash(next), contentHash(article))
  assert.throws(() => validateArticle(next, { published: true }), /godkjenning/)
  assert.equal(
    approveArticle(next, {
      reviewer: 'test-reviewer',
      commitId: 'new',
      currentHead: 'new',
      approvedAt: '2026-10-02T14:02:00Z',
    }).status,
    'published',
  )
})
test('godkjenningen omfatter taksonomi og LinkedIn-teksten', () => {
  for (const change of [
    (a) => {
      a.geography = 'Oslo'
    },
    (a) => {
      a.copy.linkedin += ' Et nytt poeng.'
    },
  ]) {
    const a = approved()
    change(a)
    assert.throws(() => validateArticle(a, { published: true }), /godkjenning/)
  }
})
test('AI kan ikke introdusere uverifiserte sifre, lenker eller ukjente faktum', () => {
  for (const text of ['Vi bruker 999 milliarder.', 'Se https://example.org', '{{fact:madeUp}}']) {
    const a = draft()
    a.copy.lead = text
    assert.throws(() => validateArticle(a))
  }
})
test('vanlige PR-er og PR-er fra forks er ikke publiseringskanaler', () => {
  const pr = {
    state: 'open',
    head: { ref: 'analysis/weekly-2026-10-02', repo: { full_name: 'owner/repo' } },
    base: { ref: 'main' },
  }
  assert.doesNotThrow(() => assertReviewBranch(pr, 'owner/repo'))
  assert.throws(() =>
    assertReviewBranch(
      { ...pr, head: { ...pr.head, repo: { full_name: 'attacker/repo' } } },
      'owner/repo',
    ),
  )
  assert.throws(() =>
    assertReviewBranch({ ...pr, head: { ...pr.head, ref: 'feature/unrelated' } }, 'owner/repo'),
  )
})
test('søkeord og alle filtre kombineres; sortering er nyeste først', () => {
  const a = approved(),
    b = {
      ...approved(),
      slug: 'kommune',
      topic: 'Kommuneøkonomi',
      geography: 'Stavanger',
      type: 'Sammenligning',
      publishedAt: '2026-10-03T13:00:00Z',
    }
  assert.deepEqual(
    filterAnalyses([a, b]).map((a) => a.slug),
    ['kommune', a.slug],
  )
  assert.deepEqual(
    filterAnalyses([a, b], {
      query: 'STAVANGER',
      topic: 'Kommuneøkonomi',
      geography: 'Stavanger',
      type: 'Sammenligning',
    }),
    [b],
  )
  assert.equal(filterAnalyses([a, b], { query: 'ukjent' }).length, 0)
})
test('LinkedIn krever nøyaktig live-versjon og stopper duplikat/ukjent kvittering', () => {
  const a = approved(),
    payload = linkedInPayload(a, '123')
  assert.ok(payload.commentary.endsWith(`https://fellestall.no/analyser/${a.slug}/`))
  assert.equal(payload.author, 'urn:li:organization:123')
  assert.ok(!payload.commentary.includes('{{fact:'))
  assert.throws(
    () => assertLiveVersion(a, { contentHash: 'old', report: a.report }),
    /ikke tilgjengelig/,
  )
  assert.doesNotThrow(() => assertLiveVersion(a, { contentHash: contentHash(a), report: a.report }))
  assert.throws(
    () => assertUnsent([{ contentHash: contentHash(a), status: 'pending' }], a),
    /automatisk gjentakelse/,
  )
  assert.throws(
    () => assertUnsent([{ contentHash: contentHash(a), status: 'sent' }], a),
    /allerede publisert/,
  )
  assert.throws(() => linkedInPayload(draft(), '123'), /godkjenning/)
})
test('mobilgjennomgangen inneholder hele analysen, LinkedIn, kontrollgrunnlag og fungerende tabell', () => {
  const text = renderReview(draft())
  assert.ok(text.includes('Review changes → Approve'))
  assert.ok(text.includes('AI reviderer og ber om ny godkjenning'))
  assert.ok(text.includes('|---|---:|---:|---:|\n| 2014'))
  assert.ok(!text.includes('{{fact:'))
  assert.ok(text.includes(factText(draft().copy.sections.at(-1).paragraphs.at(-1), draft().report)))
})
test('AI-feil lar eksisterende utkast være urørt og slipper ikke inn ugyldig tekst', async (t) => {
  const a = draft(),
    before = JSON.stringify(a)
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }))
  await assert.rejects(
    () =>
      writeCopy(a.report, {
        apiKey: 'test-only',
        model: 'test-model',
        previous: a.copy,
        feedback: 'Gjør teksten kortere',
      }),
    /HTTP 401/,
  )
  assert.equal(JSON.stringify(a), before)
})
test('AI-revisjon får kontrollert rapport, forrige utkast og endringsønsket', async (t) => {
  const a = draft(),
    copy = { ...a.copy, title: 'Et nytt blikk på pengebruken' }
  let request
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    request = JSON.parse(options.body)
    return Response.json({
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(copy) }] }],
    })
  })
  const result = await writeCopy(a.report, {
    apiKey: 'test-only',
    model: 'test-model',
    previous: a.copy,
    feedback: 'Bytt tittelen',
  })
  assert.equal(result.title, copy.title)
  assert.equal(JSON.parse(request.input).feedback, 'Bytt tittelen')
  assert.deepEqual(JSON.parse(request.input).report, a.report)
  assert.equal(request.text.format.strict, true)
})
test('publiseringscommit tar med review-hodet og kan aldri force-pushe', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, body })
    if (url.endsWith('/git/commits/base')) return Response.json({ tree: { sha: 'base-tree' } })
    if (url.endsWith('/git/blobs')) return Response.json({ sha: 'blob' })
    if (url.endsWith('/git/trees')) return Response.json({ sha: 'tree' })
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'merge' })
    return Response.json({})
  })
  const g = githubClient({ token: 'test-only', repository: 'owner/repo' })
  await g.commit('main', 'base', { 'web/src/analyser/publications.json': [] }, 'publish', {
    mergeParent: 'approved-head',
  })
  assert.deepEqual(calls.find((c) => c.url.endsWith('/git/commits')).body.parents, [
    'base',
    'approved-head',
  ])
  assert.equal(calls.at(-1).body.force, false)
})

test('ukentlig kø finner en annen dokumentert analyse selv uten nye data', async () => {
  const { nextReport } = await import('../../scripts/analyser/candidates.mjs')
  const first = nextReport(join(root, 'web/public/data'), [])
  assert.equal(first.scopeId, 'state')
  const second = nextReport(join(root, 'web/public/data'), [{ report: first }])
  assert.ok(second.scopeId !== 'state')
  assert.ok(second.limitations.some((s) => s.includes('ansvarsområder')))
  const unknown = () => buildReport(join(root, 'web/public/data'), { departmentId: 'missing' })
  assert.throws(unknown, /Ukjent departement/)
})
test('hele revisjonsløpet: tekstønske, nytt utkast, gammel godkjenning avvist, ny godkjenning publiserer', async () => {
  const { runWorkflow } = await import('../../scripts/analyser/workflow.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'analysis-review-')),
    registry = join(dir, 'publications.json')
  const article = draft(),
    draftPath = `editorial/drafts/${article.slug}.json`
  let current = article,
    mainPublished = [],
    pr = {
      number: 7,
      state: 'open',
      head: { sha: 'old-head', ref: 'analysis/weekly-test', repo: { full_name: 'owner/repo' } },
      base: { ref: 'main', sha: 'main-head' },
    }
  const comments = [
    {
      id: 1,
      user: { type: 'User', login: 'editor' },
      created_at: '2026-10-02T15:00:00Z',
      body: 'Gjør tittelen morsommere',
    },
  ]
  const commits = [],
    notifications = [],
    reviews = []
  const g = {
    root: '/repos/owner/repo',
    repository: 'owner/repo',
    permission: async (login) => login === 'editor',
    content: async (path) => ({ value: path === registry ? mainPublished : current }),
    pages: async (path) =>
      path.includes('/files')
        ? [{ filename: draftPath, status: 'added' }]
        : path.includes('/comments')
          ? comments
          : reviews,
    api: async (path, options = {}) => {
      if (path.endsWith('/git/ref/heads/main')) return { object: { sha: 'main-head' } }
      if (path.endsWith('/requested_reviewers')) {
        notifications.push(options.body.reviewers)
        return {}
      }
      if (path.endsWith('/comments')) {
        comments.push({
          id: 2,
          user: { type: 'Bot', login: 'github-actions[bot]' },
          body: options.body.body,
        })
        return {}
      }
      if (options.method === 'PATCH') return {}
      return structuredClone(pr)
    },
    commit: async (branch, parent, changes, message, options) => {
      commits.push({ branch, parent, changes, options })
      if (branch === 'main') mainPublished = changes[registry]
      else {
        current = changes[draftPath]
        pr.head.sha = 'revised-head'
      }
      return 'new-commit'
    },
  }
  try {
    const feedbackEvent = { issue: { number: 7 }, comment: comments[0] }
    await runWorkflow({
      command: 'feedback',
      event: feedbackEvent,
      g,
      reviewer: 'editor',
      publicationPath: registry,
      now: () => '2026-10-02T15:01:00Z',
      generateCopy: async (_r, options) => {
        assert.ok(options.feedback.includes('Gjør tittelen morsommere'))
        return { ...article.copy, title: 'Kronen trenger også lesebriller' }
      },
    })
    assert.equal(current.status, 'draft')
    assert.equal(mainPublished.length, 0)
    assert.deepEqual(notifications, [['editor']])
    const review = {
      id: 123,
      state: 'approved',
      user: { login: 'editor' },
      commit_id: 'old-head',
      submitted_at: '2026-10-02T15:02:00Z',
    }
    await assert.rejects(
      () =>
        runWorkflow({
          command: 'stage',
          reviewer: 'editor',
          event: { pull_request: { number: 7 }, review },
          g,
          publicationPath: registry,
        }),
      /gjeldende versjon/,
    )
    review.commit_id = 'revised-head'
    reviews.push(review)
    await runWorkflow({
      command: 'stage',
      reviewer: 'editor',
      event: { pull_request: { number: 7 }, review },
      g,
      publicationPath: registry,
    })
    assert.equal(mainPublished.length, 0)
    assert.equal(
      JSON.parse(readFileSync(registry))[0].copy.title,
      'Kronen trenger også lesebriller',
    )
    await runWorkflow({
      command: 'publish',
      reviewer: 'editor',
      event: { pull_request: { number: 7 }, review },
      g,
      publicationPath: registry,
    })
    assert.equal(mainPublished.length, 1)
    assert.equal(commits.at(-1).options.mergeParent, 'revised-head')
    assert.equal(commits.at(-1).changes[draftPath], undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('OAuth-fornyelse skjer før LinkedIn-publisering uten å lagre nøkler', async (t) => {
  const { linkedInToken } = await import('../../scripts/analyser/linkedin-auth.mjs')
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://www.linkedin.com/oauth/v2/accessToken')
    assert.equal(options.body.get('grant_type'), 'refresh_token')
    return Response.json({ access_token: 'test-access' })
  })
  assert.equal(
    await linkedInToken({
      LINKEDIN_REFRESH_TOKEN: 'test-refresh',
      LINKEDIN_CLIENT_ID: 'test-id',
      LINKEDIN_CLIENT_SECRET: 'test-secret',
    }),
    'test-access',
  )
  await assert.rejects(() => linkedInToken({}), /tilgang mangler/)
})

test('trukket godkjenning og en tom request-changes-review stopper publisering', async () => {
  const { assertActiveApproval } = await import('../../scripts/analyser/review.mjs')
  const review = { id: 100, state: 'APPROVED', user: { login: 'editor' }, commit_id: 'head' }
  assert.doesNotThrow(() => assertActiveApproval([review], review, 'head'))
  assert.throws(
    () => assertActiveApproval([{ ...review, state: 'DISMISSED' }], review, 'head'),
    /trukket tilbake/,
  )
  assert.throws(
    () =>
      assertActiveApproval(
        [
          review,
          {
            id: 101,
            state: 'CHANGES_REQUESTED',
            user: { login: 'editor' },
            commit_id: 'head',
            body: '',
          },
        ],
        review,
        'head',
      ),
    /ber fortsatt om endringer/,
  )
})

test('godkjenneransvar kan overføres uten at forrige godkjenner beholder publiseringsrett', async () => {
  const { assertDesignatedReviewer, isDesignatedReviewer } = await import(
    '../../scripts/analyser/review.mjs'
  )
  assert.doesNotThrow(() => assertDesignatedReviewer('Lippen1995', 'lippen1995'))
  assert.throws(() => assertDesignatedReviewer('Lippen1995', 'new-editor'), /nåværende ansvarlige/)
  assert.doesNotThrow(() => assertDesignatedReviewer('new-editor', 'new-editor'))
  assert.equal(isDesignatedReviewer('colleague', 'new-editor'), false)
  assert.throws(() => assertDesignatedReviewer('new-editor', ''), /nåværende ansvarlige/)
})

test('overføring sender et eksisterende utkast til ny godkjenner uten å generere en ny analyse', async () => {
  const { runWorkflow } = await import('../../scripts/analyser/workflow.mjs')
  const requests = []
  const g = {
    root: '/repos/owner/repo',
    permission: async (login) => login === 'new-editor',
    pages: async () => [
      {
        number: 42,
        head: { ref: 'analysis/weekly-test' },
        requested_reviewers: [{ login: 'old-editor' }],
      },
    ],
    api: async (path, options) => {
      requests.push({ path, body: options.body })
      return {}
    },
  }
  await runWorkflow({
    command: 'weekly',
    g,
    reviewer: 'new-editor',
    generateCopy: async () => {
      throw Error('En ny analyse skal ikke genereres')
    },
  })
  assert.deepEqual(requests, [
    { path: '/repos/owner/repo/pulls/42/requested_reviewers', body: { reviewers: ['new-editor'] } },
  ])
})
