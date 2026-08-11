"""
Ende-til-ende-test av SSB-nedlasteren for KPI og BNP mot en lokal etterligning
av v0-APIet.

KPI og BNP er de eneste seriene som går gjennom _download_ssb_tabell, og de er
også de som har manglet i datagrunnlaget – befolkning har sin egen nedlaster.
Testene her dekker derfor spørringsbyggingen: at hintene treffer totalindeksen
og indeksvariabelen, og ikke første verdi i lista (som er en helt annen serie).

Verdiene i etterligningen er oppdiktede og skal aldri havne i datagrunnlaget;
det er kodestien som testes, ikke tallene.
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import download                                    # noqa: E402
from parse_befolkning import parse_ssb_aarsserie   # noqa: E402


# Metadata slik SSB svarer for tabell 03013: totalindeksen ligger midt i lista,
# og den første statistikkvariabelen er månedsendring – ikke selve indeksen.
# Velger nedlasteren «første verdi», får vi altså feil serie.
METADATA_03013 = {
    "title": "Konsumprisindeks, etter konsumgruppe, måned og statistikkvariabel",
    "variables": [
        {
            "code": "Konsumgrp",
            "text": "konsumgruppe",
            "values": ["01", "TOTAL", "04"],
            "valueTexts": ["Matvarer og alkoholfrie drikkevarer", "Totalindeks", "Bolig, lys og brensel"],
        },
        {
            "code": "ContentsCode",
            "text": "statistikkvariabel",
            "values": ["KpiEndMnd", "KpiIndMnd"],
            "valueTexts": ["Månedsendring (prosent)", "Konsumprisindeks (2015=100)"],
        },
        {
            "code": "Tid",
            "text": "måned",
            "values": ["2023M01", "2023M02", "2024M01", "2024M02"],
            "valueTexts": ["2023M01", "2023M02", "2024M01", "2024M02"],
        },
    ],
}

# Indeksverdier for totalindeksen (oppdiktet), og tydelig avvikende tall for
# feil serie, slik at en gal spørring gir et gjenkjennelig utfall.
INDEKS = [128.0, 130.0, 133.0, 135.0]
ENDRING = [0.4, 1.5, 0.2, 1.4]


class SsbEtterligning(BaseHTTPRequestHandler):
    """Svarer som SSB v0: GET gir metadata, POST gir json-stat2."""

    mottatt_spørring = None

    def log_message(self, *a):
        pass

    def do_GET(self):
        self._svar(METADATA_03013)

    def do_POST(self):
        lengde = int(self.headers.get("Content-Length", 0))
        spørring = json.loads(self.rfile.read(lengde))
        SsbEtterligning.mottatt_spørring = spørring

        valg = {q["code"]: q["selection"]["values"] for q in spørring["query"]
                if q["selection"]["filter"] == "item"}
        # Serien vi returnerer avhenger av hva spørringen faktisk ba om
        verdier = INDEKS if valg.get("ContentsCode") == ["KpiIndMnd"] else ENDRING
        if valg.get("Konsumgrp") not in (["TOTAL"], None):
            verdier = [v / 2 for v in verdier]     # en annen konsumgruppe

        self._svar({
            "class": "dataset",
            "version": "2.0",
            "id": ["Konsumgrp", "ContentsCode", "Tid"],
            "size": [1, 1, len(verdier)],
            "dimension": {
                "Konsumgrp": {"category": {"index": {"TOTAL": 0}, "label": {"TOTAL": "Totalindeks"}}},
                "ContentsCode": {"category": {"index": {"KpiIndMnd": 0}}},
                "Tid": {"category": {
                    "index": {t: i for i, t in enumerate(METADATA_03013["variables"][2]["values"])},
                    "label": {t: t for t in METADATA_03013["variables"][2]["values"]},
                }},
            },
            "value": verdier,
        })

    def _svar(self, payload):
        kropp = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(kropp)))
        self.end_headers()
        self.wfile.write(kropp)


@pytest.fixture
def ssb_server(monkeypatch):
    """Start etterligningen og la nedlasteren peke på den i stedet for SSB."""
    server = HTTPServer(("127.0.0.1", 0), SsbEtterligning)
    tråd = threading.Thread(target=server.serve_forever, daemon=True)
    tråd.start()
    base = f"http://127.0.0.1:{server.server_port}"
    SsbEtterligning.mottatt_spørring = None

    ekte = download._request_med_retry

    def omdirigert(metode, url, **kwargs):
        return ekte(metode, url.replace("https://data.ssb.no", base), **kwargs)

    monkeypatch.setattr(download, "_request_med_retry", omdirigert)
    yield server
    server.shutdown()


def test_kpi_spørring_velger_totalindeks_og_indeksvariabel(ssb_server, tmp_path, monkeypatch):
    monkeypatch.setattr(download, "RAW_DIR", tmp_path)
    path = download.download_kpi(force=True)

    valg = {q["code"]: q["selection"] for q in SsbEtterligning.mottatt_spørring["query"]}
    assert valg["ContentsCode"]["values"] == ["KpiIndMnd"], (
        "hintet 'konsumprisindeks' må treffe indeksen, ikke månedsendringen"
    )
    assert valg["Konsumgrp"]["values"] == ["TOTAL"], (
        "hintet 'totalindeks' må treffe totalen, ikke første konsumgruppe"
    )
    assert valg["Tid"]["filter"] == "all"
    assert path.exists()


def test_kpi_ende_til_ende_gir_årsgjennomsnitt(ssb_server, tmp_path, monkeypatch):
    monkeypatch.setattr(download, "RAW_DIR", tmp_path)
    serie = parse_ssb_aarsserie(download.download_kpi(force=True), "KPI")

    # Månedene snittes per år: 2023 = (128 + 130) / 2, 2024 = (133 + 135) / 2
    assert serie == {2023: 129.0, 2024: 134.0}


def test_kpi_bruker_cache_uten_nytt_kall(ssb_server, tmp_path, monkeypatch):
    monkeypatch.setattr(download, "RAW_DIR", tmp_path)
    download.download_kpi(force=True)
    SsbEtterligning.mottatt_spørring = None
    download.download_kpi(force=False)
    assert SsbEtterligning.mottatt_spørring is None, "andre kall skal treffe cache"
