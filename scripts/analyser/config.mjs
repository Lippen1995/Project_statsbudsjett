import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function analysisSettings({
  path = 'editorial/analysis-settings.json',
  reviewer = process.env.ANALYSIS_REVIEWER,
} = {}) {
  const settings = JSON.parse(readFileSync(path, 'utf8'))
  const activeReviewer = reviewer?.trim() || settings.reviewer
  if (
    settings.producer !== 'scheduled-task' ||
    typeof settings.enabled !== 'boolean' ||
    typeof activeReviewer !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(activeReviewer ?? '')
  )
    throw Error('Ugyldig oppsett for planlagt analyseproduksjon')
  return { ...settings, reviewer: activeReviewer }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const settings = analysisSettings()
  if (!settings.enabled)
    throw Error('Analyselevering er deaktivert i editorial/analysis-settings.json')
  if (process.env.GITHUB_ENV)
    appendFileSync(process.env.GITHUB_ENV, `ANALYSIS_REVIEWER=${settings.reviewer}\n`)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Oppsett for planlagt analyse\n\nProdusent: planlagt oppgave. Godkjenner: ${settings.reviewer}. Ingen AI-API-nøkkel kreves.\n\nGyldig botlevering, mobilvarsling og publisering må fortsatt prøves.\n`,
    )
  console.log(
    `Planlagt analyselevering er konfigurert. Godkjenner: ${settings.reviewer}. Ingen AI-API brukes.`,
  )
}
