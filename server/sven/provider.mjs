// Transport is shared by generation, research and review. Never retry a billable
// request implicitly: an interrupted response can still have incurred usage.
export function claudeTransport({ apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.SVEN_MODEL, fetchImpl = globalThis.fetch, onUsage = async () => {},
  timeoutMs = 120_000, cacheInstructions = false, effort, stream = false } = {}) {
  if (!apiKey || !model) throw new Error('Sett ANTHROPIC_API_KEY og SVEN_MODEL for å kjøre Sven')
  return async ({ instructions, input, tools, maxTokens = 4096, signal, phase = 'answer' }) => {
    const started = Date.now()
    const timeout = timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs)
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system: cacheInstructions
        ? [{ type: 'text', text: instructions, cache_control: { type: 'ephemeral' } }]
        : instructions, messages: [{ role: 'user', content: input }],
        max_tokens: maxTokens, ...(stream ? { stream: true } : {}), ...(tools ? { tools } : {}), ...(effort ? { output_config: { effort } } : {}) }),
      signal: signal && timeout ? AbortSignal.any([signal, timeout]) : signal ?? timeout,
    })
    if (!response.ok) throw new Error(`Claude API svarte HTTP ${response.status}`)
    let message
    let streamError
    try {
      message = response.headers.get('content-type')?.startsWith('text/event-stream')
        ? await readMessageStream(response.body) : await response.json()
    } catch (error) {
      if (!error?.usage) throw error
      streamError = error
      message = { usage: error.usage, stop_reason: 'stream_interrupted' }
    }
    const usage = { requestId: message.id ?? response.headers.get('request-id'), model: message.model ?? model,
      phase, elapsedMs: Date.now() - started, stopReason: message.stop_reason, maxTokens,
      input: message.usage?.input_tokens ?? null, output: message.usage?.output_tokens ?? null,
      cacheRead: message.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage?.cache_creation_input_tokens ?? 0,
      searches: message.usage?.server_tool_use?.web_search_requests ?? 0 }
    // Record even an invalid/truncated answer; it was still billed.
    await onUsage(usage)
    if (streamError) throw streamError
    // Tool turns can already contain usable, attributed evidence even if the
    // provider stopped before writing its own final prose.
    const toolPhase = ['research', 'research-followup', 'direct-fetch'].includes(phase)
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

async function* messageEvents(body) {
  let buffer = ''
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop()
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart()).join('\n')
      if (data) yield JSON.parse(data)
    }
  }
}

async function readMessageStream(body) {
  let message
  try {
    for await (const event of messageEvents(body)) {
      if (event.type === 'error') {
        const type = event.error?.type
        const status = type === 'rate_limit_error' ? 429 : type === 'overloaded_error' ? 529 : null
        throw new Error(status ? `Claude API svarte HTTP ${status}` : 'Claude avbrøt responsstrømmen')
      }
      if (event.type === 'message_start') {
        message = { ...event.message, content: [], usage: { ...event.message.usage } }
        continue
      }
      if (!message) continue
      if (event.type === 'content_block_start') {
        const block = event.content_block
        // Only the public text, citations and source results are used later.
        // Reasoning and tool argument streams need not enter the checkpoint.
        if (['text', 'web_search_tool_result', 'web_fetch_tool_result'].includes(block.type)) {
          message.content[event.index] = block
        }
      } else if (event.type === 'content_block_delta') {
        const block = message.content[event.index]
        if (block?.type !== 'text') continue
        if (event.delta.type === 'text_delta') block.text += event.delta.text
        if (event.delta.type === 'citations_delta') (block.citations ??= []).push(event.delta.citation)
      } else if (event.type === 'message_delta') {
        Object.assign(message, event.delta)
        const { server_tool_use: toolUsage, ...usage } = event.usage ?? {}
        Object.assign(message.usage, usage)
        if (toolUsage) message.usage.server_tool_use = { ...message.usage.server_tool_use, ...toolUsage }
      } else if (event.type === 'message_stop') {
        return { ...message, content: message.content.filter(Boolean) }
      }
    }
    throw new Error('Claude avsluttet responsstrømmen uten et ferdig svar')
  } catch (error) {
    throw Object.assign(error, { usage: message?.usage })
  }
}
