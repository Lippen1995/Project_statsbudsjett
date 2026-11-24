// Transport is shared by generation, research and review. Never retry a billable
// request implicitly: an interrupted response can still have incurred usage.
export function claudeTransport({ apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.SVEN_MODEL, fetchImpl = globalThis.fetch, onUsage = async () => {},
  timeoutMs = 120_000, cacheInstructions = false, effort } = {}) {
  if (!apiKey || !model) throw new Error('Sett ANTHROPIC_API_KEY og SVEN_MODEL for å kjøre Sven')
  return async ({ instructions, input, tools, maxTokens = 4096, signal, phase = 'answer' }) => {
    const started = Date.now()
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system: cacheInstructions
        ? [{ type: 'text', text: instructions, cache_control: { type: 'ephemeral' } }]
        : instructions, messages: [{ role: 'user', content: input }],
        max_tokens: maxTokens, ...(tools ? { tools } : {}), ...(effort ? { output_config: { effort } } : {}) }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`Claude API svarte HTTP ${response.status}`)
    const message = await response.json()
    const usage = { requestId: message.id ?? response.headers.get('request-id'), model: message.model ?? model,
      phase, elapsedMs: Date.now() - started, stopReason: message.stop_reason,
      input: message.usage?.input_tokens ?? null, output: message.usage?.output_tokens ?? null,
      cacheRead: message.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage?.cache_creation_input_tokens ?? 0,
      searches: message.usage?.server_tool_use?.web_search_requests ?? 0 }
    // Record even an invalid/truncated answer; it was still billed.
    await onUsage(usage)
    // Tool turns can already contain usable, attributed evidence even if the
    // provider stopped before writing its own final prose.
    const toolPhase = phase === 'research' || phase === 'direct-fetch'
    const partial = ['pause_turn', 'max_tokens'].includes(message.stop_reason)
    if (message.stop_reason !== 'end_turn' && !(toolPhase && partial)) {
      throw Object.assign(new Error('Claude fullførte ikke analysen'), {
        code: 'provider-incomplete', stopReason: message.stop_reason, usage: message.usage,
      })
    }
    return { ...message, _svenReceivedAt: new Date().toISOString() }
  }
}

export function parseModelJSON(message) {
  const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('')
  return JSON.parse(text.replace(/^\s*```(?:json)?\s*\n/, '').replace(/\n```\s*$/, ''))
}
