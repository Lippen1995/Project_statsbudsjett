import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildReport } from './report.mjs'
import { validateArticle } from './schema.mjs'
import { renderReview } from './render-review.mjs'
const report = buildReport(new URL('../../web/public/data', import.meta.url).pathname)
const copy = {
  title: 'Pandemien slapp taket. Hva holdt statens regning oppe?',
  description:
    'Koronapandemien setter utgiftsspranget i sammenheng. Men hva skjedde etter gjenåpningen? Vi følger konkrete kriseposter, Ukraina-støtte og pensjonsutgifter gjennom regnskapet.',
  lead: 'Under koronapandemien skulle ekstraordinære utgifter holde samfunnet og økonomien i gang. Så åpnet samfunnet igjen. Flere kriseutgifter falt, men den prisjusterte regningen per innbygger kom ikke tilbake til nivået før pandemien. Hva holdt den oppe? Svaret blir mer interessant når vi åpner regnskapet og ser hvilke poster som faktisk endret seg.',
  conclusion:
    'Koronapandemien gir spranget i {{fact:largestChangeYear}} en konkret historisk sammenheng. Etterpå falt dagpengeutgiftene kraftig, og en navngitt koronakompensasjon ble nesten borte. Samtidig kom bokført militær støtte til Ukraina til, og pensjonsutgiftene vokste også målt per innbygger etter KPI-justering. Regningen skiftet innhold. At totalnivået ble værende høyt, viser derfor ikke i seg selv at koronatiltakene ble permanente. Hovedserien økte {{fact:realPerCapitaGrowth}} fra {{fact:startYear}} til {{fact:endYear}}. Eksemplene forklarer deler av bildet; en full fordeling av veksten krever alle postene.',
  linkedin:
    'Koronastøtten skulle være midlertidig.\nTotalsummen leste tydeligvis ikke det med liten skrift.\n\nFlere kriseutgifter falt. Likevel ble statens utgifter per innbygger liggende over nivået før pandemien, også etter prisjustering.\n\nSå kom vrien: Regningen var fortsatt stor, men innholdet hadde endret seg.\n\nKoronakompensasjon krympet. Militær støtte til Ukraina og pensjonsutgifter tok mer plass.\n\nHva holdt regningen oppe da krisetiltakene krympet?\n\nVi åpnet regnskapet. Se hva som krympet, og hva som tok plass ↓',
  sections: [
    {
      heading: 'Hvor stor er regningen når målestokken er lik?',
      factIds: ['nominalGrowth', 'nominalPerCapitaGrowth', 'realPerCapitaGrowth'],
      paragraphs: [
        'Utgiftene har økt med {{fact:nominalGrowth}} i løpende kroner. Det er et tall som tar plass. Men en gammel krone og en ny krone kjøper ikke nødvendigvis det samme, og flere innbyggere deler regningen. Hvor mye av økningen står igjen når vi tar hensyn til begge deler?',
        'Først deler vi beløpene på folketallet. Da blir veksten {{fact:nominalPerCapitaGrowth}}. Deretter justerer vi for konsumprisene, og står igjen med {{fact:realPerCapitaGrowth}}. Figuren under lar oss lese det samme regnskapet med ulike målestokker. Hvert mål svarer på et eget spørsmål; prosentene kan ikke legges sammen eller trekkes direkte fra hverandre.',
        'Legg merke til den siste stolpen. Den er betydelig kortere enn den første, men den er fortsatt over null. Dyrere kroner og flere innbyggere gjør altså mye av veksten mindre dramatisk. Likevel gjenstår en økning i KPI-justert pengebruk per innbygger. Det er denne forskjellen det blir interessant å følge videre.',
      ],
    },
    {
      heading: 'Sprangåret har et navn: koronapandemien',
      factIds: [
        'startYear',
        'previousYear',
        'growthBeforeChange',
        'largestChangeYear',
        'endYear',
        'firstRealPerCapita',
        'lastPerCapita',
        'largestAnnualChange',
        'dagpengerPeakAmount',
      ],
      paragraphs: [
        'Fra {{fact:startYear}} til {{fact:previousYear}} var økningen i KPI-justert utgift per innbygger {{fact:growthBeforeChange}}. Så kommer {{fact:largestChangeYear}}, med et årlig løft på {{fact:largestAnnualChange}}. Koronapandemien og nedstengingene utløste behov for inntektsstøtte, kompensasjon og ekstra helseinnsats. Her gir pandemien en konkret forklaring på hvorfor det oppstod ekstraordinære utgifter.',
        'Et konkret utslag finnes i dagpengeposten. Den når {{fact:dagpengerPeakAmount}} i sprangåret. Posten omfatter også ordinær arbeidsledighet, så vi kan ikke føre hele beløpet som koronastøtte. Men den gir oss en faktisk regnskapslinje å følge når vi undersøker hva som skjedde under pandemien og etterpå.',
        'I samme kroneverdi går hovedserien fra {{fact:firstRealPerCapita}} per innbygger i startåret til {{fact:lastPerCapita}} i {{fact:endYear}}. Den stiplede linjen holder startnivået fast. Følg kurven gjennom spranget og årene etterpå. Det interessante spørsmålet er nå hva som skulle falle bort da samfunnet åpnet igjen, og hva som i stedet holdt regningen oppe.',
      ],
    },
    {
      heading: 'Kriseutgiftene falt. Hele kurven fulgte ikke etter.',
      factIds: [
        'largestChangeYear',
        'growthAfterChange',
        'endYear',
        'dagpengerLastAmount',
        'dagpengerRealGrowthSinceReference',
      ],
      paragraphs: [
        'Det er rimelig å vente at midlertidige kriseutgifter blir mindre når behovet avtar. Det skjedde også med dagpenger: I {{fact:endYear}} er beløpet {{fact:dagpengerLastAmount}}, klart under sprangårets nivå. Med samme pris- og befolkningsjustering som hovedserien er endringen {{fact:dagpengerRealGrowthSinceReference}}. Denne posten ble altså betydelig mindre, selv om statens samlede utgifter holdt seg høye.',
        'Årsstolpene viser at hovedserien også har år med nedgang etter {{fact:largestChangeYear}}. Utgiftsnivået faller noe tilbake før det stiger igjen. Ved slutten av perioden er KPI-justert utgift per innbygger ytterligere {{fact:growthAfterChange}} over sprangåret. En nedgang i en stor krisepost og et høyt totalnivå kan dermed finnes i det samme regnskapet.',
        'Her er skillet som totalsummen lett skjuler: Den viser størrelsen på regningen, ikke om innholdet er det samme. For å avgjøre om en midlertidig ordning ble videreført, må vi følge ordningen. For å forklare hvorfor hele kurven holder seg oppe, må vi også se på postene som vokser mens den krymper.',
      ],
    },
    {
      heading: 'Noe forsvant nesten. Andre utgifter kom til.',
      factIds: [
        'koronakompensasjonPeakYear',
        'koronakompensasjonPeakAmount',
        'koronakompensasjonLastAmount',
        'ukrainastotteFirstRecordedYear',
        'ukrainastotteLastAmount',
        'alderspensjonRealGrowthSinceReference',
        'endYear',
      ],
      paragraphs: [
        'En post heter uttrykkelig «Midlertidig kompensasjonsordning for foretak med stort omsetningsfall som følge av koronapandemien». Den er på {{fact:koronakompensasjonPeakAmount}} i {{fact:koronakompensasjonPeakYear}}, men bare {{fact:koronakompensasjonLastAmount}} i {{fact:endYear}}. Her er «midlertidig» synlig i beløpene. Dette er én post, ikke et komplett koronaregnskap; tidligere utbetalinger kan være ført andre steder.',
        'Så kommer en annen virkelig hendelse inn i bildet: krigen i Ukraina. Posten «Militær støtte til Ukraina» har regnskapsføring fra {{fact:ukrainastotteFirstRecordedYear}} i denne serien, og er på {{fact:ukrainastotteLastAmount}} i {{fact:endYear}}. Det er bokført støtte på denne posten, ikke all norsk Ukraina-støtte. Den viser likevel konkret at nye utgifter kom til etter pandemispranget.',
        'Også løpende utgifter beveget seg. Pensjonskapitlet «Alderdom» økte {{fact:alderspensjonRealGrowthSinceReference}} per innbygger etter KPI-justering fra sprangåret til {{fact:endYear}}. Regnskapet skiller ikke mellom flere mottakere, regulering og regelendringer. Det viser at veksten her ikke forsvinner med den samme justeringen vi bruker på totalen. Regningen rommer både skiftende kriser og utgifter som fortsetter mellom dem.',
      ],
    },
    {
      heading: 'En høy totalsum er ikke bevis på permanente koronatiltak',
      factIds: [],
      paragraphs: [
        'Når kurven ikke vender tilbake til nivået før pandemien, er det fristende å tenke at koronaregningen ble permanent. Eksemplene gir grunn til å stoppe ved den slutningen. Noen utgifter falt kraftig samtidig som andre vokste eller kom til. En høy totalsum kan derfor bestå selv når konkrete midlertidige ordninger blir langt mindre.',
        'Det sier noe om hvordan offentlige forpliktelser endrer seg gjennom perioden. Nye hendelser møter et regnskap som allerede har løpende oppgaver. Eksemplene viser deler av denne endringen i innhold, men summerer ikke hele veksten. De beviser heller ikke at alle kriseutgifter ble avviklet eller at en bestemt utgiftsøkning var nødvendig eller unødvendig.',
        'KPI måler husholdningenes konsumpriser, ikke statens egne kostnader. Utgifter rommer også pensjoner og overføringer, og beløpene forteller ikke hvor mye tjenesteproduksjon eller kvalitet innbyggerne fikk. Når vi bruker samme målestokk gjennom perioden, får vi et klarere bilde av pengebruken. En vurdering av resultatene krever andre mål i tillegg.',
      ],
    },
    {
      heading: 'Neste spørsmål: Hvem bidro hvor mye til den nye regningen?',
      factIds: ['previousYear', 'largestChangeYear', 'endYear'],
      paragraphs: [
        'Nå kan vi stille et mer presist spørsmål enn hvorfor regningen ikke forsvant sammen med nedstengingene: Hvor mye av forskjellen mellom {{fact:previousYear}} og {{fact:endYear}} skyldes poster som falt, poster som vokste og utgifter som kom til? En slik fordeling må ta med hele regnskapet og avstemmes mot totalen.',
        'Den bør skille spranget i {{fact:largestChangeYear}} fra utviklingen etterpå, og følge endrede postnavn og ansvarsområder slik at flytting ikke telles som ny pengebruk. Først da kan vi vekte eksemplene opp mot hverandre og forklare resten av forskjellen. Tabellen under viser de utvalgte postene som denne analysen faktisk har fulgt.',
        'Pandemien gir oss bakgrunnen for å forstå krisespranget. Postene etterpå viser hvorfor det ikke holder å vente at én hendelse skal ta hele regningen med seg ut døren. Innholdet endret seg mens totalsummen forble høy. Det er denne endringen neste gjennomgang bør gjøre fullt rede for.',
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
