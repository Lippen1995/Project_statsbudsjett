import { readdirSync, readFileSync } from 'node:fs'

const feedbackDirectory = new URL('../../editorial/learning/feedback/', import.meta.url)
const normalize = (text) =>
  typeof text === 'string' ? (text.toLowerCase().normalize('NFC').match(/\p{L}+/gu) ?? []).join(' ') : ''

export function selectEditorialExamples(packet, notes) {
  const article = packet.article
  const report = article?.report
  const context = [
    packet.question,
    packet.pipeline?.topic,
    packet.pipeline?.instructions,
    article?.topic,
    article?.copy?.title,
    report?.scopeName,
    report?.question,
    ...Object.values(report?.facts ?? {}).map((fact) => fact?.label),
  ].map(normalize).filter(Boolean)

  return notes.flatMap((note) => {
    const example = note?.example
    const id = note?.feedbackSource?.id
    if (note?.status !== 'applied' || typeof id !== 'string' || !id || !Array.isArray(example?.topics) ||
        typeof example.description !== 'string' || !example.description.trim() ||
        example.description.length > 600) return []

    const topics = new Set(example.topics.map(normalize).filter(Boolean))
    const matches = [...topics].filter((topic) =>
      context.some((line) => ` ${line} `.includes(` ${topic} `)),
    ).length
    return matches ? [{ id, description: example.description, matches }] : []
  }).sort((a, b) => b.matches - a.matches || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map(({ id, description }) => ({ id, description }))
}

export function withEditorialExamples(packet) {
  if (!packet.question && !packet.article && packet.pipelineState !== 'research-required') return packet
  const notes = readdirSync(feedbackDirectory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(new URL(encodeURIComponent(name), feedbackDirectory), 'utf8'))]
      } catch {
        console.warn(`Hoppet over uleselig læringsnotat: ${name}`)
        return []
      }
    })
  const editorialExamples = selectEditorialExamples(packet, notes)
  return editorialExamples.length ? { ...packet, editorialExamples } : packet
}
