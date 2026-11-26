import { posix } from 'node:path'
import { SaxesParser } from 'saxes'
import JSZip from 'jszip'
import { normalizeOfficeEdit } from './advanced-tools.mjs'
import { escapeXml } from './file-figures.mjs'

const pptNs = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const drawNs = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const sheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relationshipNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelNs = 'http://schemas.openxmlformats.org/package/2006/relationships'
const nsName = (tag, ns, local) => (tag.uri === ns || tag.uri === ns.replace('http://schemas.openxmlformats.org/', 'http://purl.oclc.org/ooxml/')) && tag.local === local
const attr = (tag, key, uri = '') => Object.values(tag.attributes).find(item => item.local === key && (!uri || item.uri === uri))?.value

function elements(xml, kinds) {
  const result = []
  const parser = new SaxesParser({ xmlns: true })
  const stack = []
  let captured = null
  parser.on('doctype', () => { throw new Error('Ugyldig Office-dokument') })
  parser.on('opentag', tag => {
    const kind = kinds(tag, stack.at(-1)?.tag)
    const start = xml.lastIndexOf('<', parser.position - 1)
    const entry = kind ? { tag, kind, start, contentStart: parser.position, text: '', parent: captured } : null
    if (entry) { captured = entry; result.push(entry) }
    stack.push({ tag, entry })
  })
  parser.on('text', text => { if (captured?.kind === 'text') captured.text += text })
  parser.on('closetag', tag => {
    const { entry } = stack.pop()
    if (!entry) return
    entry.contentEnd = tag.isSelfClosing ? entry.contentStart : xml.lastIndexOf('<', parser.position - 1)
    entry.end = parser.position
    captured = entry.parent
  })
  parser.write(xml).close()
  return result
}

function orderedPaths(parts, manifest, path, kind, ns, parentLocal, fileRoot, directory) {
  const manifestText = parts.get(manifest)
  const relationText = parts.get(path)
  if (!manifestText || !relationText) return []
  const rels = new Map(elements(relationText, tag => nsName(tag, packageRelNs, 'Relationship') ? 'rel' : '')
    .filter(({ tag }) => attr(tag, 'TargetMode') !== 'External')
    .map(({ tag }) => [attr(tag, 'Id'), attr(tag, 'Target')]))
  return elements(manifestText, (tag, parent) => nsName(tag, ns, kind) && parent?.local === parentLocal ? kind : '')
    .map(({ tag }) => {
      const relationshipId = attr(tag, 'id', relationshipNs) ?? Object.values(tag.attributes)
        .find(item => item.local === 'id' && item.uri.endsWith('/relationships'))?.value
      const target = rels.get(relationshipId)
      if (!target || target.includes('\\') || /[:?#]/.test(target)) return null
      const name = target.startsWith('/') ? posix.normalize(target.slice(1)) : posix.normalize(posix.join(fileRoot, target))
      return name.startsWith(directory) && parts.has(name) ? { name, label: attr(tag, 'name') } : null
    })
}

export function relatedOfficeParts(name) {
  return name === '[Content_Types].xml' || /^(?:ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/[^/]+\.xml)|word\/document\.xml|xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml|sharedStrings\.xml))$/.test(name)
}

function textTargets(xml, shapeNs, shape, textNs) {
  const entries = elements(xml, tag => nsName(tag, shapeNs, shape) ? 'target' : nsName(tag, textNs, 't') ? 'text' : '')
  const groups = new Map(entries.filter(item => item.kind === 'target').map(item => [item, []]))
  for (const item of entries) {
    if (item.kind === 'text' && item.parent) groups.get(item.parent)?.push(item)
  }
  return [...groups.values()].filter(fields => fields.length)
}

const slidesInOrder = parts => orderedPaths(parts, 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels', 'sldId', pptNs, 'sldIdLst',
  'ppt', 'ppt/slides/')

export function readPresentationText(parts, readText) {
  return slidesInOrder(parts).flatMap((slide, index) => slide ? [
    `Lysbilde ${index + 1}\n` + readText(parts.get(slide.name)),
  ] : []).join('\n\n')
}

function officeTargets(parts, format, inspectAll = false) {
  if (format === 'pptx') {
    return slidesInOrder(parts).flatMap((slide, index) => slide
      ? textTargets(parts.get(slide.name), pptNs, 'sp', drawNs).map((fields, position) =>
        ({ id: `lys-${index + 1}-felt-${position + 1}`, name: slide.name, fields, label: `Lysbilde ${index + 1}` }))
      : [])
  }
  if (format === 'docx') {
    const name = 'word/document.xml'
    return parts.has(name) ? textTargets(parts.get(name), wordNs, 'p', wordNs)
      .map((fields, index) => ({ id: `avsnitt-${index + 1}`, name, fields, label: 'Word' })) : []
  }
  if (format === 'xlsx') {
    const shared = parts.has('xl/sharedStrings.xml') ? textTargets(parts.get('xl/sharedStrings.xml'), sheetNs, 'si', sheetNs)
      .map(fields => fields.map(field => field.text).join('')) : []
    return orderedPaths(parts, 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'sheet', sheetNs, 'sheets', 'xl',
      'xl/worksheets/').flatMap((sheet, index) => {
      if (!sheet) return []
      const xml = parts.get(sheet.name)
      const entries = elements(xml, tag => nsName(tag, sheetNs, 'c') ? 'cell' : ['t', 'v', 'f'].includes(tag.local) ? 'text' : '')
      const contents = new Map()
      for (const item of entries) if (item.kind === 'text' && item.parent?.kind === 'cell') {
        const cells = contents.get(item.parent) ?? []
        cells.push(item)
        contents.set(item.parent, cells)
      }
      const cells = entries.filter(({ tag, kind }) => kind === 'cell' && /^[A-Z]{1,3}[1-9]\d{0,6}$/.test(attr(tag, 'r')))
      return (inspectAll ? cells : cells.slice(0, 110)).map(cell => {
        const fields = contents.get(cell) ?? []
        const value = itemValue(fields, shared, attr(cell.tag, 't'))
        return { id: `ark-${index + 1}-${attr(cell.tag, 'r')}`, name: sheet.name, cell, label: sheet.label ?? `Ark ${index + 1}`, value }
      })
    })
  }
  return []
}

function itemValue(fields, shared, type) {
  const values = fields.filter(field => field.tag.local !== 'f')
  const content = values.map(field => field.text).join('')
  return type === 's' ? shared[Number(content)] ?? '' : content
}

export function describeOfficeParts(parts, format) {
  const fields = officeTargets(parts, format).slice(0, 150)
  return fields.map(({ id, fields, value, label }) => `[${id}] ${label}: ${(value ?? fields?.map(field => field.text).join('') ?? '').slice(0, 280)}`)
    .join('\n').slice(0, 10_000)
}

function cellReplacement(xml, cell, value) {
  const opening = xml.slice(cell.start, cell.contentStart).replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/, '').replace(/\s*\/?>$/, '')
  const prefix = cell.tag.prefix ? cell.tag.prefix + ':' : ''
  const close = `</${cell.tag.name}>`
  if (value === null) return opening + '/>'
  if (typeof value === 'number') return opening + `><${prefix}v>${value}</${prefix}v>` + close
  return opening + ` t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${escapeXml(value)}</${prefix}t></${prefix}is>` + close
}

function textEdits(fields, value) {
  return fields.flatMap((field, index) => {
    const text = index === 0 ? escapeXml(value) : ''
    if (field.tag.isSelfClosing) return text ? [{ start: field.start, end: field.end,
      text: `<${field.tag.name} xml:space="preserve">${text}</${field.tag.name}>` }] : []
    return [{ start: field.contentStart, end: field.contentEnd, text }]
  })
}

function applyEdits(xml, edits) {
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) xml = xml.slice(0, start) + text + xml.slice(end)
  return xml
}

function appendElement(xml, name, fragment) {
  const node = elements(xml, tag => tag.local === name ? 'destination' : '')[0]
  if (!node || node.tag.isSelfClosing) throw new Error('Filendringen kan ikke legge til lysbildet i denne presentasjonen.')
  return xml.slice(0, node.contentEnd) + fragment(node.tag.prefix ? node.tag.prefix + ':' : '') + xml.slice(node.contentEnd)
}

function recalculateWorkbook(xml) {
  const properties = elements(xml, tag => nsName(tag, sheetNs, 'calcPr') ? 'calculation' : '')[0]
  const settings = ' calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"'
  if (!properties) return appendElement(xml, 'workbook', prefix => `<${prefix}calcPr${settings}/>`)
  const raw = xml.slice(properties.start, properties.contentStart)
    .replace(/\s+(?:calcMode|fullCalcOnLoad|forceFullCalc)\s*=\s*(?:"[^"]*"|'[^']*')/g, '')
  const updated = raw.replace(/(\/?>)$/, settings + '$1')
  return xml.slice(0, properties.start) + updated + xml.slice(properties.contentStart)
}

async function appendPowerPoint(zip, parts, addition, targets) {
  const manifestKey = 'ppt/presentation.xml'
  const relKey = 'ppt/_rels/presentation.xml.rels'
  const typesKey = '[Content_Types].xml'
  let manifest = parts.get(manifestKey), relations = parts.get(relKey), types = parts.get(typesKey)
  if (!manifest || !relations || !types) throw new Error('Filendringen mangler presentasjonens innholdsliste.')
  let id = Math.max(255, ...elements(manifest, tag => nsName(tag, pptNs, 'sldId') ? 'id' : '')
    .map(({ tag }) => Number(attr(tag, 'id'))).filter(Number.isInteger))
  let relId = Math.max(0, ...elements(relations, tag => nsName(tag, packageRelNs, 'Relationship') ? 'rel' : '')
    .map(({ tag }) => Number(attr(tag, 'Id')?.match(/^rId(\d+)$/)?.[1])).filter(Number.isInteger))
  let seq = 0
  for (const slide of addition) {
    const template = targets.get(slide.edits[0].target)?.name
    if (!template || !slide.edits.every(edit => targets.get(edit.target)?.name === template)) {
      throw new Error('Filendringen viser til et felt som ikke finnes i lysbildemalen.')
    }
    let copied
    do { copied = `ppt/slides/slide-sven-${++seq}.xml` } while (zip.file(copied))
    const edits = slide.edits.flatMap(({ target, value }) => textEdits(targets.get(target).fields, value))
    zip.file(copied, applyEdits(parts.get(template), edits))
    const slideRel = name => posix.join(posix.dirname(name), '_rels', posix.basename(name) + '.rels')
    const originalRels = await zip.file(slideRel(template))?.async('string')
    if (originalRels) {
      const notes = elements(originalRels, tag => nsName(tag, packageRelNs, 'Relationship') &&
        attr(tag, 'Type')?.endsWith('/notesSlide') ? 'notes' : '').map(part => ({ start: part.start, end: part.end, text: '' }))
      zip.file(slideRel(copied), applyEdits(originalRels, notes))
    }
    const nextRel = `rId${++relId}`
    manifest = appendElement(manifest, 'sldIdLst', prefix => `<${prefix}sldId xmlns:r="${relationshipNs}" id="${++id}" r:id="${nextRel}"/>`)
    relations = appendElement(relations, 'Relationships', prefix => `<${prefix}Relationship Id="${nextRel}" Type="${relationshipNs}/slide" Target="${copied.slice(4)}"/>`)
    types = appendElement(types, 'Types', prefix => `<${prefix}Override PartName="/${copied}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
  }
  zip.file(manifestKey, manifest)
  zip.file(relKey, relations)
  zip.file(typesKey, types)
}

export async function editOfficeFile(original, parts, format, requestedEdits, append) {
  const plan = normalizeOfficeEdit({ sourceId: 'original', format, edits: requestedEdits, append }, new Set(['original']))
  if (!plan) throw new Error('Filendringen mangler gyldige felt eller verdier.')
  const targets = new Map(officeTargets(parts, format, true).map(target => [target.id, target]))
  const grouped = new Map()
  for (const { target, value } of plan.edits) {
    const item = targets.get(target)
    if (!item) throw new Error(`Filfeltet ${target} finnes ikke i originalen.`)
    const list = grouped.get(item.name) ?? []
    if (item.cell) {
      const xml = parts.get(item.name)
      list.push({ start: item.cell.start, end: item.cell.end, text: cellReplacement(xml, item.cell, value) })
    } else list.push(...textEdits(item.fields, value))
    grouped.set(item.name, list)
  }
  const zip = await JSZip.loadAsync(original)
  for (const [name, edits] of grouped) {
    zip.file(name, applyEdits(parts.get(name), edits))
  }
  if (plan.append) await appendPowerPoint(zip, parts, plan.append, targets)
  if (format === 'xlsx') zip.file('xl/workbook.xml', recalculateWorkbook(parts.get('xl/workbook.xml')))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
