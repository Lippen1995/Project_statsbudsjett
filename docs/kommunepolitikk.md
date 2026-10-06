# Politisk ledelse i kommuneoversikten

Alle aktive kommuner i KOSTRA-registeret (357 ved innføringen) har ordfører,
parti og registrerte opplysninger om politisk posisjon i toppen av kartoversikten.
På detaljregnskapet gjentas ordføreren. Parlamentariske kommuner viser også
byrådsleder. Historiske kommuner og fylkeskommuner har ikke dette panelet.
Opplysningene gjelder ledelse og samarbeid uavhengig av regnskapsåret.

## Hva opplysningene betyr

Det finnes ikke ett dokumentert, kontinuerlig oppdatert nasjonalt register over
**dagens koalisjoner**. Landsdekningen kommer fra Avdekks offentlige
kommunesider, med kommunenummer kontrollert mot vårt KOSTRA-register.
Avdekk oppgir KS' konstitueringsoversikt etter valget 2023 som en grunnkilde:
https://avdekk.no/datakilder. Enkelte sider er senere oppdatert, men deres
«posisjon»/«flertall» er ikke bevis for en gjeldende samarbeidsavtale.
Vi importerer kun offentlige fakta om verv og partier, ikke redaksjonelle artikler.

Derfor viser panelet **Registrert samarbeid** for disse opplysningene og
presiserer at dagens avtale ikke er kontrollert mot kommunen. Ordførerens parti,
valgresultatet eller en budsjettavstemning brukes aldri til å beregne en koalisjon.
«Hentet» er vår lesedato, ikke kildens egen endringsdato eller en bekreftelse på
at alle opplysninger fortsatt gjelder. «Ordfører · registrert» markerer en
sekundærkilde. Et vellykket HTTP-svar fornyer aldri en redaksjonell bekreftelse.

Egne kontrollerte opplysninger ligger i
`etl/mappings/municipal-politics-overrides.json`. Bergen viser Marit Warncke (H)
og byrådsleder Chris Jørgen Knudsen Rødland (H), med H, FrP og Sp i byrådet fra
25. september 2026. Trondheim viser byrådet H, V og MDG; støttepartier i
budsjettforliket er ikke byrådspartier. Stavanger viser **Skiftende flertall**:
samarbeidet fra 2023 er brutt, og samarbeid i enkeltsaker dokumenterer ikke en
ny fast koalisjon. Ordfører Tormod W. Losnedal tilhører Høyre.

Valgoppgjørene for Bergen og Stavanger 2023 kan åpnes i panelet. De viser
mandater ved valget, før partibytter, og brukes ikke til å beskrive dagens makt.

## Daglig oppdatering og varsling

`.github/workflows/municipal-politics.yml` kjører daglig kl. 06.20 UTC,
ved endring av importer/kontrollerte opplysninger og manuelt i Actions.
Løpet krever ingen API-nøkkel og gjør følgende:

1. Tester parseren og henter alle kommunesidene (høyst fire samtidige kall,
   tidsgrense og tre forsøk per kilde). Det brukes ingen nedlastingscache i CI.
2. Kontrollerer eksakt dekning, kommunenummer, navn, kildeformat og valgmandater.
   Ukjent format eller ufullstendig førstegangsimport stopper publiseringen.
3. Bevarer siste gyldige opplysning og **siste vellykkede hentedato** hvis én
   kilde feiler. Panelet varsler om feil og dato eldre enn sju dager, også hvis
   hele oppdateringsløpet har stoppet.
4. Sammenligner kildefakta med forrige import. Kontrollerte kommuner sammenlignes
   også med referansen fra siste redaksjonelle bekreftelse, slik at uenighet ikke
   forsvinner bare fordi importen kjøres igjen.
5. Overvåker teksten i de kommunale sidene oppgitt i `monitors`. Endret tekst,
   en utilgjengelig kilde eller en bekreftelse eldre enn 90 dager krever kontroll.
   Skript, HTML-noncer og navigasjon utenfor `main` ignoreres. Andre tekstrettelser
   kan gi falske varsler; de skal vurderes, ikke tolkes som politiske endringer.
6. Oppretter/oppdaterer én GitHub-sak med kontrollbehov og feil. Ingen e-post eller
   Slack-integrasjon brukes. Repoets vanlige GitHub-varsler gjelder. Saken lukkes
   når behovene er løst. Jobbsammendraget har også rapporten.
7. Publiserer kun validerte data med konfliktkontroll via `commit-generated.py`.
   Kaller Pages-bygg eksplisitt etter datacommit, fordi push med GITHUB_TOKEN
   ikke automatisk starter en ny push-workflow.

Dette oppdager endringer i de overvåkede kildene, men kan ikke garantere sanntid
eller oppdage en politisk endring som kildene ikke selv har registrert. Et gammelt
eller endret bekreftet samarbeid merkes «sist bekreftet» og trenger ny kontroll;
det presenteres ikke som nylig kontrollert. Nasjonale kildeopplysninger forblir
merket som registrerte inntil de bekreftes mot egne kilder.

## Slik kontrolleres en kommune

1. Finn kommunens aktuelle ordførerside og samarbeidsavtale/byrådssammensetning.
   Kontroller kommune, navn, parti, støttepartier og fra hvilken dato endringen gjelder.
2. Legg inn/endre overstyringen under kommunenummeret. Sett `verifiedAt` til den
   faktiske kontrolldatoen. Dokumenter separate kilder for ordfører, eventuell
   byrådsleder og samarbeid. `government.kind` er `cabinet`, `coalition` eller
   `case-cooperation`; sekundærkilder bruker `source-reported`.
3. Angi aktuelle, levende kommunale nettsider i `monitors`. Historiske nyhetssaker
   kan dokumentere endringen, men er alene ikke tilstrekkelige som endringsvakt.
4. Kjør `python3 etl/municipal_politics.py`. En **ny** bekreftelsesdato erstatter
   sammenligningsgrunnlaget etter at kildene er hentet. Ikke endre dato automatisk.
   Manglende kilde eller sammenligningsgrunnlag gir fortsatt kontrollbehov.
5. Kjør `python3 -m unittest discover -s etl/tests -p test_municipal_politics.py`
   og `node --test web/tests/municipal-politics.test.mjs`. Gjennomgå diff og kilde-
   lenker før merge. Ved kildeformatendringer oppdateres parser og test sammen.

Det genererte registeret ligger i `web/src/kostra/municipal-politics.json`.
Det lastes som en egen JavaScript-del når panelet vises. Feltene `sourceSnapshot`,
`sourceBaseline` og `monitorBaseline` brukes kun av import/kontroll. `status`
er den maskinlesbare kontrollrapporten. Bevar disse ved vanlig kildeoppdatering.

## Partilogoer

Logoene serveres lokalt fra `web/public/bilder/partier/` og ledsages av partinavn
eller forkortelse med fullt navn for skjermlesere. Manglende logo eller bildefeil
gir partifarge og tekst. Ukjente lokale lister bruker tekst og nøytral farge.

| Fil | Kilde | Bearbeiding / lisens |
| --- | --- | --- |
| `h.svg` | https://hoyre.no/content/uploads/2020/08/hoyre-logo-blue_1839da23.svg | Uendret logo fra Høyres nettside. |
| `ap.svg` | https://www.arbeiderpartiet.no/static/arbeiderpartiet_styles/svgicons/logo_rose.30adf539bb27.svg | Symbolen er gjort til selvstendig SVG med opprinnelig viewBox og partiets rødfarge. Geometrien er uendret. |
| `frp.svg` | https://www.frp.no/resources/img/frp-favicon.svg | Uendret symbol fra partiets nettside. |
| `sv.svg` | https://commons.wikimedia.org/wiki/File:Sosialistisk_Venstreparti_logo.svg | Laget for Sosialistisk Venstreparti, CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/. Uendret. Kreditering og lisenslenke finnes under «Kilder» i panelet. |
| `r.svg` | https://commons.wikimedia.org/wiki/File:R%C3%B8dt_logo_(bokm%C3%A5l).svg | Rødt, offentlig domene (PD-textlogo) ifølge Commons. Uendret. |
| `mdg.svg` | https://commons.wikimedia.org/wiki/File:MDG_Logo_2025.svg | Smuss Type Kiosk for MDG, offentlig domene (PD-textlogo) ifølge Commons. Uendret. |
| `krf.svg` | https://krf.no/content/themes/krf-theme/assets/images/KrF_Logo_Black.svg | Uendret logo fra partiets nettside. |
| `v.png` | https://www.venstre.no/content/uploads/cropped-venstre-touch-icon-192x192.png | Uendret symbol fra partiets nettside. |

Logoene brukes til redaksjonell identifikasjon av partiene.
