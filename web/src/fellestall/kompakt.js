/**
 * Adapter fra ETL-formatet til den kompakte modellen Fellestall-grafene bruker.
 *
 * ETL-en skriver et lesbart format – {id, navn, tag, niva, serier: {aar:
 * {regnskap, saldert, revidert}}, children} – mens seksjonene her leser tusenvis
 * av noder per render og trenger korte nøkler og serier som array:
 *
 *   i  id            s[aar][0]  regnskap
 *   n  navn          s[aar][1]  saldert
 *   t  tag           s[aar][2]  revidert
 *   l  nivå (d/k/p)  c          barn
 *   f  finanspost (90-post)     x  overføring til/fra Oljefondet
 *   om omrade  ka kategori  pt posttype  hd har artskontodetaljer
 *
 * Konverteringen skjer én gang ved innlasting, ikke per render.
 */

const NIVAA = { departement: 'd', kapittel: 'k', post: 'p' }

function kompaktNode(node) {
  const ut = { i: node.id, n: node.navn, l: NIVAA[node.niva] ?? node.niva, s: {} }
  if (node.tag) ut.t = node.tag
  if (node.fin) ut.f = 1
  if (node.transfer) ut.x = 1
  if (node.omrade) ut.om = node.omrade
  if (node.kategori) ut.ka = node.kategori
  if (node.postType) ut.pt = node.postType
  if (node.harDetaljer != null) ut.hd = node.harDetaljer ? 1 : 0
  for (const [aar, serie] of Object.entries(node.serier ?? {})) {
    ut.s[aar] = [serie.regnskap ?? 0, serie.saldert ?? null, serie.revidert ?? null]
  }
  if (node.children?.length) ut.c = node.children.map(kompaktNode)
  return ut
}

/**
 * Gjør hele datasettet fra loadAll() om til Fellestall-modellen.
 * Årstall brukes som nøkler både som tall og streng i kildedataene, så
 * befolkning/kpi/fondsverdi beholdes som de er og leses med String(aar).
 */
export function kompaktData(raa) {
  return {
    meta: raa.meta,
    befolkning: raa.befolkning ?? {},
    fondsverdi: raa.fondsverdi ?? {},
    kpi: raa.kpi ?? {},
    utgifter: raa.utgifter.map(kompaktNode),
    inntekter: raa.inntekter.map(kompaktNode),
  }
}

/**
 * Detaljfil for ett departement → {ak, poster}.
 * ETL: {postId: {artskonto: {aar: {kontoId: {navn, klasse, klasseNavn, belop}}}}}
 * Her: kontonavnene løftes ut i et delt oppslag, slik at posttabellen bare
 * inneholder beløp.
 */
export function kompaktDetaljer(raa) {
  if (!raa) return null
  const ak = {}
  const poster = {}
  for (const [postId, post] of Object.entries(raa)) {
    if (!post?.artskonto) continue
    const perAar = {}
    for (const [aar, konti] of Object.entries(post.artskonto)) {
      const rad = {}
      for (const [id, konto] of Object.entries(konti)) {
        rad[id] = konto.belop
        if (!ak[id]) {
          const klasse = konto.klasse ?? id[0]
          ak[id] = [konto.navn ?? `Artskonto ${id}`, klasse, konto.klasseNavn ?? `Kontoklasse ${klasse}`]
        }
      }
      perAar[aar] = rad
    }
    poster[postId] = perAar
  }
  return { ak, poster }
}

// ---------------------------------------------------------------------------
// Oppslag i den kompakte modellen

/**
 * Beløp for en node i et år. si = 0 regnskap, 1 saldert, 2 revidert.
 *
 * Med filtrering summeres barna framfor å lese den forhåndsberegnede serien på
 * departement og kapittel: den inkluderer finansposter og fondsoverføringer
 * selv når barna er filtrert bort.
 */
export function verdi(node, aar, si = 0, filtrer = true) {
  if (node.l === 'kl' || node.l === 'ak') return node.s?.[aar]?.[si] ?? 0
  if (filtrer && (node.f || node.x)) return 0
  if (filtrer && node.c) return node.c.reduce((s, k) => s + verdi(k, aar, si, true), 0)
  return node.s?.[aar]?.[si] ?? 0
}

/** Barna til en node, med finansposter og fondsoverføringer eventuelt skjult */
export const barn = (node, skjulFin) => {
  const c = node?.c ?? []
  return skjulFin ? c.filter((k) => !k.f && !k.x) : c
}

/** Toppnivået for en side, med samme filtrering som barn() */
export const rot = (data, side, skjulFin) => {
  const h = side === 'utgifter' ? data.utgifter : data.inntekter
  return skjulFin ? h.filter((k) => !k.f && !k.x) : h
}

/** Sum over alle noder på toppnivået */
export const sumRot = (noder, aar, si = 0) => noder.reduce((s, n) => s + verdi(n, aar, si), 0)

/** Sum av kapitler merket som fondsoverføring (kap. 2800 inn, kap. 5800 ut) */
export function sumFondsoverforing(hierarki, aar) {
  let sum = 0
  for (const dept of hierarki) {
    for (const kap of dept.c ?? []) if (kap.x) sum += kap.s?.[aar]?.[0] ?? 0
  }
  return sum
}

/** Kroner per innbygger, avrundet til nærmeste hundrelapp for lesbarhet */
export function perInnbygger(millKr, folk) {
  if (!folk) return null
  return Math.round((millKr * 1e6) / folk / 100) * 100
}

/** Antall poster i et hierarki – brukes bare til å tallfeste datagrunnlaget */
export function tellPoster(hierarki) {
  let n = 0
  const gaa = (node) => {
    if (node.l === 'p') n++
    ;(node.c ?? []).forEach(gaa)
  }
  hierarki.forEach(gaa)
  return n
}

/**
 * Pseudotre kontoklasse → artskonto for én post, bygget fra detaljfilen.
 * Artskonto finnes bare i regnskapet; budsjettall har ingen underliggende konti.
 */
export function artskontoTre(post, detalj) {
  const rader = detalj?.poster?.[post.i]
  if (!rader) return []
  const klasser = {}
  for (const [aar, konti] of Object.entries(rader)) {
    for (const [id, belop] of Object.entries(konti)) {
      const [navn, klasse, klasseNavn] = detalj.ak[id] ?? [`Artskonto ${id}`, id[0], `Kontoklasse ${id[0]}`]
      const kl = (klasser[klasse] ??= {
        i: `${post.i}-kl${klasse}`, n: klasseNavn, t: `Kontoklasse ${klasse}`, l: 'kl', s: {}, kontoMap: {},
      })
      ;(kl.s[aar] ??= [0, null, null])[0] += belop
      const konto = (kl.kontoMap[id] ??= { i: `${post.i}-ak${id}`, n: navn, t: `Konto ${id}`, l: 'ak', s: {} })
      ;(konto.s[aar] ??= [0, null, null])[0] += belop
    }
  }
  // Summene akkumuleres i flyttall; rund av så «0,30000000000000004» ikke vises
  const rund = (s) => {
    const ut = {}
    for (const [aar, v] of Object.entries(s)) ut[aar] = [Math.round(v[0] * 10) / 10, null, null]
    return ut
  }
  return Object.values(klasser)
    .map((kl) => ({
      i: kl.i, n: kl.n, t: kl.t, l: 'kl', s: rund(kl.s),
      c: Object.values(kl.kontoMap).map((k) => ({ ...k, s: rund(k.s) })),
    }))
    .sort((a, b) => a.t.localeCompare(b.t, 'nb'))
}

/** Departementsfilen en node hører til: «u-13-1320-01» → «u-13» */
export const detaljFil = (nodeId) => nodeId.split('-').slice(0, 2).join('-')
