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
- Den dedikerte GitHub-tokenen trenger Contents, Pull requests og
  Actions med skriveadgang i bare `Lippen1995/Project_statsbudsjett` for hele
  den nye arbeidsflyten. Eksisterende token kan få oppdaterte rettigheter;
  agentens sesjonstilgang kopieres aldri til applikasjonen.
- Daglig vedlikehold bruker en separat `CRON_SECRET`, generert direkte i den
  beskyttede publiseringsjobben. Eksisterende innlogging endres ikke.
- Planlagt Sven-oppgave beholder daglig køkontroll kl. 09.00 Europe/Oslo.
  Faktisk aktivitet rapporteres av `scripts/admin/sven-job.mjs` når oppgaven
  selv kjører. Ingen historiske kjøringer fylles inn.

Gjenstående kontooppsett er beskrevet i
[admin-external-setup.md](admin-external-setup.md).

Publiseringssperren kontrolleres også ved eksplisitt bygg fra repository-data.
Tilbakeføring til en verifisert Neon-versjon bruker egne SHA-256-referanser og
kontrollerer gjeldende aktiv versjon på nytt før aktivering.

## Første produksjonskontroll, 20. oktober 2026

PR #70 ble slått sammen som `0a4b7e75db4d5026f8441be110e29a8516624a6e`.
Workflow `39425848500` publiserte og promoterte kontrollert utrulling
`dpl_6cnoRBchugsSrnUvYz5zHPGLnu2p`. Eksisterende eierkonto logget inn, og
19 admin-endepunkter svarte 200. Ingen nettleserfeil eller mobiloverflyt.
Checkly bekrefter aktive kontroller hvert femte minutt, vekselvis Frankfurt og
London, og aktiv varslingskanal til info@fjordinsight.com for feil, nedsatt
ytelse og normal drift. Kontoen rapporterer «Trial» og oppgir ingen numerisk
API-kvote eller utløpsdato; disse vises derfor som ukjente.

Dataversjonsregisteret er tilgjengelig med fem lagrede versjoner og åtte
datasett / 1145 filer. Tekniske ID-, tall- og sumkontroller består; hull i
årserier og store årsendringer markeres separat for faglig vurdering.

Produksjonskontrollen viste også at funksjonen kjørte i San Francisco, og at
Checklys FINAL-resultat bruker `attempts` inkludert første utførelse. En
oppfølging flytter funksjonen nær Neon i Frankfurt, angir TLS-verifisering
eksplisitt og retter tellingen uten å forkaste tidligere resultater.

Eksisterende Sven-oppgave `6ac269abcdac8191a5828572d4d04cf1` er oppdatert til
faktisk arbeidsstatus og pause-/hasteprioritet. Oppdateringen bekrefter aktiv
oppgave og uendret daglig tidsplan kl. 09.00 Europe/Oslo. Ingen ny analyse
eller historisk arbeidsstatus er skrevet av implementeringen.

## Siste produksjonskontroll, 20. oktober 2026 kl. 17.16 UTC

Oppfølgingen i [PR #71](https://github.com/Lippen1995/Project_statsbudsjett/pull/71)
ble slått sammen som `070b1fda49e4f2ae47ddb23a18f1b38337489b12`.
[CI 39427863565](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39427863565)
bestod 38 backend-/plattformtester og 191 nettstedstester, frontendbygg og
SEO-kontroll. [Publisering 39428178909](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39428178909)
fullførte bygg, innholdskontroll, promotering og HTTPS-/domenekontroll.
Aktiv utrulling er `dpl_RKLbFFrXNdzvQw16VigbeBHY9utp`, tilgjengelig på
https://fellestall.no/admin/.

Eksisterende eierkonto logget inn på nytt. Alle de 19 undersøkte
admin-endepunktene svarte 200; ingen nettleserfeil eller mobiloverflyt.
Produksjonsbevisene er oppdatert i `artifacts/fellestall-platform/`.
Helsekontrollens `x-vercel-id` inneholder funksjonsregion `fra1`, og siste
Checkly-resultat er vellykket med 433 ms svartid. Loggsøk for siste utrulling
fant ingen feil eller advarsler i kontrollvinduet.

En egen autentisert infrastrukturkontroll svarte også 200. TLS-sertifikatet er
verifisert mot Let's Encrypt og gyldig til 11. januar 2027. Domeneregisteret
oppgir ingen utløpsdato; datoen vises som ukjent inntil registraren eller en
administrator oppgir den. Det er ikke lagt inn en antatt fornyelsesdato.

Checkly-registeret viser 131 resultater og 131 utførelser inkludert første
forsøk, med full dekning fra kontrollens opprettelse. Eldre dobbelttelling er
reparert, og prognosen er 8928 planlagte utførelser for en måned på 31 dager,
før eventuelle nye forsøk og manuelle kjøringer. Leverandøren rapporterer
fortsatt «Trial» uten numerisk API-kvote eller sluttdato. Entitlement-listen
bekrefter at ingen separat grense for API-utførelser er oppgitt; en nullverdi
for antall API-kontroller skal ikke tolkes som en månedlig kjøringskvote.

Checkly-kontrollen er aktiv, udempet og har ferske resultater. Varslingskanalen
til info@fjordinsight.com er bekreftet for feil, nedsatt ytelse og gjenoppretting.
Svens nye arbeidsstatus har ennå ingen historisk kjøring; dette vises som
manglende rapport, uten å fylle inn konstruert aktivitet.

Åtte datasett, 1145 filer og fem dataversjoner er tilgjengelige. ID-, tall- og
sumkontroller består. Faglige avvik og hull i tidsseriene vises til vurdering.
Det er ikke utført tilbakeføring, publiseringsgodkjenning, distribusjon eller
ekstern testsending mot produksjon i denne kontrollen.

Resend er fortsatt ikke tilkoblet; serveren rapporterer `emailReady: false`.
Invitasjoner, passordgjenoppretting og samlemail skal derfor ikke regnes som
operative før avsenderoppsettet er bekreftet. GitHub-tokenens nye
skriverettigheter må fortsatt bekreftes av kontoeieren.
