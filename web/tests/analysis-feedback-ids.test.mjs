import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingFeedback } from '../../scripts/analyser/workflow.mjs'
const user = { type: 'User', login: 'reviewer' }
const g = {
  permission: async () => true,
  pages: async (path) =>
    path.includes('/comments')
      ? [1, 2].map((id) => ({
          id,
          user,
          created_at: '2026-10-05T08:00:00Z',
          body: 'Endringsønske',
        }))
      : [
          {
            id: 1,
            user,
            state: 'COMMENTED',
            submitted_at: '2026-10-05T08:01:00Z',
            body: 'Review-ønske',
          },
        ],
}
test('numeric processed issue-comment IDs remain processed without hiding new comments or reviews', async () => {
  const pending = await pendingFeedback(g, 14, { processedFeedbackIds: [1] })
  assert.deepEqual(
    pending.map((p) => p.id),
    ['comment-2', 'review-1'],
  )
})
test('namespaced IDs remain supported and string numbers do not suppress feedback', async () => {
  assert.deepEqual(
    (await pendingFeedback(g, 14, { processedFeedbackIds: ['comment-1', 'review-1'] })).map(
      (p) => p.id,
    ),
    ['comment-2'],
  )
  assert.equal((await pendingFeedback(g, 14, { processedFeedbackIds: ['1'] })).length, 3)
})
