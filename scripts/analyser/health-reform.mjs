import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { healthScenario } from '../../web/src/analyser/health-scenario.js'

const number = (v, digits = 1) => new Intl.NumberFormat('nb-NO', {
  maximumFractionDigits: digits, minimumFractionDigits: digits,
}).format(v)
const fact = (value, text, label) => ({ value, text, label })

export function healthReformFacts(policy) {
  validateHealthReform(policy)
  const s = Object.fromEntries(policy.series.map(x => [x.id, x]))
  const first = x => x.rows[0].value, last = x => x.rows.at(-1).value
  const growth = x => (last(x) / first(x) - 1) * 100
  const scenario = healthScenario(policy.scenario)
  const cash = healthScenario({...policy.scenario, cashShare: 1})
  const a = policy.scenario, lastScenario = scenario.rows.at(-1), lastCash = cash.rows.at(-1)
  const money = v => `${number(v / 1e6)} mill. kr`
  return {
    ...(policy.factsVersion === 2 ? {
    healthScenarioTime: fact(a.timeSaving * 100, `${number(a.timeSaving * 100, 0)} %`, 'Illustrativ tidsbesparelse'),
    healthScenarioRealization: fact(a.realization * 100, `${number(a.realization * 100, 0)} %`, 'Illustrativ realisering'),
    healthScenarioReleased: fact(lastScenario.releasedFte, number(lastScenario.releasedFte), 'Frigjorte årsverk i illustrativt RHF-scenario'),
    healthScenarioEmployerCost: fact(a.annualEmployerCost, money(a.annualEmployerCost), 'Antatt årlig kostnad per årsverk'),
    healthScenarioUpfront: fact(a.upfrontCost, money(a.upfrontCost), 'Antatt engangskostnad'),
    healthScenarioOngoing: fact(a.ongoingCost, money(a.ongoingCost), 'Antatt årlig merkostnad'),
    healthScenarioCashGross: fact(lastCash.staffCashSaving, money(lastCash.staffCashSaving), 'Illustrativ brutto kontantinnsparing ved full bemanningsrealisering'),
    healthScenarioCashNet: fact(lastCash.netCash, money(lastCash.netCash), 'Illustrativ netto årlig kontanteffekt etter innfasing'),
    healthScenarioRamp: fact(a.rampYears, number(a.rampYears, 0), 'Illustrativ innfasing i år'),
    healthScenarioYears: fact(a.years, number(a.years, 0), 'Illustrativ beregningshorisont i år'),
    healthOnePercent: fact(1, '1 %', 'Illustrativ andel av avtalt arbeidstid'),
    healthCareNurseCapacity: fact(last(s.careNurseFte) / 100, number(last(s.careNurseFte) / 100, 0), 'Årsverksekvivalent dersom én prosent av avtalt sykepleiertid i kommunal omsorg frigjøres'),
    } : {}),
    healthRhfFte: fact(policy.nou.rhfFte2024, number(policy.nou.rhfFte2024, 0), 'Avtalte årsverk i de regionale helseforetakene'),
    healthElderlyStart: fact(first(s.elderly80plus), number(first(s.elderly80plus), 0), 'Innbyggere fra åtti år i startåret'),
    healthElderlyEnd: fact(last(s.elderly80plus), number(last(s.elderly80plus), 0), 'Innbyggere fra åtti år i sluttåret'),
    healthElderlyGrowth: fact(growth(s.elderly80plus), `${number(growth(s.elderly80plus))} %`, 'Vekst i innbyggere fra åtti år'),
    healthCareFteGrowth: fact(growth(s.careFte), `${number(growth(s.careFte))} %`, 'Vekst i årsverk i omsorgstjenestene'),
    healthSpecialistFteGrowth: fact(growth(s.specialistFte), `${number(growth(s.specialistFte))} %`, 'Vekst i årsverk i spesialisthelsetjenesten'),
    healthSupportFteGrowth: fact(growth(s.supportFte), `${number(growth(s.supportFte))} %`, 'Vekst i administrasjon og service i spesialisthelsetjenesten'),
  }
}

export function validNouVerification(nou) {
  if (!nou || !/^https:\/\/www\.regjeringen\.no\//.test(nou.url ?? '')) return false
  if (/^[a-f0-9]{64}$/.test(nou.pdfSha256 ?? '')) return true // historical, frozen reports
  const v = nou.textVerification
  return v?.method === 'official-pdf-text' && v.url === nou.url &&
    Number.isFinite(Date.parse(v.checkedAt)) && Number.isInteger(v.printedPage) && v.printedPage > 0 &&
    typeof v.excerpt === 'string' && v.excerpt.includes(String(nou.rhfFte2024)) &&
    typeof v.limitation === 'string' && v.limitation.length > 20
}

export function validateHealthReform(policy) {
  if (!policy || policy.version !== 1 || !Number.isFinite(Date.parse(policy.updated)) ||
      !validNouVerification(policy.nou) ||
      !Number.isFinite(policy.nou?.rhfFte2024) || !Array.isArray(policy.sources) ||
      policy.sources.some(s => !s.name || !/^https:\/\//.test(s.url) || !s.description) ||
      !Array.isArray(policy.politics) || policy.politics.length < 3 ||
      policy.politics.some(p => !p.actor || !p.position || !p.status) || !Array.isArray(policy.series))
    throw Error('Ugyldig kildegrunnlag for helsereformen')
  if (policy.factsVersion !== undefined && policy.factsVersion !== 2) throw Error('Ukjent helsefaktaversjon')
  if (policy.factsVersion === 2 && !policy.series.some(s => s.id === 'careNurseFte')) throw Error('Mangler sykepleiergrunnlag')
  const ids = ['specialistFte', 'supportFte', 'careFte', 'elderly80plus', 'municipalOslo', 'municipalBergen', 'municipalTrondheim']
  if (!ids.every(id => policy.series.some(s => s.id === id)) ||
      policy.series.some(s => !s.label || !s.unit || !Array.isArray(s.rows) || s.rows.length < 2 ||
        s.rows.some((r, i) => !Number.isInteger(r.year) || !Number.isFinite(r.value) || (i && r.year !== s.rows[i - 1].year + 1))))
    throw Error('Ugyldige helseserier')
  healthScenario(policy.scenario)
  return policy
}

export function loadHealthReform() {
  const baseRaw = readFileSync('editorial/research/helsereform-2026/baseline.json', 'utf8')
  const policyRaw = readFileSync('editorial/research/helsereform-2026/policy.json', 'utf8')
  const base = JSON.parse(baseRaw), policy = JSON.parse(policyRaw)
  for (const [path, hash] of Object.entries(base.sourceHashes)) {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
    if (actual !== hash) throw Error(`Helsekilden er endret: ${path}`)
  }
  const ssb = base.ssb
  const municipal = name => base.municipalExamples.find(x => x.name.startsWith(name) && x.metric === 'net_expenses')
  policy.series = [
    { id: 'careNurseFte', label: 'Sykepleierårsverk i kommunal omsorg', unit: 'årsverk', rows: ssb.OmsorgSykepleiere.rows, source: `SSB, tabell ${ssb.OmsorgSykepleiere.table}` },
    { id: 'specialistFte', label: 'Årsverk i spesialisthelsetjenesten', unit: 'årsverk', rows: ssb.Spesialist.rows, source: `SSB, tabell ${ssb.Spesialist.table}` },
    { id: 'supportFte', label: 'Administrasjon og service i spesialisthelsetjenesten', unit: 'årsverk', rows: ssb.SykehusStotte.rows, source: `SSB, tabell ${ssb.SykehusStotte.table}` },
    { id: 'careFte', label: 'Årsverk i omsorgstjenestene', unit: 'årsverk', rows: ssb.Omsorg.rows, source: `SSB, tabell ${ssb.Omsorg.table}` },
    { id: 'elderly80plus', label: 'Innbyggere fra åtti år', unit: 'personer', rows: base.elderly80Plus.rows, source: 'SSB, tabell 07459' },
    ...[['municipalOslo','Oslo'],['municipalBergen','Bergen'],['municipalTrondheim','Trondheim']].map(([id, name]) => {
      const row = municipal(name); if (!row) throw Error(`Mangler kommuneserie: ${name}`)
      return { id, label: `${name}: netto helse- og omsorgsutgifter per innbygger`, unit: 'kr per innbygger i faste priser', rows: row.rows.map(r => ({ year: r.year, value: r.realPerCapita })), source: 'Fellestall KOSTRA' }
    }),
  ]
  validateHealthReform(policy)
  return {
    policy,
    facts: healthReformFacts(policy),
    sha256: createHash('sha256').update(baseRaw).update('\n').update(policyRaw).digest('hex'),
  }
}
