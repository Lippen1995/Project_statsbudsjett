import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { pathToFileURL } from 'node:url'
import { nodeHandler } from '../../../server/admin/node-handler.mjs'

export function adminPlugin() {
  return {
    name: 'fellestall-admin',
    config(config, { mode }) {
      // Hemmeligheter brukes bare av Node-mellomvaren, aldri define/import.meta.env.
      const local = loadEnv(mode, resolve(config.root || '.', '..'), '')
      for (const key of ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'FELLESTALL_GITHUB_TOKEN']) {
        if (!process.env[key] && local[key]) process.env[key] = local[key]
      }
      return { build: { rollupOptions: { input: { main: resolve('index.html'), admin: resolve('admin/index.html') } } } }
    },
    configureServer(server) {
      let admin
      const handle = nodeHandler(async request => {
        admin ??= (await import(pathToFileURL(resolve(server.config.root, '../server/admin/index.mjs')).href)).default
        return admin(request)
      })
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url, 'http://localhost').pathname
        if (/^\/api\/(admin(?:\/|$)|auth(?:\/|$)|telemetry$)/.test(path)) return handle(req, res)
        if (path === '/admin') { req.url = '/admin/index.html'; return next() }
        next()
      })
    },
  }
}
