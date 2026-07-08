/**
 * Reserve-etikett for posttype ut fra postnummer.
 *
 * Primærkilden er DFØs egne felt på noden: `postType` (tekstlig posttype) og
 * `omrade`/`kategori` (programområde/-kategori = formål). Denne funksjonen
 * brukes KUN som reserve når `postType` mangler i dataene (f.eks. før ETL har
 * kjørt med kildefeltene, eller for rene budsjettposter). Etiketten er en
 * gjengivelse av statens standard kontoplan (bevilgningsreglementet) – ingen
 * fritekst utover selve klassenavnet.
 */
function typeUtgift(nr) {
  if (nr >= 90) return 'Lånetransaksjon'
  if (nr >= 70) return 'Tilskudd / stønad'
  if (nr >= 60) return 'Overføring til kommuner'
  if (nr >= 50) return 'Overføring til statlige mottakere'
  if (nr >= 30) return 'Investering'
  return 'Drift'
}
function typeInntekt(nr) {
  if (nr >= 90) return 'Tilbakebetaling / finans'
  if (nr >= 70) return 'Skatt eller avgift'
  if (nr >= 50) return 'Overføring'
  if (nr >= 30) return 'Salg av eiendom mv.'
  return 'Salg og gebyrer'
}

/** Reserve-posttype fra tag («Post 75») + side. Returnerer streng eller null. */
export function posttypeFallback(tag, side) {
  const nr = Number(String(tag ?? '').match(/(\d+)/)?.[1])
  if (!Number.isFinite(nr)) return null
  return side === 'inntekter' ? typeInntekt(nr) : typeUtgift(nr)
}
