"""
Bygg brutto inntekts- og utgiftshierarkier fra normaliserte DataFrames.

Hierarki: departement → kapittel → post.
Artskonto er en kryssdimensjon på post-nivå (ikke et eget nivå i treet),
med kontoklasse-navn hentet fra de faktiske radene.

Utgiftskapitler: 0001–2999. Inntektskapitler: 3000–5999.
"""
import json
import logging
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


def _node_id(prefix: str, dept: str, kap: str = None, post: str = None) -> str:
    parts = [prefix, (dept or "00").strip().zfill(2)]
    if kap:
        parts.append(kap.strip())
    if post:
        parts.append(post.strip())
    return "-".join(parts)


def _tom_serie():
    return {"regnskap": None, "saldert": None, "revidert": None}


def build_hierarchies(
    regnskap_frames: dict,      # {år: DataFrame} fra parse_regnskap
    bevilgning_df: pd.DataFrame,
    years: list,
    output_dir: Path,
    virk_frames: dict = None,   # {år: virk_df} fra parse_regnskap(med_virksomheter=True)
) -> None:
    """
    Skriver hovedtrærne (utgifter.json/inntekter.json, uten artskonto og
    virksomheter — små, lastes ved oppstart) og detaljfiler per departement
    (data/detaljer/{u|i}-{dept}.json — lazy-lastes ved drilldown).
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    detalj_dir = output_dir / "detaljer"
    detalj_dir.mkdir(exist_ok=True)

    all_regnskap = pd.concat(list(regnskap_frames.values()), ignore_index=True)
    all_virk = (pd.concat(list(virk_frames.values()), ignore_index=True)
                if virk_frames else None)

    regnskap_u = all_regnskap[all_regnskap["er_utgift"]]
    regnskap_i = all_regnskap[~all_regnskap["er_utgift"]]

    bevilgning_df = bevilgning_df.copy()
    bevilgning_u = bevilgning_df[bevilgning_df["kap"] < "3000"]
    bevilgning_i = bevilgning_df[bevilgning_df["kap"] >= "3000"]

    for prefix, reg, bev in [("u", regnskap_u, bevilgning_u),
                             ("i", regnskap_i, bevilgning_i)]:
        navn = "utgifter" if prefix == "u" else "inntekter"
        logger.info(f"Bygger {navn}shierarki...")
        virk = None
        if all_virk is not None:
            virk = all_virk[all_virk["er_utgift"] == (prefix == "u")]
        nodes, detaljer = _build_tree(reg, bev, years, prefix=prefix, virk=virk)
        _save_json(nodes, output_dir / f"{navn}.json")
        for dept, dept_detaljer in detaljer.items():
            _save_json(dept_detaljer, detalj_dir / f"{prefix}-{dept}.json")
        logger.info(f"  {len(detaljer)} detaljfiler skrevet til detaljer/")


MAX_VIRKSOMHETER = 12   # per post/år; resten samles i «Øvrige»


def _build_tree(regnskap: pd.DataFrame, bevilgning: pd.DataFrame,
                years: list, prefix: str, virk: pd.DataFrame = None):
    """
    Bygg liste av departement-noder etter BudsjettNode-skjemaet.
    Returnerer (nodes, detaljer) der detaljer =
    {dept_kode: {post_node_id: {"artskonto": {...}, "virksomheter": {...}}}}.
    """

    # --- Aggreger regnskap til post-nivå ---
    agg_kwargs = dict(
        belop_mill=("belop_mill", "sum"),
        dept_navn=("dept_navn", "first"),
        kap_navn=("kap_navn", "first"),
        post_navn=("post_navn", "first"),
        fin=("fin", "first"),
        transfer=("transfer", "first"),
    )
    # Kildebaserte klassifiseringer fra DFØ (tas med når de finnes i dataene):
    #   post_type – tekstlig posttype ; omrade/kategori – programområde/-kategori (formål)
    for kol in ("post_type", "omrade", "kategori"):
        if kol in regnskap.columns:
            agg_kwargs[kol] = (kol, "first")
    grp = (
        regnskap.groupby(["aar", "dept_kode", "kap", "post"], dropna=False)
        .agg(**agg_kwargs)
        .reset_index()
    )

    # --- Artskonto per år/kap/post (med kontoklasse fra dataene) ---
    ak_grp = (
        regnskap.dropna(subset=["artskonto"])
        .groupby(["aar", "kap", "post", "artskonto"], dropna=False)
        .agg(
            belop_mill=("belop_mill", "sum"),
            artskonto_navn=("artskonto_navn", "first"),
            klasse_id=("klasse_id", "first"),
            klasse_navn=("klasse_navn", "first"),
        )
        .reset_index()
    )

    tree: dict[str, Any] = {}
    post_index: dict[tuple, dict] = {}   # (kap, post) -> post_node

    def _get_dept(dept: str, navn: str) -> dict:
        if dept not in tree:
            tree[dept] = {
                "id": _node_id(prefix, dept),
                "navn": navn,
                "niva": "departement",
                "children_map": {},
                "serier": defaultdict(_tom_serie),
            }
        return tree[dept]

    def _tekst(v):
        """Ren tekstverdi eller None (filtrer bort NaN/tomt/'nan')."""
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        s = str(v).strip()
        return s if s and s.lower() != "nan" else None

    for row in grp.itertuples(index=False):
        aar = int(row.aar)
        dept = str(row.dept_kode).strip().zfill(2) if pd.notna(row.dept_kode) else "00"
        kap, post = str(row.kap), str(row.post)
        belop = round(float(row.belop_mill), 1)

        dept_node = _get_dept(dept, str(row.dept_navn))
        s = dept_node["serier"][aar]
        s["regnskap"] = round((s["regnskap"] or 0.0) + belop, 1)

        kap_map = dept_node["children_map"]
        if kap not in kap_map:
            kap_map[kap] = {
                "id": _node_id(prefix, dept, kap),
                "navn": str(row.kap_navn),
                "tag": f"Kap. {kap.lstrip('0') or '0'}",
                "niva": "kapittel",
                "children_map": {},
                "serier": defaultdict(_tom_serie),
                "transfer": bool(row.transfer),
            }
            # DFØs formålsklassifisering (programområde › programkategori)
            omrade = _tekst(getattr(row, "omrade", None))
            kategori = _tekst(getattr(row, "kategori", None))
            if omrade:
                kap_map[kap]["omrade"] = omrade
            if kategori:
                kap_map[kap]["kategori"] = kategori
        kap_node = kap_map[kap]
        s = kap_node["serier"][aar]
        s["regnskap"] = round((s["regnskap"] or 0.0) + belop, 1)

        post_map = kap_node["children_map"]
        if post not in post_map:
            post_map[post] = {
                "id": _node_id(prefix, dept, kap, post),
                "navn": str(row.post_navn),
                "tag": f"Post {post}",
                "niva": "post",
                "serier": defaultdict(_tom_serie),
                "artskonto": defaultdict(dict),
                "fin": bool(row.fin),
                "transfer": bool(row.transfer),
            }
            # DFØs tekstlige posttype (kildebasert)
            ptype = _tekst(getattr(row, "post_type", None))
            if ptype:
                post_map[post]["postType"] = ptype
            post_index[(kap, post)] = post_map[post]
        post_node = post_map[post]
        s = post_node["serier"][aar]
        s["regnskap"] = round((s["regnskap"] or 0.0) + belop, 1)

    # --- Bevilgning (saldert/revidert) på post-nivå ---
    ukjente_bev = 0
    for row in bevilgning.itertuples(index=False):
        if pd.isna(row.aar):
            continue
        aar = int(row.aar)
        node = post_index.get((str(row.kap), str(row.post)))
        if node is None:
            # Post finnes i bevilgning men ikke i regnskapet (f.eks. budsjettår
            # uten regnskap ennå, eller post som aldri ble brukt). Opprett den.
            dept = str(row.dept_kode).strip().zfill(2) if pd.notna(row.dept_kode) else "00"
            dept_node = _get_dept(dept, str(row.dept_navn))
            kap, post = str(row.kap), str(row.post)
            kap_map = dept_node["children_map"]
            if kap not in kap_map:
                kap_map[kap] = {
                    "id": _node_id(prefix, dept, kap),
                    "navn": str(row.kap_navn),
                    "tag": f"Kap. {kap.lstrip('0') or '0'}",
                    "niva": "kapittel",
                    "children_map": {},
                    "serier": defaultdict(_tom_serie),
                }
            kap_node = kap_map[kap]
            if post not in kap_node["children_map"]:
                post_nr = int(post) if post.isdigit() else 0
                kap_node["children_map"][post] = {
                    "id": _node_id(prefix, dept, kap, post),
                    "navn": str(row.post_navn),
                    "tag": f"Post {post}",
                    "niva": "post",
                    "serier": defaultdict(_tom_serie),
                    "artskonto": defaultdict(dict),
                    "fin": post_nr >= 90,
                    "transfer": kap in {"2800", "5800"},
                }
                post_index[(kap, post)] = kap_node["children_map"][post]
            node = post_index[(kap, post)]
            ukjente_bev += 1

        s = node["serier"][aar]
        if pd.notna(row.saldert):
            s["saldert"] = round(float(row.saldert), 1)
        if pd.notna(row.revidert):
            s["revidert"] = round(float(row.revidert), 1)

    if ukjente_bev:
        logger.info(f"  {ukjente_bev} bevilgningsposter uten regnskapsrader (opprettet som noder)")

    # --- Rull budsjettserier opp til kapittel og departement ---
    alle_aar = set(years) | {int(a) for a in bevilgning["aar"].dropna().unique()}
    for dept_node in tree.values():
        for kap_node in dept_node["children_map"].values():
            for aar in alle_aar:
                sal = rev = None
                for p in kap_node["children_map"].values():
                    ps = p["serier"].get(aar)
                    if not ps:
                        continue
                    if ps["saldert"] is not None:
                        sal = (sal or 0.0) + ps["saldert"]
                    if ps["revidert"] is not None:
                        rev = (rev or 0.0) + ps["revidert"]
                if sal is not None:
                    kap_node["serier"][aar]["saldert"] = round(sal, 1)
                if rev is not None:
                    kap_node["serier"][aar]["revidert"] = round(rev, 1)
        for aar in alle_aar:
            sal = rev = None
            for kap_node in dept_node["children_map"].values():
                ks = kap_node["serier"].get(aar)
                if not ks:
                    continue
                if ks["saldert"] is not None:
                    sal = (sal or 0.0) + ks["saldert"]
                if ks["revidert"] is not None:
                    rev = (rev or 0.0) + ks["revidert"]
            if sal is not None:
                dept_node["serier"][aar]["saldert"] = round(sal, 1)
            if rev is not None:
                dept_node["serier"][aar]["revidert"] = round(rev, 1)

    # --- Artskonto på post-nivå ---
    ak_uten_post = 0
    for row in ak_grp.itertuples(index=False):
        node = post_index.get((str(row.kap), str(row.post)))
        if node is None:
            ak_uten_post += 1
            continue
        belop = round(float(row.belop_mill), 1)
        if belop == 0:
            continue
        node["artskonto"][int(row.aar)][str(row.artskonto)] = {
            "navn": str(row.artskonto_navn),
            "klasse": str(row.klasse_id) if pd.notna(row.klasse_id) else "?",
            "klasseNavn": str(row.klasse_navn) if pd.notna(row.klasse_navn) else "Ukjent",
            "belop": belop,
        }
    if ak_uten_post:
        logger.warning(f"  [ADVARSEL] {ak_uten_post} artskontorader uten matchende post — logget, ignorert")

    # --- Virksomheter på post-nivå (topp N + «Øvrige» per år) ---
    if virk is not None and len(virk):
        virk_grp = (
            virk.groupby(["aar", "kap", "post", "virk_id", "virk_navn"], dropna=False)
            ["belop_mill"].sum().reset_index()
        )
        for (aar, kap, post), gruppe in virk_grp.groupby(["aar", "kap", "post"]):
            node = post_index.get((str(kap), str(post)))
            if node is None:
                continue
            gruppe = gruppe.reindex(
                gruppe["belop_mill"].abs().sort_values(ascending=False).index
            )
            topp = gruppe.head(MAX_VIRKSOMHETER)
            rest = gruppe["belop_mill"].iloc[MAX_VIRKSOMHETER:].sum()
            v = {}
            for r in topp.itertuples(index=False):
                belop = round(float(r.belop_mill), 1)
                if belop == 0:
                    continue
                v[str(r.virk_id)] = {"navn": str(r.virk_navn), "belop": belop}
            if abs(rest) >= 0.05:
                v["_ovrige"] = {"navn": f"Øvrige ({len(gruppe) - len(topp)} virksomheter)",
                                "belop": round(float(rest), 1)}
            if v:
                node.setdefault("virksomheter", defaultdict(dict))[int(aar)] = v

    # --- Serialiser: hovedtre uten artskonto/virksomheter (de går i detaljfiler) ---
    sorterings_aar = max(years)
    detaljer: dict[str, dict] = {}   # dept_kode -> {post_id: {artskonto, virksomheter}}

    def _sort_key(n):
        return n.get("serier", {}).get(str(sorterings_aar), {}).get("regnskap") or 0

    def _ser(node: dict, dept_kode: str) -> dict:
        out = {
            "id": node["id"],
            "navn": node["navn"],
            "niva": node["niva"],
            "serier": {
                str(a): dict(node["serier"][a])
                for a in sorted(node["serier"].keys())
            },
        }
        if node.get("tag"):
            out["tag"] = node["tag"]
        if node.get("fin"):
            out["fin"] = True
        if node.get("transfer"):
            out["transfer"] = True
        # Kildebaserte klassifiseringer (DFØ)
        if node.get("postType"):
            out["postType"] = node["postType"]
        if node.get("omrade"):
            out["omrade"] = node["omrade"]
        if node.get("kategori"):
            out["kategori"] = node["kategori"]

        detalj = {}
        if node.get("artskonto"):
            detalj["artskonto"] = {
                str(a): v for a, v in sorted(node["artskonto"].items()) if v
            }
        if node.get("virksomheter"):
            detalj["virksomheter"] = {
                str(a): v for a, v in sorted(node["virksomheter"].items()) if v
            }
        if detalj:
            detaljer.setdefault(dept_kode, {})[node["id"]] = detalj
            out["harDetaljer"] = True

        if node.get("children_map"):
            out["children"] = sorted(
                (_ser(c, dept_kode) for c in node["children_map"].values()),
                key=_sort_key, reverse=True,
            )
        return out

    nodes = sorted(
        (_ser(n, dept) for dept, n in tree.items()),
        key=_sort_key, reverse=True,
    )
    logger.info(f"  -> {len(nodes)} departementer")
    return nodes, detaljer


def _save_json(data: Any, path: Path) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    logger.info(f"  Skrev {path.name} ({path.stat().st_size // 1024} KB)")
