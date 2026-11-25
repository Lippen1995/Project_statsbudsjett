import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { validateChart } from './charts.mjs'
import { calculationFormula, tableFromChart, tableFromMap, validateDeliverables } from './deliverables.mjs'
import { mapAttribution, restoreMapGeometry } from './municipal-map.mjs'
import { allFigures, displayValue, green, ink, muted, paper, seriesColors, splitText } from './file-figures.mjs'

export const fileTypes = Object.freeze({
  csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', svg: 'image/svg+xml',
})
const excelFormats = ['csv', 'xlsx']
const clean = text => text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
const asText = (value, size) => typeof value === 'string' ? clean(value).trim().slice(0, size) : ''
const fill = 'E3EFE9'
const color = hex => hex.slice(1).toUpperCase()
const columnLabel = ({ label, unit }) => unit ? `${label} (${unit})` : label
const tableRows = table => table.rows.map((row, index) => [...row, ...(table.derived[index] ?? [])])
const regularFont = fileURLToPath(new URL('./assets/libre-franklin-regular.ttf', import.meta.url))
const boldFont = fileURLToPath(new URL('./assets/libre-franklin-bold.ttf', import.meta.url))

function httpsUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.href.length <= 1800 ? parsed.href : undefined
  } catch { return undefined }
}

function exportSource({ id, title, url, type }) {
  title = asText(title, 300)
  id = asText(id, 180)
  const href = httpsUrl(url)
  if (!id || !title || (!href && type !== 'upload')) return null
  return { id, title, ...(href ? { url: href } : {}) }
}

export function normalizeExport(format, payload) {
  if (!Object.hasOwn(fileTypes, format) || !payload || !Array.isArray(payload.sources) || payload.sources.length > 100) return null
  const sources = payload.sources.map(source => source && exportSource(source)).filter(Boolean)
  const ids = new Set(sources.map(({ id }) => id))
  const chart = validateChart(payload.chart, ids)
  const summary = asText(payload.summary, 6000)
  const title = asText(payload.deliverables?.title, 180) || chart?.title || 'Analyse fra Sven'
  const kit = validateDeliverables({ ...payload.deliverables, title, formats: [format] }, ids, { hasChart: Boolean(chart) })
  if (!kit?.formats.includes(format)) return null
  if (kit.map) {
    kit.map = restoreMapGeometry(kit.map, payload.deliverables.map)
    if (kit.map.areas.some(area => area.path)) sources.push({ id: 'kartverket-geometri', ...mapAttribution })
  }
  const table = kit.table ?? (chart ? tableFromChart(chart) : kit.map ? tableFromMap(kit.map) : null)
  if (excelFormats.includes(format) && !table) return null
  const findings = Array.isArray(payload.findings) ? payload.findings.slice(0, 40).flatMap(item => {
    const text = asText(item?.text, 2400)
    return text ? [{ text, sourceIds: Array.isArray(item.sourceIds) ? item.sourceIds.filter(id => ids.has(id)) : [] }] : []
  }) : []
  const recommendation = asText(payload.recommendation?.text, 2400)
  const uncertainties = Array.isArray(payload.uncertainties) ? payload.uncertainties.slice(0, 25).map(value => asText(value, 900)).filter(Boolean) : []
  if (!(summary || table || kit.sections.length || kit.illustration || kit.map)) return null
  return { title, summary, findings, uncertainties, kit, table, sources, chart,
    recommendation: recommendation ? { text: recommendation, sourceIds: (Array.isArray(payload.recommendation.sourceIds)
      ? payload.recommendation.sourceIds : []).filter(id => ids.has(id)) } : null }
}

function citations(document, ids) {
  return [...new Set(ids ?? [])].map(id => document.sources.findIndex(source => source.id === id) + 1)
    .filter(Boolean).map(index => `[${index}]`).join(' ')
}
const withCitations = (document, text, ids) => [text, citations(document, ids)].filter(Boolean).join(' ')

function proseSections(document) {
  const sections = document.kit.sections.map(section => ({ heading: section.heading,
    paragraphs: section.paragraphs.map(paragraph => withCitations(document, paragraph, section.sourceIds)) }))
  if (document.findings.length) sections.unshift({ heading: 'Hovedfunn', paragraphs: document.findings.map(finding =>
    withCitations(document, finding.text, finding.sourceIds)) })
  if (document.recommendation) sections.push({ heading: 'Anbefaling', paragraphs: [withCitations(document, document.recommendation.text, document.recommendation.sourceIds)] })
  if (document.uncertainties.length) sections.push({ heading: 'Forbehold', paragraphs: document.uncertainties })
  return sections
}

function csvCell(value) {
  if (typeof value === 'number') return String(value).replace('.', ',')
  const text = String(value ?? '')
  const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text
  return /[;\n\r"]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe
}

function csvFile({ table }) {
  const columns = [...table.columns, ...table.calculations].map(columnLabel)
  return Buffer.from('\uFEFF' + [columns, ...tableRows(table)].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n')
}

async function xlsxFile(document) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Fellestall · Sven'
  workbook.title = document.title
  workbook.calcProperties.fullCalcOnLoad = true
  const { table } = document
  const data = workbook.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] })
  data.addRow(table.columns.map(columnLabel))
  data.addRows(table.rows)
  styleSheet(data)
  data.autoFilter = { from: 'A1', to: data.getRow(1).getCell(table.columns.length).address }

  if (table.calculations.length) {
    const calculations = workbook.addWorksheet('Beregninger', { views: [{ state: 'frozen', ySplit: 1 }] })
    calculations.addRow([...table.columns, ...table.calculations].map(columnLabel))
    for (let index = 0; index < table.rows.length; index++) {
      const ref = column => 'Data!' + data.getRow(index + 2).getCell(column + 1).address
      const raw = table.rows[index].map((value, column) => ({ formula: `IF(ISBLANK(${ref(column)}),"",${ref(column)})`, result: value ?? '' }))
      const formulas = table.calculations.map((calculation, column) => ({
        formula: calculationFormula(calculation, ref), result: table.derived[index][column] ?? '',
      }))
      calculations.addRow([...raw, ...formulas])
    }
    for (const [index, calculation] of table.calculations.entries()) {
      const column = calculations.getColumn(table.columns.length + index + 1)
      column.numFmt = calculation.unit === '%' ? '#,##0.00" %"' : '#,##0.00'
    }
    styleSheet(calculations)
  }

  const sources = workbook.addWorksheet('Kilder og merknader')
  sources.addRow(['Del', 'Beskrivelse', 'Lenke'])
  sources.addRow(['Tittel', document.title])
  sources.addRow(['Tabell', withCitations(document, table.title, table.sourceIds)])
  if (document.summary) sources.addRow(['Sammendrag', document.summary])
  for (const [index, source] of document.sources.entries()) {
    sources.addRow([`[${index + 1}]`, source.title, source.url ? { hyperlink: source.url, text: source.url } : null])
  }
  for (const text of document.uncertainties) sources.addRow(['Forbehold', text])
  for (const calculation of table.calculations) {
    sources.addRow(['Beregning', `${columnLabel(calculation)} · ${calculation.columns.map(index => columnLabel(table.columns[index])).join(' / ')}`])
  }
  styleSheet(sources)
  sources.getColumn(2).width = 66
  sources.getColumn(3).width = 48
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function styleSheet(sheet) {
  const head = sheet.getRow(1)
  head.height = 24
  head.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color(green) } }
    cell.alignment = { wrapText: true, vertical: 'middle' }
  })
  sheet.columns.forEach(column => {
    const lengths = column.values.filter(value => typeof value === 'string').map(value => value.length)
    column.width = Math.max(15, Math.min(45, Math.max(...lengths, 0) + 3))
  })
}

const figureDescription = figure => figure.title
async function renderPng(figure) {
  const { Resvg } = await import('@resvg/resvg-js')
  return new Resvg(figure.svg, { fitTo: { mode: 'width', value: 960 },
    font: { loadSystemFonts: false, fontFiles: [regularFont, boldFont], defaultFontFamily: 'Libre Franklin' } }).render().asPng()
}

async function docxFile(document) {
  const { Document, Packer, HeadingLevel, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
    PageOrientation, ExternalHyperlink, ImageRun } = await import('docx')
  const text = value => new Paragraph({ text: clean(value) })
  const heading = value => new Paragraph({ text: clean(value), heading: HeadingLevel.HEADING_1 })
  const children = [new Paragraph({ text: document.title, heading: HeadingLevel.TITLE })]
  if (document.summary) children.push(text(document.summary))
  for (const section of proseSections(document)) children.push(heading(section.heading), ...section.paragraphs.map(text))
  for (const figure of allFigures(document)) {
    const width = Math.min(550, 530 * 640 / figure.height)
    children.push(heading(withCitations(document, figure.title, figure.sourceIds)), new Paragraph({
      children: [new ImageRun({ type: 'svg', data: Buffer.from(figure.svg),
        fallback: { type: 'png', data: await renderPng(figure) }, transformation: { width, height: width * figure.height / 640 },
        altText: { title: figure.title, description: figureDescription(figure), name: 'Fellestall' } })],
    }))
  }
  if (document.table) {
    const table = document.table
    children.push(heading(withCitations(document, table.title, table.sourceIds)))
    const row = (values, tableHeader = false) => new TableRow({ tableHeader, cantSplit: true,
      children: values.map(value => new TableCell({ ...(tableHeader ? { shading: { fill } } : {}),
        margins: { top: 65, bottom: 65, left: 75, right: 75 }, children: [new Paragraph({
          children: [new TextRun({ text: clean(displayValue(value)), bold: tableHeader, size: 19 })],
        })],
      })) })
    const labels = [...table.columns, ...table.calculations].map(columnLabel)
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      row(labels, true), ...tableRows(table).map(values => row(values)),
    ] }))
  }
  if (document.sources.length) {
    children.push(heading('Kilder'))
    document.sources.forEach((source, index) => {
      const label = `[${index + 1}] ${source.title}`
      children.push(source.url ? new Paragraph({ children: [new ExternalHyperlink({ link: source.url,
        children: [new TextRun({ text: label, style: 'Hyperlink' })] })] }) : text(label))
    })
  }
  const wide = document.table && document.table.columns.length + document.table.calculations.length > 6
  return Packer.toBuffer(new Document({ creator: 'Fellestall · Sven', title: document.title,
    sections: [{ properties: wide ? { page: { size: { orientation: PageOrientation.LANDSCAPE } } } : {}, children }],
  }))
}

async function pdfFile(document) {
  const [{ default: PDFDocument }, { default: svgToPdf }, regular, bold] = await Promise.all([
    import('pdfkit'), import('svg-to-pdfkit'), readFile(regularFont), readFile(boldFont),
  ])
  const wide = document.table && document.table.columns.length + document.table.calculations.length > 6
  const pdf = new PDFDocument({ size: 'A4', layout: wide ? 'landscape' : 'portrait', margin: 45,
    lang: 'nb-NO', info: { Title: document.title, Author: 'Fellestall · Sven' } })
  pdf.registerFont('SvenBody', regular)
  pdf.registerFont('SvenBold', bold)
  const chunks = []
  const bytes = new Promise((resolve, reject) => {
    pdf.on('data', data => chunks.push(data))
    pdf.once('error', reject)
    pdf.once('end', () => resolve(Buffer.concat(chunks)))
  })
  function ensure(height) {
    if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom) pdf.addPage()
  }
  const paragraph = value => pdf.font('SvenBody').fontSize(11).fillColor(ink).text(clean(value), { lineGap: 2, paragraphGap: 9 })
  const heading = value => {
    ensure(55)
    pdf.moveDown(0.4).font('SvenBold').fillColor(green).fontSize(15).text(clean(value), { paragraphGap: 7 })
  }
  pdf.font('SvenBold').fontSize(26).fillColor(green).text(document.title, { paragraphGap: 12 })
  if (document.summary) paragraph(document.summary)
  for (const section of proseSections(document)) {
    heading(section.heading)
    section.paragraphs.forEach(paragraph)
  }
  for (const figure of allFigures(document)) {
    const usable = pdf.page.width - 2 * pdf.page.margins.left
    const width = Math.min(usable, 330 * 640 / figure.height)
    const height = width * figure.height / 640
    ensure(height + 60)
    heading(withCitations(document, figure.title, figure.sourceIds))
    const top = pdf.y
    svgToPdf(pdf, figure.svg, (pdf.page.width - width) / 2, top, { width, height, assumePt: true,
      fontCallback: (_family, bold) => bold ? 'SvenBold' : 'SvenBody' })
    pdf.y = top + height + 8
  }
  if (document.table) {
    const table = document.table
    const labels = [...table.columns, ...table.calculations].map(columnLabel)
    const margin = pdf.page.margins.left
    const width = (pdf.page.width - 2 * margin) / labels.length
    const border = '#dcd6ca'
    function row(values, header = false) {
      pdf.font(header ? 'SvenBold' : 'SvenBody').fontSize(labels.length > 10 ? 7.5 : 9)
      const cells = values.map(value => clean(displayValue(value)))
      const height = Math.max(19, ...cells.map(value => pdf.heightOfString(value, { width: width - 8 }) + 8))
      if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom && !header) {
        pdf.addPage()
        row(labels, true)
      }
      const y = pdf.y
      if (header) pdf.rect(margin, y, width * labels.length, height).fill('#' + fill)
      pdf.fillColor(ink)
      cells.forEach((value, index) => pdf.text(value, margin + width * index + 4, y + 4,
        { width: width - 8, height: height - 6, ellipsis: true }))
      pdf.moveTo(margin, y + height).lineTo(margin + width * labels.length, y + height).strokeColor(border).stroke()
      pdf.x = margin
      pdf.y = y + height
    }
    heading(withCitations(document, table.title, table.sourceIds))
    row(labels, true)
    tableRows(table).forEach(values => row(values))
  }
  if (document.sources.length) {
    heading('Kilder')
    document.sources.forEach((source, index) => {
      const value = `[${index + 1}] ${source.title}`
      pdf.font('SvenBody').fontSize(10).fillColor(green).text(value, { ...(source.url ? { link: source.url, underline: true } : {}), paragraphGap: 4 })
    })
  }
  pdf.end()
  return bytes
}

async function pptxFile(document) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const deck = new PptxGenJS()
  deck.layout = 'LAYOUT_WIDE'
  deck.author = 'Fellestall · Sven'
  deck.title = document.title
  deck.lang = 'nb-NO'
  const accents = seriesColors.map(color)
  const width = 13.33
  const margin = 0.65
  const usable = width - margin * 2
  function page(title, ids = []) {
    const slide = deck.addSlide()
    slide.background = { color: color(paper) }
    slide.addText(title, { x: margin, y: 0.38, w: usable, h: 0.78, fontFace: 'Georgia', fontSize: title.length > 100 ? 22 : 28,
      bold: true, color: color(ink), valign: 'mid', margin: 0 })
    slide.addShape(deck.ShapeType.line, { x: margin, y: 1.22, w: usable, h: 0, line: { color: color(green), width: 1.25 } })
    slide.addText(['Fellestall · Sven', citations(document, ids)].filter(Boolean).join('    '), {
      x: margin, w: usable, y: 7, h: 0.26, margin: 0, color: color(muted), fontSize: 10,
    })
    if (ids.length) slide.addNotes(document.sources.filter(({ id }) => ids.includes(id)).map(source => [source.title, source.url].filter(Boolean).join(' — ')))
    return slide
  }
  function prose(title, paragraphs) {
    const lines = paragraphs.flatMap(paragraph => [...splitText(paragraph, 96), ''])
    for (let start = 0; start < lines.length; start += 11) {
      const slide = page(start ? title + ' (forts.)' : title)
      slide.addText(lines.slice(start, start + 11).join('\n'), { x: margin, y: 1.52, w: usable, h: 5.2,
        margin: 0, fontSize: 19, fontFace: 'Aptos', color: color(ink), valign: 'top', breakLine: false })
    }
  }
  if (document.summary) prose(document.title, [document.summary])
  else page(document.title)
  for (const section of proseSections(document)) prose(section.heading, section.paragraphs)
  if (document.chart) {
    const chart = document.chart
    const slide = page(chart.title, chart.sourceIds)
    slide.addChart(chart.type === 'line' ? deck.ChartType.line : deck.ChartType.bar,
      chart.series.map((name, index) => ({ name, labels: chart.rows.map(row => row.label), values: chart.rows.map(row => row.values[index]) })),
      { x: margin, y: 1.4, w: usable, h: 5.45, showLegend: chart.series.length > 1, showCatName: false,
        chartColors: accents, showValAxisTitle: true, valAxisTitle: chart.unit, displayBlanksAs: 'gap',
        catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, showMarker: chart.type === 'line', barDir: 'col',
        catAxisLabelRotate: chart.rows.length > 10 ? -35 : 0, lineSize: 2.5,
      })
  }
  const figures = allFigures({ ...document, chart: null })
  for (const figure of figures) {
    const slide = page(figure.title, figure.sourceIds)
    const h = Math.min(5.4, usable * figure.height / 640)
    const w = h * 640 / figure.height
    slide.addImage({ data: 'data:image/png;base64,' + (await renderPng(figure)).toString('base64'),
      x: (width - w) / 2, y: 1.42, w, h, altText: figure.title })
  }
  if (document.table) {
    const table = document.table
    const labels = [...table.columns, ...table.calculations].map(columnLabel)
    const rows = tableRows(table)
    for (let start = 0; start < rows.length; start += 8) {
      const slide = page(start ? table.title + ' (forts.)' : table.title, table.sourceIds)
      slide.addTable([labels.map(label => ({ text: label, options: { bold: true, fill: { color: fill } } })),
        ...rows.slice(start, start + 8).map(row => row.map(value => {
          const content = displayValue(value)
          return content.length > 120 ? content.slice(0, 119) + '…' : content
        }))],
      { x: margin, y: 1.48, w: usable, h: 5.12, border: { color: 'DCD6CA', pt: 0.75 }, margin: 0.06,
        fontSize: labels.length > 10 ? 8 : 12, color: color(ink), autoPage: true, newSlideStartY: 0.5,
        autoPageRepeatHeader: true, autoPageHeaderRows: 1, verbose: false })
    }
  }
  if (document.sources.length) {
    for (let start = 0; start < document.sources.length; start += 7) {
      const slide = page(start ? 'Kilder (forts.)' : 'Kilder')
      document.sources.slice(start, start + 7).forEach((source, index) => slide.addText(`[${start + index + 1}] ${source.title}`, {
        x: margin, w: usable, y: 1.48 + index * 0.67, h: 0.58, margin: 0, color: color(green), fontSize: 15,
        ...(source.url ? { hyperlink: { url: source.url } } : {}),
      }))
    }
  }
  return Buffer.from(await deck.write({ outputType: 'nodebuffer' }))
}

export async function exportFile(format, document) {
  switch (format) {
    case 'csv': return csvFile(document)
    case 'xlsx': return xlsxFile(document)
    case 'docx': return docxFile(document)
    case 'pdf': return pdfFile(document)
    case 'pptx': return pptxFile(document)
    case 'svg': {
      const figure = allFigures({ ...document, chart: document.kit.illustration || document.kit.map?.areas.some(area => area.path) ? null : document.chart })[0]
      if (!figure) throw new Error('Ingen illustrasjon å laste ned.')
      return Buffer.from(figure.svg)
    }
  }
}
