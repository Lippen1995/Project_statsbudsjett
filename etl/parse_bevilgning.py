"""
Parser for DFØ bevilgningshistorikk CSV.
Returnerer saldert og revidert budsjett per år/kapittel/post.
"""
import logging
from pathlib import Path
import pandas as pd
from parse_regnskap import _read_csv, _normalize_columns, _to_amount

logger = logging.getLogger(__name__)

BEVILGNING_COL_MAP = {
    "Periode": "aar",
    "periode": "aar",
    "Departement": "dept_kode",
    "departement": "dept_kode",
    "Departementnavn": "dept_navn",
    "departementnavn": "dept_navn",
    "Kapittel": "kap",
    "kapittel": "kap",
    "Kapittelnavn": "kap_navn",
    "kapittelnavn": "kap_navn",
    "Post": "post",
    "post": "post",
    "Postnavn": "post_navn",
    "postnavn": "post_navn",
    "Bevilgningstype": "bev_type",
    "bevilgningstype": "bev_type",
    "Belop": "belop",
    "belop": "belop",
    "Beløp": "belop",
    "beløp": "belop",
}

# Mappping av DFØ bevilgningstype-strenger til våre serienavn
SALDERT_KEYWORDS = {"saldert"}
REVIDERT_KEYWORDS = {"revidert", "nysaldering", "tilleggsbevilgning"}


def _classify_bev_type(bev_type: str) -> str:
    s = bev_type.lower()
    for kw in SALDERT_KEYWORDS:
        if kw in s:
            return "saldert"
    for kw in REVIDERT_KEYWORDS:
        if kw in s:
            return "revidert"
    return "annet"


def parse_bevilgning(path: Path) -> pd.DataFrame:
    """
    Les bevilgningshistorikk og returner DataFrame med kolonner:
      aar, dept_kode, dept_navn, kap, kap_navn, post, post_navn,
      saldert (mill. kr), revidert (mill. kr)

    For hvert år/kap/post: saldert = første salderte bevilgning,
    revidert = siste reviderte/nysalderte (hvis finnes, ellers = saldert).
    """
    logger.info(f"  Parser bevilgningshistorikk: {path.name}")
    df = _read_csv(path)
    df = _normalize_columns(df)

    col_map = {c: BEVILGNING_COL_MAP[c] for c in df.columns if c in BEVILGNING_COL_MAP}
    if not col_map:
        raise ValueError(
            f"Fant ingen kjente kolonner i {path.name}.\n"
            f"Faktiske kolonner: {list(df.columns)}\n"
            "Oppdater BEVILGNING_COL_MAP i parse_bevilgning.py."
        )
    df = df.rename(columns=col_map)

    required = {"aar", "kap", "post", "belop", "bev_type"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Mangler kolonner i bevilgning: {missing}")

    df["belop_mill"] = _to_amount(df["belop"]).abs() / 1000.0
    df["aar"] = pd.to_numeric(df["aar"], errors="coerce").astype("Int64")
    df["kap"] = df["kap"].str.strip().str.zfill(4)
    df["post"] = df["post"].str.strip().str.zfill(2)
    df["serie"] = df["bev_type"].apply(_classify_bev_type)

    # Behold bare saldert og revidert
    df = df[df["serie"].isin(["saldert", "revidert"])].copy()

    # Aggreger: for hvert aar/kap/post, ta sum per serie
    # (saldert budsjett er én rad per post, men vær robust)
    grp_cols = ["aar", "dept_kode", "dept_navn", "kap", "kap_navn", "post", "post_navn", "serie"]
    grp_cols = [c for c in grp_cols if c in df.columns]

    agg = (
        df.groupby(grp_cols, dropna=False)["belop_mill"]
        .sum()
        .reset_index()
    )

    # Pivot til wide: saldert | revidert
    wide = agg.pivot_table(
        index=[c for c in grp_cols if c != "serie"],
        columns="serie",
        values="belop_mill",
        aggfunc="sum",
    ).reset_index()

    wide.columns.name = None
    if "saldert" not in wide.columns:
        wide["saldert"] = float("nan")
    if "revidert" not in wide.columns:
        wide["revidert"] = float("nan")

    # Revidert fallback = saldert hvis ikke oppgitt
    wide["revidert"] = wide["revidert"].fillna(wide["saldert"])

    logger.info(f"  -> {len(wide)} poster, år: {sorted(wide['aar'].dropna().unique().tolist())}")
    return wide
