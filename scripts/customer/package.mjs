import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

export async function packageCustomer(output) {
  const directory=resolve(output,'functions/customer-api.func')
  await mkdir(directory,{recursive:true})
  await copyFile(new URL('../../server/customer/schema.sql',import.meta.url),resolve(directory,'schema.sql'))
  await build({entryPoints:[fileURLToPath(new URL('../../server/customer/vercel.mjs',import.meta.url))],outfile:resolve(directory,'index.mjs'),
    bundle:true,platform:'node',target:'node24',format:'esm',external:['pg-native'],minify:true,
    banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"}})
  await writeFile(resolve(directory,'.vc-config.json'),JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',regions:['fra1'],maxDuration:300},null,2)+'\n')
}
