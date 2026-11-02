# Helsereformen – kontrollert arbeidsplan

Bestilling: `117452e6-471e-4f63-9271-d10fa35dc362`, ønsket skrivedato 2. november 2026. Bestillingen beholdes i køen. Dette er research og plan, ikke en levert eller publisert artikkel.

## Kontrollert primærkilde

NOU 2026:12, *Én helsetjeneste*, avgitt 2. november 2026. SHA-256: `b3a7c14bb2a21e8f1184de720396a5123415bb414a57e7c4e0635e19925ce51f`. Original-PDF ble hentet med HTTP 200 og har 476 PDF-sider. Lesing i denne økten: sammendragets anbefalinger og konsekvenskapitlet 33, særlig s. 406–409. Hele utredningen er ikke faglig gjennomgått.

Kilde: https://www.regjeringen.no/contentassets/8089c2908e604358ac67a5b9cbdf8d6e/no/pdfs/nou202620260012000dddpdfs.pdf

Viktige avgrensninger for den videre analysen:

- Dette er utvalgets forslag, ikke en vedtatt reform.
- Utvalget anbefaler fortsatt delt sørge-for-ansvar mellom stat og kommuner, samtidig med en nærhelsemodell og mer forpliktende samarbeid. Forslaget innebærer ikke at alle helsetjenester samles på ett forvaltningsnivå nå.
- Flertallets modell for spesialisthelsetjenesten innebærer at administrative oppgaver i de regionale helseforetakene flyttes til staten. Å fjerne RHF-navnet eller organisasjonen fjerner derfor ikke automatisk kostnadene ved oppgavene.
- Kapittel 33 beskriver vesentlige kostnader ved omstilling, lovendringer, digitale tjenester og nye plikter. Mange beløp må utredes nærmere. Det foreligger ikke her et ferdig samlet nettoanslag som kan brukes som en dokumentert innsparing.
- Potensielle gevinster omfatter blant annet færre innleggelser, mindre dobbeltarbeid, administrasjon og lokale støttefunksjoner. Frigjort tid, budsjettinnsparing og økt behandlingskapasitet er ulike resultater.

## Beregningsopplegg

1. Etabler en samlet baseline fra Fellestalls database og supplerende SSB-serier. Fellestall skal inngå i beregninger og grafer, ikke bare nevnes som kilde. Etabler deretter en SSB-baseline for helseutgifter etter produsent/formål og finansiering, personell/årsverk og lønn, alder/folketall, institusjons- og hjemmetjenester, samt sykehusaktivitet. Les faktisk tabellmetadata før valg. Unngå å summere overlappende helse- og kommuneregnskap.
2. Sammenstill historiske observerte data separat fra SSB-framskrivinger. Merk siste år, revisjoner, prisbasis og avgrensning.
3. Sett opp en transparent scenarioidentitet: netto budsjetteffekt = unngåtte kostnader + faktisk bortfalt administrasjon − nye driftskostnader − årlig omstillingskostnad. Finansieringsoverføringer mellom stat og kommune er ikke en samfunnsøkonomisk gevinst.
4. Beregn tid separat: frigjorte årsverk = berørte årsverk × tidsbesparelse × faktisk realisering. Fordel mellom mer pasienttid, redusert overtid/innleie og faktisk kostnadsreduksjon. Ikke tell samme gevinst to ganger.
5. Interaktive antakelser må være tydelig merket som scenarioer, aldri som utvalgets anslag. Bruk dokumenterte utgangsverdier; vis break-even og følsomhet for investeringer, varig drift, innfasing og realiseringsgrad.
6. Kvalitet og trygghet må ha egne mål. Et lavere kostnadsanslag dokumenterer ikke kortere ventetid, færre feil eller bedre behandling. Digitalisering og KI krever kompetanse, kontroll, ansvar og sikkerhet, ikke bare en produktivitetsprosent.

## Leveringsformat og faktisk fremdrift

Eksisterende `pipeline-reports.mjs` og artikkelskjema støtter bare kontrollerte regnskapsrapporter, budsjettforslag/-vedtak og oljepengerapporter. Bestillingen krever en kilde- og scenariorapport med egne inndata, formler, validering og interaktiv visning. En generell rapport om Helse- og omsorgsdepartementets regnskap vil ikke besvare den. Ikke merk temaet levert eller erstatt det med et annet.

PR #82 er nå godkjent på administratorens uttrykkelige instruks i chat, på eksakt head `5cdd7efbd60fb1f3c7aaba40e799a48db5cb7499`. Review `5742770930` er registrert som `APPROVED` av `Lippen1995`. Botens godkjenningsjobb `41518110828` og deploy `41518207090` har bestått. Boten har flettet PR-en, og den offentlige artikkelen er kontrollert med HTTP 200 og riktig tittel. Denne gjennomgangen sperrer ikke lenger helsereformen.

Neste implementeringssteg er en avgrenset rapporttype for dokumentert policyanalyse og økonomiske scenarioer som gjennomgår de samme kilde-, bot-, forhåndsvisnings- og eksakte godkjenningskontrollene. Ingen publisering eller nytt AI-API er nødvendig for dette.

### Første gjennomførte beregningsarbeid

`prepare.mjs` er kjørt på nytt etter godkjenningen og velger bestilling `117452e6-471e-4f63-9271-d10fa35dc362` med `pipelineState: research-required`. Bestillingen er beholdt. Det er ikke opprettet et generisk departementsutkast som erstatning.

Fem eksplisitte SSB-uttrekk er hentet lokalt og deretter uavhengig hentet, kontrollert og arkivert av GitHub Actions: [kildekontroll 41519811327](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/41519811327), resultat `success`. Forespørselscommit: `4801d8acb199c7acc051b782c88ce10e80998f94`. Arkivet er hentet fra fersk main før videre beregninger.

- `13953`: avtalte årsverk, hele landet, alle tjenester og yrker; eget uttrekk for tjenesteområdet administrasjon og service.
- `14533`: avtalte årsverk i omsorgstjenestene, landet, alle yrker.
- `07459`: menn og kvinner hentes separat, med eksplisitt sum av alderskodene 80 til 104 samt 105+, ved inngangen til hvert år. De to seriene summeres deretter uten overlapp.
- Alle seriene dekker 2020–2025. Det er observerte historiske tall, ingen reformprognose.

`baseline.py` lager `baseline.json` fra Fellestalls statsregnskap, kommunearkiv og de fem godkjente SSB-arkivene. Skriptet kontrollerer arkivhashene og krever hele perioden. Output lagrer SHA-256 for alle brukte filer. Kommunegrafenes første dokumenterte utvalg er Oslo, Bergen og Trondheim; det skal merkes som lokale eksempler, aldri som landet. Historiske kommunekoder i arkivet overlapper nyere geografier. En ukontrollert sum av alle kommunefiler ville derfor kunne dobbelttelle og brukes ikke.

Første beregnede funn, før årsaksfortolkning:

| Mål | 2020 | 2025 | Endring |
|---|---:|---:|---:|
| Statens kapittel for regionale helseforetak, løpende mrd. kr | 172,222 | 236,291 | +37,2 % |
| Avtalte årsverk i spesialisthelsetjenesten | 131 339 | 142 826 | +8,7 % |
| Avtalte årsverk i omsorgstjenestene | 146 612 | 163 755 | +11,7 % |
| Innbyggere fra 80 år, begge kjønn | 230 710 | 270 537 | +17,3 % |

Kapittelbeløpet inkluderer blant annet investeringslån og er ikke en driftskostnad eller et mål på RHF-administrasjon. Årsverk i administrasjon og service økte fra 36 083 til 39 674, men dette omfatter nødvendige støtteoppgaver og er heller ikke et anslag på stillinger som kan fjernes. Omsorgstjenestene betjener også yngre mennesker; forholdet til antall eldre er ikke bemanning per bruker. Startåret er dessuten påvirket av pandemien.

`scenarios.mjs` er en **testet forskningsmodell**, foreløpig ikke en interaktiv produksjonsgraf. Alle antakelser må oppgis eksplisitt. Modellen faser inn tidsgevinster, fordeler frigjorte årsverk mellom kapasitet og faktisk kontantbesparelse, trekker fra omstilling og ny drift, og beregner akkumulert kontantstrøm og diskontert netto. Penger oppgis i ett felles, fast prisår. Andre innsparinger må utelukke samme personellgevinst. Den estimerer ikke kvalitet eller samfunnsøkonomisk lønnsomhet. Fire tester kontrollerer dobbeltelling, full reinvestering, innfasing/diskontering og ugyldige antakelser.

### Fordypning i selve utredningen

Original-PDF er hentet på nytt med HTTP 200; størrelse 7 703 232 byte og SHA-256 er identisk med kontrollen over. Kapittel 10.2.4, trykt side 158–159, gir en vesentlig mer presis administrasjonsavgrensning: Utredningen oppgir **495 avtalte årsverk i de regionale helseforetakene i 2024**, basert på Haugen (2025). Dette er en historisk observasjon, ikke et forslag om å fjerne 495 stillinger. De regionale oppgavene skal fortsatt utføres selv om styringen endres.

Utredningen forklarer også at den brede kategorien administrasjon og service omfatter blant annet IT, teknisk drift, logistikk, kjøkken og renhold. Valg mellom egne ansatte og innkjøpte tjenester påvirker kategorien. Derfor kan heller ikke vekst i støtteårsverk alene dokumentere mer byråkrati eller lavere effektivitet. Ved scenarioer for RHF-leddet må denne avgrensningen brukes fremfor den langt større støttepersonellserien.

Kapittel 31.8, trykt side 372–373, skiller mellom felles nærhelsetjenesteselskap og avtalebasert samarbeid. Flytting av eksisterende tjenester kan i prinsippet være budsjettnøytral, men kortsiktig omdisponering og overgang er krevende. Den mulige gevinsten er både bedre kapasitet og mindre reising for pasientene. Den er ikke et ferdig tallfestet sparebeløp. Boks 31.2 beskriver behov for avklaring av arbeidsgiver- og tariffspørsmål ved overføring av ansatte. Dette må inn i konsekvensdelen for helsepersonell, sammen med pasientsikkerhet og faktisk innføringstid.

Dette er målrettet lesing av ytterligere avsnitt, ikke en påstand om at hele NOU-en er ferdig analysert. Underkildene til administrasjonskartleggingen må ettergås før et lønns-/kostnadsanslag låses.

Gjenstående før artikkellevering: fullføre relevante kapitler og politisk kildekartlegging, avstemme administrasjon og investerings-/driftsavgrensninger, koble modellen til en kontrollert rapport og interaktiv visning, skrive artikkel og LinkedIn-tekst, og bekrefte bot-PR, eksakt forhåndsvisning og ny review request. Ingen helsereformartikkel er levert eller publisert av dette researchsteget.

## Foreløpig SSB-kartlegging

API-søk er utført 2. november 2026. Dette er kandidater, ikke ferdige uttrekk eller validerte beregningsserier.

- Tabell 07940: 07940: Utdanningsnivå og kommunefordeling blant sysselsatte i helse- og sosialtjenester. 4. kvartal (K) 2008-2025 (siste oppgitte periode 2025).
- Tabell 11918: 11918: Avtalte årsverk i kommunal sektor, etter regnskapsomfang og funksjon (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 07941: 07941: Næringsfordeling blant sysselsatte med helse- og sosialfaglig utdanning (19 grupper). 4. kvartal 2008-2025 (siste oppgitte periode 2025).
- Tabell 12418: 12418: Utvalgte nøkkeltall for helse og omsorg - bydeler (B) 2015-2025 (siste oppgitte periode 2025).
- Tabell 12405: 12405: Legeårsverk i kommunale helse- og omsorgstjenester - bydeler, etter avtaleform og funksjon (B) 2015-2025 (siste oppgitte periode 2025).
- Tabell 12406: 12406: Fysioterapeutårsverk i kommunale helse- og omsorgstjenester - bydeler, etter avtaleform og funksjon (B) 2015-2025 (siste oppgitte periode 2025).
- Tabell 07938: 07938: Kjønn- og aldersfordeling blant personer med helse- og sosialfaglig utdanning (28 grupper). 4. kvartal 2008-2025 (siste oppgitte periode 2025).
- Tabell 12209: 12209: Utvalgte nøkkeltall for helse og omsorg (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 11996: 11996: Legeårsverk i kommunale helse- og omsorgstjenester, etter avtaleform og funksjon (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 11995: 11995: Fysioterapeutårsverk i kommunale helse- og omsorgstjenester, etter avtaleform og funksjon (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 13953: 13953: Årsverk i spesialisthelsetjenesten, etter yrke, tjenesteområde og helseforetak 2008-2025 (siste oppgitte periode 2025).
- Tabell 13954: 13954: Årsverk i spesialisthelsetjenesten, etter utdanning, tjenesteområde og helseforetak 2008-2025 (siste oppgitte periode 2025).
- Tabell 14080: 14080: Årsverk for legespesialister og psykologer i spesialisthelsetjenesten, etter spesialitet, tjenesteområde og helseforetak 2008-2025 (siste oppgitte periode 2025).
- Tabell 14533: 14533: Årsverk i omsorgstjenestene, etter yrke (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 07944: 07944: Sektor- og kommunefordeling blant sysselsatte i helse- og sosialtjenester med helse- og sosialfaglig utdanning (27 grupper). 4. kvartal (K) 2008-2025 (siste oppgitte periode 2025).
- Tabell 07935: 07935: Spesialistutdanning for leger, tannleger, optikere og sykepleiere, etter alder og kjønn. 4. kvartal 2008-2025 (siste oppgitte periode 2025).

## Presisering fra administrator, 2. november 2026

Analysen skal bruke **både Fellestalls database og SSB**, og ha en egen seksjon om
politisk forankring. Dette er en eksplisitt tilleggsføring fra oppgavens chat.
Bestillingen, ønsket dato og plass i køen beholdes.

### Fellestalls eget tallgrunnlag

Følgende faktiske kapittel-ID-er er kontrollert i `web/public/data/utgifter.json`.
Dette er kildetilgjengelighet og avgrensning, ikke ferdig reformregnskap:

| Formål | Fellestall-ID | Bruk i analysen |
|---|---|---|
| Helse- og omsorgsdepartementet | `u-07` | Overordnet historisk regnskapsramme |
| Regionale helseforetak | `u-07-0732` | Statlige overføringer til spesialisthelsetjenesten; ikke automatisk RHF-administrasjon |
| Helsetjenester i kommunene mv. | `u-07-2755` | Refusjoner/folketrygd, med kontroll av postinnhold |
| Kommunale helse- og omsorgstjenester | `u-07-0760` | Navngitte statlige tilskudd og tiltak; ikke kommunenes totale utgifter |
| Psykisk helse og rusarbeid | `u-07-0765` | Historiske prioriteringer og relevante tiltak |
| IKT i helse- og omsorgssektoren | `u-07-0701` | Dokumentert statlig IKT-finansiering; ikke all digitalisering i sektoren |
| Helsedirektoratet | `u-07-0740` | Forvaltningsoppgaver; kontroller flytting av oppgaver mellom etater |

Fellestalls KOSTRA-arkiv under `web/public/data/kostra/` skal brukes til kommunale
helse- og omsorgsutgifter, funksjoner/arter, egenbetaling og relevante inntekter.
Kontroller faktisk dekning, år og regnskapsomfang før beregning. Suppler med
primærkilder der administrasjon, foretakskostnader eller andre nødvendige detaljer
ikke finnes som egen serie. Ikke sett overføringer til RHF lik administrative
kostnader, og ikke kall hele statlige tilskudd reformutgifter.

Lag minst én graf med Fellestalls regnskapsposter og én med kommunalt tallgrunnlag
når de relevante uttrekkene er avstemt. Koble disse til SSBs aktivitets-, personell-
og demografiserier med tydelige definisjoner. Vis historiske utgifter og et eget,
merket scenario for reformen. Historisk vekst er ikke et reformanslag.

### Avstemming før økonomiske scenarioer

- Skill statens overføringer fra mottakernes faktiske ressursbruk.
- Ikke summer samme krone først i statsregnskapet og deretter i kommune-/foretaksregnskapet.
- Kontroller konsern/kasse, brutto/netto, finansieringskilde og regnskap/budsjett.
- Undersøk historiske endringer i departement, etatsansvar og postnummer.
- Hold administrasjonsinnsparing, bortfalte lokalkostnader og frigjort arbeidstid
  atskilt. Oppgaver som flyttes til staten har fortsatt en kostnad.

### Egen politisk seksjon

Lag en kildebelagt matrise per hovedforslag: nærhelsetjenester, regional/statlig
styring, kommunestruktur, legevakt/AMK, finansieringsmodell og digitalisering/KI.
Oppgi hvem som foreslår, hvem som uttrykkelig støtter eller avviser, begrunnelsen,
kildedatoen og om standpunktet gjelder akkurat denne utredningen.

Skill mellom utvalgets flertall og mindretall, regjeringens forslag, partienes
uttalelser/programmer, høringssvar og vedtak i Stortinget. Undersøk ferske primærkilder
fra regjeringen og alle ni stortingspartier samt relevante kommunale aktører,
helseforetak og arbeidstakerorganisasjoner. Programstandpunkter som ligner et forslag
er bakgrunn, ikke automatisk støtte til hele reformen eller dokumentert gjennomslag.

«Hvem vil stritte imot, og hvorfor?» skal besvares i to tydelige deler:

1. **Dokumentert motstand:** navngitt aktør, konkret forslag, kildebelagt begrunnelse.
2. **Mulige konfliktlinjer:** en eksplisitt analytisk vurdering av blant annet lokal
   råderett, sentralisering, finansieringsansvar, arbeidsgiverforhold, personvern,
   pasientsikkerhet og gjennomføringskostnader. Dette er scenarioer, ikke påståtte
   motiver eller spådde stemmer. Manglende offentlig standpunkt oppgis som uavklart.

Vurder hvilke endringer som trenger lov, bevilgning, tariff-/arbeidsgiveravtaler
eller kommunale beslutninger. Ikke gi reformen en konstruert parlamentarisk
sannsynlighetsprosent.

### Første kontrollerte reaksjoner, 2. november 2026

Dette er en avgrenset start, ikke en full kartlegging av partiene. Reaksjonene må
oppdateres før konklusjonene låses.

| Aktør | Dokumentert standpunkt | Betydning for analysen |
|---|---|---|
| Helse- og omsorgsdepartementet / Jan Christian Vestre | Utredningen skal inngå i regjeringens reformarbeid. Rapporten sendes på høring; det inviteres til bredt samarbeid på Stortinget og regionale innspillsmøter. | Mottak av utredningen er ikke godkjenning eller vedtak av alle anbefalingene. |
| KS / Gunn Marit Helgesen | Støtter fortsatt delt ansvar og bedre samarbeid mellom kommuner og sykehus. Mener samarbeid om nærhelsetjenester skal være frivillig. | Støtte til en del av modellen kan sameksistere med innvendinger mot andre deler. |
| KS | Motsetter seg flytting av legevakt til staten. Begrunner det med sammenheng med fastleger og andre kommunale tjenester, rekruttering og beredskap. | Her finnes allerede konkret, dokumentert motstand; den skal ikke presenteres som en hypotese. |
| KS | Positiv til digital samhandling og sterkere statlig ansvar for alvorlig psykisk helse og rus. Har ikke konkludert om kommunestruktur, og mener kommunene selv må diskutere løsningen. | Ikke kall KS generelt for eller mot reformen eller kommunesammenslåing. |

Primærkilder, publisert og kontrollert 2. november 2026:

- Helse- og omsorgsdepartementet: https://www.regjeringen.no/no/aktuelt/nytt-skritt-pa-veien-mot-helsereform-vestre-tok-imot-helsereformutvalgets-forslag/id3190681/
- KS: https://www.ks.no/pressemeldinger/ks-stotter-delt-ansvar-men-vil-beholde-legevakten/

Et innledende nettsøk etter ferske reaksjoner fra Høyre, Senterpartiet og Norsk
Sykepleierforbund ga ikke en kontrollert reaksjonskilde i dette søkeutvalget.
Dette er ikke bevis på at aktørene mangler standpunkt eller ikke har uttalt seg.
Fortsett med direkte partisider, organisasjonssider og dokumenterte høringsinnspill.

Lesemåte i denne kontrollen: Departementets pressemelding er åpnet og lest på
originalsiden. KS-reaksjonen er lest i søkeverktøyets tilgjengelige kildeuttrekk,
som inneholdt de aktuelle avsnittene. Direkte åpning av KS-siden ble blokkert av
nettverktøyet; ingen fullstendig side-/arkivkontroll er påstått.

### Flere reaksjoner undersøkt samme dag

Legeforeningens egen pressemelding fra 2. november kl. 12.29 er lest i søketjenestens tilgjengelige kildeuttrekk. Direkte åpning av NTB Kommunikasjon-endepunktet feilet. Ikke påstå et komplett arkiv eller et endelig samlet standpunkt fra foreningen.

| Forslag | Aktør og dokumentert reaksjon | Begrunnelse / avgrensning |
|---|---|---|
| Skille store sykehusinvesteringer fra daglig drift | Legeforeningen er positiv til retningen | Vil undersøke finansieringsmodellen. Dette er ikke en beregnet offentlig besparelse. |
| Mer sentralisert styring og større helseforetak | Legeforeningen er kritisk til sentralisering og skeptisk til sammenslåinger | Ønsker beslutninger nær pasientbehandlingen og større lokal faglig innflytelse. Ser samtidig behov for et regionalt nivå. |
| Akutt og planlagt behandling | Legeforeningen støtter rammefinansiering av øyeblikkelig hjelp og økt innsatsstyrt finansiering av planlagt behandling | Må skilles fra ubetinget støtte til hele NOU-en. |
| Nærhelsetjeneste | Legeforeningen støtter sammenhengende tjenester, men etterlyser avklaring av drift og bemanning | Samarbeid trenger kapasitet; en organisasjonsendring er ikke alene en ressursgevinst. |
| Kommunestruktur og kommuneøkonomi | Spekters egen pressemelding prioriterer sterkere kommuneøkonomi og endret kommunestruktur | Tilgjengelig originalt kildeuttrekk fra 2. november kl. 12.26. Endringer skal løse konkrete pasient- og arbeidskraftproblemer. Full tekst er ikke arkivert. |

Kilder:

- Legeforeningen: https://api.kommunikasjon.ntb.no/pressemelding/19126148/riktig-retning-for-sykehusbygg-men-makten-ma-flyttes-naermere-pasientene?lang=no&publisherId=17848606
- Spekter: https://api.kommunikasjon.ntb.no/pressemelding/19126458/helseformutvalgets-rapport-endringer-ma-lose-konkrete-problemer-for-pasientene?lang=no&publisherId=89834

Søk på de ni partienes domener etter utvalgsnavnet ga hovedsakelig regjeringens kilder, eldre lokale innspill og presseomtale. Det gir ikke grunnlag for å fylle en nasjonal partimatrise med antatte standpunkter. Konkrete reaksjoner omtalt av NTB må følges til avsender eller selve uttalelsen før låsing. Finnmark Aps eldre lokale krav og Oslo SVs årsmøtedokumenter kan brukes som datert bakgrunn, men ikke som partienes svar på dagens NOU. Fortsatt uavklart i denne dokumentasjonen: nasjonale, primærkildekontrollerte svar fra H, FrP, SV, Sp, R, MDG, V og KrF på de enkelte forslagene. Ap-regjeringens mottak og høring er dokumentert; heller ikke det betyr vedtak av hele utredningen.
