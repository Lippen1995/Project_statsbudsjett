import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const [source, addressList] = process.argv.slice(2)
const addresses = (addressList || '').split(',')
assert.ok(source && addresses.every(ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)))
const temporary = await mkdtemp(resolve(tmpdir(), 'fellestall-domain-'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

async function request(host, path, ip) {
  // SNI, Host og sertifikatvalidering bruker produksjonsnavnet; bare
  // tilkoblingsadressen byttes. DNS hos Domeneshop endres ikke.
  const status = execFileSync('curl', [
    '--silent', '--show-error', '--fail', '--max-time', '20', '--connect-timeout', '5',
    '--resolve', `${host}:443:${ip}`, '--output', resolve(temporary, 'body'),
    '--dump-header', resolve(temporary, 'headers'), '--write-out', '%{http_code}',
    `https://${host}${path}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
  return { status: Number(status), body: await readFile(resolve(temporary, 'body')), headers: await readFile(resolve(temporary, 'headers'), 'utf8') }
}

try {
  for (const ip of addresses) {
    const deadline = Date.now() + 90000
    for (let attempt = 0; ; attempt++) {
      try {
        for (const path of ['index.html', 'data/meta.json']) {
          const result = await request('fellestall.no', path === 'index.html' ? '/' : `/${path}`, ip)
          assert.equal(result.status, 200)
          assert.match(result.headers, /^server:\s*Vercel\s*$/im)
          const expected = hash(await readFile(resolve(source, path)))
          assert.equal(hash(result.body), expected, `Ulikt innhold for ${path} på ${ip}`)
          assert.doesNotMatch(result.headers, /^x-robots-tag:.*noindex/im)
        }
        const redirect = await request('www.fellestall.no', '/', ip)
        assert.equal(redirect.status, 308)
        assert.match(redirect.headers, /^location:\s*https:\/\/fellestall\.no\/?\s*$/im)
        break
      } catch (error) {
        if (Date.now() >= deadline) throw error
        console.log(`Venter på at domenet får kontrollert bygg på ${ip} (forsøk ${attempt + 1})`)
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }
    console.log(`HTTPS, korrekt produksjonsinnhold og www-videresending kontrollert på ${ip}`)
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
