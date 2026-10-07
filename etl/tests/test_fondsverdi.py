import sys
from pathlib import Path

import pytest
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fondsverdi import parse_fondsverdi


def test_bare_avsluttede_aar_og_total_nok():
    points = ','.join(f'[Date.UTC({y},11, 31),{y}]' for y in range(2013, 2028))
    html = "name: 'Total', data: [" + points + "]} name: 'Inflows', data: [[Date.UTC(2025,11,31),1]]}"
    values = parse_fondsverdi(html, 2026)
    assert values['2025'] == 2025000
    assert '2026' not in values
    assert '2027' not in values


def test_endret_kildeskjema_avvises():
    with pytest.raises(ValueError):
        parse_fondsverdi("name: 'USD', data: []}", 2026)
