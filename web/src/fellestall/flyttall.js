import { PETRO, kapNr, visNavn, BLAA, GULL, RUST } from './design.js'
import { verdi, barn } from './kompakt.js'

const STORE = new Set(['5501', '5521', '5700'])
const fondNode = (n) => ({ ...n, x: undefined, ...(n.c ? { c: n.c.map(fondNode) } : {}) })
const gruppe = (i, n, c) => ({ i, n, c, l: 'gruppe' })

/** Inntekter til den ordinære statskassen; petroleum spares i fondet og lån er finansiering. */
export function flytKilder(data, skjulFin) {
  const skatter = [], andre = [], fond = [], store = []
  for (const d of data.inntekter) for (const k of d.c ?? []) {
    const nr = kapNr(k.t)
    if (k.x) { fond.push(fondNode(k)); continue }
    if ((skjulFin && k.f) || PETRO.has(nr) || nr === '5999') continue
    if ((Number(nr) >= 5501 && Number(nr) <= 5599) || nr === '5700') {
      if (STORE.has(nr)) store.push(k)
      else skatter.push(k)
    } else andre.push(k)
  }
  return [...store.map((node) => ({ node, farge: BLAA })),
    { node: gruppe('flyt-skatter', 'Andre skatter og avgifter', skatter), farge: '#5F7A3E' },
    { node: gruppe('flyt-andre', 'Gebyrer, renter og utbytte', andre), farge: '#6B6A66' },
    { node: gruppe('flyt-fond', 'Overføring fra Oljefondet', fond), farge: GULL }]
}

const flytBelop = (node, aar, si, skjulFin) => node.l === 'gruppe'
  ? node.c.reduce((sum, n) => sum + flytBelop(n, aar, si, skjulFin), 0)
  : verdi(node, aar, si, skjulFin)

/** Små områder samles i en klikkbar gruppe, slik at ingen positive beløp forsvinner. */
export function flytRader(noder, aar, si, skjulFin, farge = RUST, restNavn = 'Øvrige områder') {
  const alle = noder.map((entry) => {
    const node = entry.node ?? entry
    return { node, navn: visNavn(node), mill: flytBelop(node, aar, si, skjulFin), farge: entry.farge ?? farge, kortnavn: entry.kortnavn,
      kanNed: barn(node, skjulFin).length > 0 }
  }).filter((r) => r.mill > 0).sort((a, b) => b.mill - a.mill)
  const total = alle.reduce((s, r) => s + r.mill, 0)
  const antallStore = Math.min(9, Math.max(1, alle.filter((r) => r.mill >= total * .025).length))
  const rest = alle.slice(antallStore)
  if (rest.length < 2 && alle.length <= 10) return alle
  return [...alle.slice(0, antallStore), { node: gruppe('flyt-ovrige', restNavn, rest.map((r) => r.node)),
    navn: restNavn, mill: rest.reduce((s, r) => s + r.mill, 0), farge, kanNed: true }]
}

const erFolketrygd = (node) => {
  const nr = Number(kapNr(node.t))
  return node.l === 'k' && nr >= 2500 && nr < 2800
}
const erFellesInntekt = (k) => {
  const nr = kapNr(k.t)
  return k.x || PETRO.has(nr) || ['5700', '5999'].includes(nr)
    || (Number(nr) >= 5500 && Number(nr) <= 5599 && !/^sektoravgift/i.test(k.n))
}
const belopsNode = (i, n, mill, aar, si) => ({ i, n, l: 'p', s: { [aar]: [null, null, null, null].map((_, index) => index === si ? mill : null) } })

/**
 * Sammenstilling for et valgt utgiftsområde. Kapittelinntekter er bokførte beløp;
 * fordeling av felles folketrygdavgifter og inntekter til enkeltposter er en modell.
 * Ingen postnummerkobling eller øremerking utledes fra like postnumre.
 */
export function flytOmrade(data, fokus, aar, si, skjulFin) {
  const utKapitler = data.utgifter.flatMap((d) => d.c ?? [])
  const innKapitler = data.inntekter.flatMap((d) => d.c ?? [])
  const innPerNr = new Map(innKapitler.map((k) => [Number(kapNr(k.t)), k]))
  const kapAndeler = new Map(), heleDept = new Set()
  const leggTil = (n) => {
    if (n.l === 'd') { heleDept.add(n.i.replace(/^u-/, 'i-')); (n.c ?? []).forEach(leggTil) }
    else if (n.l === 'k') kapAndeler.set(n.i, { node: n, andel: 1 })
    else if (n.l === 'p') {
      const kap = utKapitler.find((k) => k.c?.some((p) => p.i === n.i))
      const total = kap && verdi(kap, aar, si, skjulFin)
      if (total > 0) kapAndeler.set(kap.i, { node: kap, andel: verdi(n, aar, si, skjulFin) / total })
    } else (n.c ?? []).forEach(leggTil)
  }
  leggTil(fokus)
  const direkte = new Map()
  for (const d of data.inntekter) if (heleDept.has(d.i)) {
    for (const k of d.c ?? []) if (!erFellesInntekt(k)) direkte.set(k.i, { node: k, andel: 1 })
  }
  for (const { node, andel } of kapAndeler.values()) {
    const inn = innPerNr.get(Number(kapNr(node.t)) + 3000)
    if (inn && !erFellesInntekt(inn)) direkte.set(inn.i, { node: inn, andel })
  }
  const direkteRader = [...direkte.values()].map(({ node, andel }) => ({
    node: belopsNode(node.i, `${node.n}${andel !== 1 ? ' · fordelt anslag' : ''}`, verdi(node, aar, si, skjulFin) * andel, aar, si),
    farge: BLAA,
  }))
  const folkTotal = utKapitler.filter(erFolketrygd).reduce((s, k) => s + Math.max(0, verdi(k, aar, si, skjulFin)), 0)
  const folkValgt = [...kapAndeler.values()].filter(({ node }) => erFolketrygd(node))
    .reduce((s, { node, andel }) => s + Math.max(0, verdi(node, aar, si, skjulFin)) * andel, 0)
  const avgifter = innPerNr.get(5700)
  const avgiftsAndel = folkTotal > 0 ? folkValgt / folkTotal : 0
  const avgiftsRader = avgifter && avgiftsAndel > 0
    ? (avgifter.c?.length ? avgifter.c : [avgifter]).map((p) => ({
      node: belopsNode(`andel-${p.i}`, `${p.n} · beregnet andel`, verdi(p, aar, si, skjulFin) * avgiftsAndel, aar, si), farge: BLAA, kortnavn: `${p.n} (anslag)`,
    })) : []
  let kilder = flytRader([...direkteRader, ...avgiftsRader], aar, si, false, BLAA, 'Andre områdeinntekter')
  const utgift = flytBelop(fokus, aar, si, skjulFin)
  const tilbakebetaling = [...direkteRader, ...avgiftsRader].reduce((s, r) => s - Math.min(0, flytBelop(r.node, aar, si, false)), 0)
  const inntekt = kilder.reduce((s, r) => s + r.mill, 0) - tilbakebetaling
  const kreditering = barn(fokus, skjulFin).reduce((s, n) => s - Math.min(0, flytBelop(n, aar, si, skjulFin)), 0)
  if (kreditering > 0) kilder.push({ navn: 'Inntektsføring på utgiftskapitler', mill: kreditering, farge: '#6B6A66', kanNed: false })
  const rest = utgift - inntekt
  if (rest > 0) kilder.push({ node: belopsNode('flyt-finansiering', 'Felles finansiering: skatter og Oljefondet', rest, aar, si),
    navn: 'Felles finansiering: skatter og Oljefondet', kortnavn: 'Skatter og Oljefondet', mill: rest, farge: GULL, kanNed: false })
  return { kilder, utgift, inntekt, rest, kreditering, tilbakebetaling, avgiftsAndel, fordeltPost: fokus.l === 'p' }
}
