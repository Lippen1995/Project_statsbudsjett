import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const kostraRoot = join(webRoot, 'public', 'data', 'kostra')

test('alle kommuner og fylker i KOSTRA-indeksen har publiserbare detaljdata', () => {
  const index = JSON.parse(readFileSync(join(kostraRoot, 'index.json'), 'utf8'))
  const indexedEntities = [...(index.entities ?? []), ...(index.historicalEntities ?? [])]
    .filter(({ kind, code }) => ['county', 'municipality'].includes(kind) && code)

  const expectedFiles = new Set(indexedEntities.map(({ kind, code }) => `${kind}-${code}.json`))
  const entitiesRoot = join(kostraRoot, 'entities')
  const publishedFiles = new Set(
    readdirSync(entitiesRoot).filter((fileName) => fileName.endsWith('.json')),
  )

  const missingFiles = [...expectedFiles].filter((fileName) => !publishedFiles.has(fileName))
  const unknownFiles = [...publishedFiles].filter((fileName) => !expectedFiles.has(fileName))

  assert.equal(expectedFiles.size, 872)
  assert.deepEqual(missingFiles, [], `Mangler detaljfiler: ${missingFiles.join(', ')}`)
  assert.deepEqual(unknownFiles, [], `Ukjente detaljfiler: ${unknownFiles.join(', ')}`)

  for (const fileName of ['county-1100.json', 'municipality-1103.json']) {
    const path = join(entitiesRoot, fileName)
    assert.equal(existsSync(path), true, `${fileName} skal finnes`)
    const detail = JSON.parse(readFileSync(path, 'utf8'))
    assert.ok(detail.statementData?.result, `${fileName} skal ha resultatregnskap`)
    assert.ok(detail.statementData?.balance, `${fileName} skal ha balanse`)
    if (fileName.startsWith('municipality-')) {
      assert.ok(detail.stateFlows, `${fileName} skal ha kontantstrøm`)
      assert.ok(detail.blockGrantCalculation, `${fileName} skal ha rammetilskuddsberegning`)
    }
  }
})
