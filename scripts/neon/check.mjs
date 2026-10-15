import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getSql } from './postgres.mjs'

try {
  // Normal datatilgang via den poolede adressen.
  const sql = getSql()
  const [ping] = await sql`SELECT 1::integer AS ok`
  assert.equal(ping.ok, 1)
  console.log('Postgres: tilkobling og SELECT OK')

  // Samme transaksjon for opprettelse, skriving og lesing; tabellen slettes
  // ved commit, og ingen eksisterende tabeller eller datapublisering berøres.
  const direct = getSql({ direct: true })
  const marker = { id: randomUUID(), purpose: 'fellestall-neon-check', amount: 123.45 }
  const result = await direct.transaction([
    direct`CREATE TEMP TABLE fellestall_connection_check (payload jsonb NOT NULL) ON COMMIT DROP`,
    direct`INSERT INTO fellestall_connection_check (payload) VALUES (${JSON.stringify(marker)}::jsonb)`,
    direct`SELECT payload FROM fellestall_connection_check`,
  ])
  assert.deepEqual(result[2][0].payload, marker)
  console.log('Postgres: JSON-skriving og lesing i midlertidig transaksjon OK')
  const [cleanup] = await direct`SELECT to_regclass('pg_temp.fellestall_connection_check') IS NULL AS clean`
  assert.equal(cleanup.clean, true)
  console.log('Postgres: ingen varige testdata opprettet')
} catch (error) {
  // Driverfeil kan inneholde forbindelsesdetaljer. Ikke logg feilobjekt/URL.
  if (error.message?.startsWith('Mangler DATABASE_URL')) console.error(error.message)
  else console.error('Postgres-kontroll feilet. Kontroller prosjekt, miljøvariabler og databasetilgang. Ingen forbindelsesdetaljer logges.')
  process.exitCode = 1
}
