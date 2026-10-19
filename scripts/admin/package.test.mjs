import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('produksjonspakken skiller API fra statikk og beskytter admin-cache og indeksering', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'fellestall-admin-package-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const source = resolve(directory, 'source')
  for (const path of ['index.html', 'admin/index.html', 'data/meta.json', 'data/utgifter.json', 'data/inntekter.json', 'analyser/index.html', 'sitemap.xml']) {
    await mkdir(dirname(resolve(source, path)), { recursive: true })
    await writeFile(resolve(source, path), path.endsWith('.html') ? '<html></html>' : '{}')
  }
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../deploy/vercel-static.mjs', import.meta.url)), 'pack', source], { cwd: directory })
  const output = resolve(directory, '.vercel/output')
  const config = JSON.parse(await readFile(resolve(output, 'config.json'), 'utf8'))
  const matching = path => config.routes.filter(r => r.src && new RegExp(`^${r.src}$`).test(path))
  assert.equal(matching('/api/admin/session')[0].dest, '/admin-api')
  assert.equal(matching('/api/auth/sign-in/email')[0].dest, '/admin-api')
  assert.equal(matching('/api/telemetry')[0].dest, '/admin-api')
  const responseHeaders = Object.assign({}, ...matching('/admin/').filter(r => r.continue).map(r => r.headers))
  assert.equal(responseHeaders['Cache-Control'], 'no-store')
  assert.equal(responseHeaders['X-Robots-Tag'], 'noindex, nofollow')
  assert.match(responseHeaders['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.equal(matching('/data/mangler.json').at(-1).status, 404)
  assert.equal(matching('/admin').find(r => r.status === 308).headers.Location, '/admin/')
  assert.equal(typeof (await import(pathToFileURL(resolve(output, 'functions/admin-api.func/index.mjs')).href)).default, 'function')
  assert.equal(await readFile(resolve(output, 'functions/admin-api.func/schema.sql'), 'utf8'), await readFile(new URL('../../server/admin/schema.sql', import.meta.url), 'utf8'))
})
