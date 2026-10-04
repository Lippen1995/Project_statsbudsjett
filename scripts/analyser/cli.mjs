import { readFileSync } from 'node:fs'
import { githubClient } from './github.mjs'
import { runWorkflow } from './workflow.mjs'
import { analysisSettings } from './config.mjs'
const settings = analysisSettings()
if (!settings.enabled) throw Error('Analyselevering er deaktivert')
if (['weekly', 'feedback'].includes(process.argv[2]))
  throw Error('AI-API-produksjon er deaktivert. Bruk planlagt oppgave og analysis-handoff.yml.')
const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  : null
await runWorkflow({
  command: process.argv[2],
  event,
  g: githubClient(),
  reviewer: settings.reviewer,
})
