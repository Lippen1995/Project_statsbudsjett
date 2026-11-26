import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { openWorkspace, usageSummary } from '../../server/sven/workspace.mjs'
import { activeLearningProfile } from '../../server/sven/learning-config.mjs'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { researchWithSven } from '../../server/sven/research.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'

const dataDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url))
const dbPath = resolve(process.env.SVEN_WORKSPACE || join(homedir(), '.fellestall-sven', 'research.sqlite'))
const workspace = openWorkspace(dbPath)
const owner = 'local-operator'
try {
  const [command, value] = process.argv.slice(2)
  if (command === 'list') console.log(JSON.stringify(workspace.list(owner).map(({id,status,created_at}) => ({id,status,created_at})), null, 2))
  else if (command === 'show') console.log(JSON.stringify({ ...workspace.get(owner,value), usage: usageSummary(workspace.usage(owner,value)) },null,2))
  else if (command === 'stop') workspace.cancel(owner,value)
  else if (command === 'recover') workspace.recover(owner,value)
  else if (['run','resume'].includes(command)) {
    // Fail before creating a job if credentials are absent.
    claudeTransport()
    const id = command === 'resume' ? value : workspace.create(owner, {
      ...JSON.parse(await readFile(value,'utf8')), tuning:(await activeLearningProfile()).settings, model: process.env.SVEN_MODEL, asOf: new Date().toISOString().slice(0,10),
    })
    if (workspace.get(owner,id).brief.model !== process.env.SVEN_MODEL) throw new Error('Modellen er endret. Opprett en ny analyseversjon.')
    console.error(`Analyse: ${id}`)
    const result = await workspace.execute(owner,id,
      (input,onUsage) => claudeTransport({onUsage})(input),
      options => researchWithSven({ ...options, localSources: question => resolveSvenSources(question,dataDir) }))
    console.log(JSON.stringify({ ...result, jobId: id, usage: usageSummary(workspace.usage(owner,id)) },null,2))
    if (result.status !== 'reviewed') process.exitCode = 2
  } else throw new Error('Bruk: node scripts/sven/research.mjs run <oppdrag.json> | resume/show/stop/recover <id> | list')
} catch(error) {
  console.error(error.message)
  process.exitCode = 1
} finally { workspace.close() }
