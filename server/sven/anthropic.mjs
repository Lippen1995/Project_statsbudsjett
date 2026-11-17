import { claudeTransport, parseModelJSON } from './provider.mjs'

export function anthropicSven(options = {}) {
  const request = claudeTransport(options)
  return async input => parseModelJSON(await request(input))
}
