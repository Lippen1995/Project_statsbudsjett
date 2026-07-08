/**
 * Data-loading, aggregeringshjelpere og visningsmodus-transformasjoner.
 */

let _cache = {}

async function loadJSON(path, { optional = false } = {}) {
  if (path in _cache) return _cache[path]
  try {
    const res = await fetch(path)
    if (!res.ok) {
      if (optional) { _cache[path] = null; return null }
      throw new Error(`Klarte ikke laste ${path}: ${res.status}`)
    }
    _cache[path] = await res.json()
    return _cache[path]
  } catch (e) {
    if (optional) { _cache[path] = null; return null }
    throw e
  }
}

export async function loadAll() {
  const [meta, utgifter, inntekter, befolkning, kpi, bnp] = await Promise.all([
    loadJSON('./data/meta.json'),
    loadJSON('./data/utgifter.json'),
    loadJSON('./data/inntekter.json'),
    loadJSON('./data/befolkning.json'),
    loadJSON('./data/kpi.json', { optional: true }),
    loadJSON('./data/bnp.json', { optional: true }),
  ])
  return { meta, utgifter, inntekter, befolkning, kpi, bnp }
}

/**
 * Lazy-last detaljer (artskonto + virksomheter) for en nodes departement.
 * Node-id "u-13-1320-01" → fil "detaljer/u-13.json".
 * Returnerer {nodeId: {artskonto, virksomheter}} eller null (gammelt format /
 * fil mangler).
 */
export async function hentDetaljer(nodeId) {
  const deler = nodeId.split('-')
  if (deler.length < 2) return null
  const fil = `./data/detaljer/${deler[0]}-${deler[1]}.json`
  return loadJSON(fil, { optional: true })
}

/** Hent regnskap-verdi for en node og et år */
export function getVerdi(node, year, serie = 'regnskap') {
  return node?.serier?.[year]?.[serie] ?? null
}

/**
 * Rekursiv sum for en node: summerer bladnodene.
 * VIKTIG: bruk denne (ikke node.serier direkte) på aggregerte nivåer når
 * trærne er filtrert — de forhåndsberegnede seriene på departement/kapittel
 * inkluderer fin/SPU-poster selv om barna er filtrert bort.
 */
export function sumVerdi(node, year, serie = 'regnskap') {
  if (node.children?.length) {
    return node.children.reduce((s, c) => s + (sumVerdi(c, year, serie) ?? 0), 0)
  }
  return getVerdi(node, year, serie) ?? 0
}

/** Filtrer noder basert på gjeldende innstillinger */
export function filtrerNoder(nodes, { skjulFin = true } = {}) {
  if (!skjulFin) return nodes
  return nodes
    .map(n => {
      if (n.fin || n.transfer) return null
      if (!n.children) return n
      const barn = filtrerNoder(n.children, { skjulFin })
      if (barn.length === 0) return null
      return { ...n, children: barn }
    })
    .filter(Boolean)
}

/** Bygg tidsserie for en node over alle år */
export function byggTidsserie(node, years) {
  return years.map(y => ({
    aar: y,
    regnskap: node?.serier?.[y]?.regnskap ?? null,
    saldert: node?.serier?.[y]?.saldert ?? null,
    revidert: node?.serier?.[y]?.revidert ?? null,
  }))
}

/** Y/Y-vekst (regnskap) */
export function byggYoY(tidsserie) {
  return tidsserie.map((d, i) => {
    if (i === 0 || d.regnskap == null) return { aar: d.aar, yoy: null }
    const prev = tidsserie[i - 1].regnskap
    if (!prev) return { aar: d.aar, yoy: null }
    return { aar: d.aar, yoy: ((d.regnskap - prev) / Math.abs(prev)) * 100 }
  })
}

// ---------------------------------------------------------------------------
// Visningsmoduser: løpende kr | faste kr (KPI-deflatert) | per innbygger | % av BNP

export const MODUSER = [
  { id: 'lopende', label: 'Løpende kr' },
  { id: 'fast', label: 'Faste kroner', krever: 'kpi' },
  { id: 'person', label: 'Per innbygger', krever: 'befolkning' },
  { id: 'bnp', label: '% av BNP', krever: 'bnp' },
]

/**
 * Transformer en verdi (mill. kr) for et gitt år etter valgt modus.
 * ctx = { kpi, bnp, befolkning, basisAar }
 */
export function transformVerdi(v, aar, modus, ctx) {
  if (v == null) return null
  switch (modus) {
    case 'fast': {
      const k = ctx.kpi?.[aar], kb = ctx.kpi?.[ctx.basisAar]
      return (k && kb) ? v * (kb / k) : null
    }
    case 'person': {
      const pop = ctx.befolkning?.[aar]
      return pop ? (v * 1_000_000) / pop : null   // kr per person
    }
    case 'bnp': {
      const b = ctx.bnp?.[aar]
      return b ? (v / b) * 100 : null              // prosent
    }
    default:
      return v
  }
}

// ---------------------------------------------------------------------------
// Artskonto-pseudotre (kontoklasse → enkeltkonto) fra detaljdata

export function byggArtskontoTre(node, detaljer) {
  const artskonto = detaljer?.artskonto ?? node?.artskonto
  if (!artskonto) return []
  const klasser = {}

  for (const [aar, konti] of Object.entries(artskonto)) {
    for (const [ak, d] of Object.entries(konti)) {
      const klasseId = d.klasse ?? ak[0] ?? '?'
      if (!klasser[klasseId]) {
        klasser[klasseId] = {
          id: `${node.id}-ak${klasseId}`,
          navn: d.klasseNavn ?? `Kontoklasse ${klasseId}`,
          tag: `Klasse ${klasseId}`,
          niva: 'kontoklasse',
          serier: {},
          childrenMap: {},
        }
      }
      const kl = klasser[klasseId]
      if (!kl.serier[aar]) kl.serier[aar] = { regnskap: 0, saldert: null, revidert: null }
      kl.serier[aar].regnskap += d.belop

      if (!kl.childrenMap[ak]) {
        kl.childrenMap[ak] = {
          id: `${node.id}-akk${ak}`,
          navn: d.navn ?? `Artskonto ${ak}`,
          tag: `Konto ${ak}`,
          niva: 'artskonto',
          serier: {},
        }
      }
      const ko = kl.childrenMap[ak]
      if (!ko.serier[aar]) ko.serier[aar] = { regnskap: 0, saldert: null, revidert: null }
      ko.serier[aar].regnskap += d.belop
    }
  }

  return Object.values(klasser).map(kl => ({
    ...kl,
    childrenMap: undefined,
    children: Object.values(kl.childrenMap),
  }))
}

// ---------------------------------------------------------------------------
// Globalt søk: flat indeks over hele hierarkiet med sti

export function byggSokeindeks(hierarki) {
  const indeks = []
  const gaa = (nodes, sti) => {
    for (const n of nodes) {
      indeks.push({ node: n, sti })
      if (n.children) gaa(n.children, [...sti, n])
    }
  }
  gaa(hierarki, [])
  return indeks
}

export function sokGlobalt(indeks, tekst, maks = 20) {
  const q = tekst.toLowerCase()
  const treff = []
  for (const item of indeks) {
    const { node } = item
    if (node.navn.toLowerCase().includes(q) || (node.tag ?? '').toLowerCase().includes(q)) {
      treff.push(item)
      if (treff.length >= maks) break
    }
  }
  return treff
}

// ---------------------------------------------------------------------------
// CSV-eksport av gjeldende visning

export function lastNedCSV(rader, filnavn) {
  const header = 'Navn;Referanse;Beløp (mill. kr);Andel (%)'
  const linjer = rader.map(r =>
    [r.navn, r.tag ?? '', String(r.verdi).replace('.', ','), r.andel?.toFixed(1)?.replace('.', ',') ?? '']
      .map(felt => `"${String(felt).replace(/"/g, '""')}"`)
      .join(';')
  )
  // BOM slik at Excel leser æøå riktig
  const blob = new Blob(['﻿' + [header, ...linjer].join('\r\n')],
    { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filnavn
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------------------
// URL-hash-tilstand (delbare lenker)

export function lesHashTilstand() {
  const h = window.location.hash.replace(/^#/, '')
  if (!h) return null
  const params = new URLSearchParams(h)
  return {
    side: params.get('side') === 'i' ? 'inntekter' : params.get('side') === 'u' ? 'utgifter' : null,
    aar: params.get('aar') ? parseInt(params.get('aar'), 10) : null,
    modus: params.get('modus'),
    skjulFin: params.get('fin') === null ? null : params.get('fin') === '1',
    stiIds: params.get('sti')?.split(',').filter(Boolean) ?? [],
  }
}

export function skrivHashTilstand({ side, aar, modus, skjulFin, sti }) {
  const params = new URLSearchParams()
  params.set('side', side === 'inntekter' ? 'i' : 'u')
  if (aar) params.set('aar', String(aar))
  if (modus && modus !== 'lopende') params.set('modus', modus)
  params.set('fin', skjulFin ? '1' : '0')
  // Bare noder i hovedtreet (departement/kapittel/post) kan gjenopprettes fra id
  const ids = sti
    .filter(n => ['departement', 'kapittel', 'post'].includes(n.niva))
    .map(n => n.id)
  if (ids.length) params.set('sti', ids.join(','))
  const ny = '#' + params.toString()
  if (window.location.hash !== ny) {
    window.history.replaceState(null, '', ny)
  }
}

/** Finn node-sti fra en liste id-er (id-ene er nestet: u-13, u-13-1320, …) */
export function finnStiFraIds(hierarki, ids) {
  const sti = []
  let nivaa = hierarki
  for (const id of ids) {
    const node = nivaa?.find(n => n.id === id)
    if (!node) break
    sti.push(node)
    nivaa = node.children
  }
  return sti
}
