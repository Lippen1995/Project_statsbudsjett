import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { emptyPipeline, ensureAutomatic, mutatePipeline, dueEntry, completeEntry, nextMonday, osloDate, entryFingerprint, assertCurrentEntry, validatePipeline, pipelinePath } from '../../scripts/analyser/pipeline-model.mjs'
import { suggestPipelineTopic, preparePipeline, buildPipelineReport } from '../../scripts/analyser/pipeline-reports.mjs'
import { deliverScheduled } from '../../scripts/analyser/handoff.mjs'
import { articleMetadata } from '../../scripts/analyser/article-metadata.mjs'

const root = new URL('../../', import.meta.url).pathname
const dataDir = root + 'web/public/data'
const published = JSON.parse(readFileSync(root + 'web/src/analyser/publications.json', 'utf8'))
const at = '2026-10-19T07:00:00Z'
const suggestion = () => suggestPipelineTopic(dataDir, published, emptyPipeline(), at)
const add = (document, topic = 'En konkret bestilling', scheduledDate = '2026-10-19') => mutatePipeline(document, { action: 'add', topic, instructions: 'Bruk relevante kilder, og dokumenter sammenligningen.', scheduledDate }, at)
const reference = entry => ({ id: entry.id, fingerprint: entryFingerprint(entry) })

test('Oslo-datoer og neste mandag er riktige også rundt midnatt og sommertid', () => {
  assert.equal(osloDate('2026-10-18T22:30:00Z'), '2026-10-19')
  assert.equal(nextMonday(at), '2026-10-26')
  assert.equal(nextMonday(at, true), '2026-10-19')
  assert.equal(nextMonday('2026-10-25T23:30:00Z'), '2026-11-02')
  assert.equal(nextMonday('2026-10-25T23:30:00Z', true), '2026-10-26')
})

test('tom kø får bare neste Sven-tema; manuelle temaer og slettinger respekteres', () => {
  const proposed = suggestion()
  const one = ensureAutomatic(emptyPipeline(), proposed, { at })
  assert.equal(one.items.length, 1)
  assert.equal(one.items[0].source, 'sven')
  assert.equal(one.items[0].scheduledDate, '2026-10-26')
  assert.equal(ensureAutomatic(one, proposed, { at }).items.length, 1)
  const manual = add(emptyPipeline())
  assert.equal(ensureAutomatic(manual, proposed, { at }).items.length, 1)
  assert.equal(ensureAutomatic(manual, proposed, { at }).items[0].source, 'admin')
  const deleted = mutatePipeline(one, { action: 'delete', id: one.items[0].id }, at)
  assert.equal(deleted.items.length, 0)
  assert.equal(deleted.history[0].status, 'deleted')
  assert.equal(ensureAutomatic(deleted, proposed, { at }).items.length, 0)
  const different = suggestPipelineTopic(dataDir, published, deleted, at)
  assert.notEqual(different.topicKey, proposed.topicKey)
  assert.equal(ensureAutomatic(deleted, different, { at }).items.length, 1)
})

test('datoer og prioritet styrer køen; både Sven-temaer og bestillinger kan flyttes og endres', () => {
  let queue = add(emptyPipeline(), 'Et fremtidig tema', '2026-11-09')
  queue = add(queue, 'Et tema som er klart')
  queue = add(queue, 'Et annet tema som er klart')
  assert.equal(dueEntry(queue, at).topic, 'Et tema som er klart')
  const third = queue.items[2]
  queue = mutatePipeline(queue, { action: 'move', id: third.id, index: 0 }, at)
  assert.equal(dueEntry(queue, at).id, third.id)
  assert.equal(dueEntry(queue, '2026-10-18T07:00:00Z'), null)
  let auto = ensureAutomatic(emptyPipeline(), suggestion(), { at })
  auto = add(auto)
  const original = auto.items[0]
  const rescheduled = mutatePipeline(auto, { action: 'edit', ...original, scheduledDate: '2026-10-27' }, at)
  assert.deepEqual(rescheduled.items[0].reportPlan, original.reportPlan)
  auto = mutatePipeline(auto, { action: 'move', id: original.id, index: 1 }, at)
  assert.equal(auto.items[1].source, 'sven')
  auto = mutatePipeline(auto, { action: 'edit', id: original.id, topic: 'Et justert spørsmål til Sven', instructions: 'Følg dette nye spørsmålet.', scheduledDate: '2026-10-27' }, at)
  assert.equal(auto.items[1].editedBy, 'admin')
  assert.equal(auto.items[1].reportPlan, null)
  assert.throws(() => validatePipeline({ ...auto, items: [original, { ...original, id: randomUUID() }] }), /høyst ett/)
})

test('frie bestillinger krever research; ingen tilfeldig standardrapport eller tidlig start', async () => {
  let queue = add(emptyPipeline(), 'Har sykehusene fått mer eller mindre å rutte med?')
  const repository = { read: async () => ({ document: queue }), write: async () => assert.fail('Manuell kø skal ikke erstattes') }
  const planning = await preparePipeline(repository, { dataDir, published, at })
  assert.equal(planning.packet.pipelineState, 'research-required')
  assert.equal(planning.packet.article, null)
  assert.equal(planning.packet.pipeline.topic, queue.items[0].topic)
  assert.equal(queue.items.length, 1)
  assert.throws(() => buildPipelineReport(dataDir, published, { kind: 'shell', command: 'vilkårlig kode' }, at))
  queue = mutatePipeline(queue, { action: 'edit', ...queue.items[0], scheduledDate: '2026-10-26' }, at)
  const waiting = await preparePipeline(repository, { dataDir, published, at })
  assert.equal(waiting.packet.pipelineState, 'waiting')
  assert.equal(waiting.packet.nextDate, '2026-10-26')
})

test('en endret instruks, dato eller prioritet avviser gamle utkast; bare levert tema avsluttes', () => {
  let queue = add(emptyPipeline())
  queue = add(queue, 'Den andre bestillingen')
  const ref = reference(queue.items[0])
  const edited = mutatePipeline(queue, { action: 'edit', ...queue.items[0], instructions: 'Nye eksplisitte føringer' }, at)
  assert.throws(() => assertCurrentEntry(edited, ref, at), { status: 409 })
  const moved = mutatePipeline(queue, { action: 'move', id: queue.items[1].id, index: 0 }, at)
  assert.throws(() => assertCurrentEntry(moved, ref, at), { status: 409 })
  const done = completeEntry(queue, ref, { at, reviewUrl: 'https://github.com/owner/repo/pull/1' })
  assert.deepEqual(done.items, [queue.items[1]])
  assert.equal(done.history[0].status, 'delivered')
  assert.equal(queue.items.length, 2)
  assert.throws(() => mutatePipeline(queue, { action: 'add', topic: 'Gyldig tema', instructions: '', scheduledDate: '2026-02-30' }, at))
})

function fixture({ manual = false, existing = false, drift = false, failDelivery = false, failReviewOnce = false } = {}) {
  const proposed = suggestion()
  let document = manual ? add(emptyPipeline(), proposed.topic) : ensureAutomatic(emptyPipeline(), proposed, { at, includeToday: true })
  const entry = document.items[0]
  const plan = proposed.reportPlan
  const report = buildPipelineReport(dataDir, published, plan, at)
  const article = { ...articleMetadata(report, '2026-10-19'), createdAt: at, generatedAt: at, status: 'draft', report,
    copy: { title: 'Et kontrollert spørsmål', description: 'Relevant dokumentasjon.', lead: 'Vi undersøker tallene.', conclusion: 'En dokumentert avgrensning.', linkedin: 'Les analysen.',
      sections: Array.from({ length: 4 }, () => ({ heading: 'En dokumentert utvikling', factIds: [], paragraphs: [Array(130).fill('Forklaring').join(' ')] })) } }
  const packet = { pipeline: { ...reference(entry), plan }, article }
  const writes = [], commits = []
  let reads = 0, created = null, storedDraft = null, reviewFailed = false
  const g = { root: '/repos/owner/repo', repository: 'owner/repo', permission: async () => true,
    async content(path) {
      if (path === 'editorial/handoff/test.json') return { value: packet }
      if (storedDraft && Object.keys(storedDraft)[0] === path) return { value: Object.values(storedDraft)[0] }
      if (path === 'web/src/analyser/publications.json') return { value: published }
      if (path === pipelinePath) {
        reads++
        if (drift && reads === 2) document = mutatePipeline(document, { action: 'edit', ...document.items[0], instructions: 'Endret av administrator under skrivingen.' }, at)
        return { value: structuredClone(document), sha: 'a'.repeat(40) }
      }
      throw Error(`Uventet fil: ${path}`)
    },
    pages: async path => path.endsWith('/files') ? [{ filename: Object.keys(storedDraft)[0], status: 'added' }]
      : created ? [created] : existing ? [{ number: 9, head: { ref: 'analysis/weekly-current' }, requested_reviewers: [{ login: 'reviewer' }] }] : [],
    async api(path, options = {}) {
      if (path.endsWith(`/contents/${pipelinePath}`)) { writes.push(options.body); document = JSON.parse(Buffer.from(options.body.content, 'base64')); return { content: { sha: 'b'.repeat(40) } } }
      if (path.endsWith('/git/ref/heads/main')) return { object: { sha: 'a'.repeat(40) } }
      if (path.includes('/git/ref/heads/analysis/')) return null
      if (path.endsWith('/pulls') && options.method === 'POST') {
        if (failDelivery) throw Error('Botlevering er avvist')
        created = { number: 7, html_url: 'https://github.com/owner/repo/pull/7', state: 'open', body: options.body.body,
          requested_reviewers: [], head: { ref: options.body.head, sha: 'c'.repeat(40), repo: { full_name: 'owner/repo' } }, base: { ref: 'main' } }
        return created
      }
      if (path.endsWith('/pulls/7/requested_reviewers')) {
        if (failReviewOnce && !reviewFailed) { reviewFailed = true; throw Error('Midlertidig feil ved review request') }
        created.requested_reviewers = [{ login: 'reviewer' }]
      }
      if (path.endsWith('/pulls/7') && !options.method) return created
      return {}
    },
    async commit(...args) { commits.push(args); storedDraft = args[2]; return 'c'.repeat(40) },
  }
  return { g, packet, writes, commits, entry, current: () => document }
}
const deliver = f => deliverScheduled({ g: f.g, reviewer: 'reviewer', actor: 'actor', input: { mode: 'weekly', sourceCommit: 'd'.repeat(40), sourcePath: 'editorial/handoff/test.json' }, dataDir, now: () => at })

test('botlevering følger pipelineplanen og oppretter bare neste automatiske tema etter faktisk levering', async () => {
  const f = fixture()
  const result = await deliver(f)
  assert.equal(result.delivered, true)
  assert.equal(f.commits.length, 1)
  assert.equal(f.current().history[0].entry.id, f.entry.id)
  assert.equal(f.current().history[0].reviewUrl, 'https://github.com/owner/repo/pull/7')
  assert.equal(f.current().items.length, 1)
  assert.equal(f.current().items[0].scheduledDate, '2026-10-26')
  assert.notEqual(f.current().items[0].topicKey, f.entry.topicKey)
  assert.equal(Object.values(f.commits[0][2])[0].status, 'draft')
})

test('åpen gjennomgang, feil eller endret pipeline konsumerer aldri bestillingen', async () => {
  for (const option of [{ existing: true }, { failDelivery: true }, { drift: true }]) {
    const f = fixture(option)
    if (option.existing) assert.equal((await deliver(f)).waiting, true)
    else await assert.rejects(deliver(f))
    assert.equal(f.writes.length, 0)
    assert.equal(f.current().items[0].id, f.entry.id)
    if (option.drift) assert.equal(f.commits.length, 0)
  }
  const legacy = fixture(); delete legacy.packet.pipeline
  await assert.rejects(deliver(legacy), /pipelineinstruks/)
  assert.equal(legacy.commits.length, 0)
})

test('delvis botfeil kan gjenopptas uten duplikat eller en fastlåst pipeline', async () => {
  const f = fixture({ failReviewOnce: true })
  await assert.rejects(deliver(f), /review request/)
  assert.equal(f.current().items[0].id, f.entry.id)
  assert.equal(f.commits.length, 1)
  assert.equal(f.writes.length, 0)
  const result = await deliver(f)
  assert.equal(result.recovered, true)
  assert.equal(result.delivered, true)
  assert.equal(f.commits.length, 1)
  assert.equal(f.current().history[0].entry.id, f.entry.id)
  assert.equal(f.current().items.length, 1)
  assert.notEqual(f.current().items[0].id, f.entry.id)
})

test('pausede temaer tas ikke, hasteprioritet gjelder bare klare datoer og omprioritering ugyldiggjør gammelt grunnlag',async()=>{
  const {mutatePipeline,emptyPipeline,dueEntry,entryFingerprint,assertCurrentEntry}=await import('../../scripts/analyser/pipeline-model.mjs')
  const at='2026-10-20T08:00:00Z'
  let doc=emptyPipeline()
  for(const [topic,scheduledDate] of [['Første tema i køen','2026-10-20'],['Andre tema som haster','2026-10-20'],['Fremtidig tema som haster','2026-10-21']])doc=mutatePipeline(doc,{action:'add',topic,scheduledDate,instructions:''},at)
  const original=dueEntry(doc,at),reference={id:original.id,fingerprint:entryFingerprint(original)}
  doc=mutatePipeline(doc,{action:'priority',id:doc.items[2].id,priority:'urgent'},at)
  assert.equal(dueEntry(doc,at).id,original.id)
  doc=mutatePipeline(doc,{action:'priority',id:doc.items[1].id,priority:'urgent'},at)
  assert.equal(dueEntry(doc,at).id,doc.items[1].id)
  assert.throws(()=>assertCurrentEntry(doc,reference,at),/endret|omprioritert/)
  doc=mutatePipeline(doc,{action:'pause',id:doc.items[1].id,paused:true},at)
  assert.equal(dueEntry(doc,at).id,original.id)
  assert.throws(()=>mutatePipeline(doc,{action:'reorder',ids:[original.id,original.id]}),/nøyaktig/)
})
