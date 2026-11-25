import { validateChart } from './charts.mjs'
import { validateDeliverables } from './deliverables.mjs'

const safeText = (value, max) => typeof value === 'string' && value.trim() && value.length <= max &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
const valueRange = value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
const sameSource = (source, known) => Array.isArray(source) && source.every(id => known.has(id))

export const advancedInstructions = `Valgfrie felt for brukerens arbeidsflyt:
- deliverables.scenario = {"title":"Tittel","unit":"mill. kr","items":[{"label":"Budsjettområde","base":100,"percent":5,"min":-25,"max":25}],"sourceIds":["kilde-ID"]}. Bruk dette når brukeren vil utforske antakelser interaktivt. Ha én til seks sammenlignbare budsjettlinjer med samme enhet og prisgrunnlag, nøyaktige basisverdier, og markér endringene som forutsetninger, ikke prognoser.
- deliverables.officeEdit = {"sourceId":"den aktuelle kilde-ID-en","format":"pptx","edits":[{"target":"lys-2-felt-1","value":"Ny tittel"}]}. Gjenbruk den aktuelle PPTX-, DOCX- eller XLSX-filen når brukeren vil endre en eksisterende fil. Referer nøyaktig til redigerbare felt-ID-er fra opplastet kilde. Legg bare med feltene brukeren faktisk ba om å endre. Send XLSX-tall som JSON-tall og aldri en formel fra modellen. Hvis brukeren vil legge til lysbilder, kan du legge til append: [{"template":2,"edits":[{"target":"lys-2-felt-1","value":"Tittel for nytt lysbilde"}]}] som kopierer malen fra valgt lysbilde og endrer de oppgitte feltene i kopien. Brukerens øvrige dokumentdeler beholdes. Hvis den opplastede malen har plassholdere, fyll dem med faglig innhold så langt det passer.
- Ved revision inneholder prior den forrige leveransen. Bare returner felt som skal endres i det vanlige svarformatet. Et felt som er utelatt beholdes. Gjenbruk eksisterende kilde-ID der tall er uendret. Når en underliggende verdi endres, synkroniser berørte figurer, tabeller og tekstfelt. Behold sammenhengen og omfanget ellers.
- I vedlegg med visuell dokumentlesing oppgis sidetall i kildeteksten. Angi siden i funnet når det er relevant. Usikre eller uleselige tall skal ikke presenteres som sikre.`

export const advancedRouting = `Du kan også velge research-verktøyene «compute» for en avgrenset dataanalyse som krever kode og «versions» for gjenbruk av en tidligere valgt leveranse. Bruk andre relevante kilder i tillegg ved behov. Velg compute når neste steg krever sortering, sammenslåing, aggregering eller statistisk behandling gjennom kjørbar kode. Velg innebygde regneoperasjoner for enkle konverteringer og scenarioer. Utled ønsket handling av brukerens hensikt. Ved en revisjon velger du versions sammen med eventuelle nye kilder. Ved filredigering eller malbruk med vedlegg, velg uploads. Projectdokumenter kan ligge blant vedleggene. Bruk aldri privat innhold fra prosjekt eller filer som søketermer på nettet.\n\n${advancedInstructions}`

export function normalizeScenario(value, ids) {
  if (!value || !safeText(value.title, 180) || !safeText(value.unit, 80) || !sameSource(value.sourceIds, ids) ||
    (ids.size && !value.sourceIds.length) || !Array.isArray(value.items) || !value.items.length || value.items.length > 6 ||
    !value.items.every(item => safeText(item?.label, 100) && valueRange(item.base) &&
      [item.percent, item.min, item.max].every(number => Number.isFinite(number) && number >= -100 && number <= 1000) &&
      item.max > item.min && item.percent >= item.min && item.percent <= item.max)) return null
  return { title: value.title, unit: value.unit, sourceIds: [...new Set(value.sourceIds)],
    items: value.items.map(({ label, base, percent, min, max }) => ({ label, base, percent, min, max })) }
}

const officeTargets = {
  pptx: /^lys-[1-9]\d{0,3}-felt-[1-9]\d{0,3}$/,
  docx: /^avsnitt-[1-9]\d{0,4}$/,
  xlsx: /^ark-[1-9]\d{0,3}-[A-Z]{1,3}[1-9]\d{0,6}$/,
}

function normalizeEdits(edits, format) {
  if (!Array.isArray(edits) || edits.length > 80 || !edits.every(edit =>
    typeof edit?.target === 'string' && officeTargets[format].test(edit.target) &&
    ((format === 'xlsx' && (valueRange(edit.value) || edit.value === null)) ||
      (typeof edit.value === 'string' && (!edit.value.length || safeText(edit.value, 2400))))) ||
    new Set(edits.map(edit => edit.target)).size !== edits.length) return null
  return edits.map(({ target, value }) => ({ target, value }))
}

export function normalizeOfficeEdit(value, ids) {
  if (!value || !ids.has(value.sourceId) || !Object.hasOwn(officeTargets, value.format)) return null
  const edits = normalizeEdits(value.edits ?? [], value.format)
  if (!edits) return null
  const append = []
  if (value.append != null) {
    if (value.format !== 'pptx' || !Array.isArray(value.append) || value.append.length > 8) return null
    for (const page of value.append) {
      if (!Number.isInteger(page?.template) || page.template < 1 || page.template > 9999) return null
      const changes = normalizeEdits(page.edits, 'pptx')
      if (!changes?.length || !changes.every(edit => edit.target.startsWith(`lys-${page.template}-felt-`))) return null
      append.push({ template: page.template, edits: changes })
    }
  }
  if (!edits.length && !append.length) return null
  return { sourceId: value.sourceId, format: value.format, edits, ...(append.length ? { append } : {}) }
}

export function attachAdvancedFields(answer, originalKit, ids) {
  const scenario = normalizeScenario(originalKit?.scenario, ids)
  const officeEdit = normalizeOfficeEdit(originalKit?.officeEdit, ids)
  if (!scenario && !officeEdit) return answer
  return { ...answer, deliverables: {
    ...(answer.deliverables ?? { title: safeText(originalKit.title, 180) ? originalKit.title : 'Leveranse fra Sven', formats: [], sections: [] }),
    ...(scenario ? { scenario } : {}), ...(officeEdit ? { officeEdit } : {}),
  } }
}

export function revisionContext(value) {
  if (!value?.answer || !Array.isArray(value.sources) || value.sources.length > 90 ||
      JSON.stringify(value).length > 155_000) return null
  const trustedSources = value.sources.flatMap(source => {
    if (!safeText(source?.id, 160) || !safeText(source.title, 300)) return []
    if (source.type === 'upload' || source.type === 'calculation') return [{ id: source.id, title: source.title, type: source.type }]
    try {
      const url = new URL(source.url)
      return url.protocol === 'https:' && !url.username && !url.password && url.href.length < 2000
        ? [{ id: source.id, title: source.title, url: url.href }] : []
    } catch { return [] }
  })
  const ids = new Set(trustedSources.map(source => source.id))
  const chart = validateChart(value.answer.chart, ids)
  const kit = value.answer.deliverables
  const base = validateDeliverables(kit, ids, { hasChart: Boolean(chart) })
  const scenario = normalizeScenario(kit?.scenario, ids)
  const officeEdit = normalizeOfficeEdit(kit?.officeEdit, ids)
  if (!base && !chart && !scenario && !officeEdit) return null
  const deliverables = base || scenario || officeEdit ? {
    ...(base ?? { title: 'Leveranse fra Sven', formats: [], sections: [] }),
    ...(scenario ? { scenario } : {}), ...(officeEdit ? { officeEdit } : {}),
  } : null
  const findings = Array.isArray(value.answer.findings) ? value.answer.findings.slice(0, 40)
    .filter(item => safeText(item?.text, 2000) && sameSource(item.sourceIds, ids)) : []
  const uncertainties = Array.isArray(value.answer.uncertainties) ? value.answer.uncertainties.slice(0, 30)
    .filter(item => safeText(item, 800)) : []
  const recommendation = safeText(value.answer.recommendation?.text, 2200) &&
    sameSource(value.answer.recommendation.sourceIds, ids) ? value.answer.recommendation : null
  const summary = safeText(value.answer.summary, 6000) ? value.answer.summary : 'Tidligere leveranse'
  return { answer: { summary, findings, uncertainties, recommendation, ...(chart ? { chart } : {}),
    ...(deliverables ? { deliverables } : {}) }, sources: trustedSources }
}

export function mergeRevision(prior, revised) {
  if (!prior || !revised || typeof revised !== 'object') return revised
  const updates = Object.fromEntries(['summary', 'findings', 'uncertainties', 'recommendation', 'chart']
    .filter(field => Object.hasOwn(revised, field)).map(field => [field, revised[field]]))
  const kit = revised.deliverables
  const previousEdit = prior.answer.deliverables?.officeEdit
  const edit = kit?.officeEdit
  const editedFields = previousEdit && edit && edit.sourceId === previousEdit.sourceId && edit.format === previousEdit.format && Array.isArray(edit.edits)
    ? [...new Map([...previousEdit.edits, ...edit.edits].map(change => [change?.target, change])).values()] : null
  return { ...prior.answer, ...updates,
    ...(kit && typeof kit === 'object' ? {
      deliverables: { ...prior.answer.deliverables, ...kit, ...(editedFields ? {
        officeEdit: { ...previousEdit, ...edit, edits: editedFields },
      } : {}) },
    } : {}) }
}

export function resolvePriorSources(prior, existing) {
  if (!prior) return []
  return [
    ...prior.sources.filter(item => !existing.some(source => source.id === item.id))
      .map(source => ({ ...source, text: 'Kildehenvisning fra forrige versjon. Gjenbruk bare for uendret innhold i den versjonen.' })),
    { id: 'forrige-versjon', title: 'Forrige versjon', text: JSON.stringify(prior.answer) },
  ]
}
