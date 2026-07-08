"""
Enhetstester for Stortinget-parseren (data.stortinget.no).
Tester rene funksjoner mot syntetiske API-svar — ingen nettverk.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from stortinget import (
    parse_dotnet_dato, _er_budsjettsak, hent_partifordeling, KODE,
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


def test_kode_mapping_bekreftet():
    # Verifisert empirisk: 2=for, 3=mot, 1=ikke tilstede
    assert KODE[2] == "for"
    assert KODE[3] == "mot"
    assert KODE[1] == "ikke_tilstede"


def _fake_hent(monkey_data):
    def _inner(sti, **params):
        return monkey_data
    return _inner


def test_hent_partifordeling_reconcilerer(monkeypatch):
    # Kode 2=for, 3=mot, 1=ikke tilstede. for=2, mot=3.
    data = {"voteringsresultat_liste": [
        {"votering": 2, "representant": {"parti": {"navn": "Ap"}}},
        {"votering": 2, "representant": {"parti": {"navn": "Sp"}}},
        {"votering": 3, "representant": {"parti": {"navn": "Høyre"}}},
        {"votering": 3, "representant": {"parti": {"navn": "FrP"}}},
        {"votering": 3, "representant": {"parti": {"navn": "FrP"}}},
        {"votering": 1, "representant": {"parti": {"navn": "SV"}}},  # ikke tilstede
    ]}
    monkeypatch.setattr(stortinget, "_hent", _fake_hent(data))
    pf, pm, ok, res = hent_partifordeling(999, antall_for=2, antall_mot=3)
    assert ok is True
    assert pf == {"Ap": 1, "Sp": 1}
    assert pm == {"Høyre": 1, "FrP": 2}


def test_hent_partifordeling_tvetydig_loeses_av_kode(monkeypatch):
    # Tidligere tvetydig: mot og ikke-tilstede har SAMME antall (2).
    # Med fast kode løses det: kode 3 = mot, kode 1 = ikke tilstede.
    data = {"voteringsresultat_liste": [
        {"votering": 2, "representant": {"parti": {"navn": "Ap"}}},
        {"votering": 3, "representant": {"parti": {"navn": "Høyre"}}},
        {"votering": 3, "representant": {"parti": {"navn": "FrP"}}},
        {"votering": 1, "representant": {"parti": {"navn": "SV"}}},
        {"votering": 1, "representant": {"parti": {"navn": "MDG"}}},
    ]}
    monkeypatch.setattr(stortinget, "_hent", _fake_hent(data))
    pf, pm, ok, res = hent_partifordeling(999, antall_for=1, antall_mot=2)
    assert ok is True
    assert pf == {"Ap": 1}
    assert pm == {"Høyre": 1, "FrP": 1}


def test_hent_partifordeling_reconcilerer_ikke(monkeypatch):
    # antall_for oppgitt til 5, men bare 1 for-stemme (kode 2) → ok=False
    data = {"voteringsresultat_liste": [
        {"votering": 2, "representant": {"parti": {"navn": "Ap"}}},
        {"votering": 3, "representant": {"parti": {"navn": "Høyre"}}},
    ]}
    monkeypatch.setattr(stortinget, "_hent", _fake_hent(data))
    pf, pm, ok, res = hent_partifordeling(999, antall_for=5, antall_mot=1)
    assert ok is False


def test_hent_partifordeling_akklamasjon(monkeypatch):
    # antall_for=-1 (akklamasjon) → ok=True uansett, ingen krav om reconcile
    data = {"voteringsresultat_liste": []}
    monkeypatch.setattr(stortinget, "_hent", _fake_hent(data))
    pf, pm, ok, res = hent_partifordeling(999, antall_for=-1, antall_mot=-1)
    assert ok is True
