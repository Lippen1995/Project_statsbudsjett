# Kort analyse av strukturell oljepengebruk

Denne rapporttypen dekker Finansdepartementets publiserte nøkkeltall når detaljbudsjettets kapittel/post-arkiv ennå ikke finnes. Den erstatter ikke Gul bok-importen eller den større budsjettdagsanalysen.

Ukraina-rammer og utvalgte militære, sivile og kapitalposter er kontrollert separat i [Ukraina-grunnlaget](ukraine-history-oil-2027.md). Historiske støttebeløp finnes; programrammer og bokførte utbetalinger må skilles. Tillegget følger rapportens hash og menneskelige godkjenning.

Original HTML ligger i `web/public/data/oil-funds/<år>.html`. Companion JSON inneholder den faktiske offisielle URL-en, kontrolltidspunkt og SHA-256. Kildetabellen må ha tre sammenhengende år, løpende kroner, faste forslagsårspriser og fondets uttaksandel. Parseren kontrollerer også fotnoten om anslag året før, Ukraina-beløpet og fondskapitalen. Ukjent format stopper beregningen.

Kode og kildearkiv skal være kontrollert på main før innholdsleveringen. Fra oppdatert main:

```sh
GITHUB_REPOSITORY=Lippen1995/Project_statsbudsjett node scripts/analyser/prepare.mjs editorial/handoff/ukens-analyse.json --oil-year=2027
```

Skriv `article.copy` med kontrollerte fakta, fire til ti seksjoner og eksisterende seriegrafer. `oil-funds`-serier støtter `nominal`, `real` og `fundPercent`. Både foreslåtte og anslåtte år merkes, og kroner og prosent holdes på separate grafer. Inntektsandelen forblir uttrykkelig uavklart når faktisk fondsoverføring og budsjettinntekter mangler.

Valider artikkelen og lever bare handoff-filen på en `analysis/input-*`-gren. Pakken bruker `mode: oil-funds`, tolket av eksisterende weekly-pushflyt. Boten rekonstruerer rapporten fra kildearkivet på betrodd main og krever identisk rapport. Et eksisterende utkast for samme år eller et publisert sammeårstema hindrer duplikat. Artikkel og LinkedIn-tekst trenger fortsatt menneskelig godkjenning av eksakt versjon. Ingen automatisk artikkelgodkjenning eller publiseringsregisterendring inngår.

## Oppdatering etter full fremleggelse

Nøkkeltallene ble publisert 7. oktober kl. 08.00 norsk tid, før full fremleggelse kl. 10.00. Original kapittel 3 i Nasjonalbudsjettet er nå arkivert i `2027-budget.html` med kontrolltid og SHA-256. Tabell 3.3 og 3.5 avstemmer strukturelt underskudd, oljekorrigert underskudd og fondsoverføring. Tabell 3.7 gir samlet Ukraina-støtte, bevilgning og materielldonasjoner 2022–2027. Bevilgning er ikke kontantutbetaling. Gjenanskaffelser vises separat. Tidligere DFØ-postgrunnlag er bevart med opprinnelig fase og avgrensning.

Inntektsandelen er fondsoverføring / (inntekter utenom petroleum + fondsoverføring). Petroleum som settes inn i fondet og lånetransaksjoner inngår ikke. Hovedtallene er fortsatt forslag og anslag, ikke regnskap for neste år.

En allerede publisert oljeanalyse kan oppdateres med eksplisitt `replaces.oilRefresh: true`, bundet til tidligere slug og innholdshash. Dette tillates bare for samme oljeproblemstilling, uten andre postutvalg. Boten rekonstruerer hele rapporten fra betrodd main; en redaksjonelt endret rapport avvises. Ny eksakt menneskelig godkjenning kreves. Tidligere publisert tekst og godkjenning beholdes uendret i historikken. Vanlige tekstrevisjoner beholder fortsatt frosset rapport.
