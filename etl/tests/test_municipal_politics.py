import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json
import tempfile

spec = importlib.util.spec_from_file_location('politics', Path(__file__).parents[1] / 'municipal_politics.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

HTML = '''<div data-nummer="1151"></div><h2>Politisk styring</h2><section class="facts">
<div><span>Ordfører</span><strong>Navn Æ &amp; Ø (Lokal lista)</strong></div>
<div><span>Flertall</span><strong>Lokal lista, Høyre (8 av 11 mandater)</strong></div>
</section><h2>Kommunestyret</h2><p>Høyre 11 mandater</p>'''

class PoliticsTests(unittest.TestCase):
    def test_local_lists_entities_and_no_election_inference(self):
        code, record = p.parse_record(HTML, 'https://example.org/kommune', '2026-10-06')
        self.assertEqual(code, '1151'); self.assertEqual(record['mayor']['name'], 'Navn Æ & Ø')
        self.assertEqual(record['mayor']['party'], 'Lokal lista')
        self.assertEqual(record['government']['parties'], ['Lokal lista', 'Høyre'])
        self.assertEqual(record['government']['kind'], 'source-reported')
        self.assertNotIn('election', record); self.assertNotIn('verifiedAt', record)
        missing = HTML.replace('<div><span>Flertall</span><strong>Lokal lista, Høyre (8 av 11 mandater)</strong></div>', '')
        self.assertEqual(p.parse_record(missing, 'https://example.org', '2026-10-06')[1]['government']['parties'], [])

    def test_cooperation_parties_label_and_nynorsk_name(self):
        html = HTML.replace('Flertall', 'Samarbeidspartier').replace('Lokal lista, Høyre', 'Lokal lista, Miljøpartiet Dei Grøne')
        record = p.parse_record(html, 'https://example.org', '2026-10-06')[1]
        self.assertEqual(record['government']['parties'], ['Lokal lista', 'Miljøpartiet De Grønne'])

    def test_schema_drift_missing_mayor_or_ambiguous_code_stops_import(self):
        for broken in [HTML.replace('Politisk styring', 'Ny overskrift'), HTML.replace('Ordfører', 'Ukjennt'), HTML + '<div data-nummer="4601"></div>']:
            with self.assertRaises(ValueError): p.parse_record(broken, 'https://example.org', '2026-10-06')

    def test_fetched_date_never_renews_verification_and_changed_baseline_persists(self):
        record = {'sourceFetchedAt': '2027-02-01', 'sourceSnapshot': {'mayor': 'new'}}
        override = {'verifiedAt': '2026-10-06', 'government': {'kind': 'cabinet'}, 'monitors': ['https://example.org']}
        previous = {'verifiedAt': '2026-10-06', 'monitorBaseline': {'https://example.org': 'original'}, 'sourceBaseline': {'mayor': 'old'}}
        result = p.apply_override(record, override, previous, {'https://example.org': 'changed'}, '2027-02-01')
        self.assertEqual(result['verifiedAt'], '2026-10-06'); self.assertEqual(len(result['reviewReasons']), 3)
        again = p.apply_override(record, override, result, {'https://example.org': 'changed'}, '2027-02-02')
        self.assertEqual(again['reviewReasons'], result['reviewReasons'])
        failed = p.apply_override(record, override, previous, {'https://example.org': None}, '2026-10-06')
        self.assertIn('En kommunal kilde kunne ikke hentes.', failed['reviewReasons'])
        self.assertEqual(failed['monitorBaseline'], previous['monitorBaseline'])

    def test_manual_reverification_replaces_baseline(self):
        result = p.apply_override({'sourceSnapshot': {'mayor': 'new'}}, {'verifiedAt': '2026-10-07', 'monitors': ['https://example.org']}, {'verifiedAt': '2026-10-06'}, {'https://example.org': 'new'}, '2026-10-07')
        self.assertEqual(result['monitorBaseline'], {'https://example.org': 'new'})
        self.assertEqual(result['reviewReasons'], [])

    def test_failed_fetch_preserves_saved_facts_and_success_date(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); index = root / 'index.json'; output = root / 'politics.json'; overrides = root / 'overrides.json'
            index.write_text(json.dumps({'entities': [{'code': '1151', 'name': 'Utsira', 'kind': 'municipality', 'active': True}]}))
            overrides.write_text('{"municipalities": {}}')
            listing = '<a href="/kommune/utsira" class="kom-row">Utsira</a>'
            def healthy(url, *_): return listing if url.endswith('/kommuner') else HTML
            def failed(url, *_):
                if url.endswith('/kommuner'): return listing
                raise OSError('Source unavailable')
            with patch.multiple(p, INDEX=index, OUTPUT=output, OVERRIDES=overrides), patch.object(p, 'fetch', healthy):
                p.run()
            saved = json.loads(output.read_text()); saved['municipalities']['1151']['sourceFetchedAt'] = '2020-01-01'
            output.write_text(json.dumps(saved))
            with patch.multiple(p, INDEX=index, OUTPUT=output, OVERRIDES=overrides), patch.object(p, 'fetch', failed):
                result = p.run()
            record = result['municipalities']['1151']
            self.assertEqual(record['sourceFetchedAt'], '2020-01-01'); self.assertTrue(record['fetchFailed'])
            self.assertEqual(record['mayor'], saved['municipalities']['1151']['mayor'])
            self.assertEqual(len(result['status']['fetchFailures']), 1)
            output.unlink()
            with patch.multiple(p, INDEX=index, OUTPUT=output, OVERRIDES=overrides), patch.object(p, 'fetch', failed):
                with self.assertRaises(ValueError): p.run()
            self.assertFalse(output.exists())

    def test_nonce_and_scripts_do_not_create_false_changes(self):
        self.assertEqual(p.monitored_hash('<main>Navn<script nonce="a">1</script></main>'), p.monitored_hash('<main>Navn<script nonce="b">2</script></main>'))
        self.assertNotEqual(p.monitored_hash('<main>Ny ordfører</main>'), p.monitored_hash('<main>Gammel ordfører</main>'))

if __name__ == '__main__': unittest.main()
