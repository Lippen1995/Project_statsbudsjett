import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'

export async function buildDataCatalog(dataDir) {
  const root = resolve(dataDir)
  const files = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isSymbolicLink())
        throw Error('Datagrunnlaget kan ikke inneholde symlinker')
      if (entry.isDirectory()) await walk(path)
      else {
        const bytes = await readFile(path)
        files.push({
          path: relative(root, path).replaceAll('\\', '/'),
          bytes: bytes.length,
          hash: createHash('sha256').update(bytes).digest('hex'),
        })
      }
    }
  }
  await walk(root)
  files.sort((a, b) => a.path.localeCompare(b.path))
  const read = async (name) => {
    try {
      return JSON.parse(await readFile(resolve(root, name), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  const meta = await read('meta.json')
  const datasets = [],
    checks = [],
    problems = []
  const problem = (value) => {
    if (problems.length < 150) problems.push(value)
  }
  for (const file of ['utgifter.json', 'inntekter.json']) {
    const tree = await read(file)
    if (!Array.isArray(tree)) {
      checks.push({
        id: file,
        passed: false,
        label: 'Datasettet finnes og er en liste',
      })
      continue
    }
    const ids = new Set(),
      years = new Set()
    let nodes = 0,
      values = 0,
      duplicates = 0,
      invalid = 0,
      sums = 0,
      mismatches = 0,
      gaps = 0,
      outliers = 0,
      comparisons = 0
    function visit(node) {
      nodes++
      if (!node.id || ids.has(node.id)) {
        duplicates++
        problem({
          file,
          node: node.id || 'ukjent',
          kind: 'duplicate',
          message: 'Manglende eller duplisert node-ID',
        })
      }
      ids.add(node.id)
      for (const [year, series] of Object.entries(node.serier || {})) {
        if (/^20\d{2}$/.test(year)) years.add(Number(year))
        for (const [kind, value] of Object.entries(series || {})) {
          if (value == null) continue
          values++
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            invalid++
            problem({
              file,
              node: node.id,
              kind: 'value',
              year,
              message: 'Ugyldig tallverdi',
            })
            continue
          }
          const children = node.children || []
          if (
            children.length &&
            children.every((c) => Number.isFinite(c.serier?.[year]?.[kind]))
          ) {
            sums++
            const actual = children.reduce(
              (n, c) => n + c.serier[year][kind],
              0,
            )
            const tolerance = Math.max(
              0.2,
              children.length * 0.1,
              Math.abs(value) * 0.000001,
            )
            if (Math.abs(actual - value) > tolerance) {
              mismatches++
              problem({
                file,
                node: node.id,
                kind: 'sum',
                year,
                series: kind,
                expected: value,
                actual,
                difference: actual - value,
                message: 'Sum av underposter avviker fra overordnet post',
              })
            }
          }
        }
      }
      const ordered = Object.entries(node.serier || {}).sort(([a], [b]) =>
        a.localeCompare(b),
      )
      const kinds = [
        ...new Set(ordered.flatMap(([, s]) => Object.keys(s || {}))),
      ]
      for (const kind of kinds) {
        const observed = ordered.filter(([, s]) => Number.isFinite(s?.[kind]))
        for (let i = 1; i < observed.length; i++) {
          const [year, series] = observed[i],
            [previous, prior] = observed[i - 1]
          if (Number(year) > Number(previous) + 1) {
            gaps++
            problem({
              file,
              node: node.id,
              kind: 'gap',
              series: kind,
              from: previous,
              to: year,
              message: 'Mellomliggende år mangler mellom observerte verdier',
            })
          }
          if (
            Number(year) === Number(previous) + 1 &&
            Math.abs(prior[kind]) >= 100
          ) {
            comparisons++
            const ratio =
              Math.abs(series[kind] - prior[kind]) / Math.abs(prior[kind])
            if (ratio > 2) {
              outliers++
              problem({
                file,
                node: node.id,
                kind: 'outlier',
                series: kind,
                year,
                previous: prior[kind],
                actual: series[kind],
                message:
                  'Endring over 200 prosent fra et grunnlag på minst 100 enheter; krever faglig vurdering',
              })
            }
          }
        }
      }
      for (const child of node.children || []) visit(child)
    }
    tree.forEach(visit)
    datasets.push({
      id: file,
      path: '/data/' + file,
      label: file === 'utgifter.json' ? 'Statsutgifter' : 'Statsinntekter',
      nodes,
      values,
      years: [...years].sort(),
      updated: meta?.oppdatert || null,
      unit: meta?.enhet || null,
    })
    checks.push(
      {
        id: file + ':ids',
        label: 'Unike ID-er i ' + file,
        passed: duplicates === 0,
        checked: nodes,
        failures: duplicates,
      },
      {
        id: file + ':numbers',
        label: 'Gyldige tall i ' + file,
        passed: invalid === 0,
        checked: values,
        failures: invalid,
      },
      {
        id: file + ':sums',
        label: 'Summer og delsummer i ' + file,
        passed: mismatches === 0,
        checked: sums,
        failures: mismatches,
      },
      {
        id: file + ':gaps',
        label: 'Hull mellom observerte år i ' + file,
        passed: gaps === 0,
        failures: gaps,
        severity: 'review',
      },
      {
        id: file + ':outliers',
        label: 'Store årsendringer i ' + file,
        passed: outliers === 0,
        checked: comparisons,
        failures: outliers,
        severity: 'review',
      },
    )
  }
  for (const [id, label] of [
    ['befolkning.json', 'Folkemengde'],
    ['kpi.json', 'Konsumprisindeks'],
    ['bnp.json', 'Bruttonasjonalprodukt'],
  ]) {
    const values = await read(id)
    if (values)
      datasets.push({
        id,
        label,
        path: '/data/' + id,
        years: Object.keys(values)
          .filter((k) => /^\d{4}$/.test(k))
          .map(Number)
          .sort(),
        updated: null,
        unit:
          id === 'kpi.json'
            ? 'indeks'
            : id === 'befolkning.json'
              ? 'personer'
              : meta?.bnp_enhet,
      })
  }
  const oil = await read('oljepengebruk.json')
  if (oil)
    datasets.push({
      id: 'oljepengebruk.json',
      label: 'Oljepengebruk',
      path: '/data/oljepengebruk.json',
      years: Object.keys(oil.serier || {})
        .map(Number)
        .sort(),
      updated: oil.oppdatert || null,
      unit: oil.enhet || 'mill_kr',
    })
  const kostra = await read('kostra/index.json')
  if (kostra)
    datasets.push({
      id: 'kostra/index.json',
      label: 'KOSTRA kommunetall',
      path: '/data/kostra/index.json',
      years: kostra.years || [],
      updated: kostra.updated || null,
      entities: kostra.entities?.length || 0,
      sources: kostra.sources || [],
    })
  const archive = await read('budsjettarkiv/index.json')
  if (archive)
    datasets.push({
      id: 'budsjettarkiv/index.json',
      label: 'Arkiverte budsjettforslag',
      path: '/data/budsjettarkiv/index.json',
      years: [...new Set((archive.proposals || []).map((p) => p.year))].sort(),
      updated: null,
    })
  checks.unshift({
    id: 'metadata',
    label: 'Metadata, kildehenvisninger og årstall',
    passed: Boolean(
      meta?.oppdatert && meta?.kilder?.length && meta?.regnskap_aar?.length,
    ),
  })
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    updated: meta?.oppdatert,
    unit: meta?.enhet,
    baseYear: meta?.kpi_basisaar,
    sources: (meta?.kilder || []).map((k) => ({
      name: k.navn,
      url: k.url,
      license: k.lisens || null,
    })),
    datasets,
    checks,
    problems,
    files,
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    manifestHash: createHash('sha256')
      .update(JSON.stringify(files))
      .digest('hex'),
  }
}
