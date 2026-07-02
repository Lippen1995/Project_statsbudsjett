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
