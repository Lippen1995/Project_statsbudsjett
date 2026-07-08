/**
 * Klarspråk-forklaringer for «Forklart»-visningen.
 *
 * Statsbudsjettet er organisert etter departement (utgifter) og
 * inntektskapittel. Kodene og kapittelnavnene sier vanlige folk lite –
 * her oversetter vi dem til hva pengene faktisk går til / kommer fra.
 *
 * Nøkler er de to sifrene i node-id (u-06 → "06") for departementer, og
 * kapittelnummeret (tag «Kap. 5501» → "5501") for inntekter.
 */

// --- Utgifter: hva hvert departement betaler for ---------------------------
export const DEPARTEMENT = {
  '06': {
    ikon: '🧓',
    kort: 'Trygd, pensjon og NAV',
    tekst: 'Folketrygden: alderspensjon, uføretrygd, sykepenger, dagpenger og ' +
      'arbeidsavklaring. Også NAV og integrering. Statens desidert største utgift.',
  },
  '07': {
    ikon: '🏥',
    kort: 'Sykehus og helse',
    tekst: 'Sykehusene og spesialisthelsetjenesten, legemidler på blå resept, ' +
      'psykisk helse og folkehelsearbeid.',
  },
  '02': {
    ikon: '🎓',
    kort: 'Skole og utdanning',
    tekst: 'Barnehager, grunnskole, videregående, fagskoler, universiteter og ' +
      'høyskoler, forskning og studiestøtte gjennom Lånekassen.',
  },
  '05': {
    ikon: '🏘️',
    kort: 'Kommunene og distriktene',
    tekst: 'Rammetilskudd til kommuner og fylker som betaler for eldreomsorg, ' +
      'skole og lokale tjenester. Også bolig- og distriktspolitikk.',
  },
  '17': {
    ikon: '🛡️',
    kort: 'Forsvaret',
    tekst: 'Forsvaret: soldater, materiell, øvelser og militær beredskap.',
  },
  '13': {
    ikon: '🚆',
    kort: 'Vei, bane og transport',
    tekst: 'Veier, jernbane, kollektivtransport, kyst og luftfart.',
  },
  '08': {
    ikon: '👶',
    kort: 'Barn og familie',
    tekst: 'Barnetrygd, kontantstøtte, foreldrepenger, barnevern og tros- og ' +
      'livssynssamfunn.',
  },
  '04': {
    ikon: '⚖️',
    kort: 'Politi og justis',
    tekst: 'Politi, domstoler, fengsler, brann og redning, og sivil beredskap.',
  },
  '01': {
    ikon: '🌍',
    kort: 'Utenriks og bistand',
    tekst: 'Bistand til fattige land, utenrikstjenesten og norsk deltakelse i ' +
      'internasjonalt samarbeid.',
  },
  '09': {
    ikon: '🐟',
    kort: 'Næring og fiskeri',
    tekst: 'Støtte til næringsliv, fiskeri og havbruk, eksport og statlig eierskap.',
  },
  '11': {
    ikon: '🌾',
    kort: 'Landbruk og mat',
    tekst: 'Jordbruksavtalen, støtte til bønder, skogbruk og mattrygghet.',
  },
  '14': {
    ikon: '🌱',
    kort: 'Klima og miljø',
    tekst: 'Klimatiltak, naturvern, forurensning og miljøovervåking.',
  },
  '03': {
    ikon: '🎭',
    kort: 'Kultur og likestilling',
    tekst: 'Kultur, idrett, frivillighet, medier, kirke og likestilling.',
  },
  '15': {
    ikon: '💻',
    kort: 'Digitalisering og forvaltning',
    tekst: 'Digitalisering av det offentlige, felles IT-løsninger, ' +
      'statsforvaltningen og offentlige innkjøp.',
  },
  '18': {
    ikon: '⚡',
    kort: 'Energi',
    tekst: 'Kraft, energiforsyning, vassdrag og forvaltning av olje- og ' +
      'gassressursene.',
  },
  '16': {
    ikon: '💰',
    kort: 'Statens økonomi',
    tekst: 'Statens økonomistyring, Skatteetaten, statsgjeld og pensjon til ' +
      'statsansatte. Overføringer til Oljefondet er holdt utenfor her.',
  },
}

// --- Inntekter: hvor pengene kommer fra (etter kapittelnummer) --------------
export const INNTEKT = {
  '5501': {
    ikon: '💵',
    kort: 'Inntekts- og formuesskatt',
    tekst: 'Skatt på lønn, inntekt og formue fra privatpersoner.',
  },
  '5521': {
    ikon: '🛒',
    kort: 'Merverdiavgift (moms)',
    tekst: 'Moms – som regel 25 % – på det aller meste vi kjøper.',
  },
  '5507': {
    ikon: '🛢️',
    kort: 'Skatt på olje og gass',
    tekst: 'Særskatt og skatt på utvinning av petroleum i Nordsjøen.',
  },
  '5700': {
    ikon: '👷',
    kort: 'Trygde- og arbeidsgiveravgift',
    tekst: 'Trygdeavgift trukket fra lønn, og arbeidsgiveravgift fra bedrifter.',
  },
  '5501-selskap': { ikon: '🏢', kort: 'Selskapsskatt', tekst: 'Skatt på overskudd i bedrifter.' },
  '5999': {
    ikon: '🏦',
    kort: 'Lån (statslånemidler)',
    tekst: 'Penger staten låner for å få budsjettet i balanse.',
  },
  '5536': {
    ikon: '🚗',
    kort: 'Bilavgifter',
    tekst: 'Engangsavgift, trafikkforsikringsavgift og andre avgifter på kjøretøy.',
  },
  '5526': {
    ikon: '🍺',
    kort: 'Alkoholavgift',
    tekst: 'Særavgift på øl, vin og brennevin.',
  },
  '5531': {
    ikon: '🚬',
    kort: 'Tobakksavgift',
    tekst: 'Særavgift på tobakk og snus.',
  },
  '5543': {
    ikon: '⛽',
    kort: 'Miljø- og CO₂-avgift',
    tekst: 'Avgift på bensin, diesel og andre fossile produkter.',
  },
  '5565': {
    ikon: '🏠',
    kort: 'Dokumentavgift',
    tekst: 'Avgift du betaler når du tinglyser kjøp av bolig.',
  },
  '5351': {
    ikon: '🏦',
    kort: 'Overføring fra Norges Bank',
    tekst: 'Utbytte og overføringer fra sentralbanken.',
  },
  '5800': {
    ikon: '🛟',
    kort: 'Overføring fra Oljefondet',
    tekst: 'Oljepengebruken: den delen av Oljefondet staten bruker for å få ' +
      'budsjettet i balanse. Handlingsregelen sier at man over tid bare skal ' +
      'bruke den forventede avkastningen (om lag 3 %).',
  },
  '5440': {
    ikon: '🛢️',
    kort: 'Statens egne oljeinntekter (SDØE)',
    tekst: 'Statens direkte inntekter fra olje- og gassfeltene den eier andeler i.',
  },
  '5685': {
    ikon: '🏢',
    kort: 'Utbytte fra Equinor',
    tekst: 'Statens andel av overskuddet i Equinor.',
  },
  '5656': {
    ikon: '🏢',
    kort: 'Utbytte fra statlig eide selskaper',
    tekst: 'Utbytte fra selskaper staten eier, som Telenor, DNB og Aker Kværner.',
  },
}

// --- Inntekter: tematiske grupper for den lange halen -----------------------
// De fire store kildene (skatt, moms, trygdeavgift) og oljepengebruken vises
// som egne rader. Alle øvrige inntektskapitler samles i disse temaene, slik at
// samleposten «Annet» blir minimal i stedet for å sluke ~10 %.
export const INNTEKT_GRUPPER = {
  saeravgifter: {
    ikon: '🧾',
    kort: 'Særavgifter',
    tekst: 'Avgifter på varer og bruk: kjøretøy, drivstoff, strøm, alkohol, ' +
      'tobakk, dokumentavgift, CO₂ og toll.',
  },
  renterutbytte: {
    ikon: '🏦',
    kort: 'Renter og utbytte',
    tekst: 'Utbytte fra statlig eide selskaper og Norges Bank, og renter på ' +
      'statens innskudd, fordringer og utlån.',
  },
  laan: {
    ikon: '💳',
    kort: 'Tilbakebetaling av lån',
    tekst: 'Avdrag på statlige utlån – Lånekassen, Husbanken, Innovasjon Norge ' +
      'og boliglånsordningen. Dette er tilbakebetalt lån, ikke ny inntekt.',
  },
  virksomhet: {
    ikon: '🏢',
    kort: 'Virksomhetenes egne inntekter',
    tekst: 'Gebyrer, salg og driftsinntekter i statlige etater og selskaper.',
  },
  andreskatt: {
    ikon: '➕',
    kort: 'Andre skatter og avgifter',
    tekst: 'Finansskatt, sektoravgifter og mindre skatter og avgifter.',
  },
  annet: {
    ikon: '❔',
    kort: 'Annet',
    tekst: 'Diverse småposter som ikke passer i kategoriene over.',
  },
}

// Statsbank-/utlånskapitler der inntekten er avdrag (tilbakebetalt lån).
const LAAN_KAP = new Set(['5310', '5312', '5325', '5326', '5327', '5341', '4565'])

/**
 * Grupper et inntektskapittel i et tema ut fra kapittelnummer/navn.
 * Følger statsbudsjettets kapittelnummerering: 55xx = skatter/avgifter,
 * 56xx = renter og utbytte, 3xxx/4xxx = virksomhetenes egne inntekter osv.
 * De fire store kildene (5501, 5521, 5700) og oljepengebruken (5800) grupperes
 * ikke her – de vises som egne rader.
 */
export function grupperInntekt(tag, navn) {
  const nr = String(tag ?? '').match(/\d{3,4}/)?.[0] ?? ''
  const n = parseInt(nr, 10)
  if (/avdrag/i.test(navn ?? '') || LAAN_KAP.has(nr)) return 'laan'
  if (nr === '5511' || nr === '5506' || (n >= 5526 && n <= 5567)) return 'saeravgifter'
  if (nr === '5351' || (n >= 5600 && n <= 5693)) return 'renterutbytte'
  if (nr === '5502' || nr === '5509' || (n >= 5568 && n <= 5599) || (n >= 5700 && n <= 5799)) return 'andreskatt'
  if ((n >= 3000 && n <= 4999) || (n >= 5300 && n <= 5399)) return 'virksomhet'
  return 'annet'
}

/** Slå opp forklaring for et utgiftsdepartement ut fra node-id (u-06 → "06"). */
export function forklarDepartement(nodeId) {
  const kode = String(nodeId).split('-')[1]
  return DEPARTEMENT[kode] ?? null
}

/** Slå opp forklaring for et inntektskapittel ut fra tag «Kap. 5501». */
export function forklarInntekt(tag) {
  const nr = String(tag ?? '').match(/\d{3,4}/)?.[0]
  return nr ? (INNTEKT[nr] ?? null) : null
}
