import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
export function editorialRendererHash() {
  // Admin is a serverless bundle without the source tree. Its packager freezes
  // the same renderer fingerprint at build time.
  if (typeof __SVEN_EDITORIAL_RENDERER_HASH__ !== 'undefined') return __SVEN_EDITORIAL_RENDERER_HASH__
  const root = new URL('../../web/src/analyser/',import.meta.url)
  const files = readdirSync(root).filter(name=>/\.(jsx|js|css)$/.test(name)).sort()
  const hash=createHash('sha256')
  for(const file of files)hash.update(file).update(readFileSync(new URL(file,root)))
  for(const path of ['../../web/src/fellestall/design.js','../../web/src/fellestall/fellestall.css','../../web/src/index.css'])
    hash.update(path).update(readFileSync(new URL(path,import.meta.url)))
  return hash.digest('hex')
}
