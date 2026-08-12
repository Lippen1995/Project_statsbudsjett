#!/usr/bin/env python3
"""Henter skriftfilene til nettstedet fra Google Fonts og legger dem lokalt.

Grunnen til at skriftene ligger hos nettstedet selv er personvern: en lenke til
fonts.googleapis.com betyr at nettleseren til hver besøkende gjør en forespørsel
til Google, som da ser IP-adressen. Det var den eneste tredjeparten siden hadde.

Skriptet er kilden til public/fonter.css og public/fonter/. Skal en vekt legges
til eller fjernes, endre VEKTER under og kjør på nytt – ikke rediger den
genererte CSS-en for hånd.

    python web/scripts/hent_fonter.py

Om utvalget:

  Bare «latin» er tatt med. Alle tegnene siden faktisk bruker – inkludert æ, ø,
  å og é – ligger der. «latin-ext» ville lagt til 155 kB uten å dekke et enkelt
  tegn mer av det som står på siden. Det eneste tegnet utenfor latin er «→»
  (U+2192), og det finnes ikke i latin-ext heller; det tegnes av systemskriften
  uansett.

  Playfair Display hentes i 600 og 700. Stilarket ber om 400 for «.no» i
  logoen, men det er bevisst ikke lastet: da faller den på nærmeste vekt, som er
  det siden alltid har vist. Å legge til 400 ville kostet 37 kB for tre tegn og
  endret utseendet.
"""

import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Vektene er de som faktisk males på siden, målt i nettleseren – ikke de som
# tilfeldigvis står i et stilark. JetBrains Mono og Inter er ikke med: .ft .num
# overstyrer monospace med sidens egen skrift, og Inter finnes bare i <noscript>.
VEKTER = {
    "Libre Franklin": [400, 500, 600, 700],
    "Playfair Display": [600, 700],
}

SUBSETT = {"latin"}

# Google svarer med woff2 bare til nettlesere som støtter det. Uten en slik
# User-Agent får man ttf, som er flere ganger større.
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

STILARK_HODE = """/*
 * Skriftene ligger hos nettstedet selv, ikke hos Google, av personvernhensyn.
 *
 * DENNE FILEN ER GENERERT av web/scripts/hent_fonter.py. Endringer her blir
 * borte neste gang skriptet kjøres – endre skriptet i stedet.
 *
 * Libre Franklin og Playfair Display er lisensiert under SIL Open Font License
 * 1.1, som tillater dette. Lisensteksten ligger i fonter/OFL.txt.
 */
"""


def hent(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as svar:
        return svar.read()


def bygg_url() -> str:
    deler = []
    for familie, vekter in VEKTER.items():
        navn = familie.replace(" ", "+")
        deler.append(f"family={navn}:wght@{';'.join(str(v) for v in sorted(vekter))}")
    return "https://fonts.googleapis.com/css2?" + "&".join(deler) + "&display=swap"


def main() -> int:
    web = Path(__file__).resolve().parent.parent
    mappe = web / "public" / "fonter"
    mappe.mkdir(parents=True, exist_ok=True)

    url = bygg_url()
    print(f"henter {url}")
    try:
        kilde = hent(url).decode("utf-8")
    except urllib.error.URLError as e:
        # Nettverket kan være stengt. Da er det bedre å si det rett ut enn å
        # skrive et halvferdig stilark over et som virker.
        print(f"FEIL: kom ikke til fonts.googleapis.com: {e}", file=sys.stderr)
        return 1

    blokker = re.findall(r"/\* (\S+) \*/\s*@font-face \{(.*?)\}", kilde, re.S)
    if not blokker:
        print("FEIL: fant ingen @font-face i svaret", file=sys.stderr)
        return 1

    # Familiene her er variable skrifter: Google svarer med SAMME fil for alle
    # vektene, og lar font-weight i @font-face peke ut punktet på vektaksen.
    # Lagrer man den under ett filnavn per vekt, blir én delt adresse til fire
    # ulike – og nettleseren laster samme skrift fire ganger. Filene navngis
    # derfor etter innholdet, slik at like filer blir én fil og alle reglene
    # peker på den.
    filnavn_for_url: dict[str, str] = {}
    regler, hentet, gjenbrukt, hoppet = [], 0, 0, 0

    for subsett, kropp in blokker:
        if subsett not in SUBSETT:
            hoppet += 1
            continue
        familie = re.search(r"font-family: '([^']+)'", kropp).group(1)
        vekt = re.search(r"font-weight: (\d+)", kropp).group(1)
        filurl = re.search(r"url\((https://[^)]+)\)", kropp).group(1)
        omraade = re.search(r"unicode-range: ([^;]+);", kropp).group(1)

        if filurl in filnavn_for_url:
            filnavn = filnavn_for_url[filurl]
            gjenbrukt += 1
            print(f"  {familie} {vekt}: samme fil som en tidligere vekt ({filnavn})")
        else:
            data = hent(filurl)
            stamme = familie.lower().replace(" ", "-")
            filnavn = f"{stamme}-{subsett}.woff2"
            # Skulle en familie likevel komme i flere filer, skilles de med vekt
            if (mappe / filnavn).exists() and (mappe / filnavn).read_bytes() != data:
                filnavn = f"{stamme}-{vekt}-{subsett}.woff2"
            (mappe / filnavn).write_bytes(data)
            filnavn_for_url[filurl] = filnavn
            hentet += 1
            print(f"  {filnavn}  {len(data) // 1024} kB  (vekt {vekt})")

        regler.append(
            f"@font-face {{\n"
            f"  font-family: '{familie}';\n"
            f"  font-style: normal;\n"
            f"  font-weight: {vekt};\n"
            f"  font-display: swap;\n"
            f"  src: url('fonter/{filnavn}') format('woff2');\n"
            f"  unicode-range: {omraade};\n"
            f"}}"
        )

    if not regler:
        print("FEIL: ingen av subsettene i svaret var etterspurt", file=sys.stderr)
        return 1

    (web / "public" / "fonter.css").write_text(STILARK_HODE + "\n" + "\n".join(regler) + "\n")
    total = sum(f.stat().st_size for f in mappe.glob("*.woff2"))
    print(f"\nskrev public/fonter.css: {len(regler)} regler over {hentet} filer, {total // 1024} kB")
    if gjenbrukt:
        print(f"{gjenbrukt} vekter deler fil med en annen (variabel skrift) – "
              "de lastes én gang, ikke én per vekt")
    print(f"hoppet over {hoppet} blokker i andre subsett")
    return 0


if __name__ == "__main__":
    sys.exit(main())
