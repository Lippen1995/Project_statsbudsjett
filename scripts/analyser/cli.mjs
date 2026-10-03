import { readFileSync } from 'node:fs'
import { githubClient } from './github.mjs'
import { runWorkflow } from './workflow.mjs'
const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  : null
await runWorkflow({
  command: process.argv[2],
  event,
  g: githubClient(),
  reviewer: process.env.ANALYSIS_REVIEWER,
})
