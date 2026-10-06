import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const digest = (raw) => createHash('sha256').update(raw).digest('hex')
export const partyHosts = {
  Ap: 'arbeiderpartiet.no',
  H: 'hoyre.no',
  FrP: 'frp.no',
  Sp: 'senterpartiet.no',
  SV: 'sv.no',
  KrF: 'krf.no',
  V: 'venstre.no',
  MDG: 'mdg.no',
  R: 'roedt.no',
}
export const priorityKinds = {
  programme: 'Partiprogram',
  'budget-request': 'Budsjettkrav',
  'alternative-budget': 'Alternativt budsjett',
  'stated-priority': 'Uttalt prioritering',
}
export function validatePriorities(priorities, rows) {
  if (priorities === undefined) return
  if (!Array.isArray(priorities) || !priorities.length || priorities.length > 36)
    throw Error('Ugyldig partigrunnlag')
  const ids = new Set(),
    keys = new Set(rows.map((r) => r.id))
  for (const p of priorities) {
    const url = new URL(p.url)
    const host = partyHosts[p.party]
    if (
      !/^[a-z]{1,24}$/.test(p.id ?? '') ||
      ids.has(p.id) ||
      !host ||
      !Object.hasOwn(priorityKinds, p.kind) ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      ![host, 'www.' + host].includes(url.hostname) ||
      (url.port && url.port !== '443') ||
      typeof p.quote !== 'string' ||
      p.quote.length < 30 ||
      p.quote.length > 2000 ||
      !/^[a-f0-9]{64}$/.test(p.sourceHash ?? '') ||
      !/^[a-f0-9]{64}$/.test(p.rawHash ?? '') ||
      !/^party-research\/documents\/[a-f0-9]{64}\.json$/.test(p.documentPath ?? '') ||
      !/^party-research\/raw\/[a-f0-9]{64}\.(?:html|pdf)$/.test(p.rawPath ?? '') ||
      p.documentPath !== `party-research/documents/${p.sourceHash}.json` ||
      !p.rawPath.startsWith(`party-research/raw/${p.rawHash}.`) ||
      !Number.isFinite(Date.parse(p.retrievedAt)) ||
      (p.sourceDate != null &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(p.sourceDate) ||
          !Number.isFinite(Date.parse(p.sourceDate)))) ||
      !Array.isArray(p.recordKeys) ||
      p.recordKeys.length > 20 ||
      new Set(p.recordKeys).size !== p.recordKeys.length ||
      p.recordKeys.some((k) => !keys.has(k))
    )
      throw Error('Partiprioriteten mangler kontrollert kilde eller postkobling')
    if (p.kind === 'programme') {
      if (
        !Array.isArray(p.period) ||
        p.period.length !== 2 ||
        p.period.some((y) => !Number.isSafeInteger(y) || y < 2000 || y > 2100) ||
        p.period[0] > p.period[1] ||
        p.period[1] - p.period[0] > 10 ||
        p.referenceYear != null
      )
        throw Error('Partiprogrammets periode mangler')
    } else if (
      p.period != null ||
      (p.referenceYear != null &&
        (!Number.isSafeInteger(p.referenceYear) ||
          p.referenceYear < 2000 ||
          p.referenceYear > 2100)) ||
      (['budget-request', 'alternative-budget'].includes(p.kind) && p.referenceYear == null)
    )
      throw Error('Partikildens opprinnelige år mangler')
    ids.add(p.id)
  }
}
export function loadPriorities(dataDir, year, phase, rows) {
  const indexPath = `${dataDir}/party-research/index.json`
  if (!existsSync(indexPath)) return undefined
  const index = JSON.parse(readFileSync(indexPath))
  if (index.version !== 1 || !Array.isArray(index.snapshots)) throw Error('Ukjent partiarkiv')
  const s = index.snapshots.findLast((s) => s.year === year && s.phase === phase)
  if (!s) return undefined
  if (
    !new RegExp(`^party-research/${year}/${phase}/[a-f0-9]{64}\\.json$`).test(s.path) ||
    !/^[a-f0-9]{64}$/.test(s.hash)
  )
    throw Error('Ugyldig partiarkivsti')
  const raw = readFileSync(`${dataDir}/${s.path}`)
  if (digest(raw) !== s.hash) throw Error('Partiarkivets versjon er endret')
  const priorities = JSON.parse(raw)
  validatePriorities(priorities, rows)
  for (const p of priorities) {
    const doc = JSON.parse(readFileSync(`${dataDir}/${p.documentPath}`))
    if (
      doc.url !== p.url ||
      digest(doc.text) !== p.sourceHash ||
      !doc.text.includes(p.quote) ||
      digest(readFileSync(`${dataDir}/${p.rawPath}`)) !== p.rawHash
    )
      throw Error('Partikilden eller sitatet er endret')
  }
  return priorities
}
export function priorityFacts(priorities = []) {
  const facts = {}
  const add = (key, text, label) => {
    facts[key] = { value: 0, text, label }
  }
  priorities.forEach((p, i) => {
    const suffix = i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26)
    const prefix = 'priority' + suffix
    add(prefix + 'Party', p.party, 'Parti bak dokumentert prioritering')
    add(prefix + 'Quote', p.quote, 'Ordrett kontrollert partisitat; ikke dokumentert gjennomslag')
    add(prefix + 'Kind', priorityKinds[p.kind], 'Opprinnelig kildetype')
    if (p.referenceYear != null)
      add(
        prefix + 'ReferenceYear',
        String(p.referenceYear),
        'Opprinnelig budsjettår, ikke automatisk årets krav',
      )
    if (p.period) add(prefix + 'Period', p.period.join('–'), 'Partiprogrammets periode')
  })
  return facts
}
