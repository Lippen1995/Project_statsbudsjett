"""
Bygg brutto inntekts- og utgiftshierarkier fra normaliserte DataFrames.

Hierarki: departement → kapittel → post
Artskonto er en kryssdimensjon på bladnivå (ikke eget nivå i treet).
"""
import json
import logging
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

# Inntektskapitler: 1xxx–5xxx, eksklusive utgiftskapitler
# Enkelt heuristikk: kapitler >= 3000 på inntektssiden, < 3000 på utgiftssiden
# (det faktiske skillet er er_utgift-kolonnen fra regnskapet)


def _node_id(prefix: str, dept: str, kap: str = None, post: str = None) -> str:
    parts = [prefix, dept.strip().zfill(2) if dept else "00"]
    if kap:
        parts.append(kap.strip())
    if post:
        parts.append(post.strip())
    return "-".join(parts)


def build_hierarchies(
    regnskap_frames: dict,   # {år: DataFrame} fra parse_regnskap
    bevilgning_df: pd.DataFrame,
    years: list,
    output_dir: Path,
) -> None:
    """
    Bygg utgifter.json og inntekter.json.
    Lagrer til output_dir.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Slå sammen alle regnskapsår
    all_regnskap = pd.concat(list(regnskap_frames.values()), ignore_index=True)

    # Split: utgifter vs inntekter (basert på er_utgift-flagg fra Belopstegn)
    regnskap_u = all_regnskap[all_regnskap["er_utgift"] == True].copy()
    regnskap_i = all_regnskap[all_regnskap["er_utgift"] == False].copy()

    # Bevilgning: del opp etter om kapitlet er inntekts- eller utgiftskapittel
    # Inntektskapitler i bevilgning er typisk 3xxx, 4xxx, 5xxx
    bevilgning_u = bevilgning_df[bevilgning_df["kap"].astype(str) < "3000"].copy()
    bevilgning_i = bevilgning_df[bevilgning_df["kap"].astype(str) >= "3000"].copy()

    logger.info("Bygger utgiftshierarki...")
    utgifter = _build_tree(regnskap_u, bevilgning_u, years, prefix="u")
    _save_json(utgifter, output_dir / "utgifter.json")
    logger.info(f"  -> {len(utgifter)} departementer")

    logger.info("Bygger inntektshierarki...")
    inntekter = _build_tree(regnskap_i, bevilgning_i, years, prefix="i")
    _save_json(inntekter, output_dir / "inntekter.json")
    logger.info(f"  -> {len(inntekter)} departementer")


def _build_tree(
    regnskap: pd.DataFrame,
    bevilgning: pd.DataFrame,
    years: list,
    prefix: str,
) -> list:
    """
    Bygg en liste av departement-noder (toppnivå).
    Hvert node følger BudsjettNode-skjemaet.
    """
    # --- Regnskap-aggregering per år/dept/kap/post ---
    grp_regnskap = (
        regnskap[~regnskap["netto"]]  # Ekskluder nettobudsjetterte
        .groupby(["aar", "dept_kode", "kap", "post"], dropna=False)
        .agg(
            belop_mill=("belop_mill", "sum"),
            dept_navn=("dept_navn", "first"),
            kap_navn=("kap_navn", "first"),
            post_navn=("post_navn", "first"),
            fin=("fin", "first"),
            transfer=("transfer", "first"),
        )
        .reset_index()
    )

    # --- Artskonto per år/kap/post ---
    artskonto_grp = (
        regnskap[~regnskap["netto"]]
        .dropna(subset=["artskonto"])
        .groupby(["aar", "kap", "post", "artskonto"], dropna=False)
        .agg(
            belop_mill=("belop_mill", "sum"),
            artskonto_navn=("artskonto_navn", "first"),
        )
        .reset_index()
    )

    # --- Bevilgning-oppslag per år/kap/post ---
    bev_lookup: dict[tuple, dict] = {}
    for _, row in bevilgning.iterrows():
        key = (int(row["aar"]) if pd.notna(row["aar"]) else 0,
               str(row["kap"]), str(row["post"]))
        bev_lookup[key] = {
            "saldert": round(float(row["saldert"]), 1) if pd.notna(row.get("saldert")) else None,
            "revidert": round(float(row["revidert"]), 1) if pd.notna(row.get("revidert")) else None,
        }

    # --- Bygg tre-struktur ---
    # dept_kode → {kap → {post → data}}
    tree: dict[str, Any] = {}

    for _, row in grp_regnskap.iterrows():
        aar = int(row["aar"])
        dept = str(row["dept_kode"]).strip().zfill(2) if pd.notna(row.get("dept_kode")) else "00"
        kap = str(row["kap"]).strip()
        post = str(row["post"]).strip()
        belop = round(float(row["belop_mill"]), 1)

        # Init dept
        if dept not in tree:
            tree[dept] = {
                "id": _node_id(prefix, dept),
                "navn": str(row.get("dept_navn", dept)),
                "tag": f"Dept. {dept}",
                "niva": "departement",
                "children_map": {},
                "serier": defaultdict(lambda: {"regnskap": None, "saldert": None, "revidert": None}),
            }

        dept_node = tree[dept]
        # Akkumuler på departement-nivå
        if dept_node["serier"][aar]["regnskap"] is None:
            dept_node["serier"][aar]["regnskap"] = 0.0
        dept_node["serier"][aar]["regnskap"] = round(
            dept_node["serier"][aar]["regnskap"] + belop, 1
        )

        # Init kap
        if kap not in dept_node["children_map"]:
            dept_node["children_map"][kap] = {
                "id": _node_id(prefix, dept, kap),
                "navn": str(row.get("kap_navn", kap)),
                "tag": f"Kap. {kap}",
                "niva": "kapittel",
                "children_map": {},
                "serier": defaultdict(lambda: {"regnskap": None, "saldert": None, "revidert": None}),
                "fin": bool(row.get("fin", False)),
                "transfer": bool(row.get("transfer", False)),
            }

        kap_node = dept_node["children_map"][kap]
        if kap_node["serier"][aar]["regnskap"] is None:
            kap_node["serier"][aar]["regnskap"] = 0.0
        kap_node["serier"][aar]["regnskap"] = round(
            kap_node["serier"][aar]["regnskap"] + belop, 1
        )

        # Init post
        if post not in kap_node["children_map"]:
            kap_node["children_map"][post] = {
                "id": _node_id(prefix, dept, kap, post),
                "navn": str(row.get("post_navn", post)),
                "tag": f"Post {post}",
                "niva": "post",
                "serier": defaultdict(lambda: {"regnskap": None, "saldert": None, "revidert": None}),
                "artskonto": defaultdict(dict),
                "fin": bool(row.get("fin", False)),
                "transfer": bool(row.get("transfer", False)),
            }

        post_node = kap_node["children_map"][post]
        if post_node["serier"][aar]["regnskap"] is None:
            post_node["serier"][aar]["regnskap"] = 0.0
        post_node["serier"][aar]["regnskap"] = round(
            post_node["serier"][aar]["regnskap"] + belop, 1
        )

    # --- Fyll inn bevilgning ---
    for (aar, kap, post), bev in bev_lookup.items():
        for dept_key, dept_node in tree.items():
            if kap in dept_node["children_map"]:
                kap_node = dept_node["children_map"][kap]
                if post in kap_node["children_map"]:
                    post_node = kap_node["children_map"][post]
                    s = post_node["serier"][aar]
                    s["saldert"] = bev["saldert"]
                    s["revidert"] = bev["revidert"]
                    break

    # Rull opp budsjett til kapittel- og departementnivå
    for dept_node in tree.values():
        for kap_node in dept_node["children_map"].values():
            for aar in years:
                sal_sum = sum(
                    p["serier"][aar]["saldert"] or 0
                    for p in kap_node["children_map"].values()
                    if p["serier"][aar]["saldert"] is not None
                )
                rev_sum = sum(
                    p["serier"][aar]["revidert"] or 0
                    for p in kap_node["children_map"].values()
                    if p["serier"][aar]["revidert"] is not None
                )
                if sal_sum:
                    kap_node["serier"][aar]["saldert"] = round(sal_sum, 1)
                if rev_sum:
                    kap_node["serier"][aar]["revidert"] = round(rev_sum, 1)

            for aar in years:
                sal = kap_node["serier"][aar]["saldert"]
                rev = kap_node["serier"][aar]["revidert"]
                if sal:
                    s = dept_node["serier"][aar]
                    s["saldert"] = round((s["saldert"] or 0) + sal, 1)
                if rev:
                    s = dept_node["serier"][aar]
                    s["revidert"] = round((s["revidert"] or 0) + rev, 1)

    # --- Fyll artskonto på post-bladnivå ---
    for _, row in artskonto_grp.iterrows():
        aar = int(row["aar"])
        kap = str(row["kap"]).strip()
        post = str(row["post"]).strip()
        ak = str(row["artskonto"]).strip()
        belop = round(float(row["belop_mill"]), 1)
        navn = str(row.get("artskonto_navn", ak))

        for dept_node in tree.values():
            if kap in dept_node["children_map"]:
                kap_node = dept_node["children_map"][kap]
                if post in kap_node["children_map"]:
                    kap_node["children_map"][post]["artskonto"][aar][ak] = {
                        "navn": navn,
                        "belop": belop,
                    }
                    break

    # --- Serialiser til liste (fjern children_map hjelpesstruktur) ---
    def _serialize_node(node: dict) -> dict:
        out = {
            "id": node["id"],
            "navn": node["navn"],
            "niva": node["niva"],
            "serier": {str(y): _serialize_serie(node["serier"].get(y, {})) for y in years},
        }
        if node.get("tag"):
            out["tag"] = node["tag"]
        if node.get("fin"):
            out["fin"] = True
        if node.get("transfer"):
            out["transfer"] = True
        if "artskonto" in node and node["artskonto"]:
            out["artskonto"] = {str(y): dict(v) for y, v in node["artskonto"].items() if v}
        if "children_map" in node and node["children_map"]:
            out["children"] = sorted(
                [_serialize_node(c) for c in node["children_map"].values()],
                key=lambda x: x.get("serier", {}).get(str(max(years)), {}).get("regnskap") or 0,
                reverse=True,
            )
        return out

    def _serialize_serie(s: dict) -> dict:
        return {
            "regnskap": s.get("regnskap"),
            "saldert": s.get("saldert"),
            "revidert": s.get("revidert"),
        }

    nodes = sorted(
        [_serialize_node(n) for n in tree.values()],
        key=lambda x: x.get("serier", {}).get(str(max(years)), {}).get("regnskap") or 0,
        reverse=True,
    )
    return nodes


def _save_json(data: Any, path: Path) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=None), encoding="utf-8")
    size_kb = path.stat().st_size // 1024
    logger.info(f"  Skrev {path.name} ({size_kb} KB)")
