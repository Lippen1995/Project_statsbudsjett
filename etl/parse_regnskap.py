"""
Parser for DFØ regnskapsdata CSV-filer.
Håndterer ISO-8859-1, semikolon-separator, desimalkomma og Belopstegn-konvensjon.
"""
import logging
from pathlib import Path
import chardet
import pandas as pd

logger = logging.getLogger(__name__)

# Artskonto-klasser (første siffer)
ARTSKONTO_KLASSER = {
    "0": "Lønn og sosiale utgifter",
    "1": "Kjøp av varer og tjenester",
    "2": "Finansposter",
    "3": "Stønader og overføringer til husholdninger",
    "4": "Overføringer til private",
    "5": "Overføringer til kommuner mv.",
    "6": "Overføringer til næringslivet",
    "7": "Internasjonale organisasjoner og bistand",
    "8": "Investeringer / kapitalinnskudd",
    "9": "Finansielle transaksjoner",
}

# Kapitler som er SPU-overføringer (flagges transfer=True)
SPU_KAPITLER = {"2800", "5800", "2900", "5900"}

# Nettobudsjetterte virksomheter – primært universiteter/høyskoler
# Fra 2018 rapporterer de ikke lenger kapittel/post – sjekkes dynamisk
NETTO_VIRKSOMHETER_KJENNETEGN = {"000"}  # Kapittel "0000" markerer netto i vår modell


def _detect_encoding(path: Path) -> str:
    sample = path.read_bytes()[:65536]
    result = chardet.detect(sample)
    enc = result.get("encoding") or "latin-1"
    logger.debug(f"  Encoding {path.name}: {enc} ({result.get('confidence', 0):.0%})")
    return enc


def _read_csv(path: Path) -> pd.DataFrame:
    """Les en DFØ CSV-fil med automatisk encoding-deteksjon."""
    enc = _detect_encoding(path)

    # Prøv med detektert encoding, fall tilbake på latin-1
    for attempt_enc in [enc, "latin-1", "utf-8"]:
        try:
            df = pd.read_csv(
                path,
                sep=";",
                encoding=attempt_enc,
                decimal=",",
                thousands=None,
                dtype=str,  # Les alt som streng, konverter manuelt
                low_memory=False,
            )
            logger.debug(f"  Les {path.name}: {len(df)} rader med {attempt_enc}")
            return df
        except UnicodeDecodeError:
            continue

    raise ValueError(f"Klarte ikke lese {path.name} med noen kjent encoding")


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliser kolonnenavn: strip, lowercase, fjern spesialtegn."""
    df.columns = (
        df.columns
        .str.strip()
        .str.replace("\xa0", " ")  # non-breaking space
        .str.replace("  ", " ")
    )
    return df


def _to_amount(series: pd.Series) -> pd.Series:
    """Konverter beløpskolonne til float.
    Håndterer norsk format: punktum som tusenskille, komma som desimalskilletegn.
    Eksempel: "1.234,56" → 1234.56
    """
    return (
        series
        .str.strip()
        .str.replace("\xa0", "")   # non-breaking space
        .str.replace(" ", "")      # vanlig mellomrom som tusenskille
        .str.replace(".", "", regex=False)   # fjern punktum (tusenskille)
        .str.replace(",", ".", regex=False)  # komma → punktum (desimal)
        .apply(pd.to_numeric, errors="coerce")
    )


REGNSKAP_COL_MAP = {
    # Mulige kolonnenavn i kildefil → vårt internt navn
    "periode": "aar",
    "Periode": "aar",
    "år": "aar",
    "Ã…r": "aar",
    "virksomhet": "virksomhet_kode",
    "Virksomhet": "virksomhet_kode",
    "virksomhetnavn": "virksomhet_navn",
    "Virksomhetnavn": "virksomhet_navn",
    "departement": "dept_kode",
    "Departement": "dept_kode",
    "departementnavn": "dept_navn",
    "Departementnavn": "dept_navn",
    "kapittel": "kap",
    "Kapittel": "kap",
    "kapittelnavn": "kap_navn",
    "Kapittelnavn": "kap_navn",
    "post": "post",
    "Post": "post",
    "postnavn": "post_navn",
    "Postnavn": "post_navn",
    "artstype": "artstype",
    "Artstype": "artstype",
    "artskonto": "artskonto",
    "Artskonto": "artskonto",
    "artskontonavn": "artskonto_navn",
    "Artskontonavn": "artskonto_navn",
    "belopstegn": "tegn",
    "Belopstegn": "tegn",
    "belop": "belop",
    "Belop": "belop",
    "beløp": "belop",
    "Beløp": "belop",
}


def parse_regnskap(path: Path, year: int) -> pd.DataFrame:
    """
    Les én regnskapsdata-fil og returner normalisert DataFrame.

    Returnert DataFrame har kolonner:
      aar, virksomhet_kode, virksomhet_navn, dept_kode, dept_navn,
      kap, kap_navn, post, post_navn, artskonto, artskonto_navn,
      belop_mill (i mill. kr), er_utgift, fin, transfer, netto

    Beløp er alltid positive – bruk er_utgift for retning.
    """
    logger.info(f"  Parser regnskap {year}: {path.name}")
    df = _read_csv(path)
    df = _normalize_columns(df)

    # Verifiser at nødvendige kolonner finnes
    col_map = {c: REGNSKAP_COL_MAP[c] for c in df.columns if c in REGNSKAP_COL_MAP}
    if not col_map:
        missing = set(REGNSKAP_COL_MAP.keys()) - set(df.columns)
        raise ValueError(
            f"Fant ingen kjente kolonner i {path.name}.\n"
            f"Faktiske kolonner: {list(df.columns)}\n"
            f"Forventede kolonner (noen av): {list(REGNSKAP_COL_MAP.keys())[:8]}\n"
            "Oppdater REGNSKAP_COL_MAP i parse_regnskap.py med de faktiske kolonnenavnene."
        )

    df = df.rename(columns=col_map)

    required = {"kap", "post", "belop", "tegn"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"Mangler kolonner i {path.name}: {missing}\n"
            f"Tilgjengelige kolonner: {list(df.columns)}"
        )

    # Beløpskonversjon: tusen kr → mill. kr
    df["belop_raw"] = _to_amount(df["belop"])
    df = df.dropna(subset=["belop_raw"])

    # Sign-konvensjon: D=debet=utgift (positivt), K=kredit=inntekt (positivt i brutto-modell)
    df["tegn"] = df["tegn"].str.strip().str.upper()
    df["er_utgift"] = df["tegn"] == "D"

    # Beløp alltid positivt (brutto)
    df["belop_mill"] = df["belop_raw"].abs() / 1000.0

    # Normaliser kap/post til streng
    for col in ["kap", "post"]:
        if col in df.columns:
            df[col] = df[col].str.strip().str.zfill(2 if col == "post" else 4)

    # Sett år
    if "aar" in df.columns:
        df["aar"] = pd.to_numeric(df["aar"], errors="coerce").fillna(year).astype(int)
    else:
        df["aar"] = year

    # Flagg: finanstransaksjon (post 90–99)
    df["fin"] = df["post"].str.startswith("9")

    # Flagg: SPU-overføring
    df["transfer"] = df["kap"].isin(SPU_KAPITLER)

    # Flagg: nettobudsjettert (kapittel 0000 = ukjent, typisk nettovirksom.)
    df["netto"] = df.get("kap", pd.Series(dtype=str)) == "0000"
    netto_count = df["netto"].sum()
    if netto_count > 0:
        logger.warning(
            f"  [ADVARSEL] {path.name}: {netto_count} rader med kap=0000 "
            f"(nettobudsjetterte virksomheter) – ekskluderes fra post-hierarkiet"
        )

    # Behold relevante kolonner
    keep = [
        "aar", "dept_kode", "dept_navn", "kap", "kap_navn",
        "post", "post_navn", "artskonto", "artskonto_navn",
        "belop_mill", "er_utgift", "fin", "transfer", "netto",
    ]
    keep = [c for c in keep if c in df.columns]
    df = df[keep].copy()

    logger.info(f"  -> {len(df)} rader, sum utgifter: {df.loc[df['er_utgift'], 'belop_mill'].sum():.1f} mill.")
    return df
