import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')

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
      { src: '/(.*)', headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' }, continue: true },
      { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '/', dest: '/index.html' },
      ...directoryRoutes,
      { handle: 'filesystem' },
      { src: '/(.*)', status: 404 },
    ],
  }
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
    const body = execFileSync('vercel', ['curl', endpoint, '--deployment', url.origin, '--', '--fail', '--silent', '--show-error', '--max-time', '60'], { maxBuffer: 64 * 1024 * 1024 })
    if (hash(body) !== hash(await readFile(resolve(source, path)))) throw new Error(`Ulikt innhold: ${path}`)
    console.log(`Identisk: ${path}`)
  }
  const status = execFileSync('vercel', ['curl', '/migration-missing-file.json', '--deployment', url.origin, '--', '--silent', '--output', '/dev/null', '--write-out', '%{http_code}', '--max-time', '30'], { encoding: 'utf8' }).trim()
  if (status !== '404') throw new Error(`Manglende JSON svarte ${status}, forventet 404`)
  console.log('Manglende JSON gir 404. Utrullingen er kontrollert; domener er ikke flyttet.')
} else {
  throw new Error('Bruk: node scripts/deploy/vercel-static.mjs pack|verify <kildemappe> [deployment-url]')
}
