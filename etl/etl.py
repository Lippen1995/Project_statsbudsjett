#!/usr/bin/env python3
"""
Hoved-ETL: laster ned og normaliserer alle kildefiler, bygger JSON for frontend.

Bruk:
  python etl/etl.py                 # Last ned og bygg alt
  python etl/etl.py --force         # Re-last ned selv om cache finnes
  python etl/etl.py --inspect       # Skriv ut topplinjer av kildefilene
  python etl/etl.py --years 2022 2023  # Bare bestemte år
"""
import sys
import json
import logging
import argparse
from datetime import datetime, timezone
from pathlib import Path

# Legg til etl/ i import-path
sys.path.insert(0, str(Path(__file__).parent))

from download import download_all, download_kpi, download_bnp, YEARS
from parse_regnskap import parse_regnskap
from parse_bevilgning import parse_bevilgning
from parse_befolkning import parse_befolkning, parse_ssb_aarsserie
from build_hierarchy import build_hierarchies, _save_json
import stortinget

OUTPUT_DIR = Path(__file__).parent.parent / "web" / "public" / "data"
RAW_DIR = Path(__file__).parent / "raw"
WARNINGS_LOG = Path(__file__).parent / "warnings.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(WARNINGS_LOG, mode="w", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def _valgfri(funk, navn, kilde="kilde"):
    """
    Kjør en funksjon som gir TILLEGGSDATA fra en ekstern kilde (KPI/BNP/Stortinget).
    Returner resultatet, eller None hvis kilden feiler — da hopper vi over
    dataene i stedet for å felle hele ETL-en. Vi fabrikkerer aldri erstatningstall.
    """
    try:
        return funk()
    except SystemExit as e:
        logger.warning(f"  [ADVARSEL] {navn} kunne ikke hentes fra {kilde} — hopper over.\n{e}")
        return None
    except Exception as e:
        logger.warning(f"  [ADVARSEL] {navn} feilet ({type(e).__name__}): {e} — hopper over.")
        return None


# Bakoverkompatibelt alias
def _valgfri_ssb(funk, navn):
    return _valgfri(funk, navn, kilde="SSB")


# Antall nyeste stortingssesjoner vi henter budsjettbehandling for
POLITIKK_SESJONER = 4


def _bygg_politikk(force=False):
    """Hent budsjettbehandlingen for de nyeste sesjonene fra Stortingets API."""
    sesjoner = stortinget.hent_sesjoner()
    # Sesjons-ID-er som «2024-2025» sorteres kronologisk som streng
    nyeste = sorted(sesjoner, reverse=True)[:POLITIKK_SESJONER]
    logger.info(f"  Sesjoner: {nyeste}")
    detalj_dir = OUTPUT_DIR / "detaljer"
    data = stortinget.bygg_politikk(nyeste, detalj_dir=detalj_dir)
    # Dropp tomme sesjoner (bl.a. framtidige sesjoner som finnes i API-et
    # uten saker ennå) så frontend-velgeren bare viser reelle sesjoner
    data = {s: saker for s, saker in data.items() if saker}
    n_saker = sum(len(v) for v in data.values())
    logger.info(f"  -> {n_saker} budsjettsaker over {len(data)} sesjoner med data")
    return data


MAPPINGS_DIR = Path(__file__).parent / "mappings"


def _skriv_fondsverdi():
    """
    Skriv Oljefondets markedsverdi (år -> mill. kr) til frontend.

    Kilden er en manuelt vedlikeholdt referansetabell (etl/mappings/
    fondsverdi.json) med tall fra NBIMs årsrapporter — samme kategori som de
    øvrige mapping-filene. TILLEGGSDATA: mangler filen, hopper vi over den
    (frontend skjuler uttaksprosenten). Vi fabrikkerer aldri erstatningstall.
    """
    kilde = MAPPINGS_DIR / "fondsverdi.json"
    if not kilde.exists():
        logger.warning("  [ADVARSEL] mangler mappings/fondsverdi.json — uttaksprosent skjules i frontend")
        return
    ref = json.loads(kilde.read_text(encoding="utf-8"))
    enhet = ref.get("_enhet", "mrd_kr")
    faktor = 1000 if enhet == "mrd_kr" else 1   # normaliser til mill_kr
    ut = {str(a): round(float(v) * faktor) for a, v in ref.get("verdier", {}).items()}
    if not ut:
        logger.warning("  [ADVARSEL] mappings/fondsverdi.json har ingen verdier — hopper over")
        return
    _save_json(ut, OUTPUT_DIR / "fondsverdi.json")
    logger.info(f"  Oljefond-verdi: {len(ut)} år (mill. kr) skrevet")


def run(years=None, force=False):
    if years is None:
        years = YEARS

    logger.info(f"\n{'='*60}")
    logger.info(f"Statens regnskap ETL – {datetime.now(timezone.utc).isoformat()}")
    logger.info(f"År: {years[0]}–{years[-1]}")
    logger.info(f"{'='*60}\n")

    # 1. Last ned
    logger.info("STEG 1: Nedlasting")
    files = download_all(years=years, force=force)

    # 1b. KPI og BNP fra SSB (for faste kroner og %-av-BNP).
    # Dette er TILLEGGSSERIER for ekstra visningsmoduser — hvis SSB-APIet er
    # nede eller endret, hopper vi over dem (frontend skjuler modusene) i
    # stedet for å felle hele pipeline. Vi fabrikkerer ALDRI erstatningstall.
    logger.info("\nSTEG 1b: KPI og BNP fra SSB")
    kpi_path = _valgfri_ssb(lambda: download_kpi(force=force), "KPI")
    bnp_path = _valgfri_ssb(lambda: download_bnp(force=force), "BNP")

    # 2. Parse regnskap
    logger.info("\nSTEG 2: Parser regnskapsdata")
    regnskap_frames = {}
    virk_frames = {}
    for year in years:
        key = f"regnskap_{year}"
        if key in files:
            try:
                grp, virk = parse_regnskap(files[key], year, med_virksomheter=True)
                regnskap_frames[year] = grp
                virk_frames[year] = virk
            except Exception as e:
                if year >= 2025:
                    logger.warning(f"  Hopper over {year}: {e}")
                else:
                    raise

    if not regnskap_frames:
        raise SystemExit("Ingen regnskapsdata funnet – kan ikke fortsette.")

    # 3. Parse bevilgning
    logger.info("\nSTEG 3: Parser bevilgningshistorikk")
    bevilgning_df = parse_bevilgning(files["bevilgning"])

    # 4. Parse befolkning, KPI og BNP
    logger.info("\nSTEG 4: Parser befolkning, KPI og BNP (SSB)")
    befolkning = parse_befolkning(files["befolkning"])
    kpi = _valgfri_ssb(lambda: parse_ssb_aarsserie(kpi_path, "KPI"), "KPI") if kpi_path else None
    bnp = _valgfri_ssb(lambda: parse_ssb_aarsserie(bnp_path, "BNP"), "BNP") if bnp_path else None

    # 5. Sanity-sjekk
    logger.info("\nSTEG 5: Sanity-sjekk")
    sanity_check(regnskap_frames, bevilgning_df, befolkning, kpi, bnp)

    # 6. Bygg hierarkier
    logger.info("\nSTEG 6: Bygger hierarkier")
    build_hierarchies(regnskap_frames, bevilgning_df, years, OUTPUT_DIR,
                      virk_frames=virk_frames)

    # 6b. Stortingets behandling av budsjettet (data.stortinget.no).
    # TILLEGGSDATA — hvis Stortingets API er nede hopper vi over (frontend
    # skjuler seksjonen). Fabrikkerer aldri erstatningsdata.
    logger.info("\nSTEG 6b: Stortingets budsjettbehandling")
    politikk = _valgfri(
        lambda: _bygg_politikk(force=force), "Politikk (Stortinget)", kilde="Stortinget")

    # 7. Skriv befolkning og meta
    logger.info("\nSTEG 7: Skriver støttefiler")
    _save_json(befolkning, OUTPUT_DIR / "befolkning.json")
    _skriv_fondsverdi()
    if politikk:
        _save_json(politikk, OUTPUT_DIR / "politikk.json")
    else:
        logger.warning("  [ADVARSEL] Ingen politikk-data — Stortinget-seksjon skjules i frontend")

    actual_years = sorted(regnskap_frames.keys())
    budget_years = sorted(bevilgning_df["aar"].dropna().unique().tolist())
    meta = {
        "oppdatert": datetime.now(timezone.utc).isoformat(),
        "regnskap_aar": actual_years,
        "budsjett_aar": [int(y) for y in budget_years],
        "siste_regnskap_aar": max(actual_years),
        "siste_budsjett_aar": max(int(y) for y in budget_years),
        "enhet": "mill_kr",
        "bnp_enhet": "mill_kr",
        "kilder": [
            {
                "navn": "DFØ Statsregnskapet",
                "url": "https://statsregnskapet.dfo.no",
                "lisens": "Norsk lisens for offentlige data (NLOD)"
            },
            {
                "navn": "SSB Folkemengde, KPI og nasjonalregnskap",
                "url": "https://www.ssb.no",
                "lisens": "CC BY 4.0"
            },
            {
                "navn": "NBIM – Oljefondets markedsverdi (årsrapporter)",
                "url": "https://www.nbim.no",
                "lisens": "©NBIM"
            }
        ]
    }
    if kpi:
        _save_json({str(a): round(v, 2) for a, v in kpi.items()}, OUTPUT_DIR / "kpi.json")
        meta["kpi_basisaar"] = max(a for a in kpi if a <= max(actual_years))
    else:
        logger.warning("  [ADVARSEL] Ingen KPI — 'faste kroner'-modus deaktiveres i frontend")
    if bnp:
        _save_json({str(a): round(v, 1) for a, v in bnp.items()}, OUTPUT_DIR / "bnp.json")
    else:
        logger.warning("  [ADVARSEL] Ingen BNP — '% av BNP'-modus deaktiveres i frontend")

    _save_json(meta, OUTPUT_DIR / "meta.json")

    logger.info(f"\n{'='*60}")
    logger.info("ETL fullført!")
    logger.info(f"Output: {OUTPUT_DIR}")
    logger.info(f"Advarsler/logg: {WARNINGS_LOG}")
    logger.info(f"{'='*60}\n")


# --- Kjente totaler for sanity-sjekk ---
# Kilde: Meld. St. 3 (Statsrekneskapen) — statsbudsjettets utgifter
# UTENOM lånetransaksjoner (90-poster) og SPU-overføringer, i mill. kr.
KJENTE_TOTALER_U = {
    2019: 1_378_000,
    2020: 1_583_000,
    2023: 1_782_000,
}
# Toleranse: ±15 % (avgrensningen av «utenom lånetransaksjoner» varierer noe)
TOLERANSE = 0.15

# Grov rimelighetsramme for alle år (fanger enhetsfeil kroner vs. mill.)
RIMELIG_MIN = 800_000     # 800 mrd.
RIMELIG_MAX = 3_000_000   # 3 000 mrd.


def sanity_check(regnskap_frames: dict, bevilgning_df, befolkning: dict,
                 kpi: dict = None, bnp: dict = None):
    import pandas as pd

    all_r = pd.concat(list(regnskap_frames.values()), ignore_index=True)
    u = all_r[all_r["er_utgift"] == True]
    u_ordinaer = u[(u["fin"] == False) & (u["transfer"] == False)]

    feil = []

    # Sjekk 1: Kjente publiserte totaler (utgifter ekskl. fin/SPU)
    for year, expected in KJENTE_TOTALER_U.items():
        if year not in regnskap_frames:
            continue
        actual = u_ordinaer[u_ordinaer["aar"] == year]["belop_mill"].sum()
        lo, hi = expected * (1 - TOLERANSE), expected * (1 + TOLERANSE)
        if not (lo <= actual <= hi):
            feil.append(
                f"Utgifter {year} (ekskl. fin/SPU): {actual:,.0f} mill. — "
                f"forventet {expected:,.0f} ±{TOLERANSE*100:.0f}%"
            )
        else:
            logger.info(f"  [SANITY OK] Utgifter {year}: {actual:,.0f} mill. (ref {expected:,.0f})")

    # Sjekk 1b: Grov rimelighet for alle regnskapsår
    for year in sorted(regnskap_frames.keys()):
        actual = u_ordinaer[u_ordinaer["aar"] == year]["belop_mill"].sum()
        if not (RIMELIG_MIN <= actual <= RIMELIG_MAX):
            feil.append(
                f"Utgifter {year} (ekskl. fin/SPU) urimelig: {actual:,.0f} mill. "
                f"(forventet {RIMELIG_MIN:,}–{RIMELIG_MAX:,})"
            )

    if feil:
        for f in feil:
            logger.error(f"  [SANITY FAIL] {f}")
        raise SystemExit(
            "Sanity-sjekk feilet — tallene stemmer ikke med publiserte totaler. "
            "Se feilene over. Ingen output skrives."
        )

    # Sjekk 2: Befolkning er rimelig
    for year, pop in befolkning.items():
        if 4_000_000 > pop or pop > 6_000_000:
            raise ValueError(
                f"Befolkningstall {year} er urimelig: {pop:,} "
                "(forventet 4–6 mill. for Norge)"
            )

    # Sjekk 3: Bevilgning dekker regnskapsår
    bev_years = set(bevilgning_df["aar"].dropna().astype(int).tolist())
    reg_years = set(regnskap_frames.keys())
    mangler_bev = reg_years - bev_years
    if mangler_bev:
        logger.warning(f"  [ADVARSEL] Bevilgning mangler for år: {sorted(mangler_bev)}")

    # Sjekk 4: Ingen negative beløp (alle brutto-positive)
    neg = all_r[all_r["belop_mill"] < 0]
    if len(neg) > 0:
        logger.warning(f"  [ADVARSEL] {len(neg)} rader med negativt belop_mill")

    # Sjekk 5: Bruttobalanse — statsregnskapet er dobbelt bokholderi;
    # totale utgifter (inkl. fin/SPU) skal omtrent balansere totale inntekter
    i_alle = all_r[all_r["er_utgift"] == False]
    for year in sorted(regnskap_frames.keys()):
        tu = u[u["aar"] == year]["belop_mill"].sum()
        ti = i_alle[i_alle["aar"] == year]["belop_mill"].sum()
        if tu > 0 and abs(tu - ti) / tu > 0.10:
            logger.warning(
                f"  [ADVARSEL] Bruttobalanse {year}: utgifter {tu:,.0f} vs "
                f"inntekter {ti:,.0f} mill. (avvik {abs(tu-ti)/tu*100:.1f} %)"
            )

    # Sjekk 6: År-over-år-hopp på totalnivå (> 30 % → mulig databrudd)
    aar_liste = sorted(regnskap_frames.keys())
    for forrige, denne in zip(aar_liste, aar_liste[1:]):
        v0 = u_ordinaer[u_ordinaer["aar"] == forrige]["belop_mill"].sum()
        v1 = u_ordinaer[u_ordinaer["aar"] == denne]["belop_mill"].sum()
        if v0 > 0 and abs(v1 - v0) / v0 > 0.30:
            logger.warning(
                f"  [ADVARSEL] Y/Y-hopp {forrige}→{denne}: "
                f"{(v1-v0)/v0*100:+.0f} % på totale utgifter (ekskl. fin/SPU) — "
                "sjekk for databrudd eller strukturendring"
            )

    # Sjekk 7: KPI og BNP er rimelige
    if kpi:
        for aar, v in kpi.items():
            if not (10 <= v <= 500):
                raise ValueError(f"KPI {aar} urimelig: {v} (forventet indeks 10–500)")
    if bnp:
        for aar in [a for a in bnp if a >= 2014]:
            # BNP i mill. kr: 2 000–10 000 mrd. for Norge etter 2014
            if not (2_000_000 <= bnp[aar] <= 10_000_000):
                raise ValueError(
                    f"BNP {aar} urimelig: {bnp[aar]:,.0f} mill. "
                    "(forventet 2 000 000–10 000 000). Feil enhet fra SSB-tabellen?"
                )

    logger.info(f"  Sanity-sjekk fullført. Regnskap: {sorted(regnskap_frames.keys())}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Statens regnskap ETL")
    parser.add_argument("--force", action="store_true", help="Re-last ned cache")
    parser.add_argument("--years", nargs="+", type=int, default=YEARS)
    args = parser.parse_args()

    run(years=args.years, force=args.force)
