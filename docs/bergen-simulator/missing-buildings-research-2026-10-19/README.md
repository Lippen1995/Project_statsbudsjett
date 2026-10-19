# Evidens og reproduksjon — manglende bygninger

Se [hovedrapport](../missing-buildings-reconstruction.md) og
[kilde-/lisensregister](source-register.md). Dette er en isolert forskningspakke,
ikke en kildeoppdatering eller en masseproduksjonsimporter.

## Innhold

| Fil | Formål |
|---|---|
| `inputs.json` | Fastlåst lokalt geografigrunnlag, subset-hasher, publiserte kilde-URL-er, Overture-byteområder og begrensninger |
| `microsoft.geojson.gz`, `overture.geojson.gz` | Avgrensede originalgeometrier/egenskaper. Inkluderer også kilder som ikke passerer kontroll; ikke runtime-data |
| `coverage-results.json`, `matches.json.gz` | Tellinger, metode, kildehistorikk, parvise romlige/ID-treff; ingen survey-fasit |
| `candidates.geojson.gz`, `candidate-triage.json.gz` | Romlige hullkandidater med alle flagg, original-ID og geometri. Alle står i karantene |
| `height-results.json` | Per-bygg raster-/takhypoteser, sampling, holdout og kildekonflikt |
| `height-attribute-candidates.json.gz` | Separate Overture-høydeforslag via eksisterende OSM-ID-er, med per-egenskap-provenance; ingen attributtimport |
| `detail-results.json` | Geometrisk samsvar, høydeberiking og grov helningsscreening |
| `registry-metadata.json`, `registry-probes.json`, `registry-results.json` | Fire små åpne bygningspunktkontroller, rettighetsmetadata og livsløpsgrenser. Ingen full sentrumstelling |
| `01-coverage.png` | Reproduserbar sentrumskartfigur: eksisterende fotavtrykk og kandidatgrenser, ingen bakgrunnskarttjeneste |
| `02-bryggen-screen.png` | Fotavtrykk og kandidater over eksisterende DOM; se særlig negative funn ved Skur 11 |
| `03-skur-roof-profile.png` | Rasterceller versus estimert saltak, absolutte NN2000-koter; ikke rå laserpunkter |
| `validation.json`, `browser-report.json`, `manifest.json` | Utførte kontroller, lokal nettleserprøve og filintegritet |

Figurene er åpnet og visuelt kontrollert. Ingen etter-bilder fremstiller kandidater
som om de var ferdige, verifiserte Bergen-bygg. Dagens 3D-renderer er uendret.
Fasade- og GLB-sammenligningen fra forrige oppgave ligger
[i rekonstruksjonsstudien](../reconstruction-research-2026-10-19/prototype-results.md).

## Reproduksjon for utviklere/agent

Bruk Python 3.12 og en isolert venv med `requirements.txt`. Dette er intern
reproduksjonsdokumentasjon, ikke manuelt arbeid som telefonbrukeren må gjøre.
Fra repositoryrot:

```sh
/tmp/bergen-r1-geo/bin/python docs/bergen-simulator/missing-buildings-research-2026-10-19/audit.py
/tmp/bergen-r1-geo/bin/python docs/bergen-simulator/missing-buildings-research-2026-10-19/heights.py
/tmp/bergen-r1-geo/bin/python docs/bergen-simulator/missing-buildings-research-2026-10-19/details.py
/tmp/bergen-r1-geo/bin/python docs/bergen-simulator/missing-buildings-research-2026-10-19/registry.py
/tmp/bergen-r1-geo/bin/python docs/bergen-simulator/missing-buildings-research-2026-10-19/test_audit.py
/tmp/bergen-r1-geo/bin/python docs/bergen-simulator/missing-buildings-research-2026-10-19/figures.py
```

Appens uendrede `tests/fixtures/r1b-dom.tif` og ignorerte, tidligere låste
`data-cache/research-2a/bergen-dtm-2m.tif` må finnes. Ved cache-miss kan den
uttrykkelig opt-in `acquire.py --cache /tmp/bergen-missing-buildings` hente
den opprinnelige åpne DTM-en og reprodusere begge subsettene med hashkontroll.
Den bruker nøyaktig de gjennomgåtte Overture-byteområdene, ikke en hel verdensfil,
beholder proxy/TLS og har ingen credentials. Dagens kildefiler endres aldri.
Arkiverte rådata/cache må bevares dersom historiske upstream-filer forsvinner.

Nettverksdelen ble testet ved re-ekstraksjon fra de faktisk hentede og hashkontrollerte
byteområdene/råflisen i cache. Begge subsettene reproduserte bytevis identiske
gzip-filer. Ingen påstand om en ny kaldnedlasting fra hver ekstern host etter dette.

CPU-/RSS-tall omfatter maskeklargjøring og analyser, ikke nettverk eller en rendret
helby. Kjør ikke benchmark parallelt med bygg/test. Tids-/minnefelt kan variere;
de deterministiske telle-/geometri-/høyderesultatene kan sammenlignes separat.

`registry.py` leser normalt bare de låste, utvalgte bygningspunktfeltene. Den
separate `--acquire`-modusen ble kjørt for fire avgrensede WFS-forespørsler, men
er en **ny anskaffelse** med mulige nye datoer/status, ikke en stille reproduksjon
av historiske byte. Ikke oppdater `registry-probes.json` under eksisterende input-
lock; en endret kildeversjon må granskes og låses separat. API-ens uventede
egenskaps-/telleoppførsel og avbrutt større uttrekk er dokumentert i metadata.

## Testomfang og grenser

Forskningsregresjonene tester samme-/delt-/sammenslått polygon, nærhet og ugyldig
topologi, kildeidentitet, vei/vann/kyst/terreng, pixel-centre, nodata/dekningsfeil,
deterministisk takform, motstridende takmetadata, input-drift, multipolygon-
komponenter, fortsatt `null` for ukjente høyder og karantene også uten maskekonflikt.
Eksisterende simulator/GIS/build/isolation/browser-kontroller er kjørt separat.

Begrensninger: ingen kontrollsurvey, ingen rå LAZ/roofer/3dfier-kjøring, ingen ny
bekreftet bygningsimport, ingen ny fasade-/GLB-/GPU-måling, ingen fysisk GPU.
Mobilviewport/SwiftShader beviser ikke telefonens FPS. Senere review og dataversjon
kreves før et kandidatlag kan bli observert bygeografi.
