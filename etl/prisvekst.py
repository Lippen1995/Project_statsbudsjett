"""SSB-anslag holdes separat fra observerte årsserier."""
from download import _download_ssb_tabell, _cache_json
from parse_befolkning import parse_ssb_aarsserie


def kpi_fremskriving(kpi, vekstrater):
    siste = max(kpi)
    verdi = kpi[siste]
    resultat = {}
    for aar in range(siste + 1, max(vekstrater) + 1):
        if aar not in vekstrater:
            break  # Ikke hopp over et manglende års prisvekst.
        vekst = vekstrater[aar]
        if not -10 < vekst < 30:
            raise ValueError(f'Urimelig KPI-anslag for {aar}: {vekst}')
        verdi *= 1 + vekst / 100
        resultat[aar] = round(verdi, 4)
    return resultat


def hent_prisvekst_anslag(kpi, befolkning, force=False):
    pris = _download_ssb_tabell('12880', _cache_json('ssb_kpi_prognose.json'),
                               contents_hint='Konsumprisindeksen (KPI)', force=force)
    folk = _download_ssb_tabell('14282', _cache_json('ssb_befolkning_prognose.json'),
                               contents_hint='Folkemengde',
                               var_hints={'Framskriv': 'Hovedalternativ',
                                          'InnvandrLandbakgr': 'Hele befolkningen'}, force=force)
    return {
        'kpi': kpi_fremskriving(kpi, parse_ssb_aarsserie(pris)),
        'befolkning': {a: round(v) for a, v in parse_ssb_aarsserie(folk).items()
                       if a > max(befolkning)},
        'kilder': {'kpi': 'https://www.ssb.no/statbank/table/12880/',
                   'befolkning': 'https://www.ssb.no/statbank/table/14282/'},
    }
