import { KORT } from '../fellestall/design.js'

export function bridgeRows(report, graph = {}) {
  if (report.kind !== 'budget-comparison') throw Error('Broen krever budsjettposter')
  const { department, chapter, groupBy = chapter ? 'post' : department ? 'chapter' : 'department', groups } = graph
  if (!['department', 'chapter', 'post'].includes(groupBy)) throw Error('Ukjent bronivå')
  if (department !== undefined && !report.rows.some((r) => r.department === department))
    throw Error('Broen viser et ukjent departement')
  const selected = report.rows.filter((r) =>
    (department === undefined || r.department === department) &&
    (chapter === undefined || r.id.startsWith(chapter + '-')),
  )
  if (!selected.length) throw Error('Broen mangler poster i valgt område')
  const ids = new Set(selected.map((r) => r.id))
  const used = new Set()
  let buckets
  if (groups !== undefined) {
    if (!Array.isArray(groups) || !groups.length || groups.length > 12)
      throw Error('Ugyldige grupper i broen')
    buckets = groups.map((g, i) => {
      if (!g.label?.trim() || !Array.isArray(g.recordKeys) || !g.recordKeys.length ||
          Object.keys(g).some((k) => !['label', 'recordKeys'].includes(k)))
        throw Error('Ugyldig postgruppe i broen')
      for (const id of g.recordKeys) {
        if (!ids.has(id) || used.has(id)) throw Error('Broposter mangler eller telles dobbelt')
        used.add(id)
      }
      return { id: `group-${i}`, label: g.label, rows: selected.filter((r) => g.recordKeys.includes(r.id)) }
    })
    const rest = selected.filter((r) => !used.has(r.id))
    if (rest.length) buckets.push({ id: 'other', label: 'Øvrige poster', rows: rest })
  } else {
    const index = new Map()
    for (const row of selected) {
      const id = groupBy === 'department' ? row.department : groupBy === 'chapter' ? row.id.slice(0, 4) : row.id
      if (!index.has(id)) index.set(id, {
        id,
        label: groupBy === 'department' ? KORT[`u-${id}`] ?? row.departmentName
          : groupBy === 'chapter' ? row.name.split(' – ')[0] : row.name.split(' – ').slice(1).join(' – ') || row.name,
        rows: [],
        ...(groupBy === 'department' ? { drill: { department: id } }
          : groupBy === 'chapter' ? { drill: { department: row.department, chapter: id } } : {}),
      })
      index.get(id).rows.push(row)
    }
    buckets = [...index.values()]
  }
  const entries = buckets.map((g) => ({
    ...g, before: g.rows.reduce((s, r) => s + r.before, 0),
    after: g.rows.reduce((s, r) => s + r.after, 0),
    change: g.rows.reduce((s, r) => s + r.change, 0),
  })).sort((a, b) => b.change - a.change || a.id.localeCompare(b.id))
  const total = selected.reduce((s, r) => s + r.change, 0)
  return { entries, total, count: selected.length }
}

export function bridgeSteps(entries, total) {
  const changing = entries.filter((r) => Math.abs(r.change) > 1e-8)
  const top = changing.filter((r) => r.change > 0).slice(0, 5)
  const cuts = changing.filter((r) => r.change < 0).slice(-3)
  const shown = new Set([...top, ...cuts].map((r) => r.id))
  const other = changing.filter((r) => !shown.has(r.id))
  const ordered = [...top, ...cuts]
  if (other.length) ordered.push({ id: 'rest', label: 'Øvrige', change: other.reduce((s, r) => s + r.change, 0) })
  let current = 0
  const steps = ordered.map((r) => {
    const start = current
    current += r.change
    return { ...r, start, end: current }
  })
  if (Math.abs(current - total) > Math.max(1, Math.abs(total)) * 1e-10)
    throw Error('Broen avstemmer ikke til totalen')
  return steps
}
