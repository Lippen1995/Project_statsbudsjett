import { SaxesParser } from 'saxes'

export const norwayPopulation = Object.freeze({ table: '07459', label: 'Folkemengde ved inngangen til året',
  unit: 'innbyggere', regionKey: 'Region', options: { Kjonn: '*', Alder: '*', ContentsCode: 'Personer1' } })
export const publicSchoolPupils = Object.freeze({ table: '11971', label: 'Elever i kommunale grunnskoler',
  unit: 'elever', regionKey: 'KOKkommuneregion0000', options: { ContentsCode: 'KOSelevgrsk0000' } })

export function statbankDataUrl(table, filter) {
  if (!/^\d{5}$/.test(table)) throw new TypeError('Ugyldig SSB-tabell')
  const base = new URL('https://data.ssb.no/api/pxwebapi/v2/tables/' + table + '/data')
  base.searchParams.set('lang', 'no')
  for (const [key, value] of Object.entries(filter)) base.searchParams.set('valueCodes[' + key + ']', value)
  return base.href
}

async function officialResponse(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8500) })
  if (!response.ok) throw new Error('Offentlig kildedata er utilgjengelig (' + response.status + ')')
  return response
}

function positionMap(category) {
  const index = category?.index
  return Array.isArray(index) ? Object.fromEntries(index.map((code, offset) => [code, offset])) : index ?? {}
}

export function readStatbankCounts(data, years, definition, region) {
  const { id, size, dimension, value } = data
  if (!Array.isArray(id) || !Array.isArray(size) || id.length !== size.length || !size.every(size => Number.isInteger(size) && size > 0) ||
      !Array.isArray(value) || size.reduce((product, item) => product * item, 1) !== value.length) return {}
  const timeAxis = id.indexOf('Tid')
  const regionAxis = id.indexOf(definition.regionKey)
  if (timeAxis === -1 || regionAxis === -1 || size[regionAxis] !== 1 ||
      positionMap(dimension[id[regionAxis]]?.category)[region] !== 0) return {}
  for (const [axis, code] of Object.entries(definition.options)) {
    const axisIndex = id.indexOf(axis)
    if (axisIndex === -1) return {}
    if (code !== '*' && (size[axisIndex] !== 1 || positionMap(dimension[axis]?.category)[code] !== 0)) return {}
  }
  const positions = positionMap(dimension.Tid?.category)
  const stride = size.slice(timeAxis + 1).reduce((product, item) => product * item, 1)
  return Object.fromEntries(years.map(year => {
    if (!Object.hasOwn(positions, year)) return [year, null]
    const observations = value.filter((_, linear) => Math.floor(linear / stride) % size[timeAxis] === positions[year])
    return [year, observations.length > 0 && observations.every(number => Number.isInteger(number) && number >= 0)
      ? observations.reduce((sum, number) => sum + number, 0) : null]
  }))
}

export async function officialMunicipalCounts(definition, region, years, fetchImpl = fetch) {
  if (!/^\d{4}$/.test(region) || !years.length || !years.every(year => Number.isInteger(year) && year >= 1900 && year <= 2099)) {
    throw new Error('Ugyldig kommune eller periode')
  }
  const filter = { ...definition.options, [definition.regionKey]: region, Tid: years.join(',') }
  const url = statbankDataUrl(definition.table, filter)
  const data = await (await officialResponse(url, fetchImpl)).json()
  return { definition, url, counts: readStatbankCounts(data, years, definition, region),
    updated: typeof data.updated === 'string' ? data.updated : null }
}

const parliamentOrigin = 'https://www.stortinget.no'
const casePath = '/no/Saker-og-publikasjoner/Saker/Sak/'
const topFields = ['id', 'korttittel', 'status', 'ferdigbehandlet', 'kortvedtak', 'henvisning', 'vedtakstekst']
const publicationFields = ['eksport_id', 'lenke_tekst', 'lenke_url', 'type']

export function publicCaseId(value) {
  if (typeof value !== 'string') return null
  if (/^\d{1,8}$/.test(value) && Number(value) > 0) return value
  try {
    const url = new URL(value)
    if (url.origin !== parliamentOrigin || url.username || url.password ||
        url.pathname.replace(/\/$/, '').toLowerCase() !== casePath.replace(/\/$/, '').toLowerCase()) return null
    const id = url.searchParams.get('p')
    return id && /^\d{1,8}$/.test(id) && Number(id) > 0 ? id : null
  } catch { return null }
}

function publicationLink(value) {
  try {
    const url = new URL(value, parliamentOrigin)
    if (url.origin === parliamentOrigin && !url.username && !url.password) return url.href
  } catch { /* The exported case can contain incomplete entries. */ }
  return null
}

export function parsePublicCase(xml, id) {
  const roots = {}
  const publications = []
  const stack = []
  const parser = new SaxesParser({ xmlns: true })
  let publication
  let field = null
  let content = ''
  parser.on('doctype', () => { throw new Error('Ugyldig dokument fra Stortinget') })
  parser.on('opentag', tag => {
    stack.push(tag.local)
    if (tag.local === 'publikasjon_referanse' && stack.at(-2) === 'publikasjon_referanse_liste') publication = {}
    if (stack.length === 2 && topFields.includes(tag.local) ||
        publication && stack.at(-2) === 'publikasjon_referanse' && publicationFields.includes(tag.local)) {
      field = tag.local
      content = ''
    }
  })
  parser.on('text', text => { if (field) content += text })
  parser.on('closetag', tag => {
    if (field === tag.local) {
      const parent = stack.length === 2 ? roots : publication
      if (parent) parent[field] = content.trim()
      field = null
    }
    if (tag.local === 'publikasjon_referanse' && publication) {
      const { eksport_id, lenke_tekst, lenke_url, type } = publication
      const url = lenke_url && publicationLink(lenke_url)
      if (url && lenke_tekst) publications.push({ id: eksport_id || url, title: lenke_tekst.slice(0, 300), url, type: type || null })
      publication = null
    }
    stack.pop()
  })
  parser.write(xml).close()
  if (roots.id !== id || !roots.korttittel) throw new Error('Fant ikke denne stortingssaken')
  const docs = [...new Map(publications.map(item => [item.url, item])).values()].sort((a,b) => a.url.localeCompare(b.url))
  return {
    id, title: roots.korttittel.slice(0, 300), status: roots.status || null, completed: roots.ferdigbehandlet === 'true',
    reference: roots.henvisning || null, summary: roots.kortvedtak?.slice(0, 2400) || null,
    decision: roots.vedtakstekst?.slice(0, 1200) || null, documents: docs,
    url: parliamentOrigin + casePath + '?p=' + id,
  }
}

export async function readPublicCase(id, fetchImpl = fetch) {
  if (!publicCaseId(id) || !/^\d+$/.test(id)) throw new Error('Oppgi Stortingets saks-ID')
  const source = await officialResponse('https://data.stortinget.no/eksport/sak?sakid=' + id, fetchImpl)
  return parsePublicCase(await source.text(), id)
}
