/**
 * Forklaringer for budsjettposter.
 *
 * To lag, slik at ALLE poster får en forklaring:
 *
 * 1. POSTTYPE – postnummeret følger statens standard kontoplan
 *    (bevilgningsreglementet). Nummeret sier hva slags utgift/inntekt posten
 *    er: drift, investering, tilskudd, skatt, lånetransaksjon osv. Dette
 *    dekker enhver post, autoritativt.
 *
 * 2. KONSEPT – klarspråklige notater for gjengangere med et veldefinert
 *    innhold (de store skattene, folketrygdytelsene, rammetilskudd m.m.).
 *    Matches mot postnavnet. Overstyrer posttypen når det finnes et treff.
 *
 * Kilde for posttypene: Finansdepartementets bevilgningsreglement / standard
 * kontoplan for statsbudsjettet.
 */

// --- Lag 1: posttype ut fra postnummer -------------------------------------
function posttypeUtgift(nr) {
  if (nr >= 90) return { kort: 'Lånetransaksjon', tekst: 'Finanstransaksjon (90-post): utlån, avdrag på gjeld, kapitalinnskudd eller kjøp av aksjer – regnes ikke som en ordinær utgift.' }
  if (nr === 88 || nr === 89) return { kort: 'Renter på statsgjeld', tekst: 'Renter og provisjon på statens gjeld.' }
  if (nr >= 70) return { kort: 'Tilskudd / stønad', tekst: 'Overføring til private: tilskudd, stønader og ytelser til husholdninger, organisasjoner, næringsliv og utland.' }
  if (nr >= 60) return { kort: 'Overføring til kommuner', tekst: 'Tilskudd og overføringer til kommuner og fylkeskommuner.' }
  if (nr >= 50) return { kort: 'Overføring til statlige mottakere', tekst: 'Overføring til andre statlige regnskap, statsforetak og fond (bl.a. universiteter og Oljefondet).' }
  if (nr >= 30) return { kort: 'Investering', tekst: 'Investering: bygg, anlegg og større utstyrsanskaffelser med varig verdi.' }
  return { kort: 'Drift', tekst: 'Statens egen drift – lønn, husleie, utstyr og kjøp av varer og tjenester.' }
}

function posttypeInntekt(nr) {
  if (nr >= 90) return { kort: 'Tilbakebetaling / finans', tekst: 'Finanstransaksjon (90-post): avdrag på utlån, salg av aksjer og andre tilbakebetalinger.' }
  if (nr >= 70) return { kort: 'Skatt eller avgift', tekst: 'Skatt, avgift eller utbytte til staten.' }
  if (nr >= 50) return { kort: 'Overføring', tekst: 'Overføring til staten fra fond, statlige virksomheter eller kommuner.' }
  if (nr >= 30) return { kort: 'Salg av eiendom mv.', tekst: 'Inntekter fra bygg, anlegg og salg av eiendom.' }
  return { kort: 'Salg og gebyrer', tekst: 'Driftsinntekter: salg av varer og tjenester, gebyrer og refusjoner.' }
}

// --- Lag 2: klarspråklige konsepter (matches mot postnavn) ------------------
// Rekkefølge: mest spesifikke nøkkelord først (første treff vinner).
const KONSEPT = [
  // Skatter og avgifter
  ['fellesskatt', 'Den delen av inntektsskatten som tilfaller staten etter at kommune og fylke har fått sitt. Betales av alle med skattbar inntekt.'],
  ['formuesskatt', 'Skatt på nettoformue over et bunnfradrag. Mesteparten går til kommunene – her vises bare statens andel.'],
  ['trinnskatt', 'Trinnvis ekstraskatt på høyere arbeidsinntekter (het tidligere toppskatt).'],
  ['toppskatt', 'Trinnvis ekstraskatt på høyere inntekter (nå kalt trinnskatt).'],
  ['selskapsskatt', 'Skatt på overskudd i selskaper (upersonlige skattytere).'],
  ['kildeskatt på utbytte', 'Skatt utenlandske eiere betaler på utbytte fra norske selskaper.'],
  ['kildeskatt', 'Skatt utenlandske mottakere betaler på inntekt fra Norge.'],
  ['merverdiavgift', 'Moms – forbruksavgift, som regel 25 %, på varer og tjenester.'],
  ['meirverdiavgift', 'Moms – forbruksavgift, som regel 25 %, på varer og tjenester.'],
  ['arbeidsgiveravgift', 'Avgift arbeidsgivere betaler av det de utbetaler i lønn.'],
  ['trygdeavgift', 'Avgift trukket fra lønn, pensjon og næringsinntekt, øremerket folketrygden.'],
  ['dokumentavgift', 'Avgift ved tinglysing av kjøp av fast eiendom (bolig).'],
  ['petroleum', 'Skatter og avgifter fra utvinning av olje og gass.'],
  // Folketrygdens ytelser / store overføringer
  ['alderspensjon', 'Alderspensjon fra folketrygden.'],
  ['alderdom', 'Alderspensjon og relaterte ytelser til eldre fra folketrygden.'],
  ['uføretrygd', 'Ytelse til personer med varig nedsatt arbeidsevne.'],
  ['uførhet', 'Uføretrygd til personer med varig nedsatt arbeidsevne.'],
  ['arbeidsavklaringspenger', 'Ytelse mens man er under arbeidsavklaring hos NAV.'],
  ['sykepenger', 'Kompensasjon for tapt arbeidsinntekt ved sykdom.'],
  ['dagpenger', 'Ytelse til arbeidsledige.'],
  ['foreldrepenger', 'Inntekt under foreldrepermisjon ved fødsel og adopsjon.'],
  ['barnetrygd', 'Fast månedlig støtte til alle med barn under 18 år.'],
  ['kontantstøtte', 'Støtte for barn (1–2 år) som ikke har fulltidsplass i barnehage.'],
  ['bostøtte', 'Behovsprøvd støtte til boutgifter for husstander med lav inntekt.'],
  ['rammetilskudd', 'Statens frie overføring til kommuner/fylker, som de fordeler lokalt.'],
  ['integreringstilskudd', 'Tilskudd til kommuner som bosetter flyktninger.'],
  ['bistand', 'Norsk utviklingshjelp til fattigere land.'],
]

function forklarKonsept(navn) {
  const n = String(navn ?? '').toLowerCase()
  for (const [nøkkel, tekst] of KONSEPT) if (n.includes(nøkkel)) return tekst
  return null
}

/**
 * Forklar en post ut fra tag («Post 75») og navn.
 * side: 'utgifter' | 'inntekter'. Returnerer {kort, tekst} eller null.
 * `kort` = posttype (alltid), `tekst` = konseptforklaring hvis kjent, ellers
 * posttypens forklaring.
 */
export function forklarPost(tag, navn, side) {
  const nr = Number(String(tag ?? '').match(/(\d+)/)?.[1])
  if (!Number.isFinite(nr)) return null
  const type = side === 'inntekter' ? posttypeInntekt(nr) : posttypeUtgift(nr)
  const konsept = forklarKonsept(navn)
  return { kort: type.kort, tekst: konsept ?? type.tekst, erKonsept: !!konsept }
}
