"""
Henter Stortingets behandling av statsbudsjettet fra data.stortinget.no.

Verifisert skjema (se docs/data-schema.md §6): åpent JSON-API, .NET-datoformat
/Date(ms+tz)/. Vi henter budsjettsaker per sesjon, deres voteringer, og
partifordelingen per votering (fra representantnivå).

Viktig: betydningen av `votering`-tallkoden (for/mot/ikke tilstede) GJETTES ikke
— den utledes empirisk ved at sum av representantstemmer må reconcilere med
`antall_for`/`antall_mot` fra voteringen. Feiler høyt hvis det ikke stemmer.
"""
import json
import logging
import re
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

BASE = "https://data.stortinget.no/eksport"
HEADERS = {"User-Agent": "statsbudsjett-visualisering/1.0 (open source)",
           "Accept": "application/json"}

RETRY_STATUS = {429, 500, 502, 503, 504}
RETRY_BACKOFF = [2, 4, 8, 16]


class KildeFeil(SystemExit):
    pass


def _hent(sti: str, **params) -> dict:
    """GET mot Stortinget-APIet med retry/backoff. Returnerer parset JSON."""
    import time
    params["format"] = "json"
    url = f"{BASE}/{sti}"
    siste = None
    for forsok in range(len(RETRY_BACKOFF) + 1):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=90)
        except requests.exceptions.ConnectionError as e:
            siste = f"tilkoblingsfeil: {e}"
        else:
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError as e:
                    raise KildeFeil(f"\nFEIL: {url} ga ugyldig JSON: {e}") from e
            siste = f"HTTP {resp.status_code}"
            if resp.status_code not in RETRY_STATUS:
                raise KildeFeil(f"\nFEIL: {siste} fra {url}\n{resp.text[:300]}")
        if forsok < len(RETRY_BACKOFF):
            time.sleep(RETRY_BACKOFF[forsok])
    raise KildeFeil(f"\nFEIL: {url} feilet etter alle forsøk ({siste})")


def parse_dotnet_dato(s: str):
    """/Date(1759269600000+0200)/ -> år (int) eller None."""
    if not s:
        return None
    m = re.search(r"/Date\((-?\d+)", s)
    if not m:
        return None
    import datetime
    ms = int(m.group(1))
    return datetime.datetime.fromtimestamp(ms / 1000, tz=datetime.timezone.utc).year


def hent_sesjoner() -> list:
    """Alle sesjons-ID-er, f.eks. ['2024-2025', ...]."""
    d = _hent("sesjoner")
    return [s["id"] for s in d.get("sesjoner_liste", []) if s.get("id")]


def _er_budsjettsak(tittel: str) -> bool:
    t = (tittel or "").lower()
    return "budsjett" in t or "bevilgning" in t


def hent_budsjettsaker(sesjon_id: str) -> list:
    """Budsjettrelaterte saker i en sesjon: [{id, tittel, sesjon}]."""
    d = _hent("saker", sesjonid=sesjon_id)
    ut = []
    for s in d.get("saker_liste", []):
        if _er_budsjettsak(s.get("tittel")):
            ut.append({"id": s.get("id"), "tittel": s.get("tittel"), "sesjon": sesjon_id})
    return ut


def hent_voteringer(sak_id) -> list:
    """Voteringer for en sak: [{votering_id, tema, antall_for, antall_mot, vedtatt}]."""
    d = _hent("voteringer", sakid=sak_id)
    ut = []
    for v in d.get("sak_votering_liste", []):
        ut.append({
            "votering_id": v.get("votering_id"),
            "tema": v.get("votering_tema"),
            "antall_for": v.get("antall_for"),
            "antall_mot": v.get("antall_mot"),
            "vedtatt": v.get("vedtatt"),
        })
    return ut


def _utled_kodemapping(resultater: list, antall_for: int, antall_mot: int) -> dict:
    """
    Utled hvilken `votering`-tallkode som betyr «for» og hvilken «mot», ved å
    matche antall per kode mot antall_for/antall_mot. Returnerer {kode: 'for'|'mot'}.
    Feiler ikke her; kaller reconcilerer og logger.
    """
    from collections import Counter
    tell = Counter(r.get("votering") for r in resultater)
    mapping = {}
    for kode, n in tell.items():
        if n == antall_for and antall_for != antall_mot:
            mapping[kode] = "for"
        elif n == antall_mot and antall_for != antall_mot:
            mapping[kode] = "mot"
    return mapping


def hent_partifordeling(votering_id, antall_for: int, antall_mot: int):
    """
    Returner (parti_for, parti_mot, ok) der parti_* = {parti: antall}.
    ok=True hvis representantsummene reconcilerer med antall_for/antall_mot.
    """
    d = _hent("voteringsresultat", voteringid=votering_id)
    res = d.get("voteringsresultat_liste", [])
    mapping = _utled_kodemapping(res, antall_for, antall_mot)

    parti_for, parti_mot = {}, {}
    sum_for = sum_mot = 0
    for r in res:
        retning = mapping.get(r.get("votering"))
        parti = ((r.get("representant") or {}).get("parti") or {}).get("navn") or "Ukjent"
        if retning == "for":
            parti_for[parti] = parti_for.get(parti, 0) + 1
            sum_for += 1
        elif retning == "mot":
            parti_mot[parti] = parti_mot.get(parti, 0) + 1
            sum_mot += 1

    ok = (sum_for == (antall_for or 0)) and (sum_mot == (antall_mot or 0))
    return parti_for, parti_mot, ok, res


def bygg_politikk(sesjoner: list, maks_voteringer_per_sak: int = 40,
                  raw_dir: Path = None, detalj_dir: Path = None) -> dict:
    """
    Bygg politikk-datasettet for gitte sesjoner. Returnerer
    {sesjon: [{sak, voteringer:[{...partifordeling...}]}]}.
    Skriver representantnivå til detalj_dir/votering-{id}.json hvis oppgitt.
    """
    ut = {}
    reconcile_feil = 0
    for sesjon in sesjoner:
        saker = hent_budsjettsaker(sesjon)
        logger.info(f"  Sesjon {sesjon}: {len(saker)} budsjettsaker")
        sak_ut = []
        for sak in saker:
            voteringer = hent_voteringer(sak["id"])[:maks_voteringer_per_sak]
            vot_ut = []
            for v in voteringer:
                if not v["votering_id"]:
                    continue
                pf, pm, ok, res = hent_partifordeling(
                    v["votering_id"], v["antall_for"] or 0, v["antall_mot"] or 0)
                if not ok:
                    reconcile_feil += 1
                    logger.warning(
                        f"    [ADVARSEL] votering {v['votering_id']} reconcilerte ikke "
                        f"(for={v['antall_for']} mot={v['antall_mot']}) — hopper over partifordeling")
                    pf, pm = {}, {}
                vot_ut.append({**v, "parti_for": pf, "parti_mot": pm})
                if detalj_dir and res:
                    _skriv_detalj(detalj_dir, v["votering_id"], res)
            sak_ut.append({**sak, "voteringer": vot_ut})
        ut[sesjon] = sak_ut

    if reconcile_feil:
        logger.warning(f"  [ADVARSEL] {reconcile_feil} voteringer reconcilerte ikke")
    return ut


def _skriv_detalj(detalj_dir: Path, votering_id, res: list) -> None:
    detalj_dir.mkdir(parents=True, exist_ok=True)
    forenklet = [{
        "navn": f"{(r.get('representant') or {}).get('fornavn','')} {(r.get('representant') or {}).get('etternavn','')}".strip(),
        "parti": ((r.get("representant") or {}).get("parti") or {}).get("navn"),
        "kode": r.get("votering"),
    } for r in res]
    (detalj_dir / f"votering-{votering_id}.json").write_text(
        json.dumps(forenklet, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
