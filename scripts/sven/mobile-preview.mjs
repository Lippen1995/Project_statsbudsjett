import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import { homedir } from 'node:os'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { researchWithSven } from '../../server/sven/research.mjs'
import { activeLearningProfile } from '../../server/sven/learning-config.mjs'
import { openWorkspace, usageSummary } from '../../server/sven/workspace.mjs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { analyzeWithSven } from '../../server/sven/analysis.mjs'
import { anthropicSven } from '../../server/sven/anthropic.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { accountContext, expandAccountQuestion } from '../../server/sven/follow-up.mjs'

const dataDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url))
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.txt':'text/plain' }
const reply = (res, status, payload) =>
  res.writeHead(status, { 'content-type':'application/json', 'cache-control':'no-store' }).end(JSON.stringify(payload))

export function mobilePreview({ root, generate, research }) {
  let busy = false
  return createServer(async (req, res) => {
    try {
      const local = `http://127.0.0.1:${req.socket.localPort}`
      if (req.headers.host !== new URL(local).host) return reply(res, 403, { error:'Bruk 127.0.0.1.' })
      const path = new URL(req.url, local).pathname
      if (path === '/api/sven/chat') {
        if (req.method !== 'POST' || req.headers.origin !== local ||
            req.headers['content-type'] !== 'application/json') {
          return reply(res, 403, { error:'Send meldingen fra den lokale forhåndsvisningen.' })
        }
        if (busy) return reply(res, 429, { error:'Sven arbeider med et svar. Prøv igjen snart.' })
        busy = true
        try {
          let input = ''
          for await (const chunk of req.setEncoding('utf8')) {
            input += chunk
            if (input.length > 32768) {
              reply(res, 413, { error:'Meldingen er for lang.' })
              return
            }
          }
          let payload
          try { payload = JSON.parse(input) } catch {}
          const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
          if (!question || question.length > 2000) {
            return reply(res, 400, { error:'Skriv et spørsmål på opptil 2000 tegn.' })
          }
          if (research) {
            const result = await research({question, history: payload.history || []})
            if (result.status !== 'reviewed') return reply(res, 422, { error:'Kvalitetskontrollen fant uløste mangler. Analysen er lagret for gjennomgang.', jobId:result.jobId })
            return reply(res, 200, { ...result.answer, jobId:result.jobId, research:true,
              sources:result.sources.map(({id,title,url})=>({id,title,url})),
              gaps:result.gaps, usage:result.usage })
          }
          const expanded = expandAccountQuestion(question, payload.context)
          if (expanded.clarification) return reply(res, 422, { error:expanded.clarification })
          let sources
          try { sources = await resolveSvenSources(expanded.question, dataDir) }
          catch {
            return reply(res, 422, { error:'Jeg finner ikke et egnet regnskapsgrunnlag. Spør om samlede statsutgifter, oljepengebruk eller et kommunalt nøkkeltall i en navngitt kommune.' })
          }
          const answer = await analyzeWithSven({ question:expanded.question, sources, surface:'chat' }, generate)
          return reply(res, 200, {
            ...answer,
            context:accountContext(sources),
            sources:sources.map(({ id, title, url }) => ({ id, title, url })),
          })
        } finally {
          busy = false
        }
      }
      if (req.method !== 'GET') return reply(res, 405, { error:'Metoden støttes ikke.' })
      const file = await realpath(resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path))).catch(() => null)
      const type = file && mime[extname(file)]
      if (!type || !file.startsWith(root + sep) || !(await stat(file)).isFile()) {
        return reply(res, 404, { error:'Filen finnes ikke.' })
      }
      return res.writeHead(200, { 'content-type':type, 'x-content-type-options':'nosniff' }).end(await readFile(file))
    } catch {
      if (!res.headersSent) reply(res, 502, { error:'Sven kunne ikke svare nå. Prøv igjen.' })
      else res.end()
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const root = await realpath(process.argv[2] || '')
    if (!(await stat(resolve(root, 'index.html'))).isFile()) throw new Error('Oppgi prototypens dist-mappe.')
    const researchMode = process.argv[3] === '--research'
    claudeTransport()
    const workspace = researchMode ? openWorkspace(resolve(process.env.SVEN_WORKSPACE || join(homedir(),'.fellestall-sven','research.sqlite'))) : null
    const server = mobilePreview({ root, generate:anthropicSven(), research:researchMode ? async brief=>{
      const owner='local-operator'
      const id=workspace.create(owner,{...brief,tuning:(await activeLearningProfile()).settings,model:process.env.SVEN_MODEL,asOf:new Date().toISOString().slice(0,10)})
      const result=await workspace.execute(owner,id,(input,onUsage)=>claudeTransport({onUsage})(input),
        options=>researchWithSven({...options,localSources:question=>resolveSvenSources(question,dataDir)}))
      return {...result,jobId:id,usage:usageSummary(workspace.usage(owner,id))}
    } : undefined })
    server.on('close',()=>workspace?.close())
    server.listen(4176, '127.0.0.1', () => console.log('http://127.0.0.1:4176/?sven=local#sven'))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
