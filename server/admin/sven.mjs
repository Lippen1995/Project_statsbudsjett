import { emptyPipeline, validatePipeline, mutatePipeline, pipelinePath } from '../../scripts/analyser/pipeline-model.mjs'

export const svenFiles = [
  { id: 'instructions', group: 'Instrukser', title: 'Arbeidsinstruks for Sven', path: 'docs/codex-weekly-analysis.md' },
  { id: 'handbook', group: 'Trening', title: 'Skrivehåndbok', path: 'editorial/learning/handbook.md' },
  { id: 'preferences', group: 'Trening', title: 'Redaksjonelle preferanser', path: 'editorial/learning/preferences.json' },
  { id: 'references', group: 'Trening', title: 'Referanser og læringskilder', path: 'editorial/learning/references.md' },
  { id: 'evaluation', group: 'Trening', title: 'Kvalitetsvurdering', path: 'editorial/learning/evaluation.md' },
  { id: 'learning', group: 'Trening', title: 'Slik lærer Sven', path: 'editorial/learning/README.md' },
]

export function validateSvenEdit(value) {
  const file = svenFiles.find(f => f.id === value?.id)
  if (!file || typeof value.content !== 'string' || value.content.trim().length < 40 ||
      Buffer.byteLength(value.content) > 100000 || !/^[a-f0-9]{40}$/.test(value.sha ?? '') ||
      typeof value.reason !== 'string' || value.reason.trim().length < 5 || value.reason.length > 300 || /[\r\n]/.test(value.reason)) {
    throw Object.assign(Error('Velg en gyldig fil, skriv en endringsbeskrivelse og behold minst 40 tegn.'), { status: 400 })
  }
  if (file.id === 'preferences') {
    let preferences
    try { preferences = JSON.parse(value.content) } catch { throw Object.assign(Error('Preferansene må være gyldig JSON.'), { status: 400 }) }
    if (preferences.version !== 1 || !Array.isArray(preferences.rules) || !Array.isArray(preferences.feedbackEvents) ||
        preferences.rules.some(r => !r.id || !r.rule || !r.scope || !r.provenance || !['active', 'proposed', 'archived', 'superseded'].includes(r.status)) ||
        new Set(preferences.rules.map(r => r.id)).size !== preferences.rules.length) {
      throw Object.assign(Error('Behold preferanseregisterets versjon, unike regel-ID-er, status, kilde og historikk.'), { status: 400 })
    }
  }
  return file
}

export function createGithub({ token = process.env.FELLESTALL_GITHUB_TOKEN, repository = 'Lippen1995/Project_statsbudsjett', fetcher = fetch } = {}) {
  const call = async (path, options = {}, allow404 = false) => {
    const response = await fetcher(`https://api.github.com/repos/${repository}/${path}`, {
      ...options,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (allow404 && response.status === 404) return null
    if (!response.ok) throw Object.assign(Error(response.status === 409 ? 'Filen er endret av en annen. Last inn siste versjon før du lagrer.' : 'GitHub er utilgjengelig eller tilgangen mangler.'), { status: response.status === 409 ? 409 : 502 })
    return response.json()
  }
  const readPipeline = async () => {
    const file = await call(`contents/${pipelinePath}?ref=main`, {}, true)
    if (file && file.encoding !== 'base64') throw Object.assign(Error('Pipeline kunne ikke leses.'), { status: 502 })
    return { ...validatePipeline(file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : emptyPipeline()), sha: file?.sha ?? null, writable: Boolean(token) }
  }
  return {
    writable: Boolean(token),
    readPipeline,
    async changePipeline(action) {
      if (!token) throw Object.assign(Error('Skrivetilgang til GitHub er ikke konfigurert på serveren.'), { status: 503 })
      if (!action || typeof action !== 'object' || Array.isArray(action) || !['add', 'edit', 'delete', 'move'].includes(action.action)) throw Object.assign(Error('Ugyldig pipelinehandling.'), { status: 400 })
      const current = await readPipeline()
      if (action.sha !== current.sha) throw Object.assign(Error('Pipeline er endret av en annen. Hent siste versjon før du prøver igjen.'), { status: 409 })
      const document = mutatePipeline({ version: current.version, items: current.items, history: current.history }, action)
      const result = await call(`contents/${pipelinePath}`, { method: 'PUT', body: JSON.stringify({ branch: 'main',
        ...(current.sha ? { sha: current.sha } : {}), message: `admin: oppdater analysepipeline (${action.action})`,
        content: Buffer.from(JSON.stringify(document, null, 2) + '\n').toString('base64'),
      }) })
      return { ...document, sha: result.content.sha, writable: true }
    },
    async read(id) {
      const file = svenFiles.find(f => f.id === id)
      if (!file) throw Object.assign(Error('Ukjent instruksjonsfil.'), { status: 404 })
      const result = await call(`contents/${file.path}?ref=main`)
      if (result.encoding !== 'base64') throw Object.assign(Error('Filen kunne ikke leses.'), { status: 502 })
      return { ...file, sha: result.sha, content: Buffer.from(result.content, 'base64').toString('utf8') }
    },
    async save(value) {
      const file = validateSvenEdit(value)
      if (!token) throw Object.assign(Error('Skrivetilgang til GitHub er ikke konfigurert på serveren.'), { status: 503 })
      const result = await call(`contents/${file.path}`, { method: 'PUT', body: JSON.stringify({
        branch: 'main', sha: value.sha, content: Buffer.from(value.content).toString('base64'),
        message: `admin: ${value.reason.trim()}\n\nEndret av administrator i Fellestall. Fil: ${file.path}`,
      }) })
      return { sha: result.content.sha, commit: result.commit.sha }
    },
    async log() {
      const [commits, instructions, runs] = await Promise.all([
        call('commits?sha=main&per_page=20&path=editorial'),
        call('commits?sha=main&per_page=10&path=docs/codex-weekly-analysis.md'),
        call('actions/runs?per_page=25'),
      ])
      return {
        commits: [...new Map([...commits, ...instructions].map(c => [c.sha, c])).values()]
          .sort((a, b) => b.commit.committer.date.localeCompare(a.commit.committer.date)).slice(0, 25)
          .map(c => ({ id: c.sha, title: c.commit.message.split('\n')[0], date: c.commit.committer.date, url: c.html_url })),
        runs: runs.workflow_runs.map(r => ({ id: r.id, title: r.name, status: r.status, conclusion: r.conclusion, date: r.created_at, url: r.html_url })),
      }
    },
    async history(id) {
      const file = svenFiles.find(f => f.id === id)
      if (!file) throw Object.assign(Error('Ukjent instruksjonsfil.'), { status: 404 })
      const rows = await call(`commits?sha=main&per_page=15&path=${file.path}`)
      return rows.map(c => ({ id: c.sha, title: c.commit.message.split('\n')[0], date: c.commit.committer.date, url: c.html_url }))
    },
  }
}
