import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildReport } from './report.mjs'
import { validateArticle } from './schema.mjs'
import { renderReview } from './render-review.mjs'
const report = buildReport(new URL('../../web/public/data', import.meta.url).pathname)
const copy = {
  title: 'Statens regning har vokst. Prisvekst forklarer ikke alt.',
  description:
    'Når priser og folketall er tatt med i regnestykket, står en økning igjen. Følg kurven og se når utgiftene tok spranget, hvor de landet, og hvilket spørsmål det åpner for.',
  lead: 'En større regning. Dyrere kroner. Flere innbyggere. Det virker ganske lett å forklare veksten i statsregnskapet – helt til vi legger utviklingen på samme målestokk. Da dukker et annet spørsmål opp: Når tok utgiftene spranget, og hvor landet de etterpå?',
  conclusion:
    'Etter KPI-justering økte statens utgift per innbygger med {{fact:realPerCapitaGrowth}} fra {{fact:startYear}} til {{fact:endYear}} i denne avgrensningen. Fram til {{fact:previousYear}} var veksten {{fact:growthBeforeChange}}; det største årlige spranget kom i {{fact:largestChangeYear}}. Nivået ligger fortsatt høyere flere år etterpå. Mønsteret peker mot en endring som varer utover selve spranget. Hva løftet regningen, og hvilke forpliktelser fulgte med? Det er spørsmålet totalsummen åpner for. KPI måler konsumpriser, så økningen sier noe om pengebruken med denne målestokken, ikke om tjenestevolum.',
  linkedin:
    'Statsregnskapet har vokst med {{fact:nominalGrowth}} fra {{fact:startYear}} til {{fact:endYear}}.\n\nInflasjonen rekker opp hånden. For en gangs skyld bidrar den til en mindre dramatisk overskrift.\n\nNår vi justerer for priser og folketall, står en økning på {{fact:realPerCapitaGrowth}} per innbygger igjen.\n\nSluttsummen skjuler likevel det mest interessante:\nVar dette en topp som gikk over, eller et nivå som ble værende?\n\nVi fulgte kurven gjennom perioden. Se spranget og årene etterpå i analysen med grafer ↓',
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
      heading: 'Følg kurven, ikke bare sluttsummen',
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
        'En startverdi og en sluttverdi forteller hvor langt vi har kommet, men lite om veien dit. Fra {{fact:startYear}} til {{fact:previousYear}} var økningen i KPI-justert utgift per innbygger {{fact:growthBeforeChange}}. Kurven beveger seg forholdsvis beskjedent gjennom disse årene. Så kommer {{fact:largestChangeYear}}, og forløpet skifter karakter.',
        'I samme kroneverdi går regningen fra {{fact:firstRealPerCapita}} per innbygger i startåret til {{fact:lastPerCapita}} i {{fact:endYear}}. Den stiplede linjen holder startårets nivå fast. Følg avstanden mellom den og utgiftskurven: Hvor åpner den seg, og lukker den seg igjen?',
        'Spranget er lett å få øye på. Årene etterpå fortjener like mye oppmerksomhet. Kurven faller noe tilbake før den stiger igjen, men ender fortsatt over nivået før spranget. Allerede her blir det vanskelig å lese hele perioden som jevn vekst, eller som en kort topp som er borte ved sluttåret.',
      ],
    },
    {
      heading: 'Et sprang. Og så?',
      factIds: ['largestChangeYear', 'largestAnnualChange', 'growthAfterChange', 'endYear'],
      paragraphs: [
        'Årsstolpene gjør det enklere å se rykkene. I {{fact:largestChangeYear}} øker den KPI-justerte utgiften per innbygger med {{fact:largestAnnualChange}}. Det er den største årlige endringen i absoluttverdi i perioden. Se så på stolpene som følger: Noen peker nedover. Likevel tar de ikke regnskapet tilbake dit det startet.',
        'Fra sprangåret til {{fact:endYear}} er den samlede økningen ytterligere {{fact:growthAfterChange}}. Det er altså både et stort løft og en videre utvikling å forklare. Slår vi alt sammen til én vekstprosent, forsvinner forskjellen mellom dem. Årsstolpene gir oss et mer presist spørsmål: Hva skjedde i sprangåret, og hva holdt nivået oppe etterpå?',
        'Å kjenne tidspunktet er et sted å begynne letingen. Det er ikke i seg selv en forklaring. Den finnes eventuelt i utgiftsområdene: hvilke poster som økte, om oppgaver ble flyttet, og hvor mye av endringen som gjelder drift, investeringer eller overføringer. Totalsummen kan peke oss i en retning, men ikke avgjøre hvilken forklaring som er riktig.',
      ],
    },
    {
      heading: 'En topp – eller et nytt nivå?',
      factIds: ['realPerCapitaGrowth', 'startYear', 'endYear'],
      paragraphs: [
        'Hvis dette bare var en kortvarig topp som raskt gikk over, ville vi ventet å finne kurven tilbake nær nivået før spranget. Slik ser ikke denne serien ut. I {{fact:endYear}} ligger den KPI-justerte pengebruken per innbygger {{fact:realPerCapitaGrowth}} over {{fact:startYear}}. Sammen med forløpet gjennom mellomårene peker det mot et høyere regnskapsnivå som strekker seg over flere år.',
        'Da åpner det seg et spørsmål om offentlige forpliktelser: Hvilke behov, oppgaver eller prioriteringer ligger bak den større regningen? Også kostnadene staten møter kan ha utviklet seg annerledes. Dette er spor å undersøke, ikke forklaringer vi har påvist. Serien alene kan heller ikke fortelle hvilke utgifter som vil fortsette etter {{fact:endYear}}.',
        'Akkurat her er målestokken viktig. Staten handler ikke med husholdningenes handlekurv. Dersom statens egne kostnader øker annerledes enn konsumprisene, betyr ikke KPI-justert vekst at tjenestevolumet har vokst tilsvarende. Det høyere nivået er synlig i regnskapet med denne justeringen; hva som ligger bak det, må vi undersøke nærmere.',
      ],
    },
    {
      heading: 'Hva fikk vi for den større regningen?',
      factIds: [],
      paragraphs: [
        'Det er nærliggende å spørre hva innbyggerne fikk igjen. Men summen rommer pensjoner, tilskudd og andre overføringer sammen med statens egen drift. Den større regningen kan derfor ikke leses direkte som flere behandlinger, flere ansatte eller bedre kvalitet. Et svar om resultater trenger andre mål enn beløpet alene.',
        'Også uttrykket «per innbygger» fortjener en ekstra tanke. Vi gir alle innbyggere samme vekt, selv om en endret alderssammensetning kan gi andre behov. Regnskapet følger samme avgrensning som Fellestalls standardvisning. Det gjør pengebruken sammenlignbar med den visningen, men gir oss ingen ferdig karakterbok for effektivitet eller sløsing.',
      ],
    },
    {
      heading: 'Neste spor ligger inni totalsummen',
      factIds: ['previousYear', 'largestChangeYear', 'endYear'],
      paragraphs: [
        'Hvilke utgiftsområder bidro mest til forskjellen mellom {{fact:previousYear}} og {{fact:endYear}}? Og er det de samme områdene som står bak spranget i {{fact:largestChangeYear}}? En oppfølging bør begynne med å bryte ned beløpene og avstemme dem mot totalsummen, før vi undersøker oppgavene og postene bak endringen.',
        'Deretter må vi se etter det regnskapet ikke forklarer på egen hånd. Flyttede ansvarsområder og ulik kostnadsutvikling kan påvirke sammenligningen. Det har også betydning om økningen gjelder overføringer eller statens egne tjenester. En rangering av departementer etter vekst kan være en inngang, men er ingen forklaring uten den gjennomgangen.',
        'Vi begynte med en større regning og tok hensyn til dyrere kroner og flere innbyggere. Det som står igjen, er både en økning og et tydelig sprang i tidsserien. Kurven har gitt oss et sted å lete videre. Nå ligger det interessante sporet i postene som løftet nivået, og forpliktelsene de kan fortelle om.',
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
