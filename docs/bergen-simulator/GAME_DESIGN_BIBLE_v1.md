# BERGEN REIMAGINED
## Game Design Bible v1.0
**Produktdefinisjon, spilleropplevelse, simulering, Bergen LIVE og utviklingsprinsipper**  
**Dato:** 18. oktober 2026  
**Status:** Styrende konseptutkast – klare designprinsipper, ikke ferdig kravspesifikasjon  
**Prosjekt:** Bergen Reimagined, uavhengig av Fellestall og Fjord Insight

> **Produktløfte:** Utforsk Bergen slik byen er dokumentert. Ta deretter rollen som byrådsleder og opplev hvordan politiske beslutninger, kommuneøkonomi og uforutsette hendelser former en alternativ fremtid i en levende 3D-by.

## 0. Beslutningsstatus og dokumentkontroll

Dette dokumentet er et felles utgangspunkt for produktdesign, faglig utredning og senere utvikling. Det skiller mellom **FASTLAGT** (forankret i prosjektets designvalg), **FORESLÅTT** (arbeidshypotese som skal prototypetestes), **UTREDES** (krever dokumentasjon eller teknisk evaluering) og **IKKE TILLATT** (brudd på prosjektets sikkerhets- og sannhetskrav).

| Beslutning | Status | Konsekvens |
|---|---|---|
| To produkter: Bergen LIVE og politisk/økonomisk spill | FASTLAGT | Felles 3D- og faktagrunnlag; separate tilstander |
| Spillerrolle: byrådsleder i Bergen | FASTLAGT | Kommunale fullmakter og parlamentariske prosesser styrer handlingsrommet |
| Kontor, møter, kalender og filmatiske hendelser | FASTLAGT | Tidsmotor og Event Director er kjernefunksjoner |
| Realistisk, interaktiv 3D-by er hovedattraksjonen | FASTLAGT | Visuell kvalitetsport før geografisk ekspansjon |
| Kvartalsvise beslutningsvinduer, daglig klokke, månedlig økonomikjøring | FORESLÅTT | Prototypetest for riktig spilltempo |
| Stokastiske prosjekt-, makro- og politiske prosesser | FASTLAGT | Modellvalg og kalibrering UTREDES |
| Statlige prosjekter som Sotrasambandet inngår ved start | FASTLAGT | Kildebasert register og tydelig myndighetsdeling |
| Fri garanti eller kostnadsoverføring fra stat til kommune | IKKE TILLATT | Krever dokumentert juridisk og kontraktsmessig hjemmel |
| Produksjonskobling mot Fellestall eller endring i hovedgren | IKKE TILLATT | Isolasjon er ufravikelig |

**Endringskontroll:** Endringer i FASTLAGT-prinsipper skal begrunnes og føres i en beslutningslogg. Ingen del av dokumentet gir Codex mandat til å implementere nye funksjoner uten særskilt oppdrag.

## 1. Visjon, målgruppe og differensiering

**Visjon:** Bergen Reimagined er en virkelighetsforankret, nettleserbasert digital tvilling av Bergen med to moduser. Bergen LIVE lar alle utforske byen og faktiske prosjekter. Spillet lar brukeren lede byrådet, balansere kommunens økonomi, gjennomføre politiske saker og se fysiske og sosiale ringvirkninger i 3D.

**Primær opplevelse:** «Jeg sitter på rådhuset, tar en krevende beslutning, og kan fly ut i Bergen for å se hva den betyr.» Det skal være like interessant å se en byggeplass, en trafikkendring eller en demonstrasjon som å studere budsjettet som forårsaket den.

**Målgrupper:** (a) Bergen-interesserte innbyggere og besøkende som bruker LIVE, (b) strategi- og simuleringsspillere, (c) elever, studenter, journalister og samfunnsinteresserte som ønsker å forstå kommunal styring. Innholdet skal være forståelig uten økonomiutdanning, men kunne åpnes i dybden for fagbrukere.

**Designpilarer:** 1) Gjenkjennelig Bergen; 2) Årsak–virkning, ikke dekorasjon; 3) Ekte institusjonelle begrensninger; 4) Usikkerhet og varige konsekvenser; 5) Utforskbar og etterprøvbar informasjon; 6) Spillglede uten å forenkle bort økonomi og politikk.

**Ikke-mål:** Ikke et fritt bybyggespill der kommunen bygger private boliger direkte. Ikke en påstand om at syntetisk byliv er faktiske sanntidsobservasjoner. Ikke en prognosetjeneste som hevder å forutsi reelle politiske valg. Ikke en digital tvilling av hele kommunen før geografien er dokumentert og dekket.

## 2. To opplevelser, én geografisk plattform

### 2.1 Bergen LIVE – åpen utforsking

LIVE åpnes uten å starte en spilløkt og bør på sikt være tilgjengelig uten innlogging. Brukeren kan panorere, rotere, zoome, søke etter adresse/bydel/bygg/prosjekt, klikke på objekter, filtrere tematiske kartlag og dele en stabil lenke til et bestemt objekt. Faktiske prosjekter viser kilde, sist oppdatert, status, ansvarlig aktør, finansiering og eventuelle dokumenterte milepæler.

**«LIVE» betyr ikke automatisk sanntid:** Faktisk registerstatus skal være datert; vær og trafikk kan være sanntidsstrømmer bare når kilde og rettigheter er verifisert; fotgjengere og biler kan være syntetiske animasjoner og må merkes der det ellers kan oppstå misforståelser.

### 2.2 Bergen Reimagined – simulert alternativ historie

Spillet starter fra et versjonert historisk øyeblikksbilde («snapshot») med dokumenterte kommunale budsjetter, geodata, prosjekter, tjenestetilbud og politisk sammensetning i den grad kildene tillater det. Etter startpunktet utvikles fremtiden av simuleringsmotoren. Spillet kan ikke skrive tilbake til LIVE-registeret.

### 2.3 Felles plattform og isolasjon

Felles: GIS, terreng, bygninger, objektidentiteter, prosjektregister, kilde- og lisensmetadata, 3D-rendering. Separat: simulerte vedtak, økonomi, tidslinjer, stokastiske utfall, lagrede spill. Publisering av LIVE skal isoleres fra dagens beskyttede Vercel-deploy; ikke fjern autentiseringsbeskyttelse uten egen beslutning.

## 3. Spillerrolle, institusjoner og myndighet

Spilleren er **byrådsleder**, ikke en allmektig borgermester. Bergen har parlamentarisk styreform: bystyret er øverste folkevalgte organ; byrådet utøver administrativ og politisk ledelse innenfor gjeldende fullmakter og må ha bystyrets tillit. Ordføreren er en annen rolle. Kommunens administrasjon, byråder, bystyre, utvalg, støttepartier, opposisjon og eksterne myndigheter er selvstendige aktører i modellen.

**Beslutningsmyndighet må være eksplisitt:** Hver sak har `responsible_level`, `legal_basis`, `decision_body`, `delegation`, `required_approvals`, `funding_responsibility` og `player_actions`. Spilleren kan foreslå, forhandle, vedta innen delegasjon, iverksette, kontrollere eller påvirke – men ikke overta myndigheten til stat, fylkeskommune eller private.

Kommunale ansvarsområder omfatter blant annet grunnskole, barnehage, omsorgstjenester, sosialtjenester, lokal arealplanlegging og kommunal infrastruktur. Videregående skole og fylkeskommunale veier ligger normalt hos fylkeskommunen; sykehus og riksveier hos staten. Konkrete grensetilfeller skal kontrolleres før de blir spillhandlinger.

**Politisk pluralisme:** Partier og interessegrupper modelleres gjennom åpne, dokumenterte eller tydelig hypotetiske preferanser og saksspesifikke posisjoner. Spillet skal ikke rangere reelle partier som «best» eller «verst», og skal ikke hevde å forutsi valgutfall i virkeligheten.

## 4. Kjerne-loop og spillets første 30 minutter

**Hovedloop:** Motta situasjonsbilde → undersøk sak og konsekvenser → utred alternativer → forhandle og søk beslutning → iverksett → la tiden gå → håndter hendelser → utforsk fysisk og sosial virkning → revider prioriteringer.

**Tre grensesnitt som henger sammen:**
- **Rådhuset:** Et troverdig 3D-kontor med kalender, telefon, saksmappe, budsjett, økonomiplan og møterom. Brukeren skal kunne utføre sentrale handlinger uten å navigere gjennom et tradisjonelt kortbasert SaaS-grensesnitt.
- **Bergen:** Fri kameraføring, objektklikk, prosjektinformasjon, trafikk, byggeplasser, offentlige bygg og hendelser. Byen er et sted man oppholder seg, ikke bare en illustrasjon.
- **Samfunnsbildet:** Media, høringer, innbyggerreaksjoner, politiske forhandlinger, organisasjoner og offentlige rapporter.

**Første 30 minutter (FORESLÅTT):** 0–5 min: filmatisk introduksjon til Bergen og kontoret. 5–10 min: briefing om budsjett, bystyresituasjon og eksisterende prosjekter. 10–15 min: klikk på et pågående prosjekt i LIVE-lignende kart. 15–22 min: første sak om sykehjemsrehabilitering med to eller tre realistiske alternativer. 22–26 min: nødvendig politisk behandling og budsjettkonsekvens. 26–30 min: tidsforløp, synlig byggeplass, melding på telefon og kamerareise til hendelse. Denne sekvensen skal testes som en «vertical slice» før større breddeutvikling.

## 5. Tidsmotor, kalender og politiske hendelser

**Simulert klokke:** Dato, time og årstid skal være synlige. Brukeren kan pause, spille normalt, akselerere eller hoppe til neste milepæl. Døgnlys, vær og aktivitet kan endres visuelt, mens økonomi og demografi oppdateres med passende diskrete intervaller. Forslag: klokke og visuelle animasjoner per frame; hendelseskø per time/dag; prosjekter per dag/uke; regnskap og tjenestekapasitet per måned; politiske beslutningsvinduer etter kalender; valg hvert fjerde år.

**Hendelseskategorier:** planlagte møter; lovpålagte frister; politiske forhandlinger; budsjettsaker; prosjektavvik; servicekriser; media; innbyggerprotester; statlige beslutninger; makroøkonomiske sjokk; private utbyggingsforslag. Hver hendelse har årsak, kilde eller modellregel, alvorlighet, sted, aktører, tidsfrist og tilgjengelige valg.

**Avbruddshierarki:** Kritiske saker stopper tiden automatisk. Viktige saker kan settes i kø til neste naturlige pause. Rutinemeldinger kommer diskret. Spilleren kan velge «Utforsk», «Håndter fra kontoret», «Deleger» eller «Utsett» der det er faglig mulig. Utsettelse kan ha reelle konsekvenser.

**Filmatisk overgang:** Ved en stor demonstrasjon fryses tiden; telefonen vibrerer; byrådslederen tar den opp; spilleren leser en saksspesifikk melding; «Utforsk» utløser kamerareise fra rådhuset til Torgallmenningen; der er en allerede registrert demonstrasjon synlig. Kamerasekvensen skaper ikke hendelsen.

**Kalenderens årshjul:** Første kvartal – iverksetting, rapportering, saker; vår – årsregnskap, økonomirapport og kommuneproposisjon/revidert nasjonalbudsjett; sommer/høst – budsjettkonferanser og forslag; oktober – statsbudsjettforslag og Grønt hefte; senhøst/desember – forhandlinger, bystyrevedtak og oppdaterte rammer. Nøyaktige frister, møtedatoer og formelle prosedyrer hentes fra årsspesifikke kilder.

## 6. Politisk motor og samfunnsreaksjoner

**Sakens livssyklus:** behov/initiativ → utredning → høring der relevant → byrådsbehandling → bystyre/utvalg der nødvendig → vedtak → gjennomføring → evaluering. Hvert trinn har ansvarlig aktør og mulig utfall. Støttepartier kan stille vilkår; endringsforslag kan påvirke budsjett, tid og måloppnåelse. Mistillit eller manglende flertall kan utløse regjeringskrise i spillet.

**Innbyggerreaksjoner:** Beregnes ut fra berørte grupper, geografisk fordeling, sakens betydning, opplevd prosess, forventede konsekvenser og mobiliseringsevne. Misnøye er ikke det samme som demonstrasjon. Protester har antall deltakere som simulert størrelse, organisatorer, lokasjon, varighet og politiske ringvirkninger. Ikke alle protester trenger å være store eller i sentrum.

**Mål og vurdering:** Ingen ideologisk «riktig» løsning. Vurder økonomisk bærekraft, lovoppfyllelse, tjenestetilbud, politiske forpliktelser, innbyggeropplevelse og gjennomføring. Valg og parlamentarisk støtte er dynamiske spilltilstander, ikke prognoser om virkelige valg.

## 7. Kommuneøkonomimotor

**Regnskapsstruktur:** Drift og investering holdes adskilt. Motoren følger skatteinntekter, rammetilskudd, øremerkede tilskudd, gebyrer, lønn, kjøp av tjenester, vedlikehold, renteutgifter, avdrag, fond, gjeld og fremtidige forpliktelser. Lovkrav, budsjettbalanse, realistiske anslag og regnskapsmessig konsistens er harde regler. Lånefinansiering av ordinær drift skal ikke være et fritt virkemiddel.

**Statsbudsjett og rammetilskudd:** Bruk versjonert regelsett per budsjettår. Grønt hefte gir beregningsteknisk dokumentasjon og kommunespesifikke tabeller. Skill mellom regjeringens forslag, Stortingets vedtak, senere justeringer, faktisk utbetaling og kommunens egne prognoser. Kriteriedata, utgiftsutjevning, innbyggertilskudd, særskilt fordeling og inntektsutjevning må kunne spores og forklares. **Ikke bland rammetilskudd med samlet skatteinntekt** eller behandle alle statlige overføringer som frie inntekter.

**Tidsforsinkelse:** Befolkningsendringer påvirker ulike tilskudd, skatteanslag og tjenester gjennom forskjellige telletidspunkter og mekanismer. Skatteinntekter avhenger av skattegrunnlag, skatteregler og utjevning; høyere lokal gjennomsnittslønn er ikke en automatisk proporsjonal økning i kommunens nettoinntekt.

**Finansielle visninger:** vedtatt budsjett, regnskap hittil, helårsprognose, fireårig økonomiplan, prosjektportefølje, gjeldsprofil, renteeksponering, reserver og usikkerhetsintervaller. Hver beslutning skal vise marginal effekt på drift, investering, gjeld og tjenester i flere år.

**Invarianter:** Debet/kredit eller tilsvarende sporbar postering; ingen dobbeltelling; netto finansiering må avstemmes; fondsbevegelser og låneopptak må ha hjemmel; fremtidige driftskostnader fra investeringer kan ikke forsvinne; bevilgnings- og garantifullmakter valideres før vedtak.

## 8. Demografi, boligmarked og kommunale tjenester

**Demografi:** Alderskohorter, husholdninger, bosted, folkeregistrering, innflytting/utflytting, fødsler/dødsfall og relevante tjenestebehov. Modellen kan være aggregert på bydelsnivå selv om 3D-kartet viser enkeltbygg. Tydelig skille mellom bosatte, studenter som oppholder seg i byen, sysselsatte, lønnstakere og skattytere.

**Tjenester:** Skole/barnehage, omsorg, hjemmetjenester, sosialtjenester, kommunal infrastruktur og vedlikehold. Kapasitet og kvalitet påvirkes av lokaler, personell, drift og etterspørsel. Et ferdig bygg er ikke nødvendigvis en tjeneste som kan åpne uten bemanning.

**Private aktører:** Studentboliger, ordinære boliger og næringsbygg bygges som hovedregel av eksterne aktører. Kommunen kan påvirke gjennom arealplaner, regulering, kommunal eiendom, infrastruktur, samarbeid og lovlige tilskudd. En studentsamskipnad kan fremme prosjekt; spilleren kan ikke fritt bygge eller finansiere det som et kommunalt sykehjem.

**Ringvirkninger:** Nye studentboliger kan frigjøre private leieboliger, endre flyttestrømmer og påvirke handel og transport. Netto effekt på kommunal skatt og rammetilskudd krever modellering av hvem som faktisk flytter inn, folkeregistrering, inntekt og utjevning. Ingen direkte «400 boliger = 400 nye skattytere»-regel.

## 9. Prosjekt- og infrastrukturmotor

**Prosjektregisteret ved start:** Alle vesentlige dokumenterte pågående prosjekter innen relevant geografi skal kunne inngå, også statlige, fylkeskommunale og private. Fullstendighet er et langsiktig datamål; ved manglende data vises dekningsbegrensning. Prosjektidentitet, geometri, statusdato og kilde må være sporbare.

**Prosjektkort ved objektklikk:** navn, type, lokasjon, byggherre, eier, oppdragsgiver, entreprenør, finansieringskilder, beslutningsmyndighet, kontraktsform, opprinnelig ramme, gjeldende styringsramme/kostnadsramme der relevant, påløpt kostnad, prognose sluttkostnad, fysisk fremdrift i %, milepæler, forventet ferdigstillelse, endringshistorikk, risiko og lenker til kilder. Påløpt kostnad er ikke fremdriftsprosent. Manglende verdier merkes «ikke dokumentert», ikke fylles syntetisk uten etikett.

**Faser:** identifisert behov → konsept → politisk/administrativ avklaring → prosjektering og finansiering → anskaffelse → bygging → overlevering → drift/vedlikehold. Enkelte prosjekter har andre faser og godkjenningsregimer. Kostnadsoverskridelser kan kreve ny bevilgning, omprosjektering, endringsordre eller prosjektstans; ikke alle tiltak er juridisk eller kontraktsmessig mulige.

**Risikofordeling:** Skille mellom prosjekteier, oppdragsgiver, finansieringskilde, entreprenør, långiver, garantist og risikobærer. Statlig kostnadsoverskridelse kan ikke automatisk bokføres hos Bergen kommune. Kommunale garantier krever vurdering etter kommuneloven § 14-19, forskrift, statsstøtte- og eventuelt anskaffelsesregler; terskler og godkjenningskrav er årsspesifikke og skal verifiseres.

**Sotrasambandet – referansescenario:** Statens vegvesen er offentlig oppdragsgiver i et OPS-prosjekt. Ifølge Statens vegvesens melding 10.09.2026 ble planlagt trafikkåpning i fjerde kvartal 2027 utsatt uten fastsatt ny dato. Spillet skal vise dokumentert status på startdatoen, men ikke påstå en dokumentert prosent eller at Bergen kommune garanterer for overskridelser uten egen kilde. Full 3D krever at geografisk dekning faktisk omfatter traseen.

## 10. Stokastikk, modellvalg og empirisk kalibrering

**Anbefalt hybrid:** (1) Regimeskiftende makromodell for renter, lønnsvekst, materialpriser og aktivitetsnivå; (2) prosjektspesifikke hazard-/varighetsmodeller for forsinkelser og avvik; (3) Monte Carlo/fordelingsmodeller for sluttkostnad og tidsbruk; (4) avhengighetsnettverk for milepæler og kritisk linje; (5) agentbasert, men aggregert politisk og sosial respons; (6) Bayesiansk oppdatering når ny informasjon kommer. Hidden Markov Models kan brukes for latent prosjektrisiko, men er ikke et universelt svar.

**Tre usikkerhetsnivåer:** systematisk (makro og nasjonale regler), prosjektspesifikt (grunnforhold, kontrakt, teknikk) og politisk/institusjonelt (vedtak, høringer, myndigheter). Korrelerte sjokk må kunne påvirke flere prosjekter, mens lokale hendelser normalt ikke skal gjøre det.

**Kalibreringshierarki:** dokumenterte norske data → sammenlignbare nordiske data → eksplisitte ekspertantakelser → rene spillparametere. Ikke overfør observerte frekvenser fra store statlige prosjekter direkte til kommunale rehabiliteringer. Oppgi utvalg, tidsperiode, definisjon av «overskridelse», usikkerhet og modellversjon.

**Reproduserbarhet:** Lagret seed, deterministisk hendelsesrekkefølge, versjonerte parametere, samme starttilstand gir samme utfall. Spilleren ser relevante usikkerhetsintervaller, ikke skjult «juks». Det skal finnes automatiserte tester av statistiske fordelinger, korrelasjoner, sjeldne hendelser og ekstremutfall.

## 11. City Events Engine og visuelle årsakskjeder

**Arkitekturregel:** Fagmotorene bestemmer tilstand og hendelser; Event Director prioriterer brukeravbrudd; 3D-rendereren viser tilstanden. En kamerareise eller animasjon må aldri opprette et prosjekt, en kostnad eller en demonstrasjon.

**Eksempel sykehjem:** dokumentert bygg → politisk rehabiliteringssak → vedtak og finansiering → kontrakt → byggestart → stillaser og eventuell lokal trafikkregulering → oppdatert fremdrift og kostnad → forsinkelse eller ferdigstillelse → tjenestekapasitet, bemanning og driftskostnad. Trafikkpåvirkning vises bare hvis relevant veigeometri og en gyldig tiltaksmodell finnes.

**Eksempel demonstrasjon:** omstridt skoleforslag → berørte innbyggere og mobilisering → hendelse opprettes med sted/tid → telefonmelding stopper spillet → spilleren velger «Utforsk» → kamerareise → folkemengde på Torgallmenningen → mulige politiske handlinger. Reaksjoner må ikke genereres kun fra én popularitetsgrense.

**Tilgjengelighet og kontroll:** Filmatiske sekvenser skal kunne hoppes over, forkortes og spilles av på nytt. Viktig informasjon skal alltid finnes i tekst, med mulighet for redusert bevegelse, tastaturnavigasjon og skjermlesertilgjengelige handlingsvalg.

## 12. 3D-kvalitetsstandard og geografisk dekning

**Kvalitetsambisjon:** Høy gjenkjennelighet, spesielt Bryggen, Vågen, Bergenhus, Torgallmenningen og sentrale offentlige bygg. Bygninger skal ha riktige fotavtrykk, høyder og takformer der kildegrunnlaget støtter det. Viktige landemerker får særskilt modellering. Terreng, hav, vegetasjon, materialer, skygger, lys, vær, årstid og byliv skal oppleves sammenhengende.

**Fire kvalitetsnivåer:** (a) terreng/kyst/vegetasjon; (b) geometri og arkitektur; (c) gatemiljø og interaktive objekter; (d) lys, atmosfære og animasjon. Hvert nivå skal ha målbare kvalitetskriterier og tydelig dataopphav.

**Ytelsesprinsipper:** geografisk streaming, spatial indeksering, LOD, instancing, batched geometry, culling, worker-beregninger og ressursbudsjetter. Evaluér videreføring av Three.js/React Three Fiber mot geografisk 3D/3D Tiles/Cesium med en reell prototype; ingen motorbytte uten dokumentert kvalitets- og ytelsesgevinst.

**Kvalitetsport:** En representativ «hero zone» skal bestå visuell gjennomgang på desktop og mobil før geografisk masseutvidelse. Foreslåtte målinger: tid til første navigerbare scene, stabil bildefrekvens, minnebruk, objektklikkpresisjon, antall feilplasserte objekter, geometrisk avvik mot kilder og visuell gjenkjennelighet. Endelige terskler fastsettes etter måling av faktiske mål-enheter.

**Dekningsærlighet:** Dagens sentrumsmodell dekker ikke hele Bergen kommune eller Sotrasambandet. Utenfor dekning skal LIVE vise et tydelig kart-/registeralternativ fremfor å fremstille syntetisk geometri som observert virkelighet.

## 13. Dataarkitektur, kilder og sannhetsmerking

**Kildelag:** Kartverket, Bergen kommunes GIS/åpne data, OSM med korrekt attribusjon/lisens, kommunale budsjetter og regnskap, SSB/KOSTRA, Grønt hefte og statsbudsjett, Statens vegvesen, andre dokumenterte prosjektkilder. Data lagres som daterte, lisensmerkede og kildeidentifiserte snapshots. Ingen scraping eller kommersiell gjenbruk uten lovlig grunnlag.

**Minimumsmodell:** `GeoObject`, `Building`, `RoadSegment`, `Place`, `ServiceFacility`, `RealProject`, `ProjectActor`, `FundingShare`, `Guarantee`, `ContractRisk`, `SourceRecord`, `ObservedSnapshot`, `GameSession`, `ScenarioState`, `PolicyCase`, `PoliticalDecision`, `BudgetVersion`, `EconomicEntry`, `SimulatedProject`, `Event`, `ModelVersion`, `RandomSeed`.

**Felles ID, separate tilstander:** `real_object_id` knytter observasjoner til geometri; `game_session_id` knytter hypotetiske endringer til én spilløkt. `valid_at`, `published_at`, `observed_at`, `source_url`, `license`, `confidence`, `status` og `scenario_origin` må kunne brukes i revisjon.

**Sannhetsklasser:** OBSERVERT (dokumentert virkelighet), ANSLÅTT (kildebasert estimat), SIMULERT (modellutfall) og ILLUSTRATIVT (visuell effekt). Farge/etikett/infotekst skal gjøre skillet forståelig. Ikke bland hypotetiske budsjettall inn i LIVE.

**Kvalitetsporter:** Ingen oppdiktede vegforbindelser, terrenghøyder, innganger eller bygg. Ufullstendig datadekning håndteres med eksplisitt fravær og fallback. Daterte virkelighetsdata skal ikke oppdateres i en allerede startet spilløkt uten en uttrykkelig import-/rebase-prosess.

## 14. Brukeropplevelse, navigasjon og visuell identitet

**LIVE-first landing:** Byen er hovedbildet, ikke et rutenett av SaaS-kort. Åpen «Utforsk Bergen LIVE» og tydelig «Start spill». Kontekstuelle verktøy, diskrete lag, søk og presis objektinspeksjon. Delbare objektlenker og søkemotorvennlige prosjektsider gir trafikk uten å tvinge brukeren til å starte en spilløkt.

**Spillgrensesnitt:** Rådhuskontoret og byen skal oppleves som samme verden. Kontorobjekter åpner dokumenter og møter. Telefonen er primær hendelseskanal. Prosjektkort viser en fremdriftslinje for fysisk ferdigstillelse og separate kostnadstall. Kameraoverganger har skip-alternativ. På mobil kan et tilpasset inspeksjonspanel brukes, uten å redusere datakvaliteten.

**Sikkerhet og personvern:** Ingen personidentifiserbare innbyggersimuleringer. Aggregerte husholdningsgrupper og syntetiske 3D-figurer. Respekter opphavsrett, geodatalisenser og eventuelle restriksjoner på foto/teksturer.

## 15. Spillmodus, progresjon og suksesskriterier

**Kampanje:** Start med et bestemt dokumentert tidspunkt, politisk situasjon og fireårig periode. Spilleren setter prioriteringer og forsøker å oppnå vedtatte mål under lovlige og økonomiske rammer. Valg og parlamentariske hendelser kan endre rollen; spilleren kan fortsette i nye perioder dersom spillreglene tillater det.

**Sandkasse:** Eksperimentering med eksplisitt hypotetiske regler, separate scenarioer og valgfrie vanskelighetsgrader. Sandkassen må aldri forveksles med LIVE eller offisiell kommunal prognose.

**Mål uten ideologisk fasit:** Finansielt handlingsrom, tjenestekapasitet, lovoppfyllelse, gjennomføring av politisk program, innbyggerreaksjoner og politisk tillit vises separat. Ingen samlet rangering av faktiske politiske partier eller normative «riktige» prioriteringer.

## 16. Teknisk arkitektur og integrasjon med dagens kode

**Dagens grunnlag:** Prosjektet har allerede en React/Vite/Three.js/React Three Fiber 3D-scene, kildebasert GIS, trafikksimulering, plassering av hypotetiske bygg, konstruksjonsfaser, 24-måneders arbeidermodeller, scenario-lagring og omfattende tester. Dette er verdifulle byggesteiner, men dagens PMU-budsjett og lille befolkningsmodell er **ikke** en fullstendig norsk kommunal økonomimotor.

**Anbefalte grenser:** `core/geo`, `core/observations`, `core/clock`, `core/economy`, `core/politics`, `core/services`, `core/demography`, `core/projects`, `core/stochastics`, `core/events`, `render/3d`, `products/live`, `products/game`. Dette er logiske domener, ikke en instruks om umiddelbar filflytting.

**Event-sourcing light:** Logg beslutninger og viktige simuleringshendelser med tidsstempel, seed, modellversjon og årsak. Bruk checkpoints for effektiv lagring. En hendelseslogg er ikke alene tilstrekkelig til økonomisk regnskapsføring; økonomimotoren må ha egen validerbar ledger.

**Eksisterende funksjoner:** Behold GIS, renderytelse, arbeidere, scenariohistorikk og testing. Isoler gamle PMU- og private byggemekanikker som konseptmodus eller migrer dem gjennom egne godkjente milepæler. Ikke slett fungerende kode før erstatning og tester foreligger.

## 17. Første vertikale prototype og akseptansekriterier

**Vertical Slice A – LIVE:** Åpne en visuelt imponerende, kildeverifisert del av sentrum. Finn og klikk et faktisk bygg. Åpne prosjektregister. Se ansvarlig aktør, datert status, kilder og «ikke dokumentert» der informasjon mangler. Del direkte objektlenke. Ingen innlogging nødvendig i planlagt offentlig deploy.

**Vertical Slice B – Byråd:** Start en isolert spilløkt fra en datert starttilstand. Motta briefing på kontoret. Se kalender og et korrekt statsbudsjett-/rammetilskuddshendelsesforløp. Behandle et sykehjemsprosjekt, med vedtak og fremtidig driftsvirkning. La tiden gå og se prosjektet endre 3D-tilstand.

**Vertical Slice C – Hendelse:** Et saksspesifikt protestforløp skapes av politisk/sosial modell. Klokken pauser; telefonsekvens vises; «Utforsk» flytter kamera til Torgallmenningen; hendelsen kan inspiseres. Lagring og lasting gjenskaper samme tilstand.

**Testkrav:** Myndighetskontroll; lovlige budsjett- og garantiposter; reproduksjon med samme seed; ingen oppdiktet observert GIS; korrekt skille LIVE/spill; objektklikk og kildevisning; prosjektfremdrift uavhengig av kostnadsforbruk; animasjon uavhengig av domenehendelser; tilgjengelighet og ytelse på mål-enheter.

## 18. Faseplan og beslutningsporter

| Fase | Leveranse | Port før neste fase |
|---|---|---|
| 0 – Design og fakta | Godkjent Game Design Bible, regelverksregister, datakildematrise, gap-analyse | Åpne spørsmål og eieransvar dokumentert |
| 1 – 3D Quality Benchmark | «Hero zone» i Bergen med klikkbare objekter | Visuell kvalitet og ytelse verifisert |
| 2 – Bergen LIVE MVP | Offentlig utforsking, søk, prosjektkort, kildevisning, delbare URL-er | Faktakvalitet, lisens og tilgang kontrollert |
| 3 – Byrådets vertical slice | Kontor, kalender, budsjettmøte, vedtak, prosjekt, hendelse | Hele årsakskjeden fungerer fra sak til 3D |
| 4 – Økonomi og politikk | Statsbudsjett, økonomiplan, tjenester, forhandlinger, valg | Regnskapsinvarianter og prosedyrer bestått |
| 5 – Skala og stokastikk | Bydeler, flere prosjekter, empirisk kalibrering, rikere byliv | Robusthet, gjenskapbarhet og balanse dokumentert |

**Ingen Codex-implementering fra dette dokumentet alene.** Første Codex-oppdrag er dokumentplassering, eksisterende-kode-audit, gap-analyse, beslutningslogg og forslag til neste begrensede milepæl. Kodeendringer kommer først etter godkjent plan.

## 19. Åpne spørsmål og forskningsprogram

1. Hvilket geografisk område gir beste «hero zone», og hvilke 3D-data og lisenser kan faktisk brukes?  
2. Hvilken renderer/geospatial streaming-arkitektur leverer høyest kvalitet per ytelseskrone på desktop og mobil?  
3. Hvilke deler av Bergens møtestruktur og delegasjonsreglement kan modelleres direkte, og hvilke krever forenkling?  
4. Hvordan skal 2027-reglene for inntektssystemet versjoneres og reproduseres for Bergen, inkludert inntektsutjevning og budsjettrevisjoner?  
5. Hvilke offentlige kilder gir prosjektstatus, kostnadsrammer, kontraktsrisiko og fremdrift med tillatt gjenbruk?  
6. Hvordan kalibrerer vi kommunale rehabiliteringer, veiprosjekter og private prosjekter separat, med empirisk forsvarlige fordelinger?  
7. Hvordan representeres statlige og fylkeskommunale prosjekter i spill uten å tildele kommunen fiktiv myndighet?  
8. Hvilke lovkrav og godkjenningsprosesser gjelder for garantier, kommunale lån, anskaffelser, regulering og budsjettrevisjoner?  
9. Hva er riktig forhold mellom kontinuerlig klokke, møtedager, beslutningsrunder og automatisk pause?  
10. Hvordan publiseres Bergen LIVE åpent uten å endre dagens beskyttede deploy eller Fellestall?

**Utredningsstandard:** Hvert svar skal angi kilde, versjonsdato, geografisk/juridisk gyldighet, modellkonsekvens, usikkerhet og akseptansekriterium. Uløste forhold må ikke kamufleres som fakta.

## 20. Prosjektgrenser og sikkerhetskrav

Repo: `Lippen1995/Project_statsbudsjett`. **Kun** gren `feature/bergen-simulator`. Arbeidsområder: `apps/bergen-simulator/`, `docs/bergen-simulator/` og dedikert `.github/workflows/bergen-simulator.yml`. Ikke endre `main`, Fellestalls app, produksjonsdomene, Neon-database, hemmeligheter, workflow eller produksjonsdeploy. Ikke opprett avhengighet mellom Bergen Reimagined og Fellestalls produksjon. Alle nye kilder og importløp er selvstendige.

Dagens beskyttede Vercel-miljø for Bergen Reimagined skal forbli beskyttet inntil egen beslutning om offentlig LIVE-arkitektur. Ingen deployment eller endring av tilgangskontroll i første planleggingsoppdrag.

## 21. Kilderegister og faktakontroll (per 18.10.2026)

Dette er **startkilder**, ikke en uttømmende juridisk eller empirisk utredning. Før implementering må gjeldende lovtekst, forskrifter, budsjettår, delegasjonsreglement, kontraktsvilkår og datalisenser verifiseres på nytt.

1. Kommunal- og distriktsdepartementet, «Grønt hefte», sist oppdatert 07.10.2026. https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/gront-hefte/id547024/
2. Kommunal- og distriktsdepartementet, «Frie inntekter 2027», 07.10.2026. https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommunedata/frie-inntekter/frie-inntekter-2027/id3176408/
3. Kommunal- og distriktsdepartementet, «Inntektssystemet for kommuner og fylkeskommuner». https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/inntektssystemet/id2829838/
4. Bergen kommune, «Handlings- og økonomiplan 2026–2029» (vedtatt budsjett og revidert budsjett). https://www.bergen.kommune.no/politikk/budsjett/budsjett-2026/handlingsog-okonomiplan-2026-2029
5. Statens vegvesen, «Sotrasambandet når ikke trafikkåpning i fjerde kvartal 2027», 10.09.2026. https://www.vegvesen.no/vegprosjekter/riksveg/sotrabergen/nyhetsarkiv/sotrasambandet-nar-ikke-trafikkapning-i-fjerde-kvartal-2027/
6. Kommunal- og distriktsdepartementet, «Veileder til garanti- og finansforskriften», 20.05.2020. https://www.regjeringen.no/no/dokumenter/veileder-til-garanti--og-finansforskriften/id2703436/
7. Kommunal- og distriktsdepartementet, tolkningsuttalelse «§ 14-19: Kommunale garantier», 06.11.2024. https://www.regjeringen.no/no/dokumenter/-14-19-kommunale-garantier/id3073013/
8. Kommunal- og distriktsdepartementet, tolkningsuttalelse «§ 14-19: Godkjenning av rammevedtak». https://www.regjeringen.no/no/dokumenter/14-19-godkjenning-av-rammevedtak/id3025475/
9. Regjeringen, «Statsbudsjettet 2027 – dokumenter og pressemeldinger». https://www.regjeringen.no/no/statsbudsjett/2027/dokumenter-og-pressemeldinger/id3173039/

## Vedlegg A – Normativ datakontrakt for prosjektkort

| Felt | Regel |
|---|---|
| `project_id`, `geometry_id` | Stabil identitet, gyldig geografisk referanse |
| `owner`, `client`, `contractor`, `financiers` | Separate roller; ukjent vises som ukjent |
| `funding_shares`, `guarantees`, `risk_allocation` | Dokumenterte relasjoner med kilde og gyldighetsperiode |
| `original_budget`, `current_budget`, `spent_to_date`, `estimate_at_completion` | Beløp med valuta, prisår, mva- og omfangsdefinisjon |
| `physical_progress_pct` | 0–100 bare ved kilde eller merket modellanslag; ikke utled fra kostnad |
| `start_date`, `forecast_end`, `milestones` | Datert status, usikkerhet og historikk |
| `legal_authority`, `player_permissions` | Handlingsrom verifisert før knapp aktiveres |
| `data_class`, `source`, `as_of` | OBSERVERT/ANSLÅTT/SIMULERT/ILLUSTRATIVT, sporbar kilde |

## Vedlegg B – Definisjon av ferdig for første Codex-oppdrag

1. Markdown-dokumentet er lagt til i riktig dokumentmappe uten endring i andre produkter.  
2. Eksisterende kode og tester er kartlagt med konkrete filreferanser.  
3. Gap-analyse skiller behold/tilpass/isoler/erstatt/nybygg.  
4. Datakilder, lisenser, regulatoriske forhold og usikkerhetsmodeller er listet med kunnskapshull.  
5. Arkitekturdiagram, risikoregister og trinnvis plan er dokumentert.  
6. Det er ikke implementert nye produktfunksjoner, kjørt deploy eller endret tilgangsinnstillinger.  
7. Alt arbeid er gjort på `feature/bergen-simulator`; Fellestall og `main` er urørt.