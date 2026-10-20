import { createHash, randomUUID } from 'node:crypto'

export const pipelinePath = 'editorial/analysis-pipeline.json'
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }) }
export const emptyPipeline = () => ({ version: 1, items: [], history: [] })
export const osloDate = (at = new Date().toISOString()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
export function validDate(value) {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function nextMonday(at = new Date().toISOString(), includeToday = false) {
  const day = new Date(`${osloDate(at)}T12:00:00Z`)
  let offset = (8 - day.getUTCDay()) % 7
  if (!offset && !includeToday) offset = 7
  day.setUTCDate(day.getUTCDate() + offset)
  return day.toISOString().slice(0, 10)
}
export const entryFingerprint = entry => createHash('sha256').update(JSON.stringify(entry)).digest('hex')
export const pipelineMarker = reference => `<!-- fellestall-pipeline:${reference.id}:${reference.fingerprint} -->`

function validateEntry(entry) {
  if (!entry || !/^[a-f0-9-]{36}$/.test(entry.id ?? '') || !['admin', 'sven'].includes(entry.source) ||
      typeof entry.topic !== 'string' || entry.topic.trim().length < 5 || entry.topic.length > 180 ||
      typeof entry.instructions !== 'string' || entry.instructions.length > 12000 || !validDate(entry.scheduledDate) ||
      (entry.requestedBy !== undefined && (entry.requestedBy !== 'admin' || entry.source !== 'sven')) ||
      (entry.paused !== undefined && typeof entry.paused !== 'boolean') ||
      (entry.priority !== undefined && !['normal', 'urgent'].includes(entry.priority)) ||
      (entry.references !== undefined && (!Array.isArray(entry.references) || entry.references.length > 20 || entry.references.some(url => { try { const u = new URL(url); return u.protocol !== 'https:' || u.username || u.password || url.length > 1000 } catch { return true } }))) ||
      !Number.isFinite(Date.parse(entry.createdAt)) || !Number.isFinite(Date.parse(entry.updatedAt)) ||
      (entry.source === 'sven' && ((!entry.reportPlan && entry.editedBy !== 'admin') || typeof entry.topicKey !== 'string'))) fail('Pipeline inneholder et ugyldig tema.')
}
export function validatePipeline(document) {
  if (!document || document.version !== 1 || !Array.isArray(document.items) || !Array.isArray(document.history) || document.items.length > 100 || document.history.length > 200) fail('Pipeline har et ugyldig format.')
  document.items.forEach(validateEntry)
  if (Buffer.byteLength(JSON.stringify(document.items)) > 500000) fail('Instruksene i køen er for store. Forkort noen instrukser før du legger til flere.')
  if (new Set(document.items.map(i => i.id)).size !== document.items.length || document.items.filter(i => i.source === 'sven' && i.requestedBy !== 'admin').length > 1) fail('Pipeline kan ha høyst ett automatisk kommende tema fra Sven og ingen dupliserte ID-er.')
  if (document.history.some(h => !h || !['deleted', 'delivered', 'replaced'].includes(h.status) || !Number.isFinite(Date.parse(h.at)) || !h.entry?.id)) fail('Ugyldig pipelinehistorikk.')
  return document
}
function retainHistory(document) {
  document.history = document.history.slice(-200)
  while (document.history.length && Buffer.byteLength(JSON.stringify(document)) > 700000) document.history.shift()
  return document
}
export function dueEntry(document, at = new Date().toISOString()) {
  validatePipeline(document)
  const ready = document.items.filter(item => !item.paused && item.scheduledDate <= osloDate(at))
  return ready.find(item => item.priority === 'urgent') ?? ready[0] ?? null
}
export function ensureAutomatic(document, suggestion, { at = new Date().toISOString(), includeToday = false } = {}) {
  validatePipeline(document)
  if (document.items.length || !suggestion) return document
  if (document.history.some(h => h.entry.topicKey === suggestion.topicKey)) return document
  const entry = { id: randomUUID(), source: 'sven', topic: suggestion.topic, instructions: suggestion.instructions,
    scheduledDate: nextMonday(at, includeToday), createdAt: at, updatedAt: at,
    reportPlan: suggestion.reportPlan, topicKey: suggestion.topicKey }
  return validatePipeline({ ...document, items: [entry] })
}
export function mutatePipeline(document, action, at = new Date().toISOString()) {
  validatePipeline(document)
  if (!action || !['add', 'edit', 'delete', 'move', 'pause', 'priority', 'reorder'].includes(action.action)) fail('Ukjent pipelinehandling.')
  const next = structuredClone(document)
  if (action.action === 'reorder') {
    if (!Array.isArray(action.ids) || action.ids.length !== next.items.length || new Set(action.ids).size !== next.items.length || action.ids.some(id => !next.items.some(i => i.id === id))) fail('Rekkefølgen må inneholde alle temaene nøyaktig én gang.')
    next.items = action.ids.map(id => next.items.find(i => i.id === id))
    return validatePipeline(next)
  }
  if (action.action === 'add' || action.action === 'edit') {
    if (typeof action.topic !== 'string' || action.topic.trim().length < 5 || action.topic.length > 180 || typeof action.instructions !== 'string' || action.instructions.length > 12000 || !validDate(action.scheduledDate)) fail('Skriv et tema på 5–180 tegn, en gyldig dato og høyst 12 000 tegn med instrukser.')
    const fields = { topic: action.topic.trim(), instructions: action.instructions.trim(), scheduledDate: action.scheduledDate, updatedAt: at }
    if (action.references !== undefined) fields.references = action.references
    if (action.priority !== undefined) fields.priority = action.priority
    if (action.action === 'add') {
      if (next.items.length >= 100) fail('Pipeline kan ha høyst 100 kommende temaer.')
      next.items.push({ ...fields, id: randomUUID(), source: 'admin', createdAt: at, reportPlan: null })
    } else {
      const entry = next.items.find(i => i.id === action.id)
      if (!entry) fail('Temaet finnes ikke lenger. Last inn oppdatert pipeline.', 409)
      // Bare endret innhold krever ny research; en ren datoflytting beholder planen.
      const changed = entry.topic !== fields.topic || entry.instructions !== fields.instructions
      Object.assign(entry, fields, { reportPlan: changed ? null : entry.reportPlan, editedBy: 'admin' })
    }
  } else {
    const index = next.items.findIndex(i => i.id === action.id)
    if (index < 0) fail('Temaet finnes ikke lenger. Last inn oppdatert pipeline.', 409)
    if (action.action === 'pause') {
      if (typeof action.paused !== 'boolean') fail('Velg om temaet skal settes på pause.')
      Object.assign(next.items[index], { paused: action.paused, updatedAt: at })
    } else if (action.action === 'priority') {
      if (!['normal', 'urgent'].includes(action.priority)) fail('Velg en gyldig prioritet.')
      Object.assign(next.items[index], { priority: action.priority, updatedAt: at })
    } else if (action.action === 'delete') {
      const [entry] = next.items.splice(index, 1)
      next.history = [...next.history, { entry, status: 'deleted', at }].slice(-200)
    } else {
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= next.items.length) fail('Ugyldig plass i pipeline.')
      const [entry] = next.items.splice(index, 1)
      next.items.splice(action.index, 0, entry)
    }
  }
  return validatePipeline(retainHistory(next))
}
export function assertCurrentEntry(document, reference, at) {
  const entry = dueEntry(document, at)
  if (!reference || entry?.id !== reference.id || entryFingerprint(entry) !== reference.fingerprint) fail('Pipeline er endret, omprioritert eller ikke klar ennå. Hent gjeldende instrukser og planlegg analysen på nytt.', 409)
  return entry
}

// Suggestions passed here are selected and validated on the server. A browser
// supplies only a catalog key and date, never its own report plan or provenance.
export function applySvenSuggestion(document, { id, suggestion, scheduledDate }, at = new Date().toISOString()) {
  validatePipeline(document)
  if (!suggestion || !validDate(scheduledDate) || !suggestion.reportPlan || typeof suggestion.topicKey !== 'string') fail('Ugyldig Sven-forslag.')
  const next = structuredClone(document)
  const index = id ? next.items.findIndex(i => i.id === id) : -1
  if (id && index < 0) fail('Temaet finnes ikke lenger. Hent oppdatert pipeline.', 409)
  if (!id && next.items.length >= 100) fail('Pipeline kan ha høyst 100 kommende temaer.')
  const entry = {
    id: id || randomUUID(), source: 'sven', requestedBy: 'admin',
    topic: suggestion.topic, instructions: suggestion.instructions, scheduledDate,
    reportPlan: structuredClone(suggestion.reportPlan), topicKey: suggestion.topicKey,
    createdAt: index < 0 ? at : next.items[index].createdAt, updatedAt: at,
    ...(index<0?{}:{paused:next.items[index].paused || false,priority:next.items[index].priority || 'normal',references:next.items[index].references || []}),
  }
  if (index < 0) next.items.push(entry)
  else {
    next.history.push({ entry: next.items[index], status: 'replaced', at })
    next.items[index] = entry
  }
  return validatePipeline(retainHistory(next))
}
export function completeEntry(document, reference, { at, reviewUrl, topicKey }) {
  const entry = assertCurrentEntry(document, reference, at)
  return validatePipeline(retainHistory({ ...document, items: document.items.filter(i => i.id !== entry.id),
    history: [...document.history, { entry: { ...entry, ...(topicKey ? { topicKey } : {}) }, status: 'delivered', at, reviewUrl }].slice(-200) }))
}

// Både admin-API og native analyseoppgave bruker samme fil og SHA-kontroll.
export function pipelineRepository(g) {
  return {
    async read() {
      const file = await g.content(pipelinePath)
      return { document: validatePipeline(file?.value ?? emptyPipeline()), sha: file?.sha ?? null }
    },
    async write(document, sha, message) {
      validatePipeline(document)
      const result = await g.api(`${g.root}/contents/${pipelinePath}`, { method: 'PUT', body: {
        branch: 'main', ...(sha ? { sha } : {}), message,
        content: Buffer.from(JSON.stringify(document, null, 2) + '\n').toString('base64'),
      } })
      return { document, sha: result.content.sha }
    },
  }
}
