# Utvidet administrasjon – verifikasjon

## Brukerflyt

En administrator åpner `/admin/`, logger inn, planlegger eller gjennomgår en
analyse og lagrer gjennom serverens rolle- og versjonskontroll. Private
registreringer ligger i Neon. Åpent redaksjonelt arbeidsgrunnlag versjoneres i
GitHub. En publisering krever menneskelig godkjenning av nøyaktig utkastversjon,
og går videre gjennom prosjektets eksisterende kontroller og utrulling.

## Kontroller utført i isolert miljø

| Grense | Bevis |
| --- | --- |
| Nettleser og innlogging | Alle 18 menyområder åpnet med ekte Better Auth-innlogging mot isolert PostgreSQL. Ingen nettleserfeil; mobilbredde 390 px uten sideveis rulling. |
| Nettleser → API → database | Tema opprettet, lagret og pauset; kalender åpnet. Ny utkasttekst lagret. Kryptert kopi opprettet og faktisk gjenoppretting testet i separat databaseskjema via nettleseren. |
| Roller og sesjoner | Leserens skriveknapper er deaktivert, og redaktøren har ingen publiseringsknapp; dette er kontrollert i nettleseren. Lesere avvises ved skriving og private mottakerregistre. Redaktører kan ikke godkjenne publisering eller gjenopprette data. Offentlige Better Auth-administrasjonsruter er sperret. |
| Tofaktor | QR-kode på canvas, aktivering og senere innlogging med reservekode er også kontrollert i nettleseren. Appkode må bekreftes før aktivering; senere innlogging krever utfordringen. Reservekode forbrukes én gang. |
| Konto og gjenoppretting | Invitasjon oppretter faktisk redaktørkonto. Engangslenke setter passord. Innlogging får korrekt rolle. Brukt lenke avvises. Testleverandør brukt; ingen testmail sendes til ekte mottaker. |
| Konfliktvern og historikk | Gamle revisjoner avvises. Før/etter lagres atomisk. Tilbakeføring gir nye versjonsnumre slik at eldre klienter fortsatt avvises. |
| Sikkerhetskopi | AES-256-GCM, kontrollsum, import av kryptert eksport og faktisk isolert gjenopprettingstest. Produksjonstilbakeføring krever gjeldende versjon og ferskt passord. |
| Bakgrunnsarbeid | To instanser deler databaselease; én døgnkopi opprettes. |
| Varsling | Faktiske providerresultater summeres uten dobbelttelling. 80/90-prosentvarsler dedupliseres. Levering er idempotent, og nye avvik etter normal drift varsles som en ny hendelse. |
| Publisering | Godkjenning avvises uten sjekkliste og ved endret GitHub-versjon. Identitet og innholdshash må stemme. Ingen faktisk produksjonsanalyse er godkjent av testene. |
| Lenker og personvern | Automatisk lenkekontroll begrenses til faste offentlige kildedomener. Ingen vilkårlige interne adresser. Statistikken inneholder bare summer og faste feiltyper. |
| Eksisterende nettsted | 191 analyse-, graf-, kilde- og domenetester bestått. Frontendbygg og SEO-kontroll bestått. |

Testfilene er `scripts/admin/platform.test.mjs`, eksisterende admin- og
Neon-tester og `web/tests/*.test.mjs`. Nettleserbevis ligger i arbeidsområdets
`artifacts/fellestall-platform/`. Disse bevisene er fra et isolert miljø og skal
ikke brukes som bevis på eksterne produksjonsrettigheter eller faktisk
levering av e-post.

## Eksternt oppsett og videre produksjonskontroll

- Checkly-kanalen ble tidligere opprettet og testet av brukeren. Den nye
  visningen leser faktisk kontroll, ferskhet, pause, demping, varslingsabonnement
  og kvote. Ukjente verdier vises eksplisitt.
- Resend og bekreftet avsender mangler fortsatt. `RESEND_API_KEY` og
  `FELLESTALL_EMAIL_FROM` er servervariabler. Invitasjoner, gjenopprettingsmail,
  samlet varsling og oppsummeringer er tilgjengelige først etter tilkobling.
  Checklys eksisterende varsling er separat.
- Den dedikerte GitHub-tokenen trenger Contents, Pull requests, Issues og
  Actions med skriveadgang i bare `Lippen1995/Project_statsbudsjett` for hele
  den nye arbeidsflyten. Eksisterende token kan få oppdaterte rettigheter;
  agentens sesjonstilgang kopieres aldri til applikasjonen.
- Daglig vedlikehold bruker en separat `CRON_SECRET`, generert direkte i den
  beskyttede publiseringsjobben. Eksisterende innlogging endres ikke.
- Planlagt Sven-oppgave beholder daglig køkontroll kl. 09.00 Europe/Oslo.
  Faktisk aktivitet rapporteres av `scripts/admin/sven-job.mjs` når oppgaven
  selv kjører. Ingen historiske kjøringer fylles inn.

Produksjonsresultater og utrullingsreferanser føyes til etter publisering.

Publiseringssperren kontrolleres også ved eksplisitt bygg fra repository-data.
Tilbakeføring til en verifisert Neon-versjon bruker egne SHA-256-referanser og
kontrollerer gjeldende aktiv versjon på nytt før aktivering.
