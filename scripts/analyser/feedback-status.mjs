// Status receipts are separate from editorial feedback and never become new requests.
export const feedbackStates = ['seen', 'working', 'failed']
const marker = /^<!-- fellestall-feedback-status:(\{[^\n]+\}) -->$/
export function parseFeedbackReceipt(body) {
  const match = marker.exec(body?.trim() || '')
  if (!match) return null
  try {
    const value = JSON.parse(match[1])
    if (!feedbackStates.includes(value.state) || !Array.isArray(value.ids) ||
        !value.ids.length || value.ids.some(id => !/^(comment|review)-[1-9]\d*$/.test(id))) return null
    return { state: value.state, ids: value.ids }
  } catch { return null }
}
export function isFeedbackReceipt(body) {
  return body?.trim().startsWith('<!-- fellestall-feedback-status:') || false
}
export async function reportFeedbackStatus(g, number, feedback, state) {
  if (!feedback.length) return
  if (!feedbackStates.includes(state)) throw Error('Ugyldig revisjonsstatus')
  const body = `<!-- fellestall-feedback-status:${JSON.stringify({ state, ids: feedback.map(f => f.id) })} -->`
  if (!parseFeedbackReceipt(body)) throw Error('Ugyldige kommentar-ID-er')
  await g.api(`${g.root}/issues/${number}/comments`, { method: 'POST', body: { body } })
}
export async function feedbackStatuses(comments, feedback, processed, canWrite) {
  const receipts = []
  const trusted = new Map()
  for (const c of comments) {
    const receipt = parseFeedbackReceipt(c.body)
    if (!receipt) continue
    const user = c.user
    // Only GitHub's built-in Actions identity or a repository writer can report activity.
    const actions = user?.login === 'github-actions[bot]' && user?.id === 41898282
    if (!actions) {
      if (!user || user.type === 'Bot') continue
      if (!trusted.has(user.login)) trusted.set(user.login, await canWrite(user.login))
      if (!trusted.get(user.login)) continue
    }
    receipts.push({ ...receipt, at: c.created_at })
  }
  receipts.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return feedback.map(f => {
    const events = receipts.filter(r => r.ids.includes(f.id) && Date.parse(r.at) >= Date.parse(f.at))
    // A later acknowledgement must not regress work already started.
    let latest
    for (const event of events) {
      if (event.state !== 'seen' || !latest) latest = event
    }
    return { ...f, processed: processed.has(f.id), status: processed.has(f.id) ? 'completed' : latest?.state || 'submitted',
      statusAt: processed.has(f.id) ? null : latest?.at || f.at }
  })
}
