import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir, lstat, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const CHUNK_SIZE = 262144
const hash = content => createHash('sha256').update(content).digest('hex')
const manifestHash = manifest => hash(JSON.stringify(manifest.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))))
const comparePath = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))
const required = ['meta.json', 'utgifter.json', 'inntekter.json', 'befolkning.json', 'kostra/index.json']

export function safePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..') || /^[A-Za-z]:/.test(path)) {
    throw new Error('Ugyldig filsti i dataversjonen')
  }
  return path
}

function validateManifest(manifest, id) {
  if (!Array.isArray(manifest) || !manifest.length || manifestHash(manifest) !== id) throw new Error('Ugyldig manifest eller versjonshash')
  const paths = new Set()
  let previous = ''
  for (const file of manifest) {
    safePath(file.path)
    if (paths.has(file.path) || comparePath(file.path,previous) <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error('Ugyldig filmetadata')
    paths.add(file.path)
    previous = file.path
  }
  for (const path of required) if (!paths.has(path)) throw new Error(`Dataversjonen mangler ${path}`)
}

async function walk(root, directory = '') {
  const result = []
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name
    safePath(path)
    if (entry.isSymbolicLink()) throw new Error('Symlinker er ikke tillatt i datagrunnlaget')
    if (entry.isDirectory()) result.push(...await walk(root, path))
    else if (entry.isFile()) result.push(path)
    else throw new Error('Datagrunnlaget inneholder en filtype som ikke støttes')
  }
  return result.sort(comparePath)
}

export async function inspectDirectory(root) {
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Datamappen kan ikke være en symlink')
  const manifest = []
  for (const path of await walk(root)) {
    const bytes = await readFile(resolve(root, path))
    if (path.endsWith('.json')) JSON.parse(bytes.toString('utf8'))
    manifest.push({ path, bytes: bytes.length, sha256: hash(bytes) })
  }
  const id = manifestHash(manifest)
  validateManifest(manifest, id)
  const meta = JSON.parse(await readFile(resolve(root, 'meta.json'), 'utf8'))
  if (!Array.isArray(meta.regnskap_aar) || !meta.regnskap_aar.length) throw new Error('Metadata mangler regnskapsår')
  return { id, manifest, totalBytes: manifest.reduce((sum, file) => sum + file.bytes, 0) }
}

export async function migrate(db) {
  await db.transaction([
    { text: 'CREATE SCHEMA IF NOT EXISTS fellestall_data' },
    { text: 'CREATE TABLE IF NOT EXISTS fellestall_data.migration (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())' },
  ])
  const name = '001-data-snapshots.sql'
  const content = await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8')
  const checksum = hash(content)
  const existing = await db.query('SELECT sha256 FROM fellestall_data.migration WHERE name = $1', [name])
  if (existing.length) {
    if (existing[0].sha256 !== checksum) throw new Error('En allerede kjørt migrering er endret')
    return
  }
  const statements = content.split(';').map(text => text.trim()).filter(Boolean).map(text => ({ text }))
  await db.transaction([...statements, { text: 'INSERT INTO fellestall_data.migration(name, sha256) VALUES ($1, $2)', values: [name, checksum] }])
}

export async function importDirectory(db, root, sourceCommit, progress = () => {}) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceCommit)) throw new Error('Kildecommit må være en Git-hash')
  const snapshot = await inspectDirectory(root)
  const { id, manifest, totalBytes } = snapshot
  const existing = await db.query('SELECT state, manifest FROM fellestall_data.snapshot WHERE id=$1', [id])
  if (existing.length && existing[0].state !== 'staging') return snapshot
  await db.query(`INSERT INTO fellestall_data.snapshot(id, source_commit, manifest, file_count, total_bytes)
    VALUES ($1,$2,$3::jsonb,$4,$5) ON CONFLICT (id) DO NOTHING`, [id, sourceCommit, JSON.stringify(manifest), manifest.length, totalBytes])
  let batch = [], fileBatch = [], batchSize = 0
  async function flush() {
    if (!batch.length) return
    await db.transaction([{ text: `INSERT INTO fellestall_data.file(snapshot_id,path,sha256,bytes,compressed_bytes,chunks)
      SELECT $1,x.path,x.sha256,x.bytes,x.compressed_bytes,x.chunks FROM jsonb_to_recordset($2::jsonb)
        AS x(path text,sha256 text,bytes bigint,compressed_bytes bigint,chunks integer)
      ON CONFLICT (snapshot_id,path) DO NOTHING`, values: [id,JSON.stringify(fileBatch)] },
    { text: `INSERT INTO fellestall_data.chunk(snapshot_id,path,chunk_index,content)
      SELECT $1, x.path, x.chunk_index, decode(x.content,'base64')
      FROM jsonb_to_recordset($2::jsonb) AS x(path text,chunk_index integer,content text)
      ON CONFLICT (snapshot_id,path,chunk_index) DO NOTHING`, values: [id, JSON.stringify(batch)] }])
    batch = []; fileBatch = []; batchSize = 0
  }
  for (let index = 0; index < manifest.length; index++) {
    const file = manifest[index]
    const bytes = await readFile(resolve(root, file.path))
    if (hash(bytes) !== file.sha256) throw new Error('Datagrunnlaget ble endret under import')
    const compressed = gzipSync(bytes, { level: 6 })
    const chunks = Math.ceil(compressed.length / CHUNK_SIZE)
    fileBatch.push({ ...file, compressed_bytes: compressed.length, chunks })
    for (let i = 0; i < chunks; i++) {
      const content = compressed.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).toString('base64')
      if (batchSize + content.length > 1048576) await flush()
      batch.push({ path: file.path, chunk_index: i, content }); batchSize += content.length
    }
    if ((index + 1) % 100 === 0) progress(`Importert ${index + 1}/${manifest.length} filer`)
  }
  await flush()
  const invalid = await db.query(`SELECT f.path FROM fellestall_data.file f
    LEFT JOIN fellestall_data.chunk c USING (snapshot_id,path)
    WHERE f.snapshot_id=$1 GROUP BY f.path,f.chunks,f.compressed_bytes
    HAVING count(c.chunk_index)<>f.chunks OR sum(octet_length(c.content))<>f.compressed_bytes
      OR min(c.chunk_index)<>0 OR max(c.chunk_index)<>f.chunks-1`, [id])
  const [count] = await db.query('SELECT count(*) AS n FROM fellestall_data.file WHERE snapshot_id=$1', [id])
  if (invalid.length || Number(count.n) !== manifest.length) throw new Error('Importen er ufullstendig')
  await db.query("UPDATE fellestall_data.snapshot SET state='complete' WHERE id=$1 AND state='staging'", [id])
  return snapshot
}

export async function exportSnapshot(db, id, destination, progress = () => {}) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Ugyldig dataversjon')
  const [snapshot] = await db.query('SELECT state,manifest FROM fellestall_data.snapshot WHERE id=$1', [id])
  if (!snapshot || snapshot.state === 'staging') throw new Error('Dataversjonen er ikke ferdig importert')
  validateManifest(snapshot.manifest, id)
  const target = resolve(destination)
  try { await lstat(target); throw new Error('Eksportmappen finnes allerede') } catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp-${randomUUID()}`
  await mkdir(temporary)
  let fileIndex = 0, chunks = [], nextChunk = 0, lastPath = '', lastIndex = -1
  try {
    while (true) {
      const rows = await db.query(`SELECT c.path,c.chunk_index,encode(c.content,'base64') AS content,f.chunks
        FROM fellestall_data.chunk c JOIN fellestall_data.file f USING(snapshot_id,path)
        WHERE c.snapshot_id=$1 AND (c.path COLLATE "C",c.chunk_index)>($2 COLLATE "C",$3)
        ORDER BY c.path COLLATE "C",c.chunk_index LIMIT 16`, [id,lastPath,lastIndex])
      if (!rows.length) break
      for (const row of rows) {
        const file = snapshot.manifest[fileIndex]
        if (!file || row.path !== file.path || row.chunk_index !== nextChunk) throw new Error('Manglende eller uventet fildel')
        chunks.push(Buffer.from(row.content, 'base64')); nextChunk++
        if (nextChunk === row.chunks) {
          const bytes = gunzipSync(Buffer.concat(chunks), { maxOutputLength: Math.max(1,file.bytes) })
          if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Integritetsfeil i ${file.path}`)
          const path = resolve(temporary, safePath(file.path))
          if (!path.startsWith(temporary + sep)) throw new Error('Ugyldig eksportsti')
          await mkdir(dirname(path), { recursive: true })
          await writeFile(path, bytes, { flag: 'wx' })
          chunks = []; nextChunk = 0; fileIndex++
          if (fileIndex % 100 === 0) progress(`Kontrollert ${fileIndex}/${snapshot.manifest.length} filer`)
        }
        lastPath = row.path; lastIndex = row.chunk_index
      }
    }
    if (fileIndex !== snapshot.manifest.length || chunks.length) throw new Error('Eksporten er ufullstendig')
    const exported = await inspectDirectory(temporary)
    if (exported.id !== id) throw new Error('Eksportens manifest stemmer ikke')
    await rename(temporary, target)
    return exported
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

export async function markVerified(db, id) {
  const rows = await db.query("UPDATE fellestall_data.snapshot SET state='verified' WHERE id=$1 AND state IN ('complete','verified') RETURNING id", [id])
  if (!rows.length) throw new Error('Dataversjonen kan ikke godkjennes')
}

export async function activeSnapshot(db) {
  const rows = await db.query("SELECT snapshot_id FROM fellestall_data.active_snapshot WHERE slot='production'")
  return rows[0]?.snapshot_id ?? null
}

export async function activate(db, id, expectedPrevious) {
  const rows = await db.query(`INSERT INTO fellestall_data.active_snapshot(slot,snapshot_id)
    SELECT 'production',id FROM fellestall_data.snapshot WHERE id=$1 AND state='verified'
    ON CONFLICT (slot) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id,activated_at=now()
      WHERE fellestall_data.active_snapshot.snapshot_id=$2
    RETURNING snapshot_id`, [id,expectedPrevious])
  if (!rows.length) throw new Error('Aktivering avvist: versjonen er ikke godkjent, eller en annen publisering har byttet aktiv versjon')
}
