import os
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ssb_research import selection_params, normalize, table_id, fetch_snapshot, metadata, codes, get
from ssb_research_handoff import validate_packet


def fixture():
    d={'class':'dataset','id':['Region','ContentsCode','Tid'],'size':[1,1,2],
       'role':{'time':['Tid'],'metric':['ContentsCode']},'label':'Folkemengde',
       'dimension':{'Region':{'category':{'index':{'0':0},'label':{'0':'Hele landet'}}},
       'ContentsCode':{'category':{'index':{'Persons':0},'unit':{'Persons':{'base':'personer','decimals':0}}}},
       'Tid':{'category':{'index':{'2024':0,'2025':1}}}},'value':[100,110]}
    return d,{'Region':['0'],'ContentsCode':['Persons'],'Tid':['2024','2025']}


def test_explicit_dimensions_and_unknown_codes():
    d,s=fixture()
    assert selection_params(d,s)[1]=='Tid'
    for bad in [{**s,'Region':['unknown']},{k:v for k,v in s.items() if k!='Region'}, {**s,'Tid':['*']}]:
        with pytest.raises(ValueError):selection_params(d,bad)


def test_sparse_values_and_response_selection():
    d,s=fixture();d['value']={'0':100,'1':110}
    assert normalize(d,d,s)['rows']==[{'year':2024,'value':100},{'year':2025,'value':110}]
    d['dimension']['Region']['category']['index']={'other':0}
    with pytest.raises(ValueError):normalize(fixture()[0],d,s)


@pytest.mark.parametrize('value',[None,True,float('nan'),float('inf')])
def test_missing_and_nonfinite_are_not_zero(value):
    d,s=fixture();d['value'][1]=value
    with pytest.raises(ValueError):normalize(d,d,s)


def test_gap_and_missing_units():
    d,s=fixture();d['dimension']['Tid']['category']['index']={'2023':0,'2025':1};s['Tid']=['2023','2025']
    with pytest.raises(ValueError):normalize(d,d,s)
    d,s=fixture();del d['dimension']['ContentsCode']['category']['unit']
    with pytest.raises(ValueError):normalize(d,d,s)


def test_months_and_multiple_categories_rejected():
    d,s=fixture();d['dimension']['Tid']['category']['index']={'2024M01':0,'2024M02':1};s['Tid']=['2024M01','2024M02']
    with pytest.raises(ValueError):selection_params(d,s)
    d,s=fixture();d['dimension']['Region']['category']['index']['1']=1;s['Region']=['0','1']
    with pytest.raises(ValueError):selection_params(d,s)


def test_packet_bounds_and_ssrf():
    with pytest.raises(ValueError):table_id('../07459')
    with pytest.raises(ValueError):validate_packet({'version':1,'extracts':[]})
    with pytest.raises(ValueError):validate_packet({'version':1,'extracts':[{'scope':'state','id':'X'}]*2})


@pytest.mark.skipif(os.environ.get('SSB_LIVE_TEST')!='1',reason='Explicit live SSB network check')
def test_actual_ssb_api():
    catalog=get('',{'lang':'no','query':'folkemengde','pageSize':3})
    assert isinstance(catalog,(dict,list)) and catalog
    assert 'folkemengde' in __import__('json').dumps(catalog,ensure_ascii=False).lower()
    md=metadata('07459');selections={}
    time_id=md.get('role',{}).get('time',['Tid'])[0]
    for code in md['id']:
        values=codes(md['dimension'][code])
        if code==time_id:selections[code]=[v for v in values if v in ['2024','2025']]
        else:
            # Smoke test only: use an actual category, never deliver this test as analysis.
            selections[code]=[next((v for v in ['0','000','00','Personer1'] if v in values),values[0])]
    snapshot=fetch_snapshot('07459',selections)
    assert len(snapshot['series']['rows'])==2
    print('Verified actual SSB API:',snapshot['title'],selections,snapshot['series'])

def test_archive_preserves_versions_and_rejects_missing_identity(tmp_path, monkeypatch):
    import ssb_research
    import json
    request={'id':'Population','scope':'state','purpose':'Undersøk befolkningsutvikling','table':'07459','selections':{}}
    snapshot={'version':1,'series':{'rows':[{'year':2024,'value':100},{'year':2025,'value':110}]}}
    monkeypatch.setattr(ssb_research,'fetch_snapshot',lambda *args:snapshot)
    first=ssb_research.archive(tmp_path,request)
    before=(tmp_path/first['path']).read_bytes()
    snapshot['series']['rows'][1]['value']=111
    second=ssb_research.archive(tmp_path,request)
    assert first['hash']!=second['hash']
    assert (tmp_path/first['path']).read_bytes()==before
    index=json.loads((tmp_path/'ssb-research/index.json').read_text())
    assert index['extracts']==[second]
    with pytest.raises(ValueError):ssb_research.archive(tmp_path,{**request,'scope':'../../escape'})
