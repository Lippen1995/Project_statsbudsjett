const yearOnly = /^(?:(?:hva med|hvordan var det i|og|enn|i)\s+)?((?:19|20)\d{2})[?!.]*$/i

export function expandAccountQuestion(question, context) {
  const year = yearOnly.exec(question)?.[1]
  if (!year) return { question }
  if (context?.topic === 'state') {
    return { question: `Hva var statens samlede utgifter i statsregnskapet i ${year}?` }
  }
  const names = context?.municipalities
  if (context?.topic === 'municipal' && Array.isArray(names) && names.length > 0 &&
      names.length <= 12 && names.every(name =>
        typeof name === 'string' && name.length <= 120 && /^[\p{L}\p{M} .()–-]+$/u.test(name))) {
    return { question: `Hva var netto driftsutgifter i ${names.join(' og ')} i ${year}?` }
  }
  return { clarification: 'Hvilket regnskap gjelder spørsmålet? Oppgi ev. kommunenavn sammen med året.' }
}

export function accountContext(sources) {
  if (sources.some(source => source.id === 'dfø-statsregnskap-utgifter')) return { topic: 'state' }
  const municipalities = sources
    .filter(source => source.id.startsWith('kostra-net-expenses-'))
    .map(source => JSON.parse(source.text).kommune)
  return municipalities.length ? { topic: 'municipal', municipalities } : null
}
