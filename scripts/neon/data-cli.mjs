import { parseArgs } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { getSql } from './postgres.mjs'
import { migrate, importDirectory, exportSnapshot, markVerified, activate, activeSnapshot } from './data-store.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  source: { type: 'string' }, output: { type: 'string' }, 'source-commit': { type: 'string' },
  snapshot: { type: 'string' }, activate: { type: 'boolean', default: false }, report: { type: 'string' },
  'expected-current': { type: 'string' },
} })

try {
  const sql = getSql({ direct: true })
  const db = {
    query: (text, values = []) => sql.query(text, values),
    transaction: statements => sql.transaction(statements.map(({ text, values = [] }) => sql.query(text, values))),
  }
  let result
  if (positionals[0] === 'roundtrip') {
    if (!values.source || !values.output || !values['source-commit']) throw new Error('source, output og source-commit kreves')
    await migrate(db)
    const previous = await activeSnapshot(db)
    const imported = await importDirectory(db, values.source, values['source-commit'], console.log)
    const exported = await exportSnapshot(db, imported.id, values.output, console.log)
    await markVerified(db, imported.id)
    if (values.activate) await activate(db, imported.id, previous)
    result = { snapshot: imported.id, files: exported.manifest.length, bytes: exported.totalBytes, activated: values.activate, previous }
  } else if (positionals[0] === 'activate') {
    const report = values.report ? JSON.parse(await readFile(values.report, 'utf8')) : null
    const id = values.snapshot || report?.snapshot
    const expected = report ? report.previous : values['expected-current'] === 'none' ? null : values['expected-current']
    if (!id || expected === undefined) throw new Error('Aktivering krever snapshot og expected-current, eller en roundtrip-rapport')
    await activate(db, id, expected)
    result = report ? { ...report, activated: true } : { snapshot: id, previous: expected, activated: true }
  } else if (positionals[0] === 'export') {
    if (!values.snapshot || !values.output) throw new Error('snapshot og output kreves')
    const exported = await exportSnapshot(db, values.snapshot, values.output, console.log)
    result = { snapshot: exported.id, files: exported.manifest.length, bytes: exported.totalBytes }
  } else throw new Error('Bruk roundtrip, export eller activate')
  if (values.report) await writeFile(values.report, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} catch (error) {
  // Verken driverfeil, forbindelsesstrenger eller hemmeligheter logges.
  console.error(`Datamigrering stoppet (${error.code || error.name || 'feil'}). Ingen ny versjon skal publiseres fra denne kjøringen.`)
  if (!('severity' in error) && !('sourceError' in error) && !/postgres|neon\.tech|password|https?:\/\//i.test(error.message || '')) console.error(error.message)
  process.exitCode = 1
}
