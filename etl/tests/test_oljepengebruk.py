import json
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from oljepengebruk import BASE, parse_history, parse_saldert, update
import oljepengebruk

FIXTURES = Path(__file__).parent / 'fixtures'


@pytest.fixture(autouse=True)
def isolate_source_archive(monkeypatch, tmp_path):
    monkeypatch.setattr(oljepengebruk, 'RAW_DIR', tmp_path / 'originals')


def test_originaltabeller_gir_reviderte_underskudd_ikke_overforingsbevilgning():
    nb = parse_history((FIXTURES / 'oljepengebruk-nb2026.html').read_text(), 2026)
    rnb = parse_history((FIXTURES / 'oljepengebruk-rnb2026.html').read_text(), 2026)
    assert nb['2026']['strukturelt'] == 579358
    assert rnb['2026']['strukturelt'] == 579036
    assert rnb['2026']['oljekorrigert'] == 466447
    assert rnb['2025']['oljekorrigert'] == 475709
    assert sum(rnb['2026']['korreksjoner'].values()) == 112589


def test_endret_skjema_feil_aar_og_regnefeil_avvises():
    html = (FIXTURES / 'oljepengebruk-rnb2026.html').read_text()
    for invalid, year in [(html.replace('579 036', '599 036'), 2026), (html, 2027), (html + html, 2026)]:
        with pytest.raises(ValueError):
            parse_history(invalid, year)


def test_saldert_velger_navngitt_kolonne_ikke_nb_eller_trend_bnp():
    html = '''<table><tr><th></th><th>Nasjonalbudsjett 2032</th><th>Saldert budsjett 2032</th></tr>
    <tr><td>Oljekorrigert underskudd, mrd. kroner</td><td>400,0</td><td>456,8</td></tr>
    <tr><td>Strukturelt oljekorrigert underskudd, mrd. kroner</td><td>500,0</td><td>584,0</td></tr>
    <tr><td>Strukturelt oljekorrigert underskudd, andel av BNP</td><td>13,1</td><td>13,2</td></tr></table>'''
    assert parse_saldert(html) == {'oljekorrigert': 456800, 'strukturelt': 584000}


class Response:
    def __init__(self, url, text):
        self.url, self.text, self.content = url, text, text.encode()


def fake_sources(year, phases, include_previous_year=False):
    pages = {}
    for phase in phases:
        revised = phase == 'revidert'
        number = 2 if revised else 1
        landing = f'{BASE}/no/statsbudsjett/{year}' + ('/rnb/' if revised else '/')
        doc = f'{BASE}/no/dokumenter/meld.-st.-{number}-{year - 1}{year}/id999/'
        pages[landing] = f'<a href="{doc}">Budsjettdokument</a>'
        pages[doc] = f'<a href="{doc}?ch=1">Les dokumentet</a>'
        pages[doc + '?ch=1'] = f'<a href="{doc}?ch=5">Historiske tabeller og detaljerte anslagstall</a>'
        html = (FIXTURES / 'oljepengebruk-rnb2026.html').read_text().replace('2026', str(year))
        if include_previous_year:
            html = html.replace('2025', str(year - 1))
        pages[doc + '?ch=5'] = html
    pages[BASE + '/no/statsbudsjett/'] = '<p>Oversikt</p>'
    def get(url):
        if url not in pages:
            response = requests.Response()
            response.status_code = 404
            raise requests.HTTPError(response=response)
        return Response(url, pages[url])
    return get


def test_dynamisk_fremtidig_aar_og_urort_overforing(tmp_path):
    # Lik saldert og revidert bevilgning skal ikke overskrives med underskuddet.
    inntekter = tmp_path / 'inntekter.json'
    inntekter.write_text('{"2032":{"saldert":456823.9,"revidert":456823.9}}')
    original = inntekter.read_bytes()
    update(tmp_path, current_year=2032, get=fake_sources(2032, ['forslag', 'revidert']))
    data = json.loads((tmp_path / 'oljepengebruk.json').read_text())
    assert data['serier']['2032']['revidert']['oljekorrigert'] == 466447
    assert data['serier']['2032']['forslag']['strukturelt'] == 579036
    assert data['serier']['2025']['regnskap']['kilde']['fase'] == 'revidert'
    assert inntekter.read_bytes() == original


def test_forslag_for_neste_aar_hentes_uten_hardkodet_aar(tmp_path):
    update(tmp_path, current_year=2031, get=fake_sources(2032, ['forslag'], include_previous_year=True))
    data = json.loads((tmp_path / 'oljepengebruk.json').read_text())
    assert 'forslag' in data['serier']['2032']
    assert 'regnskap' not in data['serier']['2032']
    assert data['serier']['2031']['revidert']['strukturelt'] == 510610
    assert 'regnskap' not in data['serier']['2031']


def test_kildefeil_beholder_sist_publiserte_tall(tmp_path):
    path = tmp_path / 'oljepengebruk.json'
    path.write_text('{"versjon":1,"enhet":"mill_kr","serier":{"2032":{}}}')
    original = path.read_bytes()
    def fail(_):
        raise requests.ConnectionError('Kilden utilgjengelig')
    with pytest.raises(ValueError, match='Ingen ferske'):
        update(tmp_path, current_year=2032, get=fail)
    assert path.read_bytes() == original
