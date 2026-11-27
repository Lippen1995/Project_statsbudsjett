# Sven Editorial Intelligence

Kartlegging oppdatert mot main `9796060` og eksisterende Sven-PR #90 (`dbedc77`), 26. november 2026. Den opprinnelig monterte arbeidskopien var eldre. Baselinecommit og konkrete
teksteksempler ligger i [baseline.json](baseline.json). Dette dokumentet skiller
mellom eksisterende produksjon, lokal implementering og verifikasjon.

## Faktisk utgangspunkt

Sven er en native, planlagt skriveoppgave. `docs/codex-weekly-analysis.md`
styrer køkontroll og tekstproduksjon med abonnementspålogging. `prepare.mjs`
fryser rapport og oppdrag; `handoff.mjs` og `workflow.mjs` gjenberegner rapporten,
kontrollerer avsender og gir botens utkast til en annen, menneskelig godkjenner.
`review.mjs`, innholdshash, autoriserte feedback-ID-er og GitHub-head beskytter
publisering. Budsjett-, olje-, post- og SSB-research har allerede egne kontroller.

`ai.mjs` er et eldre, deaktivert Responses API-løp. Det skal ikke reaktiveres.
Det instruerer dessuten om omfattende tekst, fast seksjonsrekkefølge og tre
grafer. Den aktive native oppgaven har nyere regler, men krever fortsatt minst
fire seksjoner og schema krever minst 450 ord. Det tvinger også korte funn inn i
rapportform. Artikkelsiden gjentar ingressen i «Vår vurdering» før brødteksten.

Kilder: ETL fra DFØ og SSB, lokale JSON-uttrekk, KOSTRA SQLite og Neon-snapshots.
`report.mjs`, `facts.mjs`, `event-evidence.mjs`, `ssb-research.mjs` og
`research-calculations.js` lager kontrollerte fakta. `schema.mjs` gjenberegner
fakta; friteksttall og fritekstlenker er sperret. Dette verifiserer ikke i seg selv
at en ikke-numerisk politisk påstand eller årsaksforklaring følger av en kilde.

Frontend: React/Vite, håndtegnede SVG-grafer, Recharts i klassisk utforsker,
delte designtokens i `fellestall/design.js` og CSS. `chart-plan.js` velger bare
frosne serier, kontrollerer enheter, manglende år og positiv indeksbase.
På fersk main støtter artikkelen linjer, stolper, fokuserte akser, endringspiler, budsjettbro og helsescenario. Utvidelsen gjenbruker disse og legger til små paneler og bedre mobilbredde. Treemap, Sankey og kart
finnes i utforskeren, ikke som generelle artikkelgrafer. Forhåndsvisning er SSR
og versjonsbundet via `previews.mjs` og Vite-pluginen. Ingen eksisterende
automatisk screenshot-/multimodal evalueringssløyfe ble funnet.

Læring: håndbok, preferanseregister, referansenotater og feedbackarkiv.
`server/admin/learning.mjs` lar administrator godkjenne/arkivere preferanser
og gjenopprette Git-versjoner. Native håndbok har ingen eksperimentell skill-evolusjon; PR #90 har allerede autonom parameterlæring gjennom signert evaluator, som nå utvides til skill-hasher.
Admin har rollevern, revisjonsspor, SHA-konfliktkontroll, jobber, publisering og
varsling. `sven-status.json` rapporterer faktisk native aktivitet. GitHub Actions
kjører kildeimport, kontroll, levering, forhåndsvisning og deploy. Det finnes
ingen separat modellruting eller eksakt native token-/pengekostnadsmåler.

## Eksisterende Sven-chat i PR #90

Den første arbeidskopien inneholdt ikke chatten. GitHub-kontrollen fant den i
åpen PR #90 (`feat/sven-grunnmur`), som derfor er integrert **lokalt** sammen med
fersk main før videre arbeid. Ingen GitHub-PR er flettet eller publisert.

`server/sven/research.mjs` har tolkning, samtalehistorikk, researchplan,
primærkildesøk, direkte dokumenthenting, evidenskomprimering, beregninger,
faglige moduler, kritikk og avgrenset revisjon. `provider.mjs` deler Anthropic-
transport med faktiske bruksmål, prompt-caching, strømming og eksplisitt
håndtering av avbrutte/betalbare kall. `workspace.mjs` har SQLite-jobber,
inputbundne checkpoints, idempotens og bruksspor. Kundelagringen bruker
Postgres, eierskapskontroll og kapasitet som reserveres atomisk. Kundens
historikk og preferanser skal fortsatt behandles innen eksisterende API.

`server/sven/benchmark.mjs` har allerede blind produktbenchmark;
`learning.mjs`, `learning-cycle.mjs` og `learning-config.mjs` har signert
uavhengig evaluering, privat holdout, kostnadskrav og automatisk tilbakeføring.
Disse gjenbrukes. Den første lokale prototypen på separat skill-evaluering ble
fjernet da dette ble oppdaget. Redaksjonell skill-evolusjon er nå en adapter,
ikke en ny evaluator eller læringsdatabase. Vanlig chat får ingen redaksjonelle
arbeidssteg; endringene i felles tuning/benchmark er bakoverkompatible tillegg.

Native publiseringsarbeid og API-chat har forskjellig utføringsmiljø.
Artikkelcheckpoints er små lokale JSON-artefakter fordi den native oppgaven
ikke er en kundejobb og ikke skal belastes kundens kvote. De lagrer bare
redaksjonelle beslutningsoppsummeringer og referanser til eksisterende research,
ikke en ny researchmotor eller et nytt samtaleminne. Et eksplisitt redaksjonelt
oppdrag kan bruke eksisterende `surface: editorial`; den vanlige chatruten
beholder `surface: chat`. Full produksjonstilgang og native modellkvote styres
fortsatt av verten.
## Baseline og gap

12 registerversjoner er tilgjengelige på fersk main, inklusive erstattede artikler.
Helsereformutkastet er hentet fra botens åpne PR #86, head `6e8627e`, og brukes
som sentral prøve med samme frosne report i før-/etterversjonen. Eksempler: pilotens «Legg merke til den
siste stolpen» og «Figuren under lar oss lese» bruker plass på leseinstruks;
«Det interessante spørsmålet er nå» utsetter funnet; både ingress, konklusjon og
siste seksjon gjentar at regningen skiftet innhold. Universitetssaken har allerede
en konkret leservinkel og mottakernevner: den er en bedre kontrolloppgave enn
å anta at alle eksisterende saker er like svake. Familieanalysen har god
kildestøttet mekanisme, men gjentar flere ganger at gevinsten varierer.
Ingen objektive 0–100-kvalitetspoeng er målt for baseline.

| Komponent | Valg | Gap og løsning | Risiko / kostnad / eksisterende funksjoner |
|---|---|---|---|
| Native produksjon og modell | REUSE | Trinnvis isolert oppgavekontekst; ingen ny API | Flere native pass bruker vertskvote; vanlig kjøring beholder køvern |
| Research og beregninger | EXTEND | Researchspørsmål, kilde-/påstandsregister og stopp ved hull | Kildearbeid tar tid; frosne rapporter endres bare via eksisterende researchrevisjon |
| Vinkel og dramaturgi | BUILD | Sporbare alternative tilnærminger og begrunnet valg før tekst | Egenvurdering er ingen sannhetsgaranti; større saker krever tre vinkler |
| Skriveskills og minne | EXTEND | Relevansbaserte, versjonerte moduler under eksisterende editorial | Avgrenset kontekst, gamle preferanser beholdes med autoritet |
| Evaluering | EXTEND | Eksisterende schema + beskyttet rubrikk, faktastopp og målrettet revisjon | Poeng må kalibreres; deterministiske kontroller erstatter ikke kildekritikk |
| Orkestrering | EXTEND | Lokale atomiske checkpoints, innholdsbinding, revisjons-/arbeidsgrenser | Avbrudd beholdes; ingen publisering ved budsjettstopp |
| Visuell arkitektur | EXTEND | Eksisterende serieoppslag og SVG, fleksibelt valg og rendering | Ingen vilkårlig kode, ingen ny grafmotor; grafantall følger saken |
| Visuell inspeksjon | BUILD | Faktisk desktop-/mobilcapture, artefakthash og visuell kritikk | Chromium og native bildelesing kreves; screenshot alene er ikke bestått |
| Skill-evolusjon | EXTEND | Adapter til eksisterende signerte læringsregister og benchmark | Endrer bare tre avgrensede skill-hasher; uavhengig evaluator beholder holdout og aktiveringskrav |
| Publisering og revisjon | REUSE | Intern kvalitetsgodkjenning legges foran eksisterende menneskelig vern | Eksakt versjon må fortsatt godkjennes; historiske artikler beholdes |
| Admin og observability | EXTEND | Vis vinkel, kontrollresultater, modellbruk og stopp i eksisterende review | Ingen ny database eller kø; ikke vis rå intern resonnering |
| Vanlig chat | REUSE | Research, historikk, transport, lagring og kvoter fra PR #90 bevares | Eksisterende regresjoner kjøres; live modellmålinger krever produksjonsoppsett |
| Kostnader | EXTEND | Arbeids-/revisjonsgrenser og observerte tokens med ukjent-verdi | Ikke dikt opp native dollarbeløp; ingen belastning på applikasjonsbrukere |

## Implementeringsrekkefølge

1. Frys baseline og kjør eksisterende tester før vesentlige endringer.
2. Utvid schema og visning bak eksplisitt artikkelformat; behold gamle hashes.
3. Bygg kontrollerbare redaksjonelle checkpoints og selektiv skill-loading.
4. Koble kvalitetsrapport til eksakt artikkel og eksisterende handoff/admin.
5. Gjør grafvalg fleksibelt i eksisterende SVG-visning og etabler capture/kritikk.
6. Versjoner avgrensede læringskandidater og test blindt med holdout/rollback.
7. Produser lokale prøver fra faktiske frosne rapporter, inspiser bildene,
   kjør regresjoner og dokumenter faktisk testdekning og eksterne blokkeringer.

Ingen databasemigrering er nødvendig. Private checkpoints og bilder lagres
lokalt utenfor publiseringsregisteret; bare korte vurderingsresultater følger
utkastet. Deploy og publisering er ikke del av lokal verifikasjon.
