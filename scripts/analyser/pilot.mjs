import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildReport } from './report.mjs'
import { validateArticle } from './schema.mjs'
import { renderReview } from './render-review.mjs'
const report = buildReport(new URL('../../web/public/data', import.meta.url).pathname)
const copy = {
  title: 'Statens regning har vokst. Prisvekst forklarer ikke alt.',
  description:
    'Prisvekst og flere innbyggere forklarer mye av veksten, men ikke hele. Grafene viser et tydelig løft i utgiftsnivået og gir oss et mer konkret spørsmål å følge opp.',
  lead: 'Når kvitteringen blir lengre, er det fristende å skylde på prislappen. Vi har korrigert for både dyrere kroner og flere innbyggere. Regningen er fortsatt større, og grafene viser at mye av endringen kom som et sprang.',
  conclusion:
    'Staten har fått et høyere utgiftsnivå per innbygger i denne avgrensningen. Etter KPI-justering er økningen {{fact:realPerCapitaGrowth}} fra {{fact:startYear}} til {{fact:endYear}}. Fram til {{fact:previousYear}} var veksten {{fact:growthBeforeChange}}; det største årlige spranget kom i {{fact:largestChangeYear}}. At nivået fortsatt er høyere i sluttåret, antyder mer enn en kort topp i regnskapet. Neste spørsmål er hvilke utgiftsområder som løftet nivået, og hva endringen betyr for statens forpliktelser. KPI måler konsumpriser, så dette er en vurdering av pengebruk målt med den målestokken, ikke av tjenestevolum.',
  linkedin:
    'Statsregnskapet har vokst. Kronen har krympet. Begge deler må få plass i regnestykket.\n\nFra {{fact:startYear}} til {{fact:endYear}} økte statens utgifter med {{fact:nominalGrowth}}. Etter justering for priser og folketall er økningen per innbygger {{fact:realPerCapitaGrowth}}.\n\nDet mest interessante er når det skjedde: Fram til {{fact:previousYear}} var den prisjusterte veksten {{fact:growthBeforeChange}}. Det største årlige spranget kom i {{fact:largestChangeYear}}.\n\nVår vurdering: Prisvekst forklarer mye, men ikke hele økningen. Nå bør vi undersøke hvilke deler av regnskapet som har løftet nivået.\n\nGrafene og regnestykkene ligger i analysen.',
  sections: [
    {
      heading: 'Samme regnskap. Tre forskjellige spørsmål.',
      factIds: ['nominalGrowth', 'nominalPerCapitaGrowth', 'realPerCapitaGrowth'],
      paragraphs: [
        'Den store overskriften er en vekst på {{fact:nominalGrowth}} i løpende utgifter. Det beskriver regnskapsbeløpet, men ikke hvor mye av endringen som skyldes flere innbyggere eller dyrere kroner. En sammenligning som stopper der, kan få staten til å se ut som om den har vokst langt mer enn den prisjusterte pengebruken per innbygger.',
        'Deler vi først på folketallet, blir veksten {{fact:nominalPerCapitaGrowth}}. Justerer vi også for konsumprisene, står {{fact:realPerCapitaGrowth}} igjen. Figuren under viser disse som alternative mål på samme utvikling. De skal ikke legges sammen eller trekkes direkte fra hverandre; justeringene skjer gjennom forholdstall.',
        'Dette gjør hovedfunnet mer presist: En betydelig del av den nominelle veksten forsvinner når målestokken blir lik. Samtidig forsvinner ikke hele økningen. Prisvekst og befolkningsvekst er derfor viktige deler av forklaringen på endringen i regnskapets størrelse, men den valgte justeringen etterlater en tydelig økning per innbygger.',
      ],
    },
    {
      heading: 'Det store løftet kom i {{fact:largestChangeYear}}',
      factIds: [
        'startYear',
        'previousYear',
        'growthBeforeChange',
        'largestChangeYear',
        'endYear',
        'firstRealPerCapita',
        'lastPerCapita',
      ],
      paragraphs: [
        'En sammenligning mellom start og slutt kan skjule hvordan endringen faktisk skjedde. Fra {{fact:startYear}} til {{fact:previousYear}} økte den KPI-justerte utgiften per innbygger med {{fact:growthBeforeChange}}. Grafen viser et forholdsvis stabilt nivå gjennom denne delen av perioden. Den store endringen i tidsserien kommer deretter i {{fact:largestChangeYear}}.',
        'I samme kroneverdi går beløpet fra {{fact:firstRealPerCapita}} per innbygger i startåret til {{fact:lastPerCapita}} i {{fact:endYear}}. Den stiplede linjen holder startårets nivå fast. Dermed kan vi se både spranget og at utgiften per innbygger fortsatt ligger over utgangspunktet flere år senere.',
        'Vår lesning av forløpet er at staten ender perioden på et høyere prisjustert utgiftsnivå. Den årlige utviklingen er ujevn, så endepunktene bør ikke omtales som jevn vekst gjennom hele perioden. Grafen gjør det også vanskelig å beskrive hele forskjellen som en kortvarig topp som allerede er borte ved sluttåret.',
      ],
    },
    {
      heading: 'Årsveksten avslører rykkene',
      factIds: ['largestChangeYear', 'largestAnnualChange', 'growthAfterChange', 'endYear'],
      paragraphs: [
        'Den største årlige endringen i absoluttverdi er en økning på {{fact:largestAnnualChange}} i {{fact:largestChangeYear}}. Stolpene under gjør spranget synlig og viser at det også finnes år med nedgang etterpå. Regnskapet beveger seg i rykk, ikke som en rett linje mellom endepunktene.',
        'Fra året med det store spranget til {{fact:endYear}} økte den KPI-justerte utgiften per innbygger videre med {{fact:growthAfterChange}}. Det betyr at en del av nivåendringen ble etterfulgt av ny vekst, selv om enkelte mellomår trakk i motsatt retning. Et godt oppfølgingsspørsmål må derfor skille mellom det store spranget og utviklingen som kom senere.',
        'Tidspunktet er en observasjon, ikke en dokumentert årsaksforklaring. Grafen viser når regnskapsnivået endret seg. For å forklare hvorfor trenger vi å gå inn i utgiftsområdene og undersøke hvilke poster som økte, om oppgaver ble flyttet, og om endringene gjelder drift, investeringer eller overføringer.',
      ],
    },
    {
      heading: 'Hva resultatet antyder',
      factIds: ['realPerCapitaGrowth', 'startYear', 'endYear'],
      paragraphs: [
        'Vi vurderer økningen på {{fact:realPerCapitaGrowth}} som en tydelig endring i prisjustert pengebruk per innbygger. Målt med denne målestokken bruker staten mer ved slutten av perioden enn i {{fact:startYear}}. Kombinert med tidsforløpet peker det mot et høyere regnskapsnivå som strekker seg over flere år, fremfor en utvikling som bare drives av et større folketall og dyrere konsumvarer.',
        'Det er relevant når man diskuterer størrelsen på offentlige forpliktelser. En større prisjustert utgift kan henge sammen med større behov, andre oppgaver, endret kostnadsutvikling eller andre prioriteringer. Dette er mulige spørsmål å undersøke, ikke forklaringer vi har bevist med totalsummen. Vi vet heller ikke fra denne serien hvilke endringer som vil fortsette etter {{fact:endYear}}.',
        'KPI-forbeholdet betyr noe akkurat her: Staten kjøper ikke husholdningenes handlekurv. Dersom statens egne kostnader øker annerledes enn konsumprisene, blir ikke KPI-justert vekst det samme som vekst i tjenestevolum. Hovedfunnet gir grunn til å undersøke endringen nærmere, men det gir ikke alene et mål på hvor mye mer offentlig tjenesteproduksjon innbyggerne får.',
      ],
    },
    {
      heading: 'Hva den større regningen ikke avgjør',
      factIds: [],
      paragraphs: [
        'Summen inkluderer pensjoner, tilskudd og andre overføringer sammen med statens egen drift. En økning i regnskapet kan derfor ikke uten videre oversettes til flere ansatte, flere behandlinger eller bedre kvalitet. Den kan heller ikke brukes som en ferdig dom over effektivitet eller sløsing.',
        'Befolkningsjusteringen gir alle innbyggere samme vekt og tar ikke hensyn til endret alderssammensetning. Vi holder sammenligningen til regnskap og bruker samme avgrensning som Fellestalls standardvisning. Forbeholdene endrer ikke det beregnede resultatet, men de begrenser hva vi kan slutte fra det.',
      ],
    },
    {
      heading: 'Neste spørsmål: Hvor kom nivåendringen fra?',
      factIds: ['previousYear', 'largestChangeYear', 'endYear'],
      paragraphs: [
        'Den mest nyttige oppfølgingen er å undersøke hvilke utgiftsområder som bidro til forskjellen mellom {{fact:previousYear}} og {{fact:endYear}}, og hvilke som stod for spranget i {{fact:largestChangeYear}}. Først bør beløpene avstemmes mot totalsummen. Deretter kan vi se på oppgaver og regnskapsposter som kan forklare endringen.',
        'En slik gjennomgang må skille bokførte endringer fra endringer i faktiske tjenester. Flyttede ansvarsområder og ulike kostnadsforløp kan påvirke sammenligningen. En seriøs forklaring trenger derfor mer enn å rangere departementene etter vekst og gi dem karakterer.',
        'Konklusjonen her er at prisvekst og flere innbyggere ikke forklarer hele økningen målt med KPI, og at tidsserien gir oss et konkret sted å begynne letingen. Vi har funnet et mønster i regnskapet. Neste analyse bør undersøke hva som ligger bak det, med samme åpne regnestykke og tydelige avgrensning.',
      ],
    },
  ],
}
const path = new URL('../../editorial/drafts/pilot.json', import.meta.url)
const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const article = validateArticle({
  slug: 'staten-prisvekst-og-utgifter-per-innbygger',
  status: 'draft',
  createdAt: previous?.createdAt ?? new Date().toISOString(),
  generatedAt: new Date().toISOString(),
  topic: 'Statsfinanser',
  geography: 'Staten',
  type: 'Utvikling over tid',
  report,
  copy,
})
writeFileSync(path, JSON.stringify(article, null, 2) + '\n')
writeFileSync(
  new URL('../../editorial/drafts/pilot.md', import.meta.url),
  renderReview(article) + '\n',
)
console.log('Revidert pilotutkast skrevet. Ikke publisert eller godkjent.')
