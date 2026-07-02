"""
Parser for DFØ bevilgninger_full_historikk.csv.

Faktisk skjema (verifisert 2026-07, se docs/data-schema.md):
  - Separator ';', kvotert, Latin-1, desimalkomma, beløp i kroner
  - Én rad per bevilgningsvedtak per kap/post/år
  - 'Bevilgning'-kolonnen beskriver vedtaket, f.eks. "Overført fra 2013",
    "Saldert budsjett", RNB-/nysalderings-proposisjoner m.m.

Kolonner:
  År, Periode, Tildelings_periode, Programområde_id, Programområde,
  Programkategori_id, Programkategori, Fagdepartement_id, Fagdepartement,
  Kapittel_id, Kapittel, Post_id, Post, Post_type,
  Bevilgning_beløp, Bevilgning_overføres_beløp, Bevilgning_overført_beløp, Bevilgning

Serie-definisjon:
  saldert  = sum av rader klassifisert som saldert budsjett
  revidert = saldert + alle endringsvedtak gjennom året
             (RNB, nysaldering, tilleggsbevilgninger)
  Overføringer fra tidligere år ("Overført fra ...") holdes utenfor begge —
  de er disponible midler, ikke årets bevilgningsvedtak.
"""
import logging
from pathlib import Path

import pandas as pd

from parse_regnskap import _to_amount

logger = logging.getLogger(__name__)

USECOLS = [
    "År", "Fagdepartement_id", "Fagdepartement",
    "Kapittel_id", "Kapittel", "Post_id", "Post", "Post_type",
    "Bevilgning_beløp", "Bevilgning",
]

RENAME = {
    "År": "aar",
    "Fagdepartement_id": "dept_kode",
    "Fagdepartement": "dept_navn",
    "Kapittel_id": "kap",
    "Kapittel": "kap_navn",
    "Post_id": "post_id6",
    "Post": "post_navn",
    "Post_type": "post_type",
    "Bevilgning_beløp": "belop",
    "Bevilgning": "bev_tekst",
}


def _klassifiser(tekst: str) -> str:
    """Klassifiser et bevilgningsvedtak ut fra 'Bevilgning'-teksten.

    Faktiske tekster (fra CI-logg 2026-07): "2014.01.01 Saldert budsjett 2014",
    "2023.05.11 Prp: p118/22-23 i490/22-23", "Overfort fra 2020",
    "Overfores til 2026".
    """
    s = (tekst or "").lower()
    if ("overført fra" in s or "overfort fra" in s
            or "overføres til" in s or "overfores til" in s):
        return "overfort"      # overføring mellom år, ikke årets vedtak
    if "saldert" in s:
        return "saldert"
    return "endring"           # RNB, nysaldering, tilleggsprop. mv.


def parse_bevilgning(paths: list) -> pd.DataFrame:
    """
    Les bevilgningshistorikken og returner én rad per aar/kap/post:
      aar, dept_kode, dept_navn, kap, kap_navn, post, post_navn,
      saldert (mill. kr), revidert (mill. kr)
    """
    if isinstance(paths, (str, Path)):
        paths = [Path(paths)]
    frames = []
    for path in paths:
        path = Path(path)
        if path.suffix.lower() != ".csv":
            continue
        logger.info(f"  Parser {path.name}")
        df = pd.read_csv(
            path, sep=";", quotechar='"', encoding="latin-1",
            dtype=str, usecols=lambda c: c in USECOLS, low_memory=False,
        )
        frames.append(df)

    if not frames:
        raise ValueError(f"Ingen CSV-filer å parse: {paths}")

    df = pd.concat(frames, ignore_index=True)

    missing = set(USECOLS) - set(df.columns)
    if missing:
        raise ValueError(
            f"Bevilgningsfilen mangler kolonner: {missing}.\n"
            f"Faktiske kolonner: {list(df.columns)}\n"
            "Oppdater USECOLS/RENAME i parse_bevilgning.py og docs/data-schema.md."
        )

    df = df.rename(columns=RENAME)
    df["belop_mill"] = _to_amount(df["belop"]) / 1e6
    df = df.dropna(subset=["belop_mill"])
    df["aar"] = pd.to_numeric(df["aar"], errors="coerce").astype("Int64")
    df = df.dropna(subset=["aar"])

    df["kap"] = df["kap"].str.strip().str.zfill(4)
    df["post"] = df["post_id6"].str.strip().str[-2:]
    df["serie"] = df["bev_tekst"].apply(_klassifiser)

    # Logg de faktiske vedtakstypene så klassifiseringen kan verifiseres i CI-loggen
    fordeling = df.groupby("serie").size().to_dict()
    logger.info(f"  Vedtakstype-fordeling: {fordeling}")
    topp = df["bev_tekst"].value_counts().head(20)
    logger.info("  Vanligste 'Bevilgning'-tekster:")
    for tekst, antall in topp.items():
        logger.info(f"    {antall:>7} × {tekst[:90]}")

    if fordeling.get("saldert", 0) == 0:
        logger.warning(
            "  [ADVARSEL] Ingen rader klassifisert som 'saldert' — "
            "sjekk tekstene over og juster _klassifiser() i parse_bevilgning.py."
        )

    grp_cols = ["aar", "dept_kode", "dept_navn", "kap", "kap_navn", "post", "post_navn"]

    saldert = (
        df[df["serie"] == "saldert"]
        .groupby(grp_cols, dropna=False)["belop_mill"].sum()
        .rename("saldert")
    )
    # revidert = saldert + endringer (alle årets vedtak unntatt overføringer)
    revidert = (
        df[df["serie"].isin(["saldert", "endring"])]
        .groupby(grp_cols, dropna=False)["belop_mill"].sum()
        .rename("revidert")
    )

    wide = pd.concat([saldert, revidert], axis=1).reset_index()
    wide["saldert"] = wide["saldert"].fillna(0.0)

    logger.info(
        f"  -> {len(wide)} poster over årene "
        f"{int(wide['aar'].min())}–{int(wide['aar'].max())}"
    )
    return wide
