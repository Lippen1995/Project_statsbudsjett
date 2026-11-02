import { githubClient } from './github.mjs'
import { pendingFeedback, readReviewContext } from './workflow.mjs'
import { reportFeedbackStatus, feedbackStates } from './feedback-status.mjs'
const [number, state] = process.argv.slice(2)
if (!Number.isSafeInteger(Number(number)) || Number(number) < 1 || !feedbackStates.includes(state))
  throw Error('Bruk feedback-status-cli.mjs <gjennomgangsnummer> seen|working|failed')
const g = githubClient({ transport: 'gh' })
const { article } = await readReviewContext(g, { issue: { number: Number(number) } })
const feedback = await pendingFeedback(g, Number(number), article)
await reportFeedbackStatus(g, Number(number), feedback, state)
console.log(`Status ${state} registrert for ${feedback.length} ubehandlede innspill.`)
