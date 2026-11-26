import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { randomBytes } from 'node:crypto'
import { validateDeliverables } from '../../server/sven/deliverables.mjs'
import { exportFile, normalizeExport } from '../../server/sven/file-export.mjs'
import { extractUpload } from '../../server/sven/file-input.mjs'
import { prepareMunicipalMap } from '../../server/sven/municipal-map.mjs'
import { previewFiles, hostedPreview } from './test-access.mjs'

const table = {
  title: 'Skoleutgifter', sourceIds: ['ssb'],
  columns: [{ label: 'Kommune' }, { label: '2021', unit: 'kr' }, { label: '2025', unit: 'kr' },
    { label: 'KPI 2021' }, { label: 'KPI 2025' }, { label: 'Innbyggere' }, { label: 'Scenario', unit: '%' }],
  rows: [['Bergen', 1000, 1200, 80, 100, 10, 5], ['=1+1', 0, null, 80, 100, 0, -2]],
  calculations: [
    { label: 'Nominell vekst', unit: '%', op: 'growth', columns: [1, 2] },
    { label: 'Realvekst', unit: '%', op: 'real_growth', columns: [1, 2, 3, 4] },
    { label: 'Forskjell', unit: 'kr', op: 'difference', columns: [1, 2] },
    { label: 'Beløp per innbygger', unit: 'kr', op: 'per_capita', columns: [2, 5] },
    { label: 'Anslag', unit: 'kr', op: 'scenario', columns: [2, 6] },
  ],
}
const chart = { title: 'Utvikling over tid', type: 'line', axis: 'År', unit: 'kr', series: ['Bergen'],
  rows: [{ label: '2021', values: [1000] }, { label: '2023', values: [null] }, { label: '2025', values: [1200] }],
  sourceIds: ['ssb'],
}
const illustration = { title: 'Slik går pengene', sourceIds: ['ssb'],
  steps: [{ label: 'Stortinget', detail: 'Vedtatt fordeling' }, { label: 'Kommunen', detail: 'Drift av skolen' }],
}
const map = { title: 'Fordeling i 2025', year: 2025, unit: 'kr per innbygger', sourceIds: ['ssb'],
  areas: [{ code: '4601', name: 'Bergen', value: 120, path: 'M20,20L40,20L40,40Z' }, { code: '0301', value: null }],
}
const summary = 'Skolene bruker 20 % mer i løpende priser. Tallgrunnlaget vises med æ, ø og å.'
const payload = {
  summary, chart, sources: [{ id: 'ssb', title: 'SSB · KOSTRA 12362', url: 'https://www.ssb.no/statbank/table/12362/' }],
  deliverables: { title: 'Skoleøkonomien', table, illustration, map,
    formats: ['csv','xlsx','docx','pdf','pptx','svg'],
    sections: [{ heading: 'Beregning', paragraphs: ['Konsumprisindeksen ligger til grunn for realveksten.'], sourceIds: ['ssb'] }],
  },
  findings: [{ text: 'Prisjustert er veksten negativ.', sourceIds: ['ssb'] }], uncertainties: ['Testdata for eksport.'],
}
const headers = { host: 'preview.test', origin: 'https://preview.test', 'content-type': 'application/json' }

test('tabellen beregner nominell og reell vekst, scenario og beløp per innbygger med null som manglende verdi', () => {
  const kit = validateDeliverables(payload.deliverables, new Set(['ssb']))
  assert.deepEqual(kit.table.derived, [[20, -4, 200, 120, 1260], [null, null, null, null, null]])
  assert.equal(validateDeliverables({ ...kit, table: { ...table, sourceIds: ['ukjent'] } }, new Set(['ssb'])).table, undefined)
})

test('CSV og Excel er numeriske, beholder rådata og kilder og tolker ikke brukertekst som formler', async () => {
  const csv = await exportFile('csv', normalizeExport('csv', payload))
  assert.match(csv.toString(), /Bergen;1000;1200;80;100;10;5;20;-4;200;120;1260/)
  assert.match(csv.toString(), /'=1\+1/)
  const bytes = await exportFile('xlsx', normalizeExport('xlsx', payload))
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(bytes)
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['Data', 'Beregninger', 'Kilder og merknader'])
  assert.equal(book.getWorksheet('Data').getCell('A3').value, '=1+1')
  assert.equal(book.getWorksheet('Beregninger').getCell('H2').value.result, 20)
  assert.match(book.getWorksheet('Beregninger').getCell('H2').value.formula, /COUNT\(Data!B2,Data!C2\)/)
  assert.match(book.getWorksheet('Kilder og merknader').getCell('C5').value.hyperlink, /12362/)
  assert.match((await extractUpload('data.xlsx', bytes)).text, /Bergen\t1000\t1200/)
  assert.match((await extractUpload('data.csv', csv)).text, /Bergen\t1000\t1200/)
})

test('Word, PDF og PowerPoint kan genereres med figurer og leses tilbake med norsk tekst', async () => {
  for (const format of ['docx', 'pdf', 'pptx']) {
    const bytes = await exportFile(format, normalizeExport(format, payload))
    assert.ok(bytes.length > 1500, format)
    const result = await extractUpload(`rapport.${format}`, bytes)
    assert.match(result.text, /Skoleøkonomien/, format)
    assert.match(result.text, /(?:æ, ø og å|æ,\s+ø og å)/, format)
    assert.match(result.text, /KOSTRA 12362/, format)
  }
  const svg = await exportFile('svg', normalizeExport('svg', payload))
  assert.match(svg.toString(), /Slik går pengene.*?Kommunen/s)
})

test('kartet bruker områder fra Kartverket og beholder rader uten geometri', async () => {
  const result = await prepareMunicipalMap(map, async url => new Response(JSON.stringify(url.includes('4601') ? {
    kommunenavn: 'Bergen', kommunenummer: '4601',
    omrade: { type: 'Polygon', coordinates: [[[5.1, 60.2], [5.3, 60.1], [5.6, 60.5], [5.1, 60.2]]] },
  } : {})))
  assert.match(result.areas[0].path, /^M[0-9.,]+L/)
  assert.equal(result.areas[0].name, 'Bergen')
  assert.equal(result.areas[1].path, undefined)
})

test('filendepunktet avviser andre miljøer og opprinnelser og leser vedlegg uten modellkall', async () => {
  const handler = previewFiles({ environment: 'preview' })
  let status
  const chunks = []
  const res = { setHeader(){}, status(value) { status = value; return this }, json(body) { return { status, body } },
    write(bytes) { chunks.push(bytes) }, end() { return { status, bytes: Buffer.concat(chunks) } } }
  const request = { headers, method: 'POST', body: { action: 'extract', name: 'ark.tsv',
    data: Buffer.from('Kommune\tVerdi\nBergen\t20').toString('base64') } }
  assert.equal((await previewFiles({ environment: 'production' })(request, res)).status, 404)
  assert.equal((await handler({ ...request, headers: { ...headers, origin: 'https://annen.test' } }, res)).status, 403)
  assert.equal((await handler({ ...request, body: { ...request.body, name: 'ark.exe' } }, res)).status, 422)
  assert.match((await handler(request, res)).body.text, /Bergen\t20/)
  assert.match((await handler({ ...request, body: { action: 'export', format: 'csv', document: payload } }, res)).bytes.toString(), /Bergen;1000/)
})

test('opplastet tallgrunnlag går til Sven som kilde og følger med i eksporten', async () => {
  const phases = []
  const answerTable = { ...table, sourceIds: ['vedlegg-1'] }
  const pack = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })
  const preview = hostedPreview({
    environment: 'preview', apiKey: 'test',
    sources: () => assert.fail('skal bruke vedlegget'),
    createRequest: () => async ({ phase, input }) => {
      phases.push(phase)
      const data = JSON.parse(input)
      if (phase === 'interpret') {
        assert.equal(data.uploads[0].title, 'mitt-ark.csv')
        return pack({ intent: { request: 'Sammenlign', purpose: 'Excel', meaning: 'Lag Excel fra vedlegget' },
          action: 'research', tools: ['uploads'], plan: { scope: 'Vedlegg', questions: ['Hvordan endret det seg?'], searches: [], counterSearch: '', missing: [] } })
      }
      if (phase === 'answer-0') {
        assert.match(data.sources[0].text, /Bergen/)
        return pack({ summary, findings: [], uncertainties: [], recommendation: null,
          deliverables: { title: 'Sammenligning', formats: ['xlsx'], table: answerTable } })
      }
      assert.equal(phase, 'review-0')
      assert.equal(data.answer.deliverables.table.derived[0][1], -4)
      return pack({ passed: true, issues: [] })
    },
  })
  const res = { setHeader() {}, status(code) { this.code = code; return this }, json(body) { return { status: this.code, body } } }
  const requestId = randomBytes(32).toString('hex')
  const request = { method: 'POST', headers }
  let result = await preview({ ...request, body: { requestId, question: 'Lag Excel av vedlegget',
    files: [{ name: 'mitt-ark.csv', text: 'Bergen 1000 1200' }],
  } }, res)
  for (let attempts = 0; result.status === 202 && attempts < 5; attempts++) {
    result = await preview({ ...request, body: { requestId, resume: true } }, res)
  }
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.sources, [{ id: 'vedlegg-1', title: 'mitt-ark.csv', type: 'upload' }])
  assert.deepEqual(phases, ['interpret', 'answer-0', 'review-0'])
})
