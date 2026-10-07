# Kort analyse av strukturell oljepengebruk

Denne rapporttypen dekker Finansdepartementets publiserte nøkkeltall når detaljbudsjettets kapittel/post-arkiv ennå ikke finnes. Den erstatter ikke Gul bok-importen eller den større budsjettdagsanalysen.

Original HTML ligger i `web/public/data/oil-funds/<år>.html`. Companion JSON inneholder den faktiske offisielle URL-en, kontrolltidspunkt og SHA-256. Kildetabellen må ha tre sammenhengende år, løpende kroner, faste forslagsårspriser og fondets uttaksandel. Parseren kontrollerer også fotnoten om anslag året før, Ukraina-beløpet og fondskapitalen. Ukjent format stopper beregningen.

Kode og kildearkiv skal være kontrollert på main før innholdsleveringen. Fra oppdatert main:

```sh
GITHUB_REPOSITORY=Lippen1995/Project_statsbudsjett node scripts/analyser/prepare.mjs editorial/handoff/ukens-analyse.json --oil-year=2027
```

Skriv `article.copy` med kontrollerte fakta, fire til ti seksjoner og eksisterende seriegrafer. `oil-funds`-serier støtter `nominal`, `real` og `fundPercent`. Både foreslåtte og anslåtte år merkes, og kroner og prosent holdes på separate grafer. Inntektsandelen forblir uttrykkelig uavklart når faktisk fondsoverføring og budsjettinntekter mangler.

Valider artikkelen og lever bare handoff-filen på en `analysis/input-*`-gren. Pakken bruker `mode: oil-funds`, tolket av eksisterende weekly-pushflyt. Boten rekonstruerer rapporten fra kildearkivet på betrodd main og krever identisk rapport. Et eksisterende utkast for samme år eller et publisert sammeårstema hindrer duplikat. Artikkel og LinkedIn-tekst trenger fortsatt menneskelig godkjenning av eksakt versjon. Ingen automatisk artikkelgodkjenning eller publiseringsregisterendring inngår.
