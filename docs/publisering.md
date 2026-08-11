# Publisering av fellestall.no

Rekkefølgen her er ikke tilfeldig. Gjøres steg 3 før steg 2 er ferdig, blir
nettstedet utilgjengelig – ikke ødelagt, men borte til DNS-en har spredd seg.

## Status

| Del | Tilstand |
| --- | --- |
| Nettstedet bygger og publiseres til `gh-pages` | På plass (`deploy.yml`, bare fra `main`) |
| Ikoner, delingskort, `robots.txt`, `sitemap.xml` | På plass |
| Personvern, vilkår, tilgjengelighet | På plass |
| Skriftene ligger lokalt, ingen tredjeparter | På plass |
| Varsling når ETL-en feiler | På plass (`etl.yml` → GitHub-sak) |
| Publiseringssjekk | På plass (`npm run sjekk`) |
| **Domenet `fellestall.no`** | **Ikke registrert** – slår ikke opp i DNS |
| **Lisens** | **Ikke bestemt** – vilkårssiden sier det åpent |
| Utgiver og kontaktpunkt | Utsatt med hensikt |

De to uthevede punktene er det som står igjen, og begge krever en avgjørelse
utenfor koden.

## 1. Registrer domenet

`fellestall.no` slår ikke opp i DNS i dag, så det er enten ledig eller
registrert uten soneoppsett. Et `.no`-domene registreres gjennom en
Norid-registrar, og Norid krever norsk organisasjonsnummer eller
identifikasjon av privatperson. Sjekk først om navnet er ledig hos Norid.

Merk at både `fellestall.no` og `www.fellestall.no` bør registreres i samme
sone, slik at begge kan settes opp i steg 2.

## 2. Sett opp DNS

GitHub Pages nås på faste adresser. Verdiene under er slått opp i DNS mot
`lippen1995.github.io`, ikke hentet fra hukommelsen – men slå dem opp på nytt
hvis det er gått lang tid.

For toppdomenet (`fellestall.no`), fire A-poster:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Og fire AAAA-poster, slik at siden også nås over IPv6:

```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

For `www`, én CNAME-post til `lippen1995.github.io.` (med punktum til slutt).

Vent til oppslaget svarer riktig før du går videre. Sett gjerne en kort TTL
(300 sekunder) på postene mens du holder på, og øk den etterpå.

```sh
# skal gi de fire A-postene over
python3 -c "import socket;print(sorted({i[4][0] for i in socket.getaddrinfo('fellestall.no',None,socket.AF_INET)}))"
```

## 3. Legg inn CNAME-filen

Først når steg 2 svarer riktig:

```sh
echo 'fellestall.no' > web/public/CNAME
```

Filen **må** ligge i `web/public/`, ikke bare settes i repoets innstillinger.
Utrullingen force-pusher `web/dist` til `gh-pages`:

```
git push --force … gh-pages
```

En force-push uten `CNAME` i treet nullstiller det egendefinerte domenet, og
nettstedet faller tilbake til github.io-adressen ved neste utrulling. Ligger
filen i `public/`, kopierer vite den inn i `dist/` ved hvert bygg, og
innstillingen overlever.

`npm run sjekk` sier fra om filen mangler, og hvorfor den ikke skal legges inn
for tidlig.

## 4. Slå på HTTPS

I repoets innstillinger under Pages: sjekk at det egendefinerte domenet er
registrert, og kryss av for **Enforce HTTPS**. GitHub bestiller et
Let's Encrypt-sertifikat automatisk. Avkryssingen er grå til sertifikatet er
utstedt – det tar vanligvis minutter, men kan ta lengre tid. Kommer det ikke,
er årsaken nesten alltid at DNS-en ikke har spredd seg ennå.

## 5. Kjør publiseringssjekken

```sh
cd web
npm install --no-save playwright && npx playwright install chromium   # én gang
npm run build
npx vite preview --port 4173 &
npm run sjekk 4173
```

Sjekken går gjennom titler og metadata, delingskort, `robots.txt` og
`sitemap.xml`, at ingen forespørsler går utenfor eget domene, tastaturbruk og
tekstalternativ i grafene, tilpasning ved 320 px og 200 % tekst, og kontrast på
alle fire sider i begge bevegelsesinnstillinger. Den avslutter med kode 1 hvis
noe er galt.

Sjekken kjøres mot `vite preview`, som svarer med `index.html` på alle ukjente
adresser. Den henter derfor først en adresse som ikke finnes og bruker svaret
som fingeravtrykk, slik at en skrivefeil i en lenke ikke går gjennom som «200
OK». GitHub Pages svarer 404 på det samme, så sjekken er strengere enn den
trenger å være i produksjon.

## 6. Etter at det er live

- Se at forsiden svarer på `https://fellestall.no` og at `www` sender videre dit.
- Lim adressen inn i en delingsforhåndsvisning og se at kortet kommer med
  bildet. `og:image` er en absolutt adresse og virker først når domenet gjør det.
- Meld `https://fellestall.no/sitemap.xml` til Google Search Console hvis siden
  skal være søkbar.
- Den kanoniske adressen peker på `fellestall.no` også fra github.io-adressen.
  Det er med vilje: da blir ikke github.io-adressen indeksert som originalen.
  Men det betyr også at github.io-adressen peker på et domene som ikke svarer
  før steg 2 er gjort.

## Det som gjenstår, og som ikke haster

- **Lisens.** Ingen `LICENSE` er lagt inn, fordi valget ikke er tatt. Uten
  lisens har ingen rett til å gjenbruke koden selv om repoet er offentlig.
  Vilkårssiden sier dette rett ut i stedet for å være taus. Tallgrunnlaget er
  upåvirket: NLOD og CC BY 4.0 gjelder fra DFØ og SSB uansett.
- **Utgiver og kontaktpunkt.** Både vilkårssiden og
  tilgjengelighetssiden sier at kontaktpunkt ikke er satt opp, i stedet for å
  oppgi en adresse som ikke leses. Bruk ikke en jobbadresse: på et privat
  nettsted om statsfinanser leses en arbeidsgiveradresse som om arbeidsgiveren
  står bak.
- **Nyttelast.** Forsiden laster ~620 kB komprimert ved første besøk, mest
  `utgifter.json` og `inntekter.json`. Å la ETL-en skrive det kompakte formatet
  direkte er målt til 13 % mindre over nettet (350 → 303 kB gzip) og sparer
  ~40 ms tolking på en stasjonær maskin. Det er mindre enn det ser ut som i rå
  bytes (46 %), fordi gzip alt komprimerer de gjentatte nøkkelnavnene godt.
  Endringen berører dataformatet mellom ETL og frontend, så den hører hjemme
  etter lansering, ikke før.
- **Stortingets voteringer og virksomhetsnivået.** Finnes bare i det gamle
  verktøyet, som ikke er nåbart. `politikk.json` lages fortsatt av ETL-en, men
  hentes ikke før noe viser den – bruk `hentPolitikk()` fra `lib/data`.
