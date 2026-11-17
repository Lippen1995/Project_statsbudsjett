export function anthropicSven({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.SVEN_MODEL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey || !model) throw new Error('Sett ANTHROPIC_API_KEY og SVEN_MODEL for å kjøre Sven')
  return async ({ instructions, input }) => {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: instructions,
        messages: [{ role: 'user', content: input }],
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`Claude API svarte HTTP ${response.status}`)
    const message = await response.json()
    if (message.stop_reason !== 'end_turn') throw new Error('Claude fullførte ikke analysen')
    return JSON.parse(message.content.filter(block => block.type === 'text').map(block => block.text).join(''))
  }
}
