import { createHash } from 'node:crypto'

// The candidate cannot replace the system method, publication rules, source
// validation, evaluator, test data, thresholds, models or credential settings.
export function candidateSettings(value) {
  if (!value || Object.keys(value).some(k => !['maxSearches','responseDensity','editorialSkills'].includes(k)) ||
    !Number.isInteger(value.maxSearches) || value.maxSearches < 3 || value.maxSearches > 10 ||
    !['concise','balanced','detailed'].includes(value.responseDensity)) throw new Error('Ugyldig forbedringskandidat')
  if (value.editorialSkills !== undefined && (!value.editorialSkills || typeof value.editorialSkills !== 'object' || Array.isArray(value.editorialSkills) ||
    Object.keys(value.editorialSkills).length > 3 || Object.entries(value.editorialSkills).some(([key,hash]) => !['language','storytelling','visual'].includes(key) || !/^[a-f0-9]{64}$/.test(hash)))) throw new Error('Ugyldig redaksjonell skill-kandidat')
  return {maxSearches:value.maxSearches,responseDensity:value.responseDensity,
    ...(value.editorialSkills ? {editorialSkills:Object.fromEntries(Object.entries(value.editorialSkills).sort(([a],[b])=>a.localeCompare(b)))} : {})}

}
export const candidateId = settings => createHash('sha256').update(JSON.stringify(candidateSettings(settings))).digest('hex')
export const builtinSettings = Object.freeze({maxSearches:6,responseDensity:'balanced'})

