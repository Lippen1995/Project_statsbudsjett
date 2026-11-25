import { fromBuffer } from 'yauzl'
import { SaxesParser } from 'saxes'
import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'

export const maxUploadBytes = 2 * 1024 * 1024
const maxChars = 24_000
const uploadTypes = new Set(['csv', 'tsv', 'txt', 'md', 'xlsx', 'docx', 'pptx', 'pdf'])
const maxZipPayload = 24 * 1024 * 1024

function unzipOffice(bytes, wanted) {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, archive) => {
      if (error) return reject(error)
      let entries = 0
      let total = 0
      const extracted = new Map()
      const fail = failure => { archive.close(); reject(failure) }
      archive.once('error', fail)
      archive.once('end', () => resolve(extracted))
      archive.on('entry', entry => {
        total += entry.uncompressedSize
        if (++entries > 1600 || total > maxZipPayload || entry.isEncrypted()) {
          fail(new Error('Office-filen er for stor eller passordbeskyttet.'))
          return
        }
        if (!wanted(entry.fileName)) return archive.readEntry()
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(streamError)
          const chunks = []
          stream.on('data', chunk => chunks.push(chunk))
          stream.once('error', fail)
          stream.once('end', () => {
            extracted.set(entry.fileName, Buffer.concat(chunks).toString('utf8'))
            archive.readEntry()
          })
        })
      })
      archive.readEntry()
    })
  })
}

function officeParagraphs(xml, namespace) {
  const result = []
  const parser = new SaxesParser({ xmlns: false })
  let reading = false
  let line = ''
  parser.on('doctype', () => { throw new Error('Det er ikke mulig å lese dette Office-formatet.') })
  parser.on('opentag', tag => {
    if (tag.name === namespace + ':t') reading = true
    if ([namespace + ':tab', namespace + ':br'].includes(tag.name)) line += ' '
  })
  parser.on('text', value => { if (reading) line += value })
  parser.on('closetag', tag => {
    if (tag.name === namespace + ':t') reading = false
    if (tag.name === namespace + ':p' && line.trim()) {
      result.push(line.trim())
      line = ''
    }
  })
  parser.write(xml).close()
  return result.join('\n')
}

function tabSeparated(rows) {
  return rows.map(row => row.map(value => String(value ?? '').replace(/[\r\n\t]+/g, ' ')).join('\t')).join('\n')
}

function cellValue(cell) {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  if (typeof cell !== 'object' || cell == null) return cell
  if ('result' in cell) return cellValue(cell.result)
  if (Array.isArray(cell.richText)) return cell.richText.map(part => part.text).join('')
  return cell.text ?? null
}

async function workbookText(bytes) {
  const parts = await unzipOffice(bytes, name => name === 'xl/workbook.xml')
  if (!parts.has('xl/workbook.xml')) throw new Error('Jeg fant ikke et regneark i filen.')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes, { ignoreNodes: ['drawing', 'oleObjects', 'hyperlinks', 'conditionalFormatting'] })
  let text = ''
  let partial = false
  for (const sheet of workbook.worksheets) {
    const lines = []
    let sheetLength = 0
    sheet.eachRow(row => {
      if (text.length + sheetLength > maxChars) {
        partial = true
        return
      }
      const values = []
      const width = Math.min(row.cellCount, 80)
      if (row.cellCount > width) partial = true
      for (let column = 1; column <= width; column++) values.push(cellValue(row.getCell(column).value))
      const line = tabSeparated([values])
      lines.push(line)
      sheetLength += line.length + 1
    })
    text += `\nArk: ${sheet.name}\n${lines.join('\n')}\n`
    if (text.length > maxChars) return { text, partial: true }
  }
  return { text, partial }
}

function csvText(text, extension) {
  const first = text.split(/\r?\n/, 1)[0]
  const delimiter = extension === 'tsv' ? '\t' : first.includes(';') ? ';' : first.includes('\t') ? '\t' : ','
  const records = parse(text, { bom: true, delimiter, relax_column_count: true, skip_empty_lines: true, max_record_size: 150_000 })
  return tabSeparated(records)
}

async function pdfText(bytes) {
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Filen ser ikke ut som en PDF.')
  const { getDocumentProxy } = await import('unpdf')
  const document = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, useSystemFonts: false })
  try {
    let text = ''
    let page = 1
    for (; page <= Math.min(document.numPages, 80) && text.length < maxChars; page++) {
      const contents = await (await document.getPage(page)).getTextContent()
      const pageText = contents.items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('')
      if (pageText?.trim()) text += `Side ${page}\n${pageText}\n\n`
    }
    return { text, partial: page <= document.numPages }
  } finally {
    await document.loadingTask.destroy()
  }
}

export async function extractUpload(name, bytes) {
  if (typeof name !== 'string' || name.length > 180 || /[\\/\x00-\x1f]/.test(name)) {
    throw new Error('Vedlegget må ha et gyldig filnavn.')
  }
  const type = name.split('.').at(-1).toLowerCase()
  if (!uploadTypes.has(type) || !bytes.length || bytes.length > maxUploadBytes) {
    throw new Error('Velg Excel, Word, PowerPoint, PDF, CSV, TSV eller tekst opptil 2 MB.')
  }
  let text, partial = false
  if (type === 'xlsx') ({ text, partial } = await workbookText(bytes))
  else if (type === 'pdf') ({ text, partial } = await pdfText(bytes))
  else if (type === 'docx') {
    const parts = await unzipOffice(bytes, file => file === 'word/document.xml')
    if (parts.size) text = officeParagraphs(parts.get('word/document.xml'), 'w')
  } else if (type === 'pptx') {
    const parts = await unzipOffice(bytes, file => /^ppt\/slides\/slide\d+\.xml$/.test(file))
    text = [...parts].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([, xml], index) => `Lysbilde ${index + 1}\n${officeParagraphs(xml, 'a')}`).join('\n\n')
  } else {
    const raw = new TextDecoder().decode(bytes)
    const decoded = raw.includes('\ufffd') ? new TextDecoder('windows-1252').decode(bytes) : raw
    if (decoded.includes('\0')) throw new Error('Filen inneholder binært innhold.')
    text = ['csv', 'tsv'].includes(type) ? csvText(decoded, type) : decoded
  }
  text = text?.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim()
  if (!text) throw new Error(type === 'pdf'
    ? 'PDF-en inneholder ingen lesbar tekst. Bruk en PDF med tekstlag eller send tallene som Excel.'
    : 'Jeg fant ingen lesbar tekst eller celler i vedlegget.')
  if (text.length > maxChars) {
    const lastLine = text.lastIndexOf('\n', maxChars)
    text = text.slice(0, lastLine > maxChars * 0.8 ? lastLine : maxChars)
    partial = true
  }
  return { name, text, partial }
}
