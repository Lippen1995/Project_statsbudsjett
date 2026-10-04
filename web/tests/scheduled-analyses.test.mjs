import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deliverScheduled } from '../../scripts/analyser/handoff.mjs'
import { analysisSettings } from '../../scripts/analyser/config.mjs'
import { contentHash } from '../../scripts/analyser/schema.mjs'
const root = new URL('../../', import.meta.url).pathname
const pilot = () => JSON.parse(readFileSync(`${root}editorial/drafts/pilot.json`))
const input = {
  mode: 'weekly',
  sourceCommit: 'a'.repeat(40),
  sourcePath: 'editorial/drafts/pilot.json',
}

function fixture({ packet = pilot(), comments = [], existing = false } = {}) {
  const changes = [],
    calls = []
  let current = pilot()
  const path = `editorial/drafts/${current.slug}.json`
  const pr = {
    number: 123,
    state: 'open',
    requested_reviewers: [{ login: 'reviewer' }],
    head: { sha: 'c'.repeat(40), ref: 'analysis/weekly-test', repo: { full_name: 'owner/repo' } },
    base: { ref: 'main', sha: 'a'.repeat(40) },
  }
  const g = {
    root: '/repos/owner/repo',
    repository: 'owner/repo',
    permission: async (login) => ['agent', 'reviewer'].includes(login),
    content: async (file, ref) => {
      if (file === input.sourcePath && ref === input.sourceCommit) return { value: packet }
      if (file === 'web/src/analyser/publications.json') return { value: [] }
      if (file === path && ref === pr.head.sha) return { value: current }
      throw Error(`Uventet fil: ${file}`)
    },
    pages: async (route) => {
      if (route.startsWith('/pulls?')) return existing ? [pr] : []
      if (route.endsWith('/files')) return [{ filename: path, status: 'added' }]
      if (route.endsWith('/comments')) return comments
      if (route.endsWith('/reviews')) return []
      throw Error(`Uventet liste: ${route}`)
    },
    api: async (route, options = {}) => {
      calls.push({ route, ...options })
      if (route.endsWith('/git/ref/heads/main')) return { object: { sha: 'a'.repeat(40) } }
      if (route.endsWith('/pulls/123') && !options.method) return structuredClone(pr)
      if (route.endsWith('/pulls') && options.method === 'POST') return { number: 123 }
      return {}
    },
    commit: async (branch, parent, files) => {
      changes.push({ branch, parent, files })
      current = Object.values(files)[0]
      pr.head.sha = 'd'.repeat(40)
      return pr.head.sha
    },
  }
  return { g, changes, calls, pr, current: () => current, comments }
}
const deliver = (f, overrides = {}) =>
  deliverScheduled({
    g: f.g,
    actor: 'agent',
    reviewer: 'reviewer',
    input,
    dataDir: `${root}web/public/data`,
    now: () => '2026-10-04T10:00:00Z',
    ...overrides,
  })

test('planlagt tekst leveres til botgjennomgang uten AI-kall eller publisering', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw Error('Ingen ekstern AI skal kalles')
  })
  const f = fixture()
  await deliver(f)
  assert.equal(f.changes.length, 1)
  assert.match(f.changes[0].branch, /^analysis\/weekly-/)
  assert.ok(Object.keys(f.changes[0].files).every((path) => path.startsWith('editorial/drafts/')))
  assert.equal(f.current().status, 'draft')
  assert.equal(f.current().approval, undefined)
  assert.deepEqual(f.current().copy, pilot().copy)
  const request = f.calls.find((c) => c.route.endsWith('/requested_reviewers'))
  assert.deepEqual(request.body.reviewers, ['reviewer'])
  assert.ok(f.calls.find((c) => c.route.endsWith('/pulls')).body.body.includes('LinkedIn-utkast'))
})

test('en åpen gjennomgang hindrer en ny ukentlig analyse', async () => {
  const f = fixture({ existing: true })
  await deliver(f)
  assert.equal(f.changes.length, 0)
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 0)
})

test('avsender, fast commit, tillatt sti og utkaststatus kreves før levering', async () => {
  for (const override of [
    { actor: 'outsider' },
    { input: { ...input, sourceCommit: 'main' } },
    { input: { ...input, sourcePath: 'editorial/../../secret.json' } },
  ]) {
    const f = fixture()
    await assert.rejects(() => deliver(f, override))
    assert.equal(f.changes.length, 0)
  }
  const a = pilot()
  a.approval = { reviewer: 'agent' }
  const f = fixture({ packet: a })
  await assert.rejects(() => deliver(f), /utkast uten godkjenning/)
  assert.equal(f.changes.length, 0)
})

test('et endret datagrunnlag eller en endret kilde avvises før boten skriver', async () => {
  for (const alter of [
    (a) => {
      a.report.dataHash = 'b'.repeat(64)
    },
    (a) => {
      a.report.sources[0].url = 'https://example.com/fake'
    },
  ]) {
    const a = pilot()
    alter(a)
    const f = fixture({ packet: a })
    await assert.rejects(() => deliver(f), /kontrollerte rapporten/)
    assert.equal(f.changes.length, 0)
  }
})

const feedback = {
  id: 1,
  user: { login: 'reviewer', type: 'User' },
  body: 'Gjør ingressen lettere å lese',
  created_at: '2026-10-04T09:00:00Z',
}
function revisionFixture() {
  const article = pilot()
  article.copy.title = 'Et nytt blikk på statens regning'
  const packet = {
    article,
    base: { number: 123, head: 'c'.repeat(40), feedback: `reviewer: ${feedback.body}` },
  }
  return { packet, f: fixture({ packet, comments: [feedback] }) }
}
test('en planlagt revisjon behandler riktig kommentar og krever ny godkjenning', async () => {
  const { f } = revisionFixture()
  const before = contentHash(f.current())
  await deliver(f, { input: { ...input, mode: 'feedback', number: 123 } })
  assert.equal(f.changes.length, 1)
  assert.equal(f.current().status, 'draft')
  assert.equal(f.current().approval, undefined)
  assert.notEqual(contentHash(f.current()), before)
  assert.deepEqual(f.current().processedFeedbackIds, ['comment-1'])
  assert.ok(f.calls.some((c) => c.route.endsWith('/requested_reviewers')))
})
test('en revisjon skrevet før nytt head eller nye innspill kan ikke markere dem behandlet', async () => {
  const stale = revisionFixture()
  stale.packet.base.head = 'b'.repeat(40)
  await assert.rejects(
    () => deliver(stale.f, { input: { ...input, mode: 'feedback', number: 123 } }),
    /gjeldende/,
  )
  assert.equal(stale.f.changes.length, 0)
  const fresh = revisionFixture()
  fresh.f.comments.push({
    ...feedback,
    id: 2,
    body: 'Et nytt ønske',
    created_at: '2026-10-04T09:01:00Z',
  })
  await assert.rejects(
    () => deliver(fresh.f, { input: { ...input, mode: 'feedback', number: 123 } }),
    /endret/,
  )
  assert.equal(fresh.f.changes.length, 0)
})
test('godkjennerrollen kan overføres gjennom innstillinger, uten en AI-nøkkel', () => {
  const path = `${root}editorial/analysis-settings.json`
  assert.equal(analysisSettings({ path, reviewer: 'new-reviewer' }).reviewer, 'new-reviewer')
  assert.equal(analysisSettings({ path, reviewer: '' }).reviewer, 'Lippen1995')
  assert.throws(() => analysisSettings({ path, reviewer: 'bad\nVALUE=x' }), /Ugyldig/)
})
