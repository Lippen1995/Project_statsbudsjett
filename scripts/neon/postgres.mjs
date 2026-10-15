// Kun for import-/eksportverktøy på serveren. Skal aldri importeres i web/src.
import { neon } from '@neondatabase/serverless'

export function getSql({ direct = false } = {}) {
  const variable = direct ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'
  const connection = process.env[variable]
  if (!connection) throw new Error(`Mangler ${variable}. Kjør neon deploy etter innlogging.`)
  return neon(connection)
}
