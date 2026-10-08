import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prisvekst import kpi_fremskriving


def test_kpi_kjeder_prosentvekst_uten_aa_overskrive_observasjoner():
    assert kpi_fremskriving({2025: 100}, {2025: 9, 2026: 3, 2027: 2}) == {2026: 103, 2027: 105.06}


def test_kpi_hopper_ikke_over_manglende_aar():
    assert kpi_fremskriving({2025: 100}, {2027: 2}) == {}
