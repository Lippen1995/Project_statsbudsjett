import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'

// Private, single-machine research/test workspace. Production customer storage
// must use the separately authenticated Postgres service, not this operator tool.
export function openWorkspace(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  if (path !== ':memory:') chmodSync(path, 0o600)
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, owner TEXT NOT NULL, brief TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', result TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS steps(job_id TEXT NOT NULL REFERENCES jobs(id), phase TEXT NOT NULL,
      input_hash TEXT NOT NULL, status TEXT NOT NULL, response TEXT, PRIMARY KEY(job_id,phase));
    CREATE TABLE IF NOT EXISTS usage(id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
      request_id TEXT, data TEXT NOT NULL, UNIQUE(job_id,request_id));
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), data TEXT NOT NULL);`)
  const now = () => new Date().toISOString()
  const owned = (owner, id) => {
    const row = db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').get(id, owner)
    if (!row) throw new Error('Analysen finnes ikke')
    return row
  }
  const view = row => ({ ...row, brief: JSON.parse(row.brief), result: row.result ? JSON.parse(row.result) : null })
  return {
    close: () => db.close(),
    create(owner, brief) {
      if (!owner || !brief?.question) throw new Error('Eier og oppdrag mangler')
      const id = randomUUID(), date = now()
      db.prepare('INSERT INTO jobs(id,owner,brief,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, owner, JSON.stringify(brief), date, date)
      return id
    },
    get: (owner, id) => view(owned(owner,id)),
    list: owner => db.prepare('SELECT * FROM jobs WHERE owner=? ORDER BY created_at DESC').all(owner).map(view),
    cancel(owner,id) {
      owned(owner,id)
      db.prepare("UPDATE jobs SET status='cancelled',updated_at=? WHERE id=? AND status NOT IN ('completed','needs-review')").run(now(),id)
    },
    // Explicit operator recovery. Never silently reissue a request whose billing
    // and response are unknown after a process/network failure.
    recover(owner,id) {
      owned(owner,id)
      db.prepare("DELETE FROM steps WHERE job_id=? AND status='running'").run(id)
      db.prepare("UPDATE jobs SET status='pending',error=NULL,updated_at=? WHERE id=? AND status NOT IN ('completed','needs-review')").run(now(),id)
    },
    usage(owner,id) {
      owned(owner,id)
      return db.prepare('SELECT data FROM usage WHERE job_id=? ORDER BY id').all(id).map(row => JSON.parse(row.data))
    },
    async execute(owner,id, request, run) {
      let job = owned(owner,id)
      if (['completed','needs-review'].includes(job.status)) return JSON.parse(job.result)
      if (job.status === 'cancelled') throw new Error('Analysen er stoppet')
      if (!db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=? AND status IN ('pending','failed')").run(now(),id).changes) throw new Error('Analysen kjører eller må gjenopprettes eksplisitt')
      const check = () => { if (owned(owner,id).status === 'cancelled') throw new Error('Analysen er stoppet') }
      const onUsage = async usage => {
        db.prepare('INSERT OR IGNORE INTO usage(job_id,request_id,data) VALUES(?,?,?)').run(id,usage.requestId || null,JSON.stringify(usage))
      }
      const checkpoint = async event => {
        check()
        db.prepare('INSERT INTO events(job_id,data) VALUES(?,?)').run(id,JSON.stringify(event))
      }
      let calls = 0
      const cachedRequest = async input => {
        check()
        const digest = createHash('sha256').update(JSON.stringify({ ...input, signal: undefined })).digest('hex')
        const step = db.prepare('SELECT * FROM steps WHERE job_id=? AND phase=?').get(id,input.phase)
        if (step) {
          if (step.input_hash !== digest) throw new Error('Oppdrag eller modellinput er endret. Opprett en ny analyseversjon.')
          if (step.status === 'completed') return JSON.parse(step.response)
          throw new Error('Et modellkall har uavklart resultat. Kontroller forbruk før eksplisitt gjenoppretting.')
        }
        if (++calls > 6) throw new Error('Maksimalt antall modellkall er nådd')
        db.prepare("INSERT INTO steps(job_id,phase,input_hash,status) VALUES(?,?,?,'running')").run(id,input.phase,digest)
        const message = await request(input,onUsage)
        db.prepare("UPDATE steps SET status='completed',response=? WHERE job_id=? AND phase=?").run(JSON.stringify(message),id,input.phase)
        check()
        return message
      }
      try {
        const result = await run({ ...JSON.parse(job.brief), request: cachedRequest, checkpoint })
        check()
        db.prepare('UPDATE jobs SET status=?,result=?,updated_at=? WHERE id=?').run(result.status === 'needs-review' ? 'needs-review' : 'completed',JSON.stringify(result),now(),id)
        return result
      } catch (error) {
        db.prepare("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=? AND status='running'").run(error.message,now(),id)
        throw error
      }
    },
  }
}

export function usageSummary(rows, capacity = null) {
  const known = rows.every(row => Number.isSafeInteger(row.input) && row.input >= 0 && Number.isSafeInteger(row.output) && row.output >= 0)
  const tokens = known ? rows.reduce((sum,row) => sum + row.input + row.output + row.cacheRead + row.cacheWrite,0) : null
  return { calls: rows.length, tokens, searches: rows.reduce((sum,row) => sum + row.searches,0),
    elapsedMs: rows.reduce((sum,row) => sum + row.elapsedMs,0),
    remainingPercent: tokens !== null && Number.isSafeInteger(capacity) && capacity > 0 ? Math.max(0, Math.floor(100 * (capacity-tokens)/capacity)) : null }
}
