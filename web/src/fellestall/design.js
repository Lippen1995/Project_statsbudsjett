/**
 * Designtokens og redaksjonelle tekster for Fellestall-visningen.
 *
 * Fargene finnes også som CSS-variabler i fellestall.css. Duplikatet her er
 * for SVG-grafene, som setter fill/stroke i JS og ikke kan lese variabler.
 */

export const RUST = '#C7462E'
export const GRONN = '#14594F'
export const GULL = '#E3B23C'
export const BLEK = '#8C8A84'
export const INK = '#14161A'
export const BLAA = '#3C5A7D'
export const PAPIR = '#F7F5F0'
export const GRID = '#E2DDD3'
export const GRID_MORK = '#2E3037'

/** Kategorifarger for kart og arealgraf – dempet, i samme familie som RUST/GRØNN */
export const PALETT = [
  '#C7462E', '#14594F', '#B5872B', '#3C5A7D', '#8E4162', '#5F7A3E', '#A8582B', '#2F6E6A',
  '#7A4E8C', '#96442D', '#4A5B2E', '#6A6E76', '#B2603F', '#3E6B8E', '#874A4A', '#556B45',
]

/**
 * Petroleumskapitler. Inntektene her går rett inn i Oljefondet – de er ikke
 * penger staten bruker på budsjettet, og holdes derfor utenfor «skatt og avgift».
 */
export const PETRO = new Set(['5507', '5508', '5440', '5445', '5446', '5685'])

/** Kapittelnummeret i en tag som «Kap. 1320» */
export const kapNr = (t) => String(t ?? '').match(/\d{3,4}/)?.[0] ?? ''

/** Kortnavn på departementene – hva de faktisk betaler for, ikke hva de heter */
export const KORT = {
  'u-16': 'Finans og statsgjeld',
  'u-06': 'Pensjon, trygd og arbeid',
  'u-07': 'Helse og omsorg',
  'u-05': 'Kommuner og distrikt',
  'u-17': 'Forsvar',
  'u-02': 'Skole, forskning og utdanning',
  'u-09': 'Næring og fiskeri',
  'u-13': 'Vei, bane og transport',
  'u-08': 'Barn og familie',
  'u-01': 'Utenriks og bistand',
  'u-04': 'Justis og beredskap',
  'u-15': 'Digitalisering og forvaltning',
  'u-11': 'Landbruk og mat',
  'u-14': 'Klima og miljø',
  'u-03': 'Kultur og likestilling',
  'u-18': 'Energi',
}

/** Én setning om hva pengene på hvert område går til */
export const OMTALE = {
  'u-16': 'Skatteetaten, statsgjeld, overføringer til Oljefondet og rammetilskudd som forvaltes sentralt.',
  'u-06': 'Folketrygden: alderspensjon, sykepenger, uføretrygd, dagpenger og arbeidsmarkedstiltak.',
  'u-07': 'Sykehusene, legemidler på blå resept, fastlegeordningen og folkehelsearbeid.',
  'u-05': 'Rammetilskudd til kommuner og fylker, bolig- og distriktspolitikk, valg og IT i staten.',
  'u-17': 'Forsvarsgrenene, materiellinvesteringer, Heimevernet og deltakelse i NATO-operasjoner.',
  'u-02': 'Grunnskole og videregående, universiteter og høyskoler, studiestøtte og forskning.',
  'u-09': 'Næringsstøtte, eierskap i selskaper, fiskeri, havbruk og eksportfremme.',
  'u-13': 'Vei og jernbane – drift, vedlikehold og investeringer – kollektivtransport og post.',
  'u-08': 'Barnetrygd, kontantstøtte, barnehager, barnevern, familievern og forbrukersaker.',
  'u-01': 'Utviklingshjelp, ambassader, nødhjelp og bidrag til internasjonale organisasjoner.',
  'u-04': 'Politi, domstoler, kriminalomsorg, redningstjeneste og innvandringsforvaltning.',
  'u-15': 'Statens felles IT-løsninger, digitalisering, statsbygg og forvaltningspolitikk.',
  'u-11': 'Jordbruksavtalen, landbruksstøtte, reindrift, matsikkerhet og skogbruk.',
  'u-14': 'Klimatiltak, naturvern, forurensning, polarforvaltning og kulturminner.',
  'u-03': 'Kulturliv, idrett, frivillighet, medier, kirke og tros- og livssynssamfunn.',
  'u-18': 'Kraftforsyning, energiomstilling, petroleumsforvaltning og vassdrag.',
}

/** Navn som vises for en node: kortnavn hvis vi har et, ellers datanavnet */
export const visNavn = (node) => (node ? (KORT[node.i] ?? node.n) : '')

export const NIVAANAVN = {
  d: 'Departement',
  k: 'Kapittel',
  p: 'Post',
  kl: 'Kontoklasse',
  ak: 'Artskonto',
}

/**
 * Stortingets skattevedtak for 2025. Brukes til å anslå skatten på en lønn og
 * fordele den mellom stat, kommune og fylkeskommune.
 */
export const SATS = {
  minstefradrag: 0.46,
  minstefradragMaks: 92000,
  personfradrag: 108550,
  kommune: 12.75,
  fylke: 2.65,
  felles: 6.60,
  alminnelig: 22,
  trygd: 0.077,
  trygdGrense: 99650,
  trygdOpptrapping: 0.25,
  aga: 0.141,
  trinn: [[217400, 0.017], [306050, 0.04], [697150, 0.137], [942400, 0.167], [1410750, 0.177]],
}

/**
 * Skatt fra privatpersoner: fellesskatt, trinnskatt og formuesskatt
 * (kap. 5501 post 70/72/75) pluss trygdeavgift (kap. 5700 post 71).
 * Arbeidsgiveravgift og selskapsskatt holdes utenfor.
 */
export const PERSONPOST = { 5501: ['70', '72', '75'], 5700: ['71'] }

/** Seksjonene i venstremenyen, i leserekkefølge */
export const SEKSJONER = [
  { id: 'prisvekst', navn: 'Vokser staten?' },
  { id: 'kartet', navn: 'Kartet' },
  { id: 'flyten', navn: 'Flyten' },
  { id: 'utgifter', navn: 'Hvor pengene går' },
  { id: 'endringer', navn: 'Endringer' },
  { id: 'oljefondet', navn: 'Oljefondet' },
  { id: 'din-andel', navn: 'Lønnen din' },
  { id: 'utforsk', navn: 'Utforsk' },
]
