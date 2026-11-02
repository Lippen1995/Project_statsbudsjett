import test from 'node:test'
import assert from 'node:assert/strict'
import { feedbackStatuses, reportFeedbackStatus, parseFeedbackReceipt } from '../../scripts/analyser/feedback-status.mjs'
import { pendingFeedback } from '../../scripts/analyser/workflow.mjs'
const at = minute => `2026-11-02T09:${minute}:00Z`
const feedback = [{ id: 'comment-1', body: 'Bruk SSB', at: at('00') }, { id: 'review-1', at: at('03') }]
const user = { type: 'User', login: 'sven' }
function receipt(state, ids, minute, actor = user) {
  return { body: `<!-- fellestall-feedback-status:${JSON.stringify({state, ids})} -->`, created_at: at(minute), user: actor }
}
const status = (comments, processed = new Set(), permission = async () => true) => feedbackStatuses(comments, feedback, processed, permission)
test('sent, seen, working and delivered are tied to the exact feedback ID', async () => {
  assert.deepEqual((await status([])).map(f => f.status), ['submitted', 'submitted'])
  const seen = receipt('seen', ['comment-1'], '01')
  assert.equal((await status([seen]))[0].status, 'seen')
  const working = receipt('working', ['comment-1'], '02')
  const result = await status([working, seen, receipt('seen', ['comment-1'], '04')])
  assert.equal(result[0].status, 'working')
  assert.equal(result[0].statusAt, at('02'))
  assert.equal(result[1].status, 'submitted')
  const delivered = await status([working], new Set(['comment-1']))
  assert.equal(delivered[0].status, 'completed')
  assert.equal(delivered[0].processed, true)
})
test('failure and retry preserve status across later acknowledgements', async () => {
  const comments = [receipt('working', ['comment-1'], '01'), receipt('failed', ['comment-1'], '02')]
  assert.equal((await status(comments))[0].status, 'failed')
  comments.push(receipt('working', ['comment-1'], '04'))
  assert.equal((await status(comments))[0].status, 'working')
})
test('unauthorized, malformed, old and other-bot receipts cannot claim activity', async () => {
  const comments = [receipt('working', ['comment-1'], '01'), receipt('working', ['review-1'], '02')]
  assert.equal((await status(comments, new Set(), async () => false))[0].status, 'submitted')
  assert.equal((await status([comments[1]]))[1].status, 'submitted')
  assert.equal(parseFeedbackReceipt('<!-- fellestall-feedback-status:{"state":"completed","ids":["comment-1"]} -->'), null)
  const bot = receipt('working', ['comment-1'], '01', {type:'Bot',login:'unknown[bot]',id:1})
  assert.equal((await status([bot]))[0].status, 'submitted')
  bot.user = { type:'Bot', login:'github-actions[bot]', id:41898282 }
  assert.equal((await status([bot]))[0].status, 'working')
})
test('status receipts never become new revision requests', async () => {
  let written
  const g = { root: '/repos/owner/repo', api: async (path, options) => { written = options.body.body } }
  await reportFeedbackStatus(g, 1, [feedback[0]], 'seen')
  assert.deepEqual(parseFeedbackReceipt(written), { state:'seen', ids:['comment-1'] })
  const rows = await pendingFeedback({pages: async path => path.includes('/comments') ? [
    { id:1, user, created_at:at('00'), body:'Bruk SSB' },
    { id:2, user, created_at:at('01'), body:written },
  ] : [], permission:async () => true}, 1, {})
  assert.deepEqual(rows.map(f => f.id), ['comment-1'])
})
