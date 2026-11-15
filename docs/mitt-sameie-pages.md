# M1: Fellestall hjelper deg og Mitt Sameie

To pre-renderte katalogsider er lagt til:

- /hjelper-deg/ (og redirect fra URL uten avsluttende skråstrek)
- /hjelper-deg/mitt-sameie/ (samme redirect)

`web/src/products/launch.mjs` har én PRODUCTS_LAUNCHED=false-innstilling som styrer navigasjon, sitemap og robots-metadata. Direkte URL-er finnes også når lanseringen er av. Vercel-pakkeren gir i tillegg X-Robots-Tag for begge rutene. Slå ikke på flagget før minst ett produkt er ferdig og godkjent for lansering.

Sidene bruker Fellestalls lokale font-/assetmønster og egne relative assets for dype URL-er. Produktappen hydrerer de genererte propsene og erstatter ikke den eksisterende forsiden. Ukjent produktsti gir 404 i dev og i Vercels eksisterende eksplisitte 404-ruting. GitHub Pages-reserven får faktiske HTML-filer.

Innholdet skiller teknisk fundament/oppstart under utvikling fra planlagte produktmoduler og senere tillegg. Innlogging og oppstart peker til sameie.fellestall.no og er merket som avhengig av at app og BankID er klargjort. Ingen kundeopplysninger eller sensitiv appkode er lagt i dette offentlige repositoryet.

## Verifikasjon

- npm run build: bestod, inkludert eksisterende SEO-kontroller og ny sjekk_produktsider.mjs.
- npm test: 38/38 bestod.
- npm --prefix web test: 196/196 bestod, inkludert lanseringsmatrisen.
- Vercel Build Output API-pakking: bestod; katalogruter og noindex-header genereres.
- Chromium ved 375 og 1280px, begge sider: én h1, ingen horisontal overflyt eller pageerror, korrekt hydrering.
- HTTP i Vite dev: 200 for katalogsidene, 302 fra begge URL-er uten avsluttende skråstrek, 404 for ukjent underrute.
- Ingen produksjonsutrulling eller DNS-endring er utført. Denne endringen leveres for kontroll i en PR; main her utløser automatisk publisering.

Kommersiell lansering og fungerende ekstern BankID er ikke bekreftet. Status for selve appen følger det private project_sameie-repositoryet.
