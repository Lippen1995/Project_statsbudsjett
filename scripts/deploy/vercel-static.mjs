import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { packageAdmin } from '../admin/package.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')

// Les selve HTTP-svaret fra curl-filer. CLI-meldinger på stdout er ikke sideinnhold.
async function response(endpoint, deployment) {
  const temporary = await mkdtemp(resolve(tmpdir(), 'fellestall-verify-'))
  try {
    execFileSync('vercel', ['curl', endpoint, '--deployment', deployment, '--',
      '--silent', '--show-error', '--location', '--max-redirs', '3', '--compressed',
      '--max-time', '60', '--output', resolve(temporary, 'body'),
      '--dump-header', resolve(temporary, 'headers')], { stdio: ['ignore', 'ignore', 'inherit'] })
    const headers = await readFile(resolve(temporary, 'headers'), 'utf8')
    const statuses = [...headers.matchAll(/^HTTP\/\S+\s+(\d{3})/gm)]
    if (!statuses.length) throw new Error(`Ingen HTTP-status for ${endpoint}`)
    return { status: Number(statuses.at(-1)[1]), body: await readFile(resolve(temporary, 'body')), headers }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

async function files(dir, root = dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const path = resolve(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symlink er ikke tillatt: ${path}`)
    if (entry.isDirectory()) result.push(...await files(path, root))
    else result.push(relative(root, path).replaceAll('\\', '/'))
  }
  return result.sort()
}

const [command, sourceArg, deployment] = process.argv.slice(2)
const source = resolve(sourceArg || 'web/dist')
const paths = await files(source)
for (const required of ['index.html', 'data/meta.json', 'data/utgifter.json', 'data/inntekter.json', 'analyser/index.html', 'sitemap.xml']) {
  if (!paths.includes(required)) throw new Error(`Publiseringsgrunnlaget mangler ${required}`)
}

if (command === 'pack') {
  const output = resolve('.vercel/output')
  if (source === output || source.startsWith(output + '/') || output.startsWith(source + '/')) {
    throw new Error('Kilde og output må være separate kataloger')
  }
  await rm(output, { recursive: true, force: true })
  await mkdir(resolve(output, 'static'), { recursive: true })
  for (const path of paths) {
    await mkdir(resolve(output, 'static', path, '..'), { recursive: true })
    await cp(resolve(source, path), resolve(output, 'static', path))
  }
  const directoryRoutes = paths.filter(path => path.endsWith('/index.html')).flatMap(path => {
    const directory = path.slice(0, -'/index.html'.length)
    const escaped = directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return [
      { src: `/${escaped}`, status: 308, headers: { Location: `/${directory}/` } },
      { src: `/${escaped}/`, dest: `/${path}` },
    ]
  })
  const config = {
    version: 3,
    routes: [
      ...(paths.includes('admin/index.html') ? [{ src: '/api/(admin(?:/.*)?|auth(?:/.*)?|telemetry|health)', dest: '/admin-api' }] : []),
      { src: '/(.*)', headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' }, continue: true },
      { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '/admin(?:/.*)?', headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }, continue: true },
      { src: '/', dest: '/index.html' },
      ...directoryRoutes,
      { handle: 'filesystem' },
      { src: '/(.*)', status: 404 },
    ],
  }
  if (paths.includes('admin/index.html')) await packageAdmin(output, { dataDir: resolve(source, 'data') })
  await writeFile(resolve(output, 'config.json'), JSON.stringify(config, null, 2) + '\n')
  console.log(`Pakket ${paths.length} filer til Build Output API v3`)
} else if (command === 'verify') {
  const url = new URL(deployment)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Forventet en HTTPS-adresse på vercel.app')
  }
  const selected = paths.filter(path => path.endsWith('.html') || path === 'data/meta.json' || path === 'sitemap.xml' || path === 'robots.txt')
  selected.push(...paths.filter(path => path.startsWith('assets/') && /\.(js|css)$/.test(path)))
  // Sentrale datasett og representative KOSTRA-/analysefiler må også være identiske.
  selected.push('data/utgifter.json', 'data/inntekter.json')
  selected.push(...paths.filter(path => path.endsWith('datagrunnlag.json')))
  const kostra = paths.filter(path => path.startsWith('data/kostra/') && path.endsWith('.json'))
  if (kostra.length) selected.push(kostra[0], kostra[Math.floor(kostra.length / 2)], kostra.at(-1))
  for (const path of new Set(selected)) {
    const endpoint = path === 'index.html' ? '/' : path.endsWith('/index.html') ? '/' + path.slice(0, -'index.html'.length) : '/' + path
    const { status, body } = await response(endpoint, url.origin)
    if (status !== 200) throw new Error(`${endpoint} svarte ${status}, forventet 200`)
    const expected = await readFile(resolve(source, path))
    if (hash(body) !== hash(expected)) throw new Error(`Ulikt innhold: ${path} (${body.length} byte mottatt, ${expected.length} forventet)`)
    console.log(`Identisk: ${path}`)
  }
  const { status } = await response('/migration-missing-file.json', url.origin)
  if (status !== 404) throw new Error(`Manglende JSON svarte ${status}, forventet 404`)
  if (paths.includes('admin/index.html')) {
    const admin = await response('/admin/', url.origin)
    if (!/^x-robots-tag:.*noindex/im.test(admin.headers) || !/^cache-control:.*no-store/im.test(admin.headers)) {
      throw new Error('Adminområdet mangler noindex eller no-store')
    }
    for (const endpoint of ['/api/admin/session', '/api/admin/metrics', '/api/admin/live', '/api/admin/live-status', '/api/admin/pipeline', '/api/admin/sven/files']) {
      const result = await response(endpoint, url.origin)
      if (result.status !== 401) throw new Error(`Admin-API ${endpoint} svarte ${result.status}; forventet 401 uten innlogging. Kontroller serveroppsettet før aktivering.`)
    }
    const health = await response('/api/health', url.origin)
    let report
    try { report = JSON.parse(health.body.toString('utf8')) } catch { throw new Error('Helsesjekken returnerte ikke JSON') }
    if (![200, 503].includes(health.status) || !['operational', 'degraded', 'outage'].includes(report.status) ||
        !Array.isArray(report.components) || report.components.length !== 3 ||
        report.components.some(component => !['website', 'database', 'sven'].includes(component.id))) {
      throw new Error('Helsesjekken mangler et gyldig kontrollresultat. Kontroller serveroppsettet før aktivering.')
    }
    console.log(`Helsesjekk kontrollert: ${report.status}`)
  }
  console.log('Manglende JSON gir 404. Utrullingen er kontrollert; domener er ikke flyttet.')
} else {
  throw new Error('Bruk: node scripts/deploy/vercel-static.mjs pack|verify <kildemappe> [deployment-url]')
}
