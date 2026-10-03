import { writeFileSync } from 'node:fs'
import { buildReport } from './report.mjs'
import { validateArticle } from './schema.mjs'
import { renderReview } from './render-review.mjs'
const report = buildReport(new URL('../../web/public/data', import.meta.url).pathname)
const copy = {
  title: 'Staten vokser. Hvor mye er bare dyrere kroner?',
  description:
    'Vi skiller prisvekst fra vekst i statens utgifter per innbygger. Regnskapet gir et tydelig svar på størrelsen, men ikke på hva vi får igjen.',
  lead: 'En milliard er et stort tall. En milliard mange år senere er et annet stort tall. Før vi diskuterer hvor mye staten har vokst, må vi finne ut hvor mye av veksten som skyldes dyrere kroner og flere innbyggere.',
  conclusion:
    'Fra {{fact:startYear}} til {{fact:endYear}} økte de avgrensede statlige utgiftene med {{fact:nominalGrowth}} i løpende kroner. Etter justering for folketall og konsumprisvekst var økningen per innbygger {{fact:realPerCapitaGrowth}}. Det er en målt endring i pengebruk, ikke en karakter på tjenestene.',
  linkedin:
    'En milliard her og en milliard der. Men kronen har også blitt eldre.\n\nFra {{fact:startYear}} til {{fact:endYear}} økte statens utgifter med {{fact:nominalGrowth}}. Trekker vi inn folketall og prisvekst, er økningen per innbygger {{fact:realPerCapitaGrowth}}.\n\nRegnskapet forteller hvor mye mer vi bruker. Hva vi får igjen, krever flere spørsmål.\n\nVi har ryddet i regningen — og forklart hva tallene ikke sier.',
  sections: [
    {
      heading: 'Den store regningen trenger en målestokk',
      factIds: ['nominalGrowth', 'total'],
      paragraphs: [
        'Statens samlede utgifter er lette å omtale og vanskelige å forestille seg. I sluttåret i denne analysen utgjorde utgiftene {{fact:total}}, etter at finansposter og overføringer til Oljefondet er tatt ut. Sammenligner vi bare dette beløpet med startåret, finner vi en vekst på {{fact:nominalGrowth}}. Det er riktig regnet, men alene er det en ufullstendig beskrivelse.',
        'Et nominelt beløp forteller hva som er bokført i det aktuelle årets kroner. Det sier ikke hva kronene kunne kjøpe, eller hvor mange innbyggere pengene skal fordeles på. Derfor starter analysen med det store beløpet og deler spørsmålet opp: Hvor mye endres når vi tar hensyn til befolkning, og hvor mye gjenstår når vi også tar hensyn til konsumprisene?',
      ],
    },
    {
      heading: 'Flere innbyggere deler på beløpet',
      factIds: ['populationGrowth', 'firstPerCapita', 'lastPerCapita'],
      paragraphs: [
        'Befolkningen økte med {{fact:populationGrowth}} i perioden. Hvis utgiftene hadde steget like mye som folketallet, ville utgift per innbygger vært uendret i løpende kroner. Å dele på befolkningen gir derfor et mer nyttig størrelsesmål når vi vil sammenligne år med ulikt innbyggertall.',
        'Utgiftene per innbygger gikk fra {{fact:firstPerCapita}} til {{fact:lastPerCapita}}. Dette er en fordeling av statens samlede regnskapsbeløp på folketallet, ikke en faktura til hver innbygger og ikke et anslag på verdien av offentlige tjenester den enkelte mottar. Pensjoner, tilskudd og overføringer inngår sammen med statens egen drift.',
      ],
    },
    {
      heading: 'Kronene har også endret seg',
      factIds: ['priceGrowth', 'firstRealPerCapita', 'lastPerCapita'],
      paragraphs: [
        'Konsumprisindeksen steg med {{fact:priceGrowth}} fra startåret til sluttåret. For å gi beløpene samme prisnivå regner vi startårets utgifter om til sluttårets kroner. Da blir startårets beløp per innbygger {{fact:firstRealPerCapita}}, mot {{fact:lastPerCapita}} i sluttåret. Sammenligningen er nå justert både for befolkningen og for konsumprisnivået.',
        'Vi bruker KPI fordi det er et kjent og etterprøvbart mål på prisutvikling, og fordi den samme serien brukes i Fellestalls øvrige visninger. Det er samtidig en viktig begrensning: Staten kjøper ikke den samme handlekurven som en husholdning. Lønn, bygg og enkelte andre innkjøp kan utvikle seg annerledes. Faste kroner i denne analysen må derfor leses som KPI-justerte beløp.',
      ],
    },
    {
      heading: 'Det som står igjen etter justeringene',
      factIds: ['realPerCapitaGrowth'],
      paragraphs: [
        'Etter begge justeringene er endringen i utgift per innbygger {{fact:realPerCapitaGrowth}}. Beregningen deler først utgiftene på folketallet og justerer deretter med forholdet mellom konsumprisindeksene. Vi trekker ikke prosentene direkte fra hverandre; det ville gi et annet og mindre presist resultat.',
        'Grafen viser forløpet mellom endepunktene, ikke bare forskjellen mellom start og slutt. Begge kurver er satt til samme indeksverdi i startåret. Når utgift per innbygger stiger raskere enn priskurven, øker det KPI-justerte beløpet. Tabellen under grafen gjør det mulig å undersøke enkeltår og følge regnestykket uten å måtte tolke kurvene alene.',
      ],
    },
    {
      heading: 'Mer pengebruk er ikke automatisk mer tjeneste',
      factIds: [],
      paragraphs: [
        'Et samlet regnskap kan ikke svare på om innbyggerne får bedre tjenester, om behovene har vokst eller om pengene brukes mer effektivt. En slik vurdering krever opplysninger om aktiviteter, resultater, kvalitet og hvem som mottar tjenestene. Å beskrive endringen som sløsing eller effektivisering ville gå lenger enn dette datagrunnlaget tillater.',
        'Analysen identifiserer heller ikke hvilke beslutninger eller hendelser som forklarer veksten. Befolkningen kan få en annen alderssammensetning, og regnskapet kan inneholde ulike blandinger av drift og overføringer gjennom perioden. Dette er relevante spørsmål for videre analyser, men de er ikke forklaringer vi har dokumentert her.',
      ],
    },
    {
      heading: 'Hva du kan bruke sammenligningen til',
      factIds: [],
      paragraphs: [
        'Sammenligningen gir et utgangspunkt for en mer konkret diskusjon: Når noen omtaler veksten i statens pengebruk, gjelder det nominelle beløp, kroner per innbygger eller prisjusterte kroner per innbygger? Alle målene kan være nyttige, men de svarer på forskjellige spørsmål. Å oppgi målestokken gjør påstanden lettere å etterprøve.',
        'Neste steg er å se hvilke utgiftsområder som bidrar til endringen, og undersøke aktivitet og resultater der datagrunnlaget tillater det. Her har vi avgrenset oss til totalsummen og samme filtre som standardvisningen på Fellestall. Kilder, beregningsmetode og datadato følger artikkelen, slik at resultatet kan leses som en dokumentert måling fremfor en ferdig dom over staten.',
      ],
    },
  ],
}
const article = validateArticle({
  slug: 'staten-prisvekst-og-utgifter-per-innbygger',
  status: 'draft',
  createdAt: new Date().toISOString(),
  topic: 'Statsfinanser',
  geography: 'Staten',
  type: 'Utvikling over tid',
  report,
  copy,
})
writeFileSync(
  new URL('../../editorial/drafts/pilot.json', import.meta.url),
  JSON.stringify(article, null, 2) + '\n',
)
writeFileSync(
  new URL('../../editorial/drafts/pilot.md', import.meta.url),
  renderReview(article) + '\n',
)
console.log('Pilotutkast skrevet. Ikke publisert eller godkjent.')
