import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import budget_proposals as budget
import party_priorities as parties
from budget_evidence_handoff import validate_packet, validate_delivery_scope


def page(url, html):
    return SimpleNamespace(url=url, text=html)


def test_release_uses_verified_canonical_page_and_discovers_actual_workbook(monkeypatch):
    urls = []
    def get(url):
        urls.append(url)
        return page(url, '<a href="/no/statsbudsjett/2027/tallgrunnlag/">Tallgrunnlag Gul bok</a>' if len(urls) == 1 else '<a href="/content/2027_gul_bok_data.xlsx">Excel</a>')
    monkeypatch.setattr(budget, 'get', get)
    assert budget.discover(2027)['url'].endswith('2027_gul_bok_data.xlsx')
    assert urls[0] == budget.RELEASE_PAGES[2027]


def test_short_year_route_404_discovers_canonical_link_from_official_overview(monkeypatch):
    def get(url):
        if url.endswith('/2026/'):
            response = requests.Response(); response.status_code = 404
            raise requests.HTTPError(response=response)
        if url.endswith('/statsbudsjett/'):
            return page(url, '<a href="/no/statsbudsjett/2026/id1234567/">Statsbudsjett</a>')
        if url.endswith('/id1234567/'):
            return page(url, '<a href="/no/statsbudsjett/2026/tallgrunnlag/">Tallgrunnlag Gul bok</a>')
        return page(url, '<a href="/content/2026_gulbok.xlsx">Excel</a>')
    monkeypatch.setattr(budget, 'get', get)
    assert budget.discover(2026)['landing'].endswith('/id1234567/')


def test_not_released_is_distinct_from_network_denial_and_ambiguous_source(monkeypatch):
    monkeypatch.setattr(budget, 'get', lambda url: page(url, '<p>Fremleggelse kommer i morgen</p>'))
    assert budget.discover(2027) is None
    def denied(url):
        response = requests.Response(); response.status_code = 403
        raise requests.HTTPError(response=response)
    monkeypatch.setattr(budget, 'get', denied)
    with pytest.raises(requests.HTTPError): budget.discover(2027)
    monkeypatch.setattr(budget, 'get', lambda url: page(url, '<a href="/a/">Tallgrunnlag Gul bok</a><a href="/b/">Tallgrunnlag Gul bok</a>'))
    with pytest.raises(ValueError, match='Ambiguous'): budget.discover(2027)


def priority(**extra):
    return {'id': 'formuesskatt', 'party': 'H', 'kind': 'programme',
            'url': 'https://hoyre.no/politikk/partiprogram/', 'period': [2025,2029],
            'quote': 'Fjerne formuesskatten på arbeidende kapital for å styrke norsk eierskap.', **extra}


DOCUMENT = 'Program 2025–2029. ' + priority()['quote']


def test_party_priorities_verify_quote_period_origin_and_unknown_dates():
    item = priority()
    verified = parties.verify_priority(item, DOCUMENT)
    assert verified['sourceHash'] and verified['sourceDate'] is None
    for changed in [priority(url='https://sv.no/program/'), priority(kind='agreement'),
                    priority(period=[2027,2031]), priority(sourceDate='2026-10-06')]:
        with pytest.raises(ValueError): parties.verify_priority(changed,DOCUMENT)
    with pytest.raises(ValueError, match='quotation'):
        parties.verify_priority(priority(quote='Et annet løfte om arbeidende kapital og eierskap.'),DOCUMENT)
    assert validate_packet({'version':1,'year':2027,'phase':'initial','priorities':[item]})


def test_party_archives_before_proposal_is_immutable_idempotent_and_atomic(tmp_path,monkeypatch):
    monkeypatch.setattr(parties,'fetch_document',lambda url,party:(DOCUMENT,DOCUMENT.encode(),'html',url))
    first = parties.archive_priorities(tmp_path,2027,'initial',[priority()])
    snapshot = (tmp_path/first['path']).read_bytes()
    assert parties.archive_priorities(tmp_path,2027,'initial',[priority()]) == first
    assert (tmp_path/first['path']).read_bytes() == snapshot
    second = priority(id='andreprioritet',quote='Et nytt dokumentert mål om å styrke arbeidsplasser og norske bedrifter.')
    with pytest.raises(ValueError,match='quotation'):
        parties.archive_priorities(tmp_path,2027,'initial',[priority(),second])
    assert len(json.loads((tmp_path/'party-research/index.json').read_text())['snapshots']) == 1
    newer = DOCUMENT+' '+second['quote']
    monkeypatch.setattr(parties,'fetch_document',lambda url,party:(newer,newer.encode(),'html',url))
    assert parties.archive_priorities(tmp_path,2027,'initial',[priority(),second])['hash'] != first['hash']
    assert (tmp_path/first['path']).read_bytes() == snapshot
    with pytest.raises(ValueError,match='Duplicate'):
        parties.archive_priorities(tmp_path,2027,'initial',[priority(),priority()])


def test_party_redirect_cannot_fetch_another_host(monkeypatch):
    seen=[]
    class Redirect:
        is_redirect=True
        status_code=302
        headers={'Location':'https://example.com/private'}
        def __enter__(self):return self
        def __exit__(self,*args):pass
    def get(url,**kwargs):seen.append(url);return Redirect()
    monkeypatch.setattr(parties.requests,'get',get)
    with pytest.raises(ValueError,match='official HTTPS'):
        parties.fetch_document(priority()['url'],'H')
    assert seen == [priority()['url']]


def test_separate_party_queue_cannot_change_government_or_adopted_budget_data():
    ref = 'refs/heads/analysis/budget-evidence-party-2026-10-06'
    packet = {'version': 1, 'year': 2027, 'phase': 'initial', 'priorities': [priority()]}
    validate_delivery_scope(ref, validate_packet(packet))
    for changed in [{**packet, 'evidence': [{'kind': 'agreement'}]},
                    {**packet, 'rnbDecision': {'status': 'adopted'}},
                    {'evidence': [{'kind': 'agreement'}]}]:
        with pytest.raises(ValueError, match='Priority-only'):
            validate_delivery_scope(ref, changed)
    validate_delivery_scope('refs/heads/analysis/budget-evidence-general',
                            {**packet, 'evidence': [{'kind': 'agreement'}]})


def test_party_rate_limit_honors_backoff_once_and_does_not_retry_access_denial(monkeypatch):
    closed, waits, urls = [], [], []
    limited = SimpleNamespace(status_code=429, headers={'Retry-After': '12'}, close=lambda: closed.append(True))
    success = SimpleNamespace(status_code=200)
    def get(url, **kwargs):
        urls.append(url)
        return limited if len(urls) == 1 else success
    monkeypatch.setattr(parties.requests, 'get', get)
    monkeypatch.setattr(parties.time, 'sleep', waits.append)
    assert parties.source_response(priority()['url']) is success
    assert waits == [12] and closed == [True] and len(urls) == 2
    denied = SimpleNamespace(status_code=403)
    monkeypatch.setattr(parties.requests, 'get', lambda url, **kwargs: denied)
    assert parties.source_response(priority()['url']) is denied
    assert waits == [12]
    limited.headers['Retry-After'] = '120'
    monkeypatch.setattr(parties.requests, 'get', lambda url, **kwargs: limited)
    assert parties.source_response(priority()['url']) is limited
    assert waits == [12]
