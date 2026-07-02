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

from download import download_all, YEARS
from parse_regnskap import parse_regnskap
from parse_bevilgning import parse_bevilgning
from parse_befolkning import parse_befolkning
from build_hierarchy import build_hierarchies, _save_json

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

    # 2. Parse regnskap
    logger.info("\nSTEG 2: Parser regnskapsdata")
    regnskap_frames = {}
    for year in years:
        key = f"regnskap_{year}"
        if key in files:
            try:
                regnskap_frames[year] = parse_regnskap(files[key], year)
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

    # 4. Parse befolkning
    logger.info("\nSTEG 4: Parser befolkningsdata (SSB)")
    befolkning = parse_befolkning(files["befolkning"])

    # 5. Sanity-sjekk
    logger.info("\nSTEG 5: Sanity-sjekk")
    sanity_check(regnskap_frames, bevilgning_df, befolkning)

    # 6. Bygg hierarkier
    logger.info("\nSTEG 6: Bygger hierarkier")
    build_hierarchies(regnskap_frames, bevilgning_df, years, OUTPUT_DIR)

    # 7. Skriv befolkning og meta
    logger.info("\nSTEG 7: Skriver støttefiler")
    _save_json(befolkning, OUTPUT_DIR / "befolkning.json")

    actual_years = sorted(regnskap_frames.keys())
    budget_years = sorted(bevilgning_df["aar"].dropna().unique().tolist())
    meta = {
        "oppdatert": datetime.now(timezone.utc).isoformat(),
        "regnskap_aar": actual_years,
        "budsjett_aar": [int(y) for y in budget_years],
        "siste_regnskap_aar": max(actual_years),
        "siste_budsjett_aar": max(int(y) for y in budget_years),
        "enhet": "mill_kr",
        "kilder": [
            {
                "navn": "DFØ Statsregnskapet",
                "url": "https://statsregnskapet.dfo.no",
                "lisens": "Norsk lisens for offentlige data (NLOD)"
            },
            {
                "navn": "SSB Folkemengde",
                "url": "https://www.ssb.no/befolkning/statistikker/folkemengde",
                "lisens": "CC BY 4.0"
            }
        ]
    }
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


def sanity_check(regnskap_frames: dict, bevilgning_df, befolkning: dict):
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

    logger.info(f"  Sanity-sjekk fullført. Regnskap: {sorted(regnskap_frames.keys())}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Statens regnskap ETL")
    parser.add_argument("--force", action="store_true", help="Re-last ned cache")
    parser.add_argument("--years", nargs="+", type=int, default=YEARS)
    args = parser.parse_args()

    run(years=args.years, force=args.force)
