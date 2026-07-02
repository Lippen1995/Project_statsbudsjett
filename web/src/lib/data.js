/**
 * Data-loading og aggregeringshjelper.
 * Leser JSON-filer fra /data/.
 */

let _cache = {}

async function loadJSON(path) {
  if (_cache[path]) return _cache[path]
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Klarte ikke laste ${path}: ${res.status}`)
  _cache[path] = await res.json()
  return _cache[path]
}

export async function loadAll() {
  const [meta, utgifter, inntekter, befolkning] = await Promise.all([
    loadJSON('./data/meta.json'),
    loadJSON('./data/utgifter.json'),
    loadJSON('./data/inntekter.json'),
    loadJSON('./data/befolkning.json'),
  ])
  return { meta, utgifter, inntekter, befolkning }
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

/**
 * Bygg et pseudo-tre av kontoklasser → artskontoer fra en post-nodes
 * artskonto-data, med serier per år (kun regnskap — budsjett vedtas
 * ikke på artskontonivå). Brukes for å drille forbi post-nivået.
 */
export function byggArtskontoTre(node) {
  if (!node?.artskonto) return []
  const klasser = {}   // klasseId → klassenode
  const kontoer = {}   // artskontoId → kontonode

  for (const [aar, konti] of Object.entries(node.artskonto)) {
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

      const kontoKey = `${klasseId}-${ak}`
      if (!kontoer[kontoKey]) {
        kontoer[kontoKey] = {
          id: `${node.id}-akk${ak}`,
          navn: d.navn ?? `Artskonto ${ak}`,
          tag: `Konto ${ak}`,
          niva: 'artskonto',
          serier: {},
        }
        kl.childrenMap[ak] = kontoer[kontoKey]
      }
      const ko = kontoer[kontoKey]
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

/** Summer alle direktebarn (brukes for % av parent) */
export function sumBarn(node, year, serie = 'regnskap') {
  if (!node.children) return getVerdi(node, year, serie)
  return node.children.reduce((s, c) => s + (getVerdi(c, year, serie) ?? 0), 0)
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

/** Per-innbygger-skalering */
export function perInnbygger(verdi, befolkning, year) {
  const pop = befolkning?.[year]
  if (!verdi || !pop) return null
  return (verdi * 1_000_000) / pop  // mill kr → kr per person
}
