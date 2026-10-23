import { audit, fail, requireRole } from './core.mjs'

const jobRun = (r) => ({
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
})

function recoveryFor(job, runs) {
  return runs.find((run) =>
    job.workflow && run.workflow === job.workflow &&
    run.status === 'completed' && run.conclusion === 'success' &&
    (run.id === job.id ||
      (Date.parse(run.createdAt) >= Date.parse(job.createdAt) &&
       Date.parse(run.updatedAt) >= Date.parse(job.updatedAt))),
  )
}

const osloDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
})
const dayOf = (value) => Number.isFinite(Date.parse(value))
  ? osloDate.format(new Date(value)) : null

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
    const runs = (response.workflow_runs || []).map(jobRun)
    const native = heartbeat ? JSON.parse(heartbeat.content) : null
    const today = dayOf(new Date().toISOString())
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Oslo',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    )
    const reportedToday = [native?.current, ...(native?.history || [])].some(
      (entry) => dayOf(entry?.startedAt) === today && Date.parse(entry.startedAt) <= Date.now(),
    )
    const missing = hour >= 10 && !reportedToday
    if (notifications) {
      if (missing)
        await notifications.publish({
          key: 'job:sven:' + today,
          type: 'editorial',
          severity: 'warning',
          title: 'Dagens Sven-kjøring mangler bekreftet arbeidsstatus.',
          detail: 'Forventet køkontroll kl. 09.00 i norsk tid. Se arbeidsloggen og kontroller om oppgaven har kjørt.',
          resource: 'sven',
        })
      // En senere fullført køkontroll bekrefter gjenoppretting, men beviser
      // ikke at kontrollen også ble utført på dagen som opprinnelig manglet.
      const completed = [native?.current, ...(native?.history || [])].filter(
        (entry) => entry?.id && ['waiting', 'review', 'completed'].includes(entry.state) &&
          dayOf(entry.startedAt) && Date.parse(entry.finishedAt) >= Date.parse(entry.startedAt) &&
          Date.parse(entry.finishedAt) <= Date.now(),
      ).sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
      const open = await sql.query(
        "SELECT * FROM ft_admin_notifications WHERE resolved_at IS NULL AND dedupe_key LIKE 'job:sven:%'",
      )
      for (const item of open) {
        const date = item.dedupe_key.slice('job:sven:'.length)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
        const recovery = completed.find((entry) => dayOf(entry.startedAt) >= date)
        if (recovery)
          await notifications.publish({
            key: item.dedupe_key, type: item.type, severity: item.severity,
            title: item.title, resource: item.resource,
            detail: 'Bekreftet gjenopprettet av fullført Sven-køkontroll ' + recovery.id +
              ' (' + recovery.finishedAt + '). Den opprinnelig manglende dagen er ikke etterregistrert.',
            resolved: true,
          })
      }
    }
    for (const job of runs
      .filter(
        (r) =>
          Date.now() - Date.parse(r.updatedAt) < 7 * 86400000 &&
          r.conclusion === 'failure',
      )
      .slice(0, 5))
      if (notifications) {
        const recovery = recoveryFor(job, runs)
        await notifications.publish({
          key: 'job:failure:' + job.id,
          type: /etl|neon|data/i.test(job.name) ? 'data' : 'operations',
          severity: 'warning',
          title: job.name + ' feilet.',
          detail: recovery
            ? 'Bekreftet løst av vellykket kjøring: ' + recovery.url
            : 'Se den faktiske kjøringen for feilsteg og årsak.',
          resource: job.url,
          resolved: Boolean(recovery),
        })
      }
    // En vellykket omkjøring har samme ID og finnes ikke lenger i feillisten.
    // Kontroller også lagrede varsler som har falt utenfor den siste siden.
    if (notifications) {
      const open = await sql.query(
        "SELECT * FROM ft_admin_notifications WHERE resolved_at IS NULL AND dedupe_key LIKE 'job:failure:%'",
      )
      for (const item of open) {
        const id = item.dedupe_key.slice('job:failure:'.length)
        if (!/^\d+$/.test(id)) continue
        let job = runs.find((run) => String(run.id) === id)
        if (!job) {
          try {
            job = jobRun(await github.api('actions/runs/' + id))
          } catch {
            continue // Manglende bevis er aldri grunn til å lukke et varsel.
          }
        }
        const recovery = recoveryFor(job, [job, ...runs])
        if (recovery)
          await notifications.publish({
            key: item.dedupe_key,
            type: item.type,
            severity: item.severity,
            title: item.title,
            detail: 'Bekreftet løst av vellykket kjøring: ' + recovery.url,
            resource: item.resource,
            resolved: true,
          })
      }
    }
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
          'actions/workflows/' + definition.workflow + '/runs?per_page=5&branch=main',
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
      const occurred = latest && Date.parse(latest.created_at) >= Date.parse(definition.expected)
      if (notifications && (overdue || occurred))
        await notifications.publish({
          key: 'job:missing:' + definition.workflow,
          type: 'data',
          severity: 'warning',
          title: definition.name + ' mangler forventet kjøring.',
          detail:
            'Forventet etter ' +
            definition.expected +
            (occurred ? '. Bekreftet kjøring: ' + latest.html_url : '. Kontroller Actions-planen.'),
          resource: 'drift',
          resolved: Boolean(occurred),
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
