import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('catalogue', Path(__file__).parents[1] / 'ssb_research_catalogue.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class CatalogueTests(unittest.TestCase):
    def page(self, number, ids, total=3):
        return {'page': {'pageNumber':number,'totalPages':2,'totalElements':total},
                'tables':[{'id':x} for x in ids]}
    def test_requires_all_pages(self):
        seen=[]
        def fetch(n):
            seen.append(n)
            return self.page(n, ['00001','00002'] if n==1 else ['00003'])
        tables, pages=module.collect(fetch)
        self.assertEqual(seen,[1,2]);self.assertEqual(len(tables),3)
    def test_rejects_duplicate_and_incomplete(self):
        for last in [['00002'], []]:
            with self.assertRaises(ValueError):
                module.collect(lambda n:self.page(n,['00001','00002'] if n==1 else last))
    def test_rejects_changing_catalogue(self):
        with self.assertRaises(ValueError):
            module.collect(lambda n:self.page(n,['00001'],total=2 if n==1 else 3))

if __name__=='__main__':unittest.main()
