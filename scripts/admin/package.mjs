import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

export async function packageAdmin(output) {
  const directory = resolve(output, 'functions/admin-api.func')
  await mkdir(directory, { recursive: true })
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
