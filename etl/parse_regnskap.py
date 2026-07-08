"""
Parser for DFØ statsregnskapet_aar_YYYY.csv.

Faktisk skjema (verifisert mot nedlastet fil 2026-07, se docs/data-schema.md):
  - Separator: ';', alle felt kvotert med '"'
  - Encoding: ISO-8859-1 (Latin-1)
  - Desimaltegn: ',' — beløp i kroner med øre, f.eks. "-847732,870"
  - Fortegn: debet positivt (utgift), kredit negativt (inntekt)
  - Én rad per måned (Periode = YYYYMM) — summeres til årsnivå
  - Post_id er 6 siffer: kapittel (4) + post (2)

Kolonner:
  År, Periode, Konto_no, Konto, Programområde_id, Programområde,
  Programkategori_id, Programkategori, Fagdepartement_id, Fagdepartement,
  Kapittel_id, Kapittel, Post_id, Post, Post_type,
  Kontoklasse_id, Kontoklasse, Kontogruppe_id, Kontogruppe,
  Artskonto_id, Artskonto, Fagdepartement_Virksomhet_id, Fagdepartement_Virksomhet,
  Virksomhet_id, Virksomhet, Regnskapsfører_id, Regnskapsfører, Beløp
"""
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# Kapitler for overføring til/fra Statens pensjonsfond utland
SPU_KAPITLER = {"2800", "5800"}

# Kolonner vi faktisk trenger (usecols sparer minne — filene er ~130 MB/år)
USECOLS = [
    "År", "Fagdepartement_id", "Fagdepartement",
    "Kapittel_id", "Kapittel", "Post_id", "Post", "Post_type",
    "Kontoklasse_id", "Kontoklasse", "Artskonto_id", "Artskonto",
    "Virksomhet_id", "Virksomhet",
    "Beløp",
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
    "Kontoklasse_id": "klasse_id",
    "Kontoklasse": "klasse_navn",
    "Artskonto_id": "artskonto",
    "Artskonto": "artskonto_navn",
    "Virksomhet_id": "virk_id",
    "Virksomhet": "virk_navn",
    "Beløp": "belop",
}


def _to_amount(series: pd.Series) -> pd.Series:
    """Norsk beløpsformat → float. "1.234,56" / "-847732,870" → -847732.87"""
    return (
        series
        .str.strip()
        .str.replace("\xa0", "")
        .str.replace(" ", "")
        .str.replace(".", "", regex=False)   # punktum = tusenskille
        .str.replace(",", ".", regex=False)  # komma = desimal
        .apply(pd.to_numeric, errors="coerce")
    )


def parse_regnskap(paths: list, year: int, med_virksomheter: bool = False):
    """
    Les regnskaps-CSV(er) for ett år og returner normalisert DataFrame,
    aggregert til årsnivå per dept/kap/post/artskonto.

    Kolonner ut:
      aar, dept_kode, dept_navn, kap, kap_navn, post, post_navn,
      klasse_id, klasse_navn, artskonto, artskonto_navn,
      belop_mill (signert, mill. kr), er_utgift, fin, transfer, netto

    Med med_virksomheter=True returneres (df, virk_df) der virk_df er
    aggregert per aar/kap/post/virksomhet (for «hvem bruker pengene»).
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
        raise ValueError(f"Ingen CSV-filer å parse for {year}: {paths}")

    df = pd.concat(frames, ignore_index=True)

    missing = set(USECOLS) - set(df.columns)
    if missing:
        raise ValueError(
            f"Regnskapsfil for {year} mangler kolonner: {missing}.\n"
            f"Faktiske kolonner: {list(df.columns)}\n"
            "Skjemaet har endret seg — oppdater USECOLS/RENAME i parse_regnskap.py "
            "og docs/data-schema.md."
        )

    df = df.rename(columns=RENAME)
    df["belop_kr"] = _to_amount(df["belop"])
    df = df.dropna(subset=["belop_kr"])

    df["aar"] = pd.to_numeric(df["aar"], errors="coerce").fillna(year).astype(int)

    # Nettobudsjetterte virksomheter: rapporterer artskonto men ikke kapittel/post.
    # Kjennetegn: manglende/ugyldig Kapittel_id eller Post_id.
    kap_ok = df["kap"].notna() & df["kap"].str.strip().str.match(r"^\d{3,4}$", na=False)
    post_ok = df["post_id6"].notna() & df["post_id6"].str.strip().str.match(r"^\d{6}$", na=False)
    df["netto"] = ~(kap_ok & post_ok)

    n_netto = int(df["netto"].sum())
    if n_netto:
        belop_netto = df.loc[df["netto"], "belop_kr"].sum() / 1e6
        logger.warning(
            f"  [ADVARSEL] {year}: {n_netto} rader uten gyldig kapittel/post "
            f"(nettobudsjetterte virksomheter, {belop_netto:,.0f} mill. kr) — "
            "ekskluderes fra kapittel/post-hierarkiet, logget her."
        )

    ok = df[~df["netto"]].copy()
    ok["kap"] = ok["kap"].str.strip().str.zfill(4)
    ok["post"] = ok["post_id6"].str.strip().str[-2:]

    # Utgift vs inntekt: kapittelserien avgjør (1–2999 utgift, 3000–5999 inntekt)
    ok["er_utgift"] = ok["kap"] < "3000"

    # Fortegnkonvensjon: debet positivt. På inntektskapitler er inntekter kreditert
    # (negative) — snu fortegn slik at inntekter blir positive i inntektstreet.
    ok["belop_mill"] = ok["belop_kr"] / 1e6
    ok.loc[~ok["er_utgift"], "belop_mill"] = -ok.loc[~ok["er_utgift"], "belop_mill"]

    # Flagg
    post_nr = pd.to_numeric(ok["post"], errors="coerce")
    ok["fin"] = post_nr >= 90
    ok["transfer"] = ok["kap"].isin(SPU_KAPITLER)

    # Aggreger måneder → år, per dept/kap/post/artskonto
    grp = (
        ok.groupby(
            ["aar", "dept_kode", "dept_navn", "kap", "kap_navn",
             "post", "post_navn", "klasse_id", "klasse_navn",
             "artskonto", "artskonto_navn", "er_utgift", "fin", "transfer"],
            dropna=False,
        )["belop_mill"]
        .sum()
        .reset_index()
    )
    grp["netto"] = False

    total_u = grp.loc[grp["er_utgift"], "belop_mill"].sum()
    total_i = grp.loc[~grp["er_utgift"], "belop_mill"].sum()
    logger.info(
        f"  -> {len(grp)} aggregerte rader. "
        f"Utgifter: {total_u:,.0f} mill., inntekter: {total_i:,.0f} mill."
    )

    if not med_virksomheter:
        return grp

    # Virksomhetsdimensjon: hvem konterer på posten («hvem bruker pengene»)
    if "virk_id" in ok.columns:
        virk = (
            ok.groupby(
                ["aar", "kap", "post", "virk_id", "virk_navn", "er_utgift"],
                dropna=False,
            )["belop_mill"]
            .sum()
            .reset_index()
        )
    else:
        logger.warning("  [ADVARSEL] Virksomhet-kolonner mangler — virk_df blir tom")
        virk = pd.DataFrame(columns=["aar", "kap", "post", "virk_id", "virk_navn",
                                     "er_utgift", "belop_mill"])
    return grp, virk
