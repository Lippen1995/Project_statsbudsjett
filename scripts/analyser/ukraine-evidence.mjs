import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const hash = (s) => createHash('sha256').update(s).digest('hex')
const clean = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex ?? dec, hex ? 16 : 10))).replace(/&nbsp;|&amp;/g, ' ').replace(/\s+/g, ' ').trim()
const numeric = (s) => Number(s.replace(/\s/g, '').replace(',', '.'))

export function buildUkraineEvidence(dataDir, year, currentTotal) {
  if (year !== 2027) return null
  const dir = `${dataDir}/oil-funds/ukraine`
  const manifest = JSON.parse(readFileSync(`${dir}/sources.json`, 'utf8'))
  if (!Number.isFinite(Date.parse(manifest.checkedAt))) throw Error('Ukraina-kildekontrollen mangler tidspunkt')
  const text = new Map()
  for (const source of manifest.sources) {
    if (!/^(?:2025-audit|2026-programme|2026-rnb|2026-rnb-details|2025-accounts|2027-programme)$/.test(source.id) || source.file !== `${source.id}.html` || !/^https:\/\/(?:www\.regjeringen\.no|www\.riksrevisjonen\.no)\//.test(source.url))
      throw Error('Ukjent Ukraina-kilde')
    const raw = readFileSync(`${dir}/${source.file}`, 'utf8')
    if (hash(raw) !== source.sha256 || text.has(source.id)) throw Error('Ukraina-originalkilden er endret')
    text.set(source.id, clean(raw))
  }
  const requireMatch = (id, pattern) => {
    const match = text.get(id)?.match(pattern)
    if (!match) throw Error(`Ukraina-kilden har ukjent format: ${id}`)
    return match
  }
  const start = requireMatch('2025-audit', /([\d,]+) milliarder kroner i 2025 – ([\d,]+) milliarder i militær støtte, ([\d,]+) milliarder i sivil/)
  const previous = requireMatch('2026-programme', /bevilget ([\d,]+) milliarder kroner til Ukraina gjennom Nansen-programmet for 2026\. Av dette går ([\d,]+) milliarder kroner til militær støtte og ([\d,]+) milliarder kroner til si/)
  const revised = requireMatch('2026-rnb', /videreføre den sivile og humanitære støtten til Ukraina på ([\d,]+) milliarder kroner i 2026/)
  const future = requireMatch('2027-programme', /videreføre den ekstraordinære støtten på ([\d,]+) milliarder kroner til Ukraina også i 2027/)
  requireMatch('2027-programme', /støtten gis gjennom Nansen-programmet/)
  const reallocation = requireMatch('2026-rnb-details', /økt med ([\d ,]+) mill\. kroner mot tilsvarende reduksjon på kap\. 1750, post 79/)
  requireMatch('2026-rnb-details', /verdien av donert materiell som skal gjenanskaffes trekkes fra bevilgningen i donasjonsåret/)
  requireMatch('2025-accounts', /militære stønaden vore prega av lågare utnytting enn planlagt/)
  const programmeRows = [
    { year: 2025, total: numeric(start[1]), military: numeric(start[2]), civil: numeric(start[3]), status: 'Oppdatert programramme, Riksrevisjonen' },
    { year: 2026, total: numeric(previous[1]), military: numeric(previous[2]), civil: numeric(previous[3]), status: 'Bevilget programramme; sivil del videreført i RNB' },
    { year: 2027, total: numeric(future[1]), military: null, civil: null, status: 'Foreslått videreført programramme; fordeling ikke oppgitt i kilden' },
  ]
  if (programmeRows.at(-1).total !== currentTotal || programmeRows[1].civil !== numeric(revised[1]) || programmeRows.slice(0, 2).some((r) => Math.abs(r.total - r.military - r.civil) > 1e-8))
    throw Error('Ukraina-rammene kan ikke avstemmes')
  const rawPosts = readFileSync(`${dir}/posts.json`, 'utf8')
  const posts = JSON.parse(rawPosts)
  if (hash(rawPosts) !== manifest.postsSha256 || !/^[a-f0-9]{64}$/.test(posts.sourceDataHash) || posts.sourceUrl !== 'https://fellestall.no/data/utgifter.json' || !Number.isFinite(Date.parse(posts.sourceUpdated)) || !/^[a-f0-9]{40}$/.test(posts.sourceCommit) || posts.frozenSourceUrl !== `https://raw.githubusercontent.com/Lippen1995/Project_statsbudsjett/${posts.sourceCommit}/web/public/data/utgifter.json`)
    throw Error('Frosne Ukraina-poster er endret')
  const seen = new Set()
  for (const row of posts.rows) {
    const key = `${row.year}:${row.id}`
    const allowed = row.year === 2025 ? ['u-17-1700-79', 'u-01-0159-73', 'u-01-0162-77', 'u-01-0162-97'] : ['u-17-1750-21', 'u-17-1750-79', 'u-01-0159-73', 'u-01-0165-72', 'u-01-0165-92']
    const category = row.id.includes('-17-') ? 'military' : row.id.includes('-0159-') ? 'civil' : 'capital'
    if (![2025, 2026].includes(row.year) || !allowed.includes(row.id) || !Number.isFinite(row.amountMillion) || row.amountMillion < 0 || row.stage !== (row.year === 2025 ? 'regnskap' : 'revidert') || row.category !== category || !['name', 'department'].every((k) => typeof row[k] === 'string' && row[k].trim()) || seen.has(key))
      throw Error('Ugyldig eller dobbeltført Ukraina-post')
    seen.add(key)
  }
  if (posts.rows.length !== 9) throw Error('Ukraina-postutvalget mangler rader')
  const amount = (pattern) => numeric(requireMatch('2026-rnb-details', pattern)[1])
  const shift = numeric(reallocation[1])
  const proposedChanges = {
    'u-17-1750-21': shift + amount(/omdisponere ([\d ,]+) mill\. kroner fra kap\. 1720, post 01\. Midlene gjelder utgifter til Forsvarets aktivitet i forbindelse med den militære støtten/) + amount(/øke bevilgningen med ([\d ,]+) mill\. kroner mot tilsvarende reduksjon på kap\. 1700, post 01/),
    'u-17-1750-79': amount(/Bevilgningen foreslås økt med ([\d ,]+) mill\. kroner mot tilsvarende reduksjon på kap\. 1700, post 78/) + amount(/øke bevilgningen på posten med ([\d ,]+) mill\. kroner\. Det foreslås å redusere bevilgningen på posten med 19/) - shift - amount(/bevilgningen reduseres med ytterligere ([\d ,]+) mill\. kroner i forbindelse med ytterligere donasjoner/),
    'u-01-0159-73': -amount(/ambassadens kontorlokaler i Kyiv foreslås det å øke posten med ([\d ,]+) mill\. kroner/) - amount(/Det foreslås å øke posten med ([\d ,]+) mill\. kroner mot tilsvarende reduksjon på kap\. 159/),
  }
  const rnbReconciliation = Object.entries(proposedChanges).map(([id, changeMillion]) => {
    const row = posts.rows.find((r) => r.year === 2026 && r.id === id)
    if (!Number.isFinite(row.baselineMillion)) throw Error('RNB-baseline mangler')
    const proposedMillion = row.baselineMillion + changeMillion
    if (Math.abs(proposedMillion - row.amountMillion) > 1e-7) throw Error('Løpende revidert post avviker fra kontrollert RNB-forslag')
    return { id, baselineMillion: row.baselineMillion, changeMillion, proposedMillion }
  })
  return {
    programmeRows, postRows: posts.rows,
    rnbReconciliation,
    militaryReallocationMillion: numeric(reallocation[1]),
    provenance: { ...manifest, postSource: { url: posts.sourceUrl, frozenUrl: posts.frozenSourceUrl, commit: posts.sourceCommit, sourceDataHash: posts.sourceDataHash, updated: posts.sourceUpdated } },
    notes: [
      `Programrammene måler militær og sivil støtte gjennom Nansen-programmet, inkludert sivil støtte til Moldova. De er ikke en sum av bokførte kontantutbetalinger. Oppdatert ramme for 2025 er ${programmeRows[0].total.toLocaleString('nb-NO')} mrd. kroner; omtalen «85» er avrundet.`,
      'Postutvalget viser regnskap i 2025 og Fellestalls løpende reviderte bevilgninger i 2026. De to militære postene og kap. 159 post 73 er særskilt avstemt mot saldert bevilgning pluss RNB-forslagets endringer. Dette er ikke et frosset parlamentarisk RNB-vedtak.',
      `RNB 2026 flytter ${shift.toLocaleString('nb-NO')} mill. kroner fra kap. 1750 post 79 til post 21, og samler tidligere midler fra andre forsvarskapitler. Begge sider av flyttingen inngår derfor ikke som nye utgifter. Donert materiell og gjenanskaffelser kan flytte kontantutgifter mellom år.`,
      'Kap. 159 post 73 dekker Ukraina og naboland; Norfunds risikokapital og kapitalinnskudd vises separat. Kapitalinnskudd er finansposter og kan ikke uten videre regnes som bidrag til strukturelt underskudd. Programrammen og postutvalget skal ikke legges sammen.',
      'Flyktningmottak og integrering i Norge, lånegarantiordninger som følger av krigen og Nansen Fredssenter inngår ikke i dette Nansen-postutvalget. Store generelle drifts- eller integreringsposter tilordnes ikke Ukraina uten dokumentert andel. Utvalget er ikke alle Ukraina-relaterte kostnader.',
    ],
  }
}

export function ukraineFacts(evidence) {
  if (!evidence) return {}
  const facts = {}, rows = evidence.programmeRows
  const add = (id, value, label, decimals = 1) => { facts[id] = { value, label, text: value.toLocaleString('nb-NO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' mrd. kr' } }
  add('ukraineStartTotal', rows[0].total, 'Oppdatert Nansen-ramme for første år')
  add('ukraineStartMilitary', rows[0].military, 'Militær Nansen-ramme første år')
  add('ukraineStartCivil', rows[0].civil, 'Sivil Nansen-ramme første år')
  add('ukrainePreviousTotal', rows[1].total, 'Nansen-ramme året før forslaget')
  add('ukrainePreviousMilitary', rows[1].military, 'Militær Nansen-ramme året før forslaget')
  add('ukrainePreviousCivil', rows[1].civil, 'Sivil Nansen-ramme året før forslaget')
  add('ukraineAnnualFrameChange', rows[2].total - rows[1].total, 'Nominell endring i Nansen-ramme fra året før')
  const sum = (year, category) => evidence.postRows.filter((r) => r.year === year && r.category === category).reduce((n, r) => n + r.amountMillion, 0) / 1000
  add('ukraineMilitaryCashStart', sum(2025, 'military'), 'Utvalgt militær tilskuddspost, regnskap første år')
  add('ukraineMilitaryBudgetPrevious', sum(2026, 'military'), 'Militære Ukraina-poster i løpende revidert budsjett')
  add('ukraineCivilCashStart', sum(2025, 'civil'), 'Ukraina og naboland, regnskap første år')
  add('ukraineCivilBudgetPrevious', sum(2026, 'civil'), 'Ukraina og naboland, løpende revidert budsjett')
  add('ukraineCapitalCashStart', sum(2025, 'capital'), 'Norfund Ukraina, risikokapital og kapitalinnskudd første år', 2)
  add('ukraineCapitalBudgetPrevious', sum(2026, 'capital'), 'Ukraina-fond, risiko og kapital i løpende revidert budsjett', 2)
  add('ukraineMilitaryReallocation', evidence.militaryReallocationMillion / 1000, 'Militær ompostering mellom to poster i RNB', 1)
  return facts
}
