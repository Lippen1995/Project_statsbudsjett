import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectPreviews, notifyPreviews, previewPath } from '../../scripts/analyser/previews.mjs'
import { contentHash } from '../../scripts/analyser/schema.mjs'
const article = () =>
  JSON.parse(readFileSync(new URL('../../editorial/drafts/pilot.json', import.meta.url)))
function fixture() {
  const pr = {
    number: 14,
    state: 'open',
    user: { login: 'github-actions[bot]' },
    body: `Original review\nVersjon: \`${contentHash(article())}\``,
    head: { sha: 'a'.repeat(40), ref: 'analysis/weekly-test', repo: { full_name: 'owner/repo' } },
    base: { ref: 'main' },
  }
  const writes = []
  const g = {
    repository: 'owner/repo',
    root: '/repos/owner/repo',
    pages: async (p) =>
      p.startsWith('/pulls?')
        ? [pr]
        : [{ filename: 'editorial/drafts/test.json', status: 'added' }],
    api: async (_p, options = {}) =>
      options.method ? writes.push(options.body) : structuredClone(pr),
    content: async (_p, ref) => {
      assert.equal(ref, pr.head.sha)
      return { value: article() }
    },
  }
  return { g, pr, writes }
}
test('preview uses validated JSON at exact bot review head, not branch code', async () => {
  const { g, pr } = fixture()
  const [p] = await collectPreviews(g)
  assert.equal(p.path, `/analyser/utkast/pr-14/${pr.head.sha}/`)
  assert.equal(p.article.status, 'draft')
  assert.equal(p.hash.length, 64)
  pr.user.login = 'someone'
  assert.deepEqual(await collectPreviews(g), [])
})

test('a stale review description is regenerated from the exact preview without approving it', async () => {
  const { g, pr, writes } = fixture()
  const revised = article()
  revised.copy.linkedin = 'Regningen har vokst. Hva fikk vi igjen for pengene? Les analysen.'
  g.content = async () => ({ value: revised })
  const [preview] = await collectPreviews(g)
  await notifyPreviews(g, [preview])
  assert.ok(writes[0].body.includes(revised.copy.linkedin))
  assert.ok(writes[0].body.includes(`Versjon: \`${preview.hash}\``))
  assert.equal(writes[0].body.includes('Original review'), false)
  assert.equal(revised.approval, undefined)
  preview.article.copy.linkedin = 'A changed artifact'
  await assert.rejects(notifyPreviews(g, [preview]), /versjon er endret/)
  assert.equal(writes.length, 1)
})
test('preview rejects unexpected changed files and invalid paths', async () => {
  const { g } = fixture()
  g.pages = async (p) =>
    p.startsWith('/pulls?')
      ? [fixture().pr]
      : [{ filename: 'web/src/main.jsx', status: 'modified' }]
  await assert.rejects(() => collectPreviews(g), /uventede filendringer/)
  assert.throws(() => previewPath(14, '../x'), /Ugyldig/)
})
test('review link preserves body, replaces old notice, and skips stale versions', async () => {
  const { g, pr, writes } = fixture()
  const previews = await collectPreviews(g)
  await notifyPreviews(g, previews)
  assert.ok(writes[0].body.includes('Original review'))
  assert.ok(writes[0].body.includes(previews[0].path))
  pr.body = writes[0].body
  await notifyPreviews(g, previews)
  assert.equal(writes[1].body.match(/analysis-preview:start/g).length, 1)
  pr.head.sha = 'b'.repeat(40)
  await notifyPreviews(g, previews)
  assert.equal(writes.length, 2)
})
