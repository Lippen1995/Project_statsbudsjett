import robekHistory from './robek-history.json' with { type: 'json' }

const ROBEK_SOURCE_URL = 'https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/robek-2/kommuner-som-er-oppfort-i-registeret/id415422/'
const ROBEK_HISTORY_URL = 'https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/robek-2/robek-2001-2015/id415536/'
const ROBEK_UPDATED = '2026-09-03'

// Kommunal- og distriktsdepartementets løpende register, sist oppdatert 3. september 2026.
// Når den løpende kilden ikke publiserer en eksakt innmeldingsdag, oppgis bare året.
const CURRENT_ROBEK = new Map(Object.entries({
  '1514': { name: 'Sande', legalBasis: 'c og d' },
  '1515': { name: 'Herøy', legalBasis: 'd' },
  '1517': { name: 'Hareid', legalBasis: 'a, b, c og d' },
  '1520': { name: 'Ørsta', legalBasis: 'd', entered: '2026' },
  '1560': { name: 'Tingvoll', legalBasis: 'c og d' },
  '1566': { name: 'Surnadal', legalBasis: 'c', entered: '2026' },
  '1822': { name: 'Leirfjord', legalBasis: 'c og d' },
  '1837': { name: 'Meløy', legalBasis: 'c og d' },
  '1840': { name: 'Saltdal', legalBasis: 'd', entered: '2026-07-06' },
  '1865': { name: 'Vågan', legalBasis: 'c og d' },
  '1867': { name: 'Bø', legalBasis: 'd', entered: '2026' },
  '1871': { name: 'Andøy', legalBasis: 'c og d' },
  '1874': { name: 'Moskenes', legalBasis: 'a, b, c, d og e' },
  '3322': { name: 'Nesbyen', legalBasis: 'c og d' },
  '3334': { name: 'Flesberg', legalBasis: 'a, b, c og d' },
  '3416': { name: 'Eidskog', legalBasis: 'c og d' },
  '3417': { name: 'Grue', legalBasis: 'c og d' },
  '3418': { name: 'Åsnes', legalBasis: 'c og d' },
  '3430': { name: 'Os', legalBasis: 'd', entered: '2026' },
  '3443': { name: 'Vestre Toten', legalBasis: 'c og d' },
  '4014': { name: 'Kragerø', legalBasis: 'c og d' },
  '4020': { name: 'Midt-Telemark', legalBasis: 'c og d' },
  '4213': { name: 'Tvedestrand', legalBasis: 'c og d', entered: '2026' },
  '4214': { name: 'Froland', legalBasis: 'c' },
  '4613': { name: 'Bømlo', legalBasis: 'c og d', entered: '2026' },
  '5022': { name: 'Rennebu', legalBasis: 'c og d', entered: '2026' },
  '5025': { name: 'Røros', legalBasis: 'c og d' },
  '5026': { name: 'Holtålen', legalBasis: 'a og c', entered: '2026' },
  '5043': { name: 'Røyrvik', legalBasis: 'b, c og d' },
  '5501': { name: 'Tromsø', legalBasis: 'd', entered: '2026-08-26' },
  '5540': { name: 'Kåfjord', legalBasis: 'c og d' },
  '5605': { name: 'Sør-Varanger', legalBasis: 'c og d' },
  '5607': { name: 'Vadsø', legalBasis: 'a, b, c og d' },
  '5610': { name: 'Karasjok', legalBasis: 'c og d', entered: '2026-08-26' },
  '5626': { name: 'Gamvik', legalBasis: 'c og d' },
}))

const EXITS_AFTER_HISTORY_FILE = new Map(Object.entries({
  '1851': '2026-07-01',
  '4649': '2026-03-03',
  '5612': '2026-08-26',
}))

export const ROBEK_LEGAL_BASIS_DESCRIPTIONS = {
  a: 'Driftsbudsjettet er vedtatt med merforbruk.',
  b: 'Økonomiplanens driftsdel er vedtatt med merforbruk.',
  c: 'Et merforbruk er planlagt dekket inn over mer enn to år.',
  d: 'Oppsamlet merforbruk er større enn tre prosent av driftsinntektene.',
  e: 'Økonomiplan eller årsbudsjett er ikke vedtatt innen fristen.',
  f: 'Årsregnskapet er ikke vedtatt innen fristen.',
  g: 'Departementet har fattet vedtak etter inndelingslova § 16 a.',
}

export function robekLegalBasisLetters(legalBasis) {
  return String(legalBasis ?? '')
    .split(/\s*(?:,|\bog\b)\s*/u)
    .filter((letter) => Object.hasOwn(ROBEK_LEGAL_BASIS_DESCRIPTIONS, letter))
}

function periodsFromEvents(events = []) {
  const periods = []
  let entered = null

  events.forEach((event) => {
    if (event.type === 'in') {
      entered ??= event.date
    } else if (event.type === 'out' && entered) {
      periods.push({ entered, exited: event.date })
      entered = null
    }
  })

  if (entered) periods.push({ entered, exited: null })
  return periods
}

function historicalPeriods(code) {
  const periods = periodsFromEvents(robekHistory[code]?.events)
  const laterExit = EXITS_AFTER_HISTORY_FILE.get(code)
  if (laterExit && periods.at(-1)?.exited === null) {
    periods[periods.length - 1] = { ...periods.at(-1), exited: laterExit }
  }
  return periods
}

function currentPeriodFor(code, record, periods) {
  if (!record) return null
  const openPeriod = periods.findLast((period) => period.exited === null)
  if (openPeriod) return openPeriod
  return { entered: record.entered ?? '2026', exited: null }
}

function plural(value, singular, pluralForm) {
  return `${value} ${value === 1 ? singular : pluralForm}`
}

export function formatRobekDuration(period, referenceDate = ROBEK_UPDATED) {
  if (!period?.entered) return 'Ukjent varighet'
  if (/^\d{4}$/.test(period.entered)) {
    const years = Number((period.exited ?? referenceDate).slice(0, 4)) - Number(period.entered)
    return years < 1 ? 'under 1 år' : plural(years, 'år', 'år')
  }

  const start = new Date(`${period.entered}T12:00:00Z`)
  const end = new Date(`${period.exited ?? referenceDate}T12:00:00Z`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return 'Ukjent varighet'

  let years = end.getUTCFullYear() - start.getUTCFullYear()
  let months = end.getUTCMonth() - start.getUTCMonth()
  if (end.getUTCDate() < start.getUTCDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years > 0) {
    return months > 0
      ? `${plural(years, 'år', 'år')} og ${plural(months, 'måned', 'måneder')}`
      : plural(years, 'år', 'år')
  }
  if (months > 0) return plural(months, 'måned', 'måneder')

  const days = Math.max(0, Math.round((end - start) / 86_400_000))
  return plural(days, 'dag', 'dager')
}

export function robekStatusForMunicipality(municipalityCode) {
  const code = String(municipalityCode)
  const currentRecord = CURRENT_ROBEK.get(code) ?? null
  const periods = historicalPeriods(code)
  const currentPeriod = currentPeriodFor(code, currentRecord, periods)
  if (currentPeriod && !periods.includes(currentPeriod)) periods.push(currentPeriod)

  return {
    registered: currentRecord !== null,
    legalBasis: currentRecord?.legalBasis ?? null,
    updated: ROBEK_UPDATED,
    sourceUrl: ROBEK_SOURCE_URL,
    historyUrl: ROBEK_HISTORY_URL,
    municipalityName: currentRecord?.name ?? robekHistory[code]?.name ?? null,
    periods,
    currentPeriod,
  }
}

export function robekCurrentMunicipalities() {
  return [...CURRENT_ROBEK.entries()]
    .map(([code, record]) => ({ code, name: record.name, ...robekStatusForMunicipality(code) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'nb'))
}
