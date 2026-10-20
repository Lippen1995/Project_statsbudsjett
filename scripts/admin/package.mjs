import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { buildTopicCatalog } from './topic-catalog.mjs'
import { buildDataCatalog } from './data-catalog.mjs'

export async function packageAdmin(output, { dataDir } = {}) {
  const directory = resolve(output, 'functions/admin-api.func')
  await mkdir(directory, { recursive: true })
  await copyFile(new URL('../../server/admin/schema.sql', import.meta.url), resolve(directory, 'schema.sql'))
  await writeFile(resolve(directory, 'topic-catalog.json'), JSON.stringify(buildTopicCatalog({ dataDir })) + '\n')
  await writeFile(resolve(directory, 'data-catalog.json'), JSON.stringify(await buildDataCatalog(dataDir || fileURLToPath(new URL('../../web/public/data',import.meta.url)))) + '\n')
  await build({
    entryPoints: [fileURLToPath(new URL('../../server/admin/vercel.mjs', import.meta.url))], outfile: resolve(directory, 'index.mjs'),
    bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['pg-native'],
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    minify: true,
  })
  await writeFile(resolve(directory, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs',
  }, null, 2) + '\n')
}
