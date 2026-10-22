# Gjennomgang av Fellestall-admin 22. oktober 2026

Produksjonskontoen logget inn på fellestall.no via det faktiske innloggings-API-et.
Varslingsinnboksen, jobbhistorikken, administrasjonsstatus og oversikten ble hentet
med den autentiserte økten. Innboksen inneholdt fire varsler. Ingen varsler ble
merket som lest for å skjule dem.

| Varsel | Kontroll og bevis | Resultat |
| --- | --- | --- |
| Budsjettkontroll feilet, `job:failure:39775364026` | [Omkjøring](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39775364026) endte fortsatt med feil 22. oktober kl. 19.50 norsk tid. Loggen viser tilkoblingstimeout mot bevilgningshistorikken. En separat kontroll av samme DFØ-adresse svarte HTTP 503. | Uløst. [PR #75](https://github.com/Lippen1995/Project_statsbudsjett/pull/75) forbedrer timeout/retry, men kan ikke reparere kildeutfallet. Behold åpent frem til bekreftet vellykket kjøring. |
| Manglende budsjettkjøring, `job:missing:budget-monitor.yml` | Forventet etter 06.20 UTC; [faktisk kjøring](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39775364026) startet 12.04 UTC samme dag. | Allerede løst i produksjon. Fraværsvarselet er korrekt løst selv om jobbens feil fortsatt er åpen. |
| ETL feilet, `job:failure:39245413559` | [Jobbene](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/39245413559) viser at ETL fullførte, mens publiseringen feilet i «Hent production-forbindelsen til Neon». Siste jobblogg sier `NEON_API_KEY mangler i vercel-migration`. ETL-kallet til den gjenbrukbare workflowen mangler `secrets: inherit`. | Årsak rettet i [PR #77](https://github.com/Lippen1995/Project_statsbudsjett/pull/77), også i de to tilsvarende budsjettflytene. Behold åpent til hele kjøringen er bekreftet vellykket. |
| Manglende Sven-status 20. oktober, `job:sven:2026-10-20` | `editorial/sven-status.json` inneholder fullførte køkontroller 21. oktober kl. 09.08 og 22. oktober kl. 09.01 norsk tid. Siste kjørings-ID er `c8dde271-8623-442e-b02f-41eef097e77b`. Køen ble kontrollert; neste tema er 26. oktober. | Statusrapporteringen er gjenopprettet. Produksjonen kontrollerer bare dagens nøkkel, slik at det gamle varselet blir stående. [PR #76](https://github.com/Lippen1995/Project_statsbudsjett/pull/76) kontrollerer eldre varsler og dokumenterer beviset ved lukking. Dette beviser ikke en gjennomført kontroll 20. oktober. |

PR #75 og #76 var begge åpne og ikke merget ved start. #76 er utvidet med
kontroll av gamle Sven-varsler og krav om faktisk main-kjøring for å lukke et
fraværsvarsel. Manglende, feilaktig, pågående eller fremtidig Sven-status lukker
ikke varsler. En ny tidsfrist alene er heller ikke bevis på gjenoppretting.

## Validering

- `npm test` på PR #76: 61 bestått, ingen feil eller hoppet over.
- GitHub Actions-kontrollen på PR #76 bestod rottester, frontendtester og bygg.
- Hele ETL-testsuiten på PR #75: 147 bestått, 1 hoppet over.
- Produksjonens fire varsler og faktiske arbeidsstatus ble kopiert til en isolert
  PostgreSQL/PGlite-database og kjørt gjennom den nye varselkoden. Bare Sven og
  det allerede løste fraværsvarselet fikk løst status. Begge jobbfeilene ble bevart
  åpne, med uendret antall varsler. Ingen produksjonsdatabase ble skrevet i testen.
- Actionlint bestod for `etl.yml`, `budget-monitor.yml` og `budget-proposal.yml`.
- `git diff --check` er ren.

Kodeendringene må være publisert før den faktiske innboksen får den nye
kontrollen av gamle Sven-varsler. Jobbfeilene krever nye vellykkede kjøringer;
kodetester alene er ikke tilstrekkelig bevis.
