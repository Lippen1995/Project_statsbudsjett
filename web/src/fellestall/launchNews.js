// Oppdater begge tidspunktene før lansering dersom publiseringsdatoen flyttes.
// Sluttdatoen er eksklusiv, slik at innholdet vises i én kalendermåned.
export const MUNICIPAL_LAUNCH_START = '2026-09-23T00:00:00+02:00'
export const MUNICIPAL_LAUNCH_END = '2026-10-23T00:00:00+02:00'

export function isMunicipalLaunchNewsVisible(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(timestamp)
    && timestamp >= Date.parse(MUNICIPAL_LAUNCH_START)
    && timestamp < Date.parse(MUNICIPAL_LAUNCH_END)
}
