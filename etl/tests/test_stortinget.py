"""
Enhetstester for Stortinget-parseren (data.stortinget.no).
Tester rene funksjoner mot syntetiske API-svar — ingen nettverk.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from stortinget import (
    parse_dotnet_dato, _er_budsjettsak, _utled_kodemapping, hent_partifordeling,
)
import stortinget


def test_parse_dotnet_dato():
    assert parse_dotnet_dato("/Date(1759269600000+0200)/") == 2025
    assert parse_dotnet_dato("/Date(1420066800000+0100)/") == 2014
    assert parse_dotnet_dato("") is None
    assert parse_dotnet_dato(None) is None
    assert parse_dotnet_dato("tull") is None


def test_er_budsjettsak():
    assert _er_budsjettsak("Statsbudsjettet 2025")
    assert _er_budsjettsak("Endringar i statsbudsjettet 2025 under HOD")
    assert _er_budsjettsak("Tilleggsbevilgninger og omprioriteringer")
    assert not _er_budsjettsak("Endringer i vegtrafikkloven")
    assert not _er_budsjettsak("")


def test_utled_kodemapping_normal():
    # 2 stemte kode 1 (for), 3 stemte kode 2 (mot)
    res = [{"votering": 1}, {"votering": 1},
           {"votering": 2}, {"votering": 2}, {"votering": 2}]
    m = _utled_kodemapping(res, antall_for=2, antall_mot=3)
    assert m[1] == "for"
    assert m[2] == "mot"


def test_utled_kodemapping_uavgjort_gir_tomt():
    # Når for == mot kan vi ikke skille kodene trygt → tom mapping
    res = [{"votering": 1}, {"votering": 2}]
    m = _utled_kodemapping(res, antall_for=1, antall_mot=1)
    assert m == {}


def _fake_hent(monkey_data):
    def _inner(sti, **params):
        return monkey_data
    return _inner


def test_hent_partifordeling_reconcilerer(monkeypatch):
    data = {"voteringsresultat_liste": [
        {"votering": 1, "representant": {"parti": {"navn": "Ap"}}},
        {"votering": 1, "representant": {"parti": {"navn": "Sp"}}},
        {"votering": 2, "representant": {"parti": {"navn": "Høyre"}}},
        {"votering": 2, "representant": {"parti": {"navn": "FrP"}}},
        {"votering": 2, "representant": {"parti": {"navn": "FrP"}}},
    ]}
    monkeypatch.setattr(stortinget, "_hent", _fake_hent(data))
    pf, pm, ok, res = hent_partifordeling(999, antall_for=2, antall_mot=3)
    assert ok is True
    assert pf == {"Ap": 1, "Sp": 1}
    assert pm == {"Høyre": 1, "FrP": 2}


def test_hent_partifordeling_reconcilerer_ikke(monkeypatch):
    # antall_for oppgitt til 5, men bare 2 stemmer funnet → ok=False
    data = {"voteringsresultat_liste": [
        {"votering": 1, "representant": {"parti": {"navn": "Ap"}}},
        {"votering": 1, "representant": {"parti": {"navn": "Sp"}}},
        {"votering": 2, "representant": {"parti": {"navn": "Høyre"}}},
    ]}
    monkeypatch.setattr(stortinget, "_hent", _fake_hent(data))
    pf, pm, ok, res = hent_partifordeling(999, antall_for=5, antall_mot=1)
    assert ok is False
