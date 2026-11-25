import { mapAttribution } from './municipal-map.mjs'

export const green = '#14594f'
export const ink = '#14161a'
export const muted = '#58544d'
export const paper = '#f7f5f0'
export const seriesColors = [green, '#b23f2a', '#546796', '#685360']
export const mapColors = ['#d4e9e2', '#a4d1c4', '#73b3a3', '#398877', '#14594f']
const nb = new Intl.NumberFormat('nb-NO', { maximumSignificantDigits: 12 })
export const displayValue = value => typeof value === 'number' ? nb.format(value) : value ?? '–'
export const escapeXml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]))
export const splitText = (text, width) => {
  const result = []
  let line = ''
  for (const word of text.split(/\s+/).flatMap(word => word.length > width ? word.match(new RegExp(`.{1,${width}}`, 'gu')) ?? [] : [word])) {
    if (line && line.length + word.length + 1 > width) { result.push(line); line = '' }
    line += (line ? ' ' : '') + word
  }
  if (line) result.push(line)
  return result
}

export function renderFigure({ title, description, width = 640, height, content }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><title>${escapeXml(title)}</title><desc>${escapeXml(description)}</desc><rect width="100%" height="100%" fill="${paper}"/><g font-family="Libre Franklin, sans-serif">${content}</g></svg>`
}

function textAt(value, x, y, size, options = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${ink}" ${options}>${escapeXml(value)}</text>`
}

export function illustrationFigure(illustration) {
  const { title, steps } = illustration
  let y = 22
  const blocks = steps.map(({ label, detail }, index) => {
    const labels = splitText(label, 48)
    const lines = splitText(detail, 65)
    const height = 28 + labels.length * 24 + lines.length * 18
    const block = `<rect x="20" y="${y}" width="600" height="${height}" rx="11" fill="#fffdf9" stroke="#c9dcd4"/>
      <circle cx="47" cy="${y + 28}" r="14" fill="${green}"/>
      ${textAt(index + 1, 47, y + 33, 14, 'text-anchor="middle" style="fill:white"')}
      ${labels.map((line, offset) => textAt(line, 70, y + 32 + offset * 24, 20, 'font-weight="bold"')).join('')}
      ${lines.map((line, offset) => textAt(line, 70, y + 31 + labels.length * 24 + offset * 18, 15)).join('')}
      ${index === steps.length - 1 ? '' : `<path d="M320,${y + height + 3}v14m-4,-4 4,4 4,-4" stroke="${green}" fill="none"/>`}`
    y += height + 23
    return block
  })
  return { title, height: y, svg: renderFigure({ title, description: steps.map(step => `${step.label}. ${step.detail}`).join(' '), height: y, content: blocks.join('') }) }
}

export function municipalMapFigure(map) {
  if (!map.areas.some(area => area.path)) return null
  const values = map.areas.map(area => area.value).filter(Number.isFinite)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const pathColor = value => value == null ? '#e2ddd3' : min === max ? mapColors[2]
    : mapColors[Math.min(4, Math.floor((value - min) / (max - min) * 5))]
  const shapes = map.areas.map(area => area.path
    ? `<path d="${area.path}" fill="${pathColor(area.value)}" stroke="#444d4b" stroke-width=".65"><title>${escapeXml(area.name ?? area.code)} · ${escapeXml(displayValue(area.value))}</title></path>` : '').join('')
  const key = (min === max ? [mapColors[2]] : mapColors).map((color, index) => `<rect x="${190 + index * 39}" y="296" width="38" height="10" fill="${color}"/>`).join('')
  const legend = values.length ? key + textAt(displayValue(min), 184, 305, 12, 'text-anchor="end"') +
    (min === max ? '' : textAt(displayValue(max), 391, 305, 12)) : ''
  const content = `<g transform="translate(74,0)">${shapes}</g>${legend}` +
    textAt(`${map.unit} · ${map.year}`, 22, 327, 13) + textAt(mapAttribution.title + ' (gjeldende inndeling)', 22, 347, 11)
  return { title: map.title, height: 368, svg: renderFigure({ title: map.title, description: map.areas
    .map(area => `${area.name ?? area.code} ${displayValue(area.value)}`).join(', '), height: 368, content }) }
}

export function chartFigure(chart) {
  const { title, unit, series, rows, type } = chart
  const values = rows.flatMap(row => row.values.filter(Number.isFinite))
  const bars = type === 'bar'
  let min = Math.min(...values), max = Math.max(...values)
  if (bars || min === max) { min = Math.min(0, min); max = Math.max(0, max) }
  if (min === max) max = 1
  const left = 82, top = 42, right = 575, bottom = 249
  const spacing = (right - left) / (bars ? rows.length : rows.length - 1)
  const x = i => left + (i + (bars ? 0.5 : 0)) * spacing
  const y = value => bottom - (value - min) / (max - min) * (bottom - top)
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = min + (max - min) * i / 4
    return `<path d="M${left} ${y(value)}H${right}" fill="none" stroke="#d6d3c9"/>` +
      textAt(new Intl.NumberFormat('nb-NO', { notation: 'compact', maximumSignificantDigits: 3 }).format(value), left - 9, y(value) + 4, 13, 'text-anchor="end"')
  }).join('')
  const interval = Math.ceil(rows.length / 5)
  const labels = rows.map(({ label }, i) => (i === rows.length - 1 || (i % interval === 0 && rows.length - i > interval))
    ? textAt(label.length > 10 ? label.slice(0, 9) + '…' : label, x(i), bottom + 18, 12, 'text-anchor="middle"') : '').join('')
  const marks = series.map((_, column) => {
    const color = seriesColors[column]
    let previous = false
    return rows.map((row, i) => {
      const value = row.values[column]
      const prefix = previous ? 'L' : 'M'
      previous = value !== null
      if (!previous) return ''
      if (!bars) return `${prefix}${x(i).toFixed(2)} ${y(value).toFixed(2)} `
      const width = Math.min(36, spacing * 0.8 / series.length)
      return `<rect x="${x(i) + (column - series.length / 2) * width}" y="${Math.min(y(0), y(value))}" width="${width * 0.9}" height="${Math.max(1, Math.abs(y(0) - y(value)))}" fill="${color}"/>`
    }).join('').replace(/^.+$/, body => bars ? body : `<path d="${body}" fill="none" stroke="${color}" stroke-width="2.8" stroke-dasharray="${['', '8 4', '3 4', '8 3 2 3'][column]}"/>` +
      rows.map((row, i) => row.values[column] === null ? '' : `<circle cx="${x(i)}" cy="${y(row.values[column])}" r="3" fill="${color}"/>`).join(''))
  }).join('')
  const key = series.map((label, index) => `<circle cx="${37 + index % 2 * 305}" cy="${299 + Math.floor(index / 2) * 20}" r="4" fill="${seriesColors[index]}"/>` +
    textAt(label.length > 44 ? label.slice(0, 43) + '…' : label, 48 + index % 2 * 305, 303 + Math.floor(index / 2) * 20, 12)).join('')
  return { title, height: 340, svg: renderFigure({ title, description: `${unit}. ${series.join(', ')}.`, height: 340,
    content: textAt(unit, left, 22, 14) + grid + marks + labels + key }) }
}

export function allFigures(document) {
  return [
    ...(document.chart ? [{ ...chartFigure(document.chart), sourceIds: document.chart.sourceIds }] : []),
    ...(document.kit.illustration ? [{ ...illustrationFigure(document.kit.illustration), sourceIds: document.kit.illustration.sourceIds }] : []),
    ...(document.kit.map ? [{ ...municipalMapFigure(document.kit.map), sourceIds: document.kit.map.sourceIds }].filter(figure => figure.svg) : []),
  ]
}
