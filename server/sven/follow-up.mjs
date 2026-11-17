import { municipalMetrics } from './municipal-metrics.mjs'

const yearOnly = /^(?:(?:hva med|hvordan var det i|og|enn|i)\s+)?((?:19|20)\d{2})[?!.]*$/i

export function expandAccountQuestion(question, context) {
  const year = yearOnly.exec(question)?.[1]
  if (!year) return { question }
  if (context?.topic === 'state') {
    return { question: `Hva var statens samlede utgifter i statsregnskapet i ${year}?` }
  }
  if (context?.topic === 'oil') return { question: `Hva var oljepengebruken i ${year}?` }
  const names = context?.municipalities
  const metrics = context?.metrics ?? ['net_expenses']
  if (context?.topic === 'municipal' && Array.isArray(metrics) && metrics.length > 0 &&
      metrics.length <= Object.keys(municipalMetrics).length && metrics.every(metric => Object.hasOwn(municipalMetrics, metric)) &&
      Array.isArray(names) && names.length > 0 &&
      names.length <= 12 && names.every(name =>
        typeof name === 'string' && name.length <= 120 && /^[\p{L}\p{M} .()–-]+$/u.test(name))) {
    return { question: `Hva var ${metrics.map(metric => municipalMetrics[metric]).join(' og ')} i ${names.join(' og ')} i ${year}?` }
  }
  return { clarification: 'Hvilket regnskap gjelder spørsmålet? Oppgi ev. kommunenavn sammen med året.' }
}

export function accountContext(sources) {
  if (sources.some(source => source.id === 'dfø-statsregnskap-utgifter')) return { topic: 'state' }
  if (sources.some(source => source.id.startsWith('finansdep-oljepengebruk-'))) return { topic: 'oil' }
  const records = sources
    .filter(source => source.id.startsWith('kostra-'))
    .map(source => JSON.parse(source.text))
  if (!records.length) return null
  return {
    topic: 'municipal',
    municipalities: [...new Set(records.map(record => record.kommune))],
    metrics: [...new Set(records.map(record => record.metric))],
  }
}
