import { createAuth, authPool } from './auth.mjs'
import { createGithub } from './sven.mjs'
import { createHandler } from './handler.mjs'
import { bootstrapAdmin } from './bootstrap.mjs'
import { migrateAdmin } from './migrations.mjs'
import { createHealthMonitor } from './health.mjs'
import { createPlatform } from './platform.mjs'
import { mailService } from './mail.mjs'
import { waitUntil } from '@vercel/functions'

let handler
let initializing
async function initialize() {
  const pool = authPool()
  try {
    await bootstrapAdmin(pool, process.env.FELLESTALL_ADMIN_PASSWORD_HASH)
    await migrateAdmin(pool)
    const origin = process.env.BETTER_AUTH_URL || 'https://fellestall.no'
    const sql = {
      query: async (text, values) => (await pool.query(text, values)).rows,
    }
    const github = createGithub()
    const health = createHealthMonitor({ sql, github, origin })
    const mail = mailService({ sql })
    const auth = createAuth(pool, {
      ...(mail.ready
        ? { sendResetPassword: (value) => mail.reset(value) }
        : {}),
    })
    const secret = process.env.BETTER_AUTH_SECRET
    const platform = createPlatform({
      sql,
      pool,
      auth,
      github,
      health,
      mail,
      secret,
      origin,
    })
    return createHandler({
      auth,
      sql,
      github,
      health,
      origin,
      secret,
      platform,
      background: waitUntil,
    })
  } catch (error) {
    await pool.end()
    throw error
  }
}
export default async function admin(request) {
  if (!handler) {
    initializing ||= initialize().catch((error) => {
      initializing = null
      throw error
    })
    handler = await initializing
  }
  return handler(request)
}
