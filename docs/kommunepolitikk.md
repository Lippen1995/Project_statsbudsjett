# Politisk ledelse i kommuneoversikten

Toppen av kommunens kartoversikt har ordfører og styrende samarbeid på høyre
side på store skjermer, under introduksjonen på mobil. Mandatfordelingen fra
siste kommunevalg kan åpnes her uten å forlate siden. Ved detaljregnskapet
gjentas bare ordfører med parti og kilde. Politisk ledelse gjelder **nå**, uavhengig av
regnskapsåret i KOSTRA. Historiske kommuner og fylkeskommuner viser ikke panelet.

## Dekning og vedlikehold

Opplysningene er redaksjonelt kontrollert og ligger i
`web/src/kostra/municipal-politics.json`, med kommunenummer som nøkkel.
Første kontrollerte kommune er Stavanger, 6. oktober 2026. Andre aktive
kommuner viser at opplysninger ennå ikke er tilgjengelige. Dette er ikke et
landsdekkende register, og ingen ukjente samarbeid utledes av valgresultatet.

Legg til en kommune først når kommunens nettside bekrefter ordfører og parti,
og en aktuell samarbeidsavtale eller annen dokumentert kilde bekrefter det
styrende samarbeidet. Registrer `checkedAt`, kildelenker og en kort presisering
av om samarbeidet er en fast koalisjon, mindretallsstyring eller samarbeid om
budsjett og enkeltsaker. Oppdater ved ordførerskifte eller endret samarbeid.
Ordførerens parti trenger ikke inngå i det politiske flertallet.

For Stavanger bekrefter kommunens ordførerside Tormod W. Losnedal (Høyre).
Samarbeidsavtalen fra 2023 mellom H, FrP, KrF, V og Pp er ikke brukt som belegg
for dagens koalisjon: samarbeidet har brutt sammen. Panelet beskriver flertallet
Ap, FrP, SV, Rødt og MDG som samarbeid om budsjett og enkeltsaker, med lenker
til Aftenbladets omtale fra april og juni 2026 og SVs årsberetning om
budsjettbehandlingen. INP og en uavhengig deltok i budsjettforslaget, men er
ikke lagt til som medlemmer av et fast styrende samarbeid. Panelet hevder
ikke at en ny formell koalisjonsavtale er inngått.

Valgoppgjøret for 2023 viser alle 67 mandater fordelt på 11 partier. Det
beskriver fordelingen ved valget og oppdateres ikke som følge av partibytter.

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
