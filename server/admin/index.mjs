import { createAuth, authPool } from './auth.mjs'
import { createGithub } from './sven.mjs'
import { createHandler } from './handler.mjs'
import { bootstrapAdmin } from './bootstrap.mjs'
import { migrateAdmin } from './migrations.mjs'
import { createHealthMonitor } from './health.mjs'

let handler
let initializing
async function initialize() {
  const pool = authPool()
  try {
    await bootstrapAdmin(pool, process.env.FELLESTALL_ADMIN_PASSWORD_HASH)
    await migrateAdmin(pool)
    const origin = process.env.BETTER_AUTH_URL || 'https://fellestall.no'
    const sql = { query: async (text, values) => (await pool.query(text, values)).rows }
    const github = createGithub()
    const health = createHealthMonitor({ sql, github, origin })
    return createHandler({ auth: createAuth(pool), sql, github, health, origin })
  } catch (error) {
    await pool.end()
    throw error
  }
}
export default async function admin(request) {
  if (!handler) {
    initializing ||= initialize().catch(error => { initializing = null; throw error })
    handler = await initializing
  }
  return handler(request)
}
