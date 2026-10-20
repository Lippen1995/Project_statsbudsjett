import { audit, fail, requireRole } from './core.mjs'

export function jobService({ sql, github, notifications }) {
  let cached,
    checked = 0,
    running
  async function refresh() {
    if (cached && Date.now() - checked < 60000) return cached
    const [response, heartbeat] = await Promise.all([
      github.api('actions/runs?per_page=60&branch=main'),
      github.readFile('editorial/sven-status.json'),
    ])
    const runs = (response.workflow_runs || []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      createdAt: r.created_at,
      startedAt: r.run_started_at,
      updatedAt: r.updated_at,
      url: r.html_url,
      workflow: r.path?.split('/').at(-1),
      commit: r.head_sha,
    }))
    const native = heartbeat ? JSON.parse(heartbeat.content) : null
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Oslo',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    )
    const missing =
      hour >= 10 &&
      (!native?.current?.startedAt ||
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Oslo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(native.current.startedAt)) < today)
    if (notifications)
      await notifications.publish({
        key: 'job:sven:' + today,
        type: 'editorial',
        severity: 'warning',
        title: 'Dagens Sven-kjøring mangler bekreftet arbeidsstatus.',
        detail:
          'Forventet køkontroll kl. 09.00 i norsk tid. Se arbeidsloggen og kontroller om oppgaven har kjørt.',
        resource: 'sven',
        resolved: !missing,
      })
    const newestByWorkflow = new Map()
    for (const run of runs.filter((r) => r.status === 'completed'))
      if (!newestByWorkflow.has(run.workflow))
        newestByWorkflow.set(run.workflow, run)
    for (const job of runs
      .filter(
        (r) =>
          Date.now() - Date.parse(r.updatedAt) < 7 * 86400000 &&
          r.conclusion === 'failure',
      )
      .slice(0, 5))
      if (notifications)
        await notifications.publish({
          key: 'job:failure:' + job.id,
          type: /etl|neon|data/i.test(job.name) ? 'data' : 'operations',
          severity: 'warning',
          title: job.name + ' feilet.',
          detail: 'Se den faktiske kjøringen for feilsteg og årsak.',
          resource: job.url,
          resolved: newestByWorkflow.get(job.workflow)?.id !== job.id,
        })
    const deadlines = [
      {
        workflow: 'etl.yml',
        name: 'Månedlig datainnhenting',
        expected: (() => {
          const date = new Date()
          date.setUTCDate(5)
          date.setUTCHours(6, 0, 0, 0)
          if (date > Date.now()) date.setUTCMonth(date.getUTCMonth() - 1)
          return date.toISOString()
        })(),
      },
      {
        workflow: 'budget-monitor.yml',
        name: 'Daglig budsjettkontroll',
        expected: (() => {
          const date = new Date()
          date.setUTCHours(6, 20, 0, 0)
          if (date > Date.now()) date.setUTCDate(date.getUTCDate() - 1)
          return date.toISOString()
        })(),
      },
    ]
    const schedules = []
    for (const definition of deadlines) {
      const response = await github.api(
          'actions/workflows/' + definition.workflow + '/runs?per_page=5',
        ),
        latest = response.workflow_runs?.[0],
        overdue =
          Date.now() - Date.parse(definition.expected) > 2 * 3600000 &&
          (!latest ||
            Date.parse(latest.created_at) < Date.parse(definition.expected))
      schedules.push({
        ...definition,
        latest: latest
          ? {
              id: latest.id,
              status: latest.status,
              conclusion: latest.conclusion,
              at: latest.created_at,
              url: latest.html_url,
            }
          : null,
        overdue,
      })
      if (notifications)
        await notifications.publish({
          key: 'job:missing:' + definition.workflow,
          type: 'data',
          severity: 'warning',
          title: definition.name + ' mangler forventet kjøring.',
          detail:
            'Forventet etter ' +
            definition.expected +
            '. Kontroller Actions-planen.',
          resource: 'drift',
          resolved: !overdue,
        })
    }
    cached = {
      runs,
      schedules,
      native,
      expected: {
        time: '09:00',
        timeZone: 'Europe/Oslo',
        frequency: 'daily',
        source:
          'Eksisterende planlagt oppgave; arbeidsstatus rapporteres fra selve kjøringen.',
      },
      missing,
      checkedAt: new Date().toISOString(),
    }
    checked = Date.now()
    return cached
  }
  return {
    get() {
      running ||= refresh().finally(() => {
        running = null
      })
      return running
    },
    async retry(user, value) {
      requireRole(user)
      const state = await this.get(),
        run = state.runs.find((r) => r.id === value.id)
      if (!run || run.status !== 'completed' || run.conclusion !== 'failure')
        fail('Velg en avsluttet, mislykket kjøring.', 409)
      if (!['etl.yml', 'neon-check.yml', 'deploy.yml'].includes(run.workflow))
        fail(
          'Denne jobben må håndteres i den tilhørende gjennomgangen eller distribusjonsvisningen.',
        )
      const result = await github.dispatch(run.workflow, {})
      await audit(sql, user, 'retry-job', 'jobs/' + run.id, null, result)
      checked = 0
      return { requested: true, ...result }
    },
  }
}
