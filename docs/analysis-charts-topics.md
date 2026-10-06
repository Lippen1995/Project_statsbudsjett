# Grafvalg, problemstillinger og erstatninger

Brukerføringer 6. oktober 2026. Disse erstatter eldre instrukser om et fast antall grafer og eksakt sammenligning av regnskapstall.

## Grafer

AI velger **én til syv grafer** etter hva som hjelper leseren. Verken tre grafer eller flest mulig grafer er et mål. Valget lagres i `article.copy.graphs` og inngår i innholdshashen og den menneskelige godkjenningen. En eldre artikkel uten feltet beholder sine tre opprinnelige grafer og sin gamle hash.

`afterSection` er en nullbasert seksjonsindeks. Regnskapsrapporter støtter `growth`, `real-expenditure`, `annual-change`. Budsjettanalyser støtter `budget-totals`, `budget-changes`, `budget-bridge`. Disse standardgrafene tar bare `kind` og `afterSection`. Alle rapporter kan vise en `series`-graf med arkiverte SSB-serier. Regnskapsrapporter kan blande SSB, Fellestall og konkrete poster.

```json
[
  {"kind":"growth","afterSection":0},
  {
    "kind":"series","afterSection":1,
    "title":"Hvor langt rekker forklaringene?",
    "description":"Prisnivå, folketall og statens regning gjennom samme periode.",
    "mode":"index",
    "series":[
      {"source":"fellestall","id":"expenditure","label":"Statens utgifter"},
      {"source":"ssb","id":"Priser","label":"Konsumpriser"},
      {"source":"ssb","id":"Befolkning","label":"Folkemengde"}
    ]
  }
]
```

Dette eksemplet krever at Priser og Befolkning faktisk finnes i rapportens frosne `ssbEvidence`. Velg ID-ene som er i den aktuelle rapporten; ikke finn på en serie. `series` kan vise én til fem serier. `source: fellestall` støtter `expenditure` (mill. kroner), `perCapita`, `realPerCapita`, `population` og `cpi`. `source: post` bruker en faktisk ID fra `eventEvidence`, for eksempel `alderspensjon` eller `dagpenger`. Ikke-observerte postår utelates og blir aldri automatisk null.

`mode: values` krever samme enhet for alle serier. `mode: index` setter alle seriene til hundre i det første felles året; første verdi må være positiv. Grafen viser bare felles sammenhengende observerte år. Koden beregner verdiene; AI leverer ingen punkter, egne beløp, vilkårlige felt eller JavaScript. Indekskurver sammenligner vekst, ikke størrelser. Ingen doble akser eller umerkede anslag. Kontroller også geografi, definisjoner, bestand/strøm og faktisk sammenlignbarhet selv om enheten er lik. Samvariasjon gir ikke en årsaksforklaring.

Grafene får tekstalternativ, kildemerking, enhets-/basisforklaring og tilgjengelig talltabell. `title`, `description` og eventuelle serielabels er redaksjonell tekst og følger samme faktumreferanseregler som artikkelen. Forklar grafens implikasjon, ikke bare hva aksene heter.

### Velg konkrete regnskapsposter

AI kan undersøke de faktiske postene som forklarer utviklingen, fremfor å begrense seg til de opprinnelige faste eksemplene. `buildReport(dataDir, {departmentId, start, end, question, detailSelections})` beregner et kontrollert postgrunnlag. `detailSelections` er én til tolv grupper med en unik bokstav-ID og én til åtte faktiske node-ID-er per gruppe, for eksempel:

```json
[
  {"id":"ukraina","nodeIds":["u-01-0159-73"]},
  {"id":"driftsamlet","nodeIds":["u-01-0100-01","u-01-0140-01"]}
]
```

Departement, kapittel eller konkret post må finnes innen rapportens scope. Finansposter og interne overføringer utelates som i hovedserien. En gruppe kan ikke inneholde både en node og dens etterkommer. AI velger ID-er; beløp, postnavn og fakta beregnes fra regnskapet. Behold det kanoniske kandidatvalget ved ordinær weekly-levering og beregn rapporten på nytt med det ønskede utvalget. Boten gjentar beregningen før levering.

Postgrunnlag versjon to har årlige `YearA`/`AmountA`, `YearB`/`AmountB` osv. samt kontrollerte fakta for første observerte år, topp, siste års endring og bokført endring mot hovedtotalen. Les rapportens faktaliste, ikke gjett faktanavn. Manglende føring er ikke observert null. Grupper kan overlappe på tvers av grafer, men skal ikke summeres som uavhengige bidrag. En posts endring delt på totalens nettoendring er et regnskapsforhold, ikke en årsaksandel. Historiske postnavn, ompostering og endret innhold må kontrolleres før de tolkes som aktivitetsvekst eller kutt. Grafgrensen er fortsatt én til syv.

## Skriv om saken

SSB er en kilde, ikke en produktnyhet i brødteksten eller LinkedIn-innlegget. Ikke skriv at vi nettopp har fått SSB-data, at et nytt uttrekk bekrefter Fellestalls grunnlag, eller at «SSB hjelper oss å få målestokken på plass». Kildekontroll beskrives i metode og kildeliste. Brødteksten skal si hva observasjonene innebærer og føre leseren videre.

## To år mellom samme problemstilling

Temakontrollen bruker **hovedspørsmål + konkret avgrensning**, ikke de brede bibliotekfeltene Tema, Geografi og Analysetype. Overskriftsendring, liten tallrettelse, nytt uttrekk, nytt årsspenn eller annet grafvalg gir ikke et nytt tema. Sperren varer to kalenderår fra publisering; den håndheves både i kandidatvalg og rett før publisering. Behold historikken.

Dagens kontrollerte problemstillinger:

- `real-expenditure-growth`: samlet utgiftsvekst etter pris- og befolkningsjustering, med eget scope for staten og hvert departement. Kortere og lengre perioder innen samme scope er samme tema.
- `pension-expenditure`: pensjonsutgifter. Krever det kontrollerte pensjonskapitlet og at teksten undersøker det i minst to seksjoner. Samme konkrete post er samme tema selv om bakgrunnsregnskapets scope endres fra staten til departementet.
- `temporary-crisis-support`: midlertidig krisestøtte. Krever både dagpenger og den konkrete kompensasjonsposten, med reell analyse av disse.
- `military-support`: den konkrete militære Ukraina-støtteposten. Ikke all Ukraina-støtte eller generell forsvarsbruk.

For de tre smale variantene gir `buildReport(...,{question:'pension-expenditure'})` et kontrollert fokus; hovedregnskapet kan gi bakgrunn, men teksten skal undersøke den valgte problemstillingen. Det er ikke tillatt å omgå sperren ved å velge en annen nøkkel og likevel skrive samme totalanalyse. Les tidligere overskrifter, beskrivelser og hovedkonklusjoner semantisk før valg. En kort omtale av pensjon inne i en totalanalyse er ikke i seg selv en hel pensjonsanalyse. Nye spørsmål krever et faktisk kontrollerbart rapportgrunnlag og en gjennomtenkt nøkkel, ikke en fri teksttagg for hver overskrift.

Budsjettanalyser avgrenser også **budsjettår + fase + sammenligning**. Regjeringens nye forslag for et nytt budsjettår er et nytt dokumentert objekt. Ordinært budsjett og RNB er separate hendelser; forslag mot vedtak er en annen problemstilling enn forrige budsjett mot forslag. Et korrigert tallgrunnlag for det samme forslaget er derimot samme tema og skal ikke gi en ny ordinær artikkel innen sperren.

## Oppdater en publisert analyse

En tydelig forbedring eller rettelse gjøres som en **erstatning**, ikke en ny problemstilling. Erstatningen krever en ny, eksakt menneskelig godkjenning. Fra fersk main:

```sh
node scripts/analyser/prepare-replacement.mjs editorial/handoff/ukens-analyse.json <publisert-slug>
```

Pakken har `mode: replacement` og `article.replaces` med den tidligere analysens slug og innholdshash. Revider `copy` (inkludert grafer), behold rapport og erstatningsreferanse uendret, valider og lever bare JSON gjennom den eksisterende `analysis/input-*`-grenen. Boten henter den tidligere godkjente versjonen på nytt, sjekker den faste referansen og oppretter et nytt utkast. Et foreldet eller allerede erstattet grunnlag stopper. Dette er ingen omvei rundt godkjenning eller botens forfatterskap.

For en fordypning i nye poster, lag en JSON-fil med kontrollerte `detailSelections` og oppgi filen som tredje argument til samme kommando. Den frosne hovedserien og tidligere fakta beholdes; nye poster beregnes fra fersk main bare dersom alle årsrader i hovedserien er identiske med den gamle rapporten. Kildeversjon, oppdateringstidspunkt, post-ID-er og årlige beløp følger den nye rapporten. Hovedgrunnlaget kan ikke skiftes ut gjennom denne postutvidelsen. Boten kontrollerer beregningen på nytt, og hele den utvidede versjonen krever ny godkjenning.

En uttrykkelig bestilt erstatning av en annen artikkel kan ligge til gjennomgang parallelt med et eksisterende utkast. En annen åpen erstatning av samme kildeartikkel gjenbrukes og dupliseres ikke. Ordinære ukeskjøringer prioriterer fortsatt åpne gjennomganger og endringsønsker.

Etter godkjenning blir erstatningen hovedartikkel i bibliotek og sitemap. Tidligere godkjente tekster og datagrunnlag bevares uendret med en synlig lenke til nyere utgave og noindex; tidligere lenker fungerer fortsatt. Toårsregelen bruker også erstatningens nye publiseringsdato. Den samme bibliotekregelen rydder opp i de to allerede godkjente totalanalysene fra 4. og 6. oktober uten å endre deres godkjente innhold.
