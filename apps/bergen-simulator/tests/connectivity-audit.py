"""Offline source-integrity checks; no downloads and no runtime snapshot writes."""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('connected_audit',Path(__file__).resolve().parents[1]/'scripts/audit-connected-city.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class AuditTests(unittest.TestCase):
 def test_complete_pinned_cache_and_source_immutability(self):
  paths=[audit.ROOT/'public/data'/name for name in ['bergen.json','bryggen-transport.json','source-manifest.json','terrain-source.json']]
  before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
  r=audit.audit()
  self.assertEqual(r['totals']['currentMotorWays'],27)
  self.assertGreater(r['totals']['mappedEntrances'],0)
  self.assertEqual(r['totals']['verifiedProposedSiteConnections'],0)
  self.assertEqual(len(r['sources']),30)
  self.assertGreater(r['totals']['offlineUnionMotorWays'],27)
  self.assertTrue(all(s['verifiedCarConnector'] is None for s in r['sites']))
  self.assertEqual(before,{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths})
 def fixture(self,root):
  (root/'public/data').mkdir(parents=True);(root/'data-cache').mkdir()
  (root/'public/data/source-manifest.json').write_text(json.dumps({'osm':[{'sha256':'expected-pinned-hash'}]}))
 def test_unpinned_source_fails_closed(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);self.fixture(root);(root/'data-cache/osm-0-0.xml').write_text('<osm/>')
   with patch.object(audit,'ROOT',root),self.assertRaisesRegex(ValueError,'Unpinned'):audit.audit()
 def test_incomplete_cache_fails_closed(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);self.fixture(root)
   with patch.object(audit,'ROOT',root),self.assertRaisesRegex(ValueError,'Incomplete'):audit.audit()
if __name__=='__main__':unittest.main()
