import test from 'node:test'
import assert from 'node:assert/strict'
import { kompaktData } from '../src/fellestall/kompakt.js'
import { oljeTidsserie, oljeGrafSerier, oljeMakroTidsserie, oljeDifferanser } from '../src/fellestall/oljetall.js'

const data = (serie, regnskap = []) => kompaktData({
  meta: { regnskap_aar: regnskap }, utgifter: [],
  inntekter: [{ children: [{ transfer: true, serier: { 2032: serie } }] }],
  fondsverdi: { 2031: 1000 }, befolkning: { 2032: 100 },
})

test('samme år går fra forslag til saldert, revidert og regnskap', () => {
  const serie = { regnskap: null, forslag: 10 }
  assert.equal(oljeTidsserie(data(serie))[0].type, 'Foreslått budsjett')
  serie.saldert = 20
  assert.equal(oljeTidsserie(data(serie))[0].belop, 20)
  serie.revidert = 30
  assert.equal(oljeTidsserie(data(serie))[0].type, 'Revidert budsjett')
  serie.regnskap = 0
  const rad = oljeTidsserie(data(serie, [2032]))[0]
  assert.equal(rad.budsjett, false)
  assert.equal(rad.belop, 0)
})

test('manglende regnskap blir ikke nulluttak, og manglende referanser gir ikke anslag', () => {
  const d = data({ forslag: 10 })
  d.fondsverdi = {}; d.befolkning = {}
  assert.deepEqual(oljeTidsserie(d)[0], { aar: 2032, type: 'Foreslått budsjett', budsjett: true, befolkningsanslag: false, belop: 10, prosent: null, perPerson: null })
})

test('stiplet linje kobles til regnskap og forsvinner når budsjettet blir regnskap', () => {
  const rader = [{ budsjett: false, belop: 10 }, { budsjett: true, belop: 20 }]
  let serier = oljeGrafSerier(rader, 'belop', 'gold')
  assert.deepEqual(serier.map((s) => s.punkter.map((p) => p.v)), [[10, null], [10, 20]])
  rader[1].budsjett = false
  serier = oljeGrafSerier(rader, 'belop', 'gold')
  assert.deepEqual(serier.map((s) => s.punkter.map((p) => p.v)), [[10, 20], [null, null]])
})

test('oljepengebruk, underskudd og vedtatt overføring er tre forskjellige beløp', () => {
  const d = data({ saldert: 456823.9, revidert: 456823.9 })
  d.oljepengebruk = { serier: { 2032: {
    saldert: { strukturelt: 584000, oljekorrigert: 456800 },
    revidert: { strukturelt: 579036, oljekorrigert: 466447 },
  } } }
  d.meta.regnskap_aar = [2031]
  d.fondsverdi = { 2031: 21268000 }
  const overforing = oljeTidsserie(d)[0]
  const makro = oljeMakroTidsserie(d)[0]
  assert.equal(overforing.type, 'Revidert budsjett')
  assert.equal(overforing.belop, 456823.9)
  assert.equal(makro.belop, 579036)
  assert.ok(Math.abs(makro.prosent - 579036 / 21268000 * 100) < 1e-9)
  assert.equal(oljeDifferanser(overforing, makro).strukturell, 112589)
  assert.ok(Math.abs(oljeDifferanser(overforing, makro).overforing + 9623.1) < 1e-6)
})

test('framtidig prosent bruker offisielt fondsanslag og ikke dagens fondsverdi', () => {
  const d = data({ forslag: 600000 }, [2031])
  d.fondsverdi = { 2030: 21000000 }
  d.oljepengebruk = { serier: { 2032: { forslag: { strukturelt: 600000, oljekorrigert: 480000, prosent_fond: 2.8 } } } }
  const makro = oljeMakroTidsserie(d)[0]
  assert.equal(makro.prosent, 2.8)
  assert.equal(makro.fondsanslag, true)
  delete d.oljepengebruk.serier[2032].forslag.prosent_fond
  assert.equal(oljeMakroTidsserie(d)[0].prosent, null)
})

test('nye budsjettversjoner erstatter forslag og regnskapsår bruker siste historiske anslag', () => {
  const d = data({ forslag: 10 }, [2031])
  const serie = { forslag: { strukturelt: 12, oljekorrigert: 10 } }
  d.oljepengebruk = { serier: { 2032: serie } }
  assert.equal(oljeMakroTidsserie(d)[0].type, 'Foreslått budsjett')
  serie.saldert = { strukturelt: 13, oljekorrigert: 11 }
  assert.equal(oljeMakroTidsserie(d)[0].type, 'Saldert budsjett')
  serie.revidert = { strukturelt: 14, oljekorrigert: 12 }
  assert.equal(oljeMakroTidsserie(d)[0].type, 'Revidert budsjett')
  serie.regnskap = { strukturelt: 15, oljekorrigert: 13 }
  assert.equal(oljeMakroTidsserie(d)[0].budsjett, true)
  d.meta.regnskap_aar.push(2032)
  assert.equal(oljeMakroTidsserie(d)[0].budsjett, false)
  assert.equal(oljeMakroTidsserie(d)[0].type, 'Historisk anslag')
  assert.equal(oljeMakroTidsserie(d)[0].belop, 15)
})

test('netto pengestrøm bruker felles versjon og bevarer negative beløp og null', async () => {
  const { oljeStromTidsserie } = await import('../src/fellestall/oljetall.js')
  const d = data({ saldert: 20, revidert: 40 }, [2032])
  d.utgifter = [{ c: [{ x: 1, s: { 2032: [null, 10, null, null] } }] }]
  assert.deepEqual(oljeStromTidsserie(d)[0], { aar: 2032, type: 'Saldert budsjett', budsjett: true, innskudd: 10, overforing: 20, netto: -10 })
  d.utgifter[0].c[0].s[2032][0] = 0
  d.inntekter[0].c[0].s[2032][0] = 0
  assert.equal(oljeStromTidsserie(d)[0].netto, 0)
  assert.equal(oljeStromTidsserie(d)[0].budsjett, false)
  d.utgifter = []
  assert.deepEqual(oljeStromTidsserie(d), [])
})


test('overføring per innbygger bruker SSB-anslag når observert folketall mangler', () => {
  const d = data({ forslag: 600000 }, [2031])
  d.befolkning = {}
  d.prisvekstAnslag = { befolkning: { 2032: 6000000 } }
  let rad = oljeTidsserie(d)[0]
  assert.equal(rad.perPerson, 100000)
  assert.equal(rad.befolkningsanslag, true)
  assert.equal(rad.budsjett, true)
  d.befolkning[2032] = 6250000
  rad = oljeTidsserie(d)[0]
  assert.equal(rad.perPerson, 96000)
  assert.equal(rad.befolkningsanslag, false)
  delete d.befolkning[2032]
  delete d.prisvekstAnslag.befolkning[2032]
  assert.equal(oljeTidsserie(d)[0].perPerson, null)
})
