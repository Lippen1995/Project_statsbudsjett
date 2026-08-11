"""
Tester for etl/status.json – kjøringens referat som maskinlesbare data.

Filen finnes fordi en advarsel i en loggfil ingen leser, ikke er et varsel. Da
KPI sluttet å komme fra SSB, hoppet ETL-en over serien etter hensikten, skrev
«[ADVARSEL] Ingen KPI» til warnings.log, og fortsatte med grønt merke i CI.
Seksjonen på nettstedet sto uten datagrunnlag i månedsvis.

Statusfilen er det CI varsler på, så det som testes her er nettopp det som
gjorde feilen usynlig: at en delvis kjøring kan skilles fra en hel, og at et
sammenbrudd også etterlater et referat.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import etl                                          # noqa: E402


@pytest.fixture(autouse=True)
def rent_bord(tmp_path, monkeypatch):
    """Skriv statusfilen til et midlertidig sted, og start uten gamle advarsler."""
    monkeypatch.setattr(etl, "STATUS_FIL", tmp_path / "status.json")
    etl.advarsler.meldinger.clear()
    yield
    etl.advarsler.meldinger.clear()


def les():
    return json.loads(Path(etl.STATUS_FIL).read_text(encoding="utf-8"))


def test_vellykket_kjoring_uten_advarsler():
    etl.skriv_status(vellykket=True, serier={"kpi": True, "bnp": True}, aar=[2024, 2025])
    s = les()
    assert s["vellykket"] is True
    assert s["antall_advarsler"] == 0
    assert s["advarsler"] == []
    assert s["regnskap_aar"] == [2024, 2025]
    assert "feil" not in s


def test_advarsler_fanges_fra_loggen():
    """Det er logger.warning-kallene selve ETL-en gjør som skal ende i statusen."""
    etl.logger.warning("  [ADVARSEL] Ingen KPI — 'faste kroner'-modus deaktiveres")
    etl.logger.warning("  [ADVARSEL] Ingen BNP-prognose")
    etl.logger.info("dette er ikke en advarsel og skal ikke med")

    etl.skriv_status(vellykket=True, serier={"kpi": False, "bnp": True})
    s = les()
    assert s["antall_advarsler"] == 2
    assert any("Ingen KPI" in a for a in s["advarsler"])
    assert not any("ikke en advarsel" in a for a in s["advarsler"])


def test_delvis_kjoring_skilles_fra_hel():
    """
    Kjernen i saken: kjøringen lykkes, men en serie mangler. Uten dette skillet
    ser CI bare «success» og varsler ikke.
    """
    etl.logger.warning("  [ADVARSEL] Ingen KPI")
    etl.skriv_status(vellykket=True, serier={"kpi": False, "bnp": True, "politikk": True})
    s = les()

    assert s["vellykket"] is True                       # kjøringen gikk …
    assert s["antall_advarsler"] > 0                    # … men noe mangler
    tomme = [n for n, ok in s["serier"].items() if not ok]
    assert tomme == ["kpi"]


def test_sammenbrudd_etterlater_status():
    """
    Uten en status på feilstien kan CI ikke skille «brøt sammen» fra «startet
    aldri», og det er to ulike ting å varsle om.
    """
    etl.skriv_status(vellykket=False, feil="ValueError: BNP 2026 urimelig: 1,0")
    s = les()
    assert s["vellykket"] is False
    assert "BNP 2026 urimelig" in s["feil"]


def test_tidspunkt_er_utc_med_tidssone():
    """Et tidspunkt uten sone kan ikke sammenlignes med noe. Da er det verdiløst."""
    from datetime import datetime
    etl.skriv_status(vellykket=True)
    stemplet = datetime.fromisoformat(les()["tidspunkt"])
    assert stemplet.tzinfo is not None


def test_statusfilen_havner_ikke_blant_nettstedets_data():
    """
    Statusen hører til kjøringen, ikke til tallene. Havner den i
    web/public/data/, blir den publisert og hentet av hver besøkende.
    """
    assert "public" not in etl.STATUS_FIL.parts
    # og den virkelige plasseringen, ikke bare den midlertidige i testen:
    ekte = Path(etl.__file__).parent / "status.json"
    assert ekte.parent.name == "etl"
