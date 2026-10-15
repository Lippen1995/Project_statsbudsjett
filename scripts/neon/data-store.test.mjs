import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { migrate, inspectDirectory, importDirectory, exportSnapshot, activate, markVerified, activeSnapshot, safePath } from './data-store.mjs'

const commit = 'a'.repeat(40)

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'fellestall-data-test-'))
  const engine = new PGlite()
  const db = {
    query: async (text, values = []) => (await engine.query(text, values)).rows,
    transaction: queries => engine.transaction(async tx => {
      const result = []
      for (const { text, values = [] } of queries) result.push((await tx.query(text, values)).rows)
      return result
    }),
  }
  t.after(async () => { await engine.close(); await rm(directory, { recursive: true, force: true }) })
  const source = join(directory, 'source')
  const files = { 'meta.json': { regnskap_aar: [2025] }, 'utgifter.json': { value: 123.45 }, 'inntekter.json': {}, 'befolkning.json': {}, 'kostra/index.json': {} }
  for (const [path, value] of Object.entries(files)) {
    await mkdir(dirname(join(source, path)), { recursive: true })
    await writeFile(join(source, path), JSON.stringify(value))
  }
  await migrate(db)
  return { db, directory, source }
}

test('full roundtrip bevarer binærfiler, store filer, Unicode og identiske versjoner', async t => {
  const { db, directory, source } = await setup(t)
  await writeFile(join(source, 'kildefil.pdf'), randomBytes(1600000))
  await writeFile(join(source, 'æøå.json'), '{"verdi":null,"anslag":false}')
  await migrate(db)
  const first = await importDirectory(db, source, commit)
  const second = await importDirectory(db, source, commit)
  assert.equal(first.id, second.id)
  assert.equal((await db.query('SELECT count(*) AS n FROM fellestall_data.snapshot'))[0].n, 1)
  const output = join(directory, 'export')
  const exported = await exportSnapshot(db, first.id, output)
  assert.equal(exported.id, first.id)
  for (const file of first.manifest) assert.deepEqual(await readFile(join(output, file.path)), await readFile(join(source, file.path)))
  await assert.rejects(exportSnapshot(db, first.id, output), /finnes allerede/)
})

test('korrupt innhold avvises uten å etterlate en eksport eller bytte aktiv versjon', async t => {
  const { db, directory, source } = await setup(t)
  const first = await importDirectory(db, source, commit)
  await exportSnapshot(db, first.id, join(directory, 'first'))
  await markVerified(db, first.id)
  await activate(db, first.id, null)
  await writeFile(join(source, 'utgifter.json'), '{"value":456}')
  const next = await importDirectory(db, source, commit)
  await assert.rejects(activate(db, next.id, first.id), /Aktivering avvist/)
  await db.query("UPDATE fellestall_data.chunk SET content=decode('00','hex') WHERE snapshot_id=$1 AND path='utgifter.json'", [next.id])
  await assert.rejects(exportSnapshot(db, next.id, join(directory, 'corrupt')))
  await assert.rejects(lstat(join(directory, 'corrupt')), { code: 'ENOENT' })
  assert.equal(await activeSnapshot(db), first.id)
})

test('ufullstendig import kan gjenopptas; gammel aktivering kan ikke overskrive ny', async t => {
  const { db, directory, source } = await setup(t)
  const a = await importDirectory(db, source, commit)
  await db.query("UPDATE fellestall_data.snapshot SET state='staging' WHERE id=$1", [a.id])
  await db.query("DELETE FROM fellestall_data.chunk WHERE snapshot_id=$1 AND path='utgifter.json'", [a.id])
  await assert.rejects(exportSnapshot(db, a.id, join(directory, 'incomplete')), /ikke ferdig/)
  await importDirectory(db, source, commit)
  await exportSnapshot(db, a.id, join(directory, 'a'))
  await markVerified(db, a.id)
  await activate(db, a.id, null)
  await writeFile(join(source, 'utgifter.json'), '{"value":789}')
  const b = await importDirectory(db, source, commit)
  await exportSnapshot(db, b.id, join(directory, 'b'))
  await markVerified(db, b.id)
  await activate(db, b.id, a.id)
  await assert.rejects(activate(db, a.id, a.id), /Aktivering avvist/)
  assert.equal(await activeSnapshot(db), b.id)
})

test('filstier, manglende grunnlag, symlinker og ugyldig JSON avvises', async t => {
  for (const path of ['../secret','/absolute','a/../b','a\\b','a//b','C:/file']) assert.throws(() => safePath(path))
  const { source } = await setup(t)
  await symlink('meta.json', join(source, 'link'))
  await assert.rejects(inspectDirectory(source), /Symlinker/)
  await rm(join(source, 'link'))
  await writeFile(join(source, 'meta.json'), 'broken JSON')
  await assert.rejects(inspectDirectory(source), SyntaxError)
  await rm(join(source, 'meta.json'))
  await assert.rejects(inspectDirectory(source), /mangler meta.json/)
})
