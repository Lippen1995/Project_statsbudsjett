import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph } from 'docx'
import { editOfficeFile, relatedOfficeParts } from '../../server/sven/office-edit.mjs'
import { extractUpload, unzipOffice } from '../../server/sven/file-input.mjs'
import { mergeRevision, normalizeScenario, revisionContext } from '../../server/sven/advanced-tools.mjs'
import { runAnalysisCode } from '../../server/sven/run-analysis-code.mjs'
import { visionImport } from '../../server/sven/vision-import.mjs'
import { hostedPreview } from './hosted-preview.mjs'

const edit = async (bytes, format, edits, append) =>
  editOfficeFile(bytes, await unzipOffice(bytes, relatedOfficeParts), format, edits, append)

test('PowerPoint redigerer valgte felt og legger til lysbilde med samme mal', async () => {
  const presentation = new PptxGenJS()
  const first = presentation.addSlide()
  first.background = { color: '12584F' }
  first.addText('Original tittel', { x: 1, y: 1, fontFace: 'Arial', bold: true })
  first.addText('Behold dette feltet', { x: 1, y: 2 })
  presentation.addSlide().addText('Urørt lysbilde', { x: 1, y: 1 })
  const original = Buffer.from(await presentation.write({ outputType: 'nodebuffer' }))
  const inspect = await extractUpload('original.pptx', original)
  assert.match(inspect.editable, /\[lys-1-felt-1\].*Original tittel/)
  const revised = await edit(original, 'pptx', [{ target: 'lys-1-felt-1', value: 'Endret & sikker' }], [
    { template: 1, edits: [{ target: 'lys-1-felt-1', value: 'Nytt lysbilde' }] },
  ])
  const edited = await extractUpload('endret.pptx', revised)
  assert.match(edited.text, /Lysbilde 1\nEndret & sikker\nBehold dette feltet/)
  assert.match(edited.text, /Lysbilde 2\nUrørt lysbilde/)
  assert.match(edited.text, /Lysbilde 3\nNytt lysbilde/)
  const before = await JSZip.loadAsync(original)
  const after = await JSZip.loadAsync(revised)
  assert.equal(await after.file('ppt/slides/slide2.xml').async('string'), await before.file('ppt/slides/slide2.xml').async('string'))
  assert.match(await after.file('ppt/slides/slide-sven-1.xml').async('string'), /12584F/)
  await assert.rejects(edit(original, 'pptx', [{ target: 'lys-7-felt-1', value: 'Feil' }]), /finnes ikke/)
})

test('Word og Excel endrer målrettet innhold og bevarer andre felt og formler', async () => {
  const doc = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Endre meg'), new Paragraph('Behold meg')] }] }))
  const revised = await edit(doc, 'docx', [{ target: 'avsnitt-1', value: 'Endret <verdi>' }])
  assert.equal((await extractUpload('rapport.docx', revised)).text, 'Endret <verdi>\nBehold meg')
  const xlsx = new ExcelJS.Workbook()
  const sheet = xlsx.addWorksheet('Inndata')
  sheet.getCell('A1').value = 10
  sheet.getCell('A1').font = { bold: true }
  sheet.getCell('B1').value = { formula: 'A1*2', result: 20 }
  const book = await edit(Buffer.from(await xlsx.xlsx.writeBuffer()), 'xlsx', [{ target: 'ark-1-A1', value: 18 }])
  const roundTrip = new ExcelJS.Workbook()
  await roundTrip.xlsx.load(book)
  assert.equal(roundTrip.getWorksheet(1).getCell('A1').value, 18)
  assert.equal(roundTrip.getWorksheet(1).getCell('A1').font.bold, true)
  assert.equal(roundTrip.getWorksheet(1).getCell('B1').value.formula, 'A1*2')
})

test('isolert kode har ingen vertstilgang, kan aggregere data og avbryter en uendelig løkke', async () => {
  const computed = await runAnalysisCode('function analyze(s) { return { sum: s.map(x => +x.text).reduce((a,b) => a+b), host: [typeof fetch,typeof process,typeof require] }; }',
    [{ id: 'a', text: '12' }, { id: 'b', text: '18' }])
  assert.deepEqual(computed, { sum: 30, host: ['undefined','undefined','undefined'] })
  await assert.rejects(runAnalysisCode('function analyze() { while (true) {} }', [], { timeMs: 10 }), /overskred/)
})

test('visuell import sender bilde som bilde og bevarer nummererte PDF-sider', async () => {
  const calls = []
  const vision = visionImport({ apiKey: 'test', transport: ({ onUsage }) => async ({ input, tools }) => {
    assert.equal(tools, undefined)
    calls.push(input[0].type)
    onUsage({ input: 28, output: 12 })
    const isPdf = input[0].type === 'document'
    return { content: [{ type: 'text', text: JSON.stringify({
      pages: [{ page: isPdf ? 2 : 1, text: 'Grunnskole\t25 mill. kr', uncertain: isPdf }],
    }) }] }
  } })
  const jpeg = Buffer.from([255,216,255,217])
  const imported = await extractUpload('foto.jpg', jpeg, { readVisual: vision })
  assert.match(imported.text, /Skjermbilde\nGrunnskole/)
  assert.equal(imported.usage.input, 28)
  const pdf = await vision({ extension: 'pdf', bytes: Buffer.from('%PDF-'), pageCount: 2 })
  assert.match(pdf.text, /Side 2 · delvis uleselig/)
  assert.equal(pdf.partial, true)
  assert.deepEqual(calls, ['image','document'])
  await assert.rejects(vision({ extension: 'pdf', bytes: Buffer.from('%PDF-'), pageCount: 21 }), /opptil 20 sider/)
})

const payload = { answer: {
  summary: 'Opprinnelig sammendrag', findings: [], uncertainties: [], recommendation: null,
  deliverables: { title: 'Budsjett', formats: ['pdf'], sections: [{ heading: 'Behold', paragraphs: ['Opprinnelig tekst'], sourceIds: ['k'] }],
    scenario: { title: 'Nytt scenario', unit: 'kr', items: [{ label: 'Grunnskole', base: 120, percent: 10, min: -20, max: 20 }], sourceIds: ['k'] } },
}, sources: [{ id: 'k', title: 'Kilde', url: 'https://fellestall.no/' }] }

test('en revisjon beholder de avtalte delene og avviser scenario uten tallgrunnlag', () => {
  const prior = revisionContext(payload)
  assert(prior)
  const revised = mergeRevision(prior, { summary: 'Oppdatert sammendrag', deliverables: { formats: ['pdf', 'pptx'] } })
  assert.equal(revised.summary, 'Oppdatert sammendrag')
  assert.deepEqual(revised.deliverables.sections, prior.answer.deliverables.sections)
  assert.deepEqual(revised.deliverables.scenario, prior.answer.deliverables.scenario)
  assert.equal(normalizeScenario(revised.deliverables.scenario, new Set(['annen'])), null)
})

test('Sven kan gjenbruke prosjektvedlegg, kjøre kode og revidere en eksisterende versjon', async () => {
  const calls = []
  const pack = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] })
  const requestFor = prior => hostedPreview({ environment: 'preview', apiKey: 'test',
    createRequest: () => async ({ phase, input }) => {
      calls.push(phase)
      const dto = JSON.parse(input)
      if (phase === 'interpret') {
        if (prior) assert.equal(dto.prior.title, 'Budsjett')
        else assert.equal(dto.uploads[0].title, 'analyse.csv')
        return pack({ action: 'research', tools: prior?['versions']:['uploads','compute'],
          intent: { request: 'Bearbeid', purpose: 'Rapport', meaning: 'Korriger rapporten.' },
          plan: { scope: 'Tall', questions: ['Hva viser tallene?'], searches: [], counterSearch: '', missing: [] } })
      }
      if (phase === 'compute-code') {
        assert.equal(dto.sources[0].id, 'prosjektfil-1')
        return pack({ code: 'function analyze(inputs) { return +inputs[0].text * 2 }', method: 'Doblet oppgitt beløp' })
      }
      if (phase === 'answer-0') {
        if (!prior) assert.equal(JSON.parse(dto.sources.find(source => source.id === 'sven-beregning').text).value, 36)
        return pack(prior ? { summary: 'Ny tittel i sammendrag' } : { summary: 'Summen er 36',
          findings: [{ text: 'Doblet 18 til 36', sourceIds: ['sven-beregning'] }], uncertainties: [], recommendation: null })
      }
      assert.equal(phase, 'review-0')
      if (prior) assert.equal(dto.answer.deliverables.sections[0].heading, 'Behold')
      return pack({ passed: true, issues: [] })
    },
  })
  const res = { setHeader(){}, status(code){ this.code = code; return this }, json(body){ return { code:this.code, body } } }
  const headers = { host: 'preview.test', origin: 'https://preview.test', 'content-type': 'application/json' }
  for (const prior of [false,true]) {
    const preview = requestFor(prior)
    const requestId = randomBytes(32).toString('hex')
    const post = body => preview({ method:'POST', headers, body: { ...body, requestId } }, res)
    let result = await post(prior ? { question: 'Endre sammendraget', revision: payload } :
      { question: 'Dobbel beløpet i prosjektfilen', projectFiles: [{ name: 'analyse.csv', text: '18' }] })
    for (let i = 0; result.code === 202 && i < 10; i++) result = await post({ resume: true })
    assert.equal(result.code, 200)
    if (prior) assert.equal(result.body.deliverables.sections[0].heading, 'Behold')
    else assert.equal(result.body.sources[0].type, 'calculation')
  }
  assert.deepEqual(calls, ['interpret','compute-code','answer-0','review-0','interpret','answer-0','review-0'])
})
