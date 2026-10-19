# Reproduksjon av de isolerte forsøkene

Dette er dokumentasjon for videre teknisk arbeid, ikke en oppgave brukeren må utføre.
Ingen ny app-avhengighet, install-hook, runtime-tjeneste, DB-tilkobling, credential,
Vercel-endring eller geografisk import er nødvendig. Alle forsøksutdata går til en
ny mappe **utenfor repositoryet**. Åpne bare kilder med dokumenterte rettigheter.

## Miljø og låsing

- Eksakt appgrunnlag: `358b3e03649de9550af66697a76d86471e53ccee`.
- Node 24.19.0, Three.js fra uendret app-lock, Chromium 151.0.7922.173/SwiftShader.
- Java OpenJDK 21.0.12.1, OSM2World **0.4.0**, ikke bevegelig latest-build.
- [Offisiell ZIP](https://osm2world.org/download/files/0.4.0/OSM2World-0.4.0-bin.zip):
  452 089 567 byte, SHA-256
  `c05b37920d29c26710a06e30c170ca62e5e8ea653cccbbb3243dfc7e5d20b899`.
  Nedlasting tok ca. 132 s her; kompileringstiden i resultatet inkluderer ikke dette.
- Python 3.12.14; isolert `requirements.txt`. PyCOLMAP 4.0.3 er forsøksversjonen;
  nyere PyPI-versjon 4.2.1 ble funnet, men benchmarkes ikke som om den var kjørt.
- glTF Transform CLI 4.2.1/MIT via midlertidig npm-cache, aldri app-package.json.
  npm-pakkens integritet:
  `sha512-xnN8oJVQx4Sj3YX1uFkAR1dZ5PD8eEfh6BVijbGyI6XIbCb4CgAPm2x54NVbKWJTnapqoe1kyMxnfdzdKr0OEw==`.
  Eksperimentpinnen innebærer ikke godkjenning av varig installasjon; CLI-install
  varslet også om eldre transitive avhengigheter. Vurder oppdatert pinne på nytt
  før et produksjonsverktøy vedtas.
- Kildebilder: eksisterende `scripts/r1b-inputs.json` / `r1c-inputs.json`, kontrollert
  mot ignored `data-cache/r1b`. Ikke bruk nedskalerte dokumentbilder i stedet for
  originalene. Fem originalhash-er følger resultatene. Ingen nye foto kjøpt/hentet.

En ren reproduksjon krever at originalene først er hentet fra de lisensierte URL-ene
i eksisterende kilde-lock, med SHA-/bytekontroll, gjennom den godkjente nettverksstien.
Behold proxy/CA/TLS-vern. Hash-er oppdager drift; de er ikke utgiversignaturer.
Ikke bruk uautorisert kart-/modellskraping hvis en kilde blir utilgjengelig.

## Forsøk

Alle nedenstående kommandoer forutsetter repo-roten, eksisterende isolerte app-
avhengigheter og en ny midlertidig arbeidsmappe. Binærverktøy holdes utenfor repoet.
ZIP-filer må verifiseres før utpakking; avvis medlemmer som unnslipper destinasjonen.
Programvare må leses/vurderes som programvare, ikke som instruksjoner om tilgang.

```sh
uv venv /tmp/bergen-study-venv --python 3.12
uv pip install --python /tmp/bergen-study-venv/bin/python -r docs/bergen-simulator/reconstruction-research-2026-10-19/requirements.txt

# Forutsetter kontrollert OSM2World.jar fra den låste offisielle ZIP-en.
python3 docs/bergen-simulator/reconstruction-research-2026-10-19/osm_probe.py /tmp/bergen-study-osm /tmp/bergen-tools/OSM2World.jar

/tmp/bergen-study-venv/bin/python docs/bergen-simulator/reconstruction-research-2026-10-19/photogrammetry_probe.py /tmp/bergen-study-sfm
/tmp/bergen-study-venv/bin/python docs/bergen-simulator/reconstruction-research-2026-10-19/photogrammetry_probe.py /tmp/bergen-study-sfm-enhanced --enhanced

mkdir -p /tmp/bergen-delivery
python3 docs/bergen-simulator/reconstruction-research-2026-10-19/extract_landmark.py /tmp/bergen-delivery/skur-r1c.glb
npx --yes @gltf-transform/cli@4.2.1 weld /tmp/bergen-delivery/skur-r1c.glb /tmp/bergen-delivery/skur-indexed.glb
npx --yes @gltf-transform/cli@4.2.1 meshopt /tmp/bergen-delivery/skur-indexed.glb /tmp/bergen-delivery/skur-meshopt.glb --quantize-position 16 --quantize-normal 12 --quantize-color 16
```

For den samlede benchmarken, bruk én mappe med de tre siste GLB-ene og
`osm/skur-osm2world.glb` fra OSM-forsøket, som beskrevet i `benchmark.mjs`.
Kopier forsøksutdata, ikke applikasjonens kilder/credentials. Deretter:

```sh
node docs/bergen-simulator/reconstruction-research-2026-10-19/benchmark.mjs /tmp/bergen-delivery
/tmp/bergen-study-venv/bin/python docs/bergen-simulator/reconstruction-research-2026-10-19/compare_geometry.py /tmp/bergen-delivery
python3 -B docs/bergen-simulator/reconstruction-research-2026-10-19/test_probes.py
```

`benchmark.mjs` binder bare `127.0.0.1:4192`, serverer en eksplisitt liste testfiler
og Three.js-moduler, og avslutter server/browser etter testen. Ingen .env, API eller
vilkårlig filimport er tilgjengelig gjennom serveren. Viewer-koden bruker ikke
applikasjonens scenariolager og distribueres ikke med Vite-applikasjonen.

## Viktige metodiske begrensninger

- OSM-carrieren beholder faktisk kontur, bygnings-ID og tags, men den kompakte
  snapshoten beholdt ikke originale fotavtrykks-node-ID-er. Negative XML-referanser
  og `version=1` er kun formatbærere og påstås ikke å være historiske OSM-redigeringer.
- SfM bruker CPU, to tråder, automatisk kamera/EXIF og bibliotekets antakelser der
  kalibrering mangler. Mapping-seed er 7, maks tre modeller og 120 s mapping.
  Minste modellstørrelse 3 gjør testen mulig på fem bilder; standard 10 ville ha
  avvist alle. Initieringskrav til inliers/vinkel er ikke senket for å presse fram et resultat.
  Tilfeldige/parallelle tredjepartsdetaljer betyr at hele forsøket ikke lover
  bit-identiske SfM-filer eller maskintider på alle plattformer.
- SIFT `max_num_features` er konfigurasjonsverdien, ikke en påstand om at alle
  registrerte orienteringer/keypoints i resultatet er under dette tallet.
- Prosesstopp-RSS er Linux `resource`-måling; ikke native GPU-minne. COLMAPs SQLite
  er midlertidig internt arbeidsformat, ikke en ny simulator-/produksjonsdatabase.
- Kameratestene bruker fire warmups + tolv beholdte to-RAF/`gl.finish`-prober.
  Fast rekkefølge, JIT/shaderoppvarming og software-host-støy påvirker oppstart og
  P95 sterkt. Én oppstart per case er ikke en kontrollert cold-load-fordeling.
  Ikke bruk tallene som fysisk FPS, nettverkslastetid eller bevist akselerasjon.
- Eksakte posisjoner/trekanter testes separat fra vertex-settavvik etter kvantisering.
  Et nærmeste-vertex-mål er **ikke** en komplett mesh-/overflate-Hausdorff-test,
  arkitektonisk aksept eller verifikasjon mot virkelige Bergen.
