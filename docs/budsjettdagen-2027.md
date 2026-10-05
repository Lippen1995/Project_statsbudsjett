# Budsjettdagen 2027 – beredskap og analyse

Kontrollert 5. oktober 2026. Brukeren ønsker rask oppdatering og en analyse på lanseringsdagen, uten separat AI-API. Dette dokumentet er en forberedelsesplan, ikke en aktiv tidsplan eller bekreftet støtte for import.

## Bekreftet tidspunkt og primærkilde

Regjeringen oppgir onsdag 7. oktober 2026 klokken 10.00 norsk tid for forslaget til statsbudsjett 2027. Enkelte nøkkeltall publiseres klokken 08.00. Kilden er lest i denne økten:
https://www.regjeringen.no/no/statsbudsjett/2027/id3172975/

## Faktisk beredskap

- Publisering, versjonsbundet menneskelig godkjenning og forhåndsvisning med grafer fungerer.
- Ordinær ETL henter DFØs vedtatte bevilgninger, ikke regjeringens fremleggelse. Den kjører månedlig den femte klokken 06.00 UTC; ingen særskilt kjøring på budsjettdagen er satt opp.
- Gjenbrukt råfilcache kan hindre fersk nedlasting av bevilgningshistorikken. Et nytt budsjettforslag må uansett hentes direkte fra regjeringens dokumenter, og ikke ventes på gjennom DFØ.
- Importmodellen har regnskap, saldert og revidert budsjett, men ingen separat serie for regjeringens forslag. Forslag må ikke registreres som vedtatt/saldert budsjett.
- Analysemotoren aksepterer bare historisk regnskapsutvikling per innbygger med KPI. En egen kontrollert rapporttype for budsjettforslag er nødvendig; historiske KPI-er og folketall skal ikke presenteres som faktiske fremtidige verdier.
- Den native AI-oppgaven er satt opp for mandager. Ingen særskilt onsdagskjøring er bekreftet, og denne økten har ikke et planleggingsverktøy for den andre samtalen.
- ETL kaller nå deploy som gjenbrukbar workflow. Deploy trenger pull-requests: write for forhåndsvisningslenkene, mens kalleren foreløpig bare oppgir contents: write. Dette må rettes og testes før ETL kan omtales som klar.

## Arbeidet før lansering

1. Lag og prøv import av offisielle budsjettdokumenter på et tidligere budsjett med kjent fasit. Behold URL, dokumentversjon, nedlastingstid, filhash og enheter. Skill forslag fra vedtak i nettstedets data og velger.
2. Lag en kontrollert budsjettanalyse med beregninger, passende grafer og validering. Hent sammenligningsgrunnlaget fra samme offisielle tabell når mulig, oppgi om 2026 er saldert, revidert eller anslag, og håndter endrede departementsansvar. Ikke bland regnskap med budsjett uten å forklare det.
3. Forbered en særskilt native AI-kjøring etter full fremleggelse, for eksempel fra 10.15 Europe/Oslo, med nytt forsøk ved manglende kilder. Dette tidspunktet er et forslag, ikke en opprettet oppgave. Den eksisterende mandagsoppgaven skal ikke erstattes eller dupliseres.
4. AI leverer til botens godkjenning og viser faktiske grafer i forhåndsvisning. Godkjenneren får lenken og må godkjenne eksakt versjon før publisering. LinkedIn krever fortsatt innvilget tilgang.

## Redaksjonell prioritering på dagen

Første analyse bør følge pengene: de største endringene, hvilke konkrete poster som driver dem, og sammenhengen med regjeringens foreslåtte tiltak. Tre nyttige grafer er samlet sammenligning, største økninger/kutt og en nedbryting av den viktigste endringen. Ikke skriv før funnene er dokumentert, og ikke gjenta totalsummen i flere seksjoner.

Dersom fullstendige postdata ikke er tilgjengelige ved fremleggelsen, lag en tydelig avgrenset førstegjennomgang av dokumenterte nøkkeltall og tiltak, og utsett full kartimport. Publisering samme dag er et mål, ikke en garanti før kildetilgang og den nye rapporttypen er testet.
