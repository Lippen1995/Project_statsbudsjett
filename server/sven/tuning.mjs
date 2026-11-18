import { createHash } from 'node:crypto'

// The candidate cannot replace the system method, publication rules, source
// validation, evaluator, test data, thresholds, models or credential settings.
export function candidateSettings(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'maxSearches,responseDensity' ||
    !Number.isInteger(value.maxSearches) || value.maxSearches < 3 || value.maxSearches > 10 ||
    !['concise','balanced','detailed'].includes(value.responseDensity)) throw new Error('Ugyldig forbedringskandidat')
  return {maxSearches:value.maxSearches,responseDensity:value.responseDensity}
}
export const candidateId = settings => createHash('sha256').update(JSON.stringify(candidateSettings(settings))).digest('hex')
export const builtinSettings = Object.freeze({maxSearches:6,responseDensity:'balanced'})

