import { createAuth, authPool } from './auth.mjs'
import { createGithub } from './sven.mjs'
import { createHandler } from './handler.mjs'

let handler
export default async function admin(request) {
  if (!handler) {
    const pool = authPool()
    const origin = process.env.BETTER_AUTH_URL || 'https://fellestall.no'
    handler = createHandler({ auth: createAuth(pool), sql: { query: async (text, values) => (await pool.query(text, values)).rows }, github: createGithub(), origin })
  }
  return handler(request)
}
