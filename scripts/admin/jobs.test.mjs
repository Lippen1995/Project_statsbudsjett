import test from 'node:test'
import assert from 'node:assert/strict'
import { testDatabase } from './test-support.mjs'
import { notificationService } from '../../server/admin/notifications.mjs'
import { jobService } from '../../server/admin/jobs.mjs'

const origin = 'https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/'
const run = (id, conclusion, offset = 0, workflow = 'budget-monitor.yml') => ({
  id, name: 'Budsjettkontroll', path: '.github/workflows/' + workflow,
  status: conclusion ? 'completed' : 'in_progress', conclusion,
  created_at: new Date(Date.now() + offset).toISOString(),
  updated_at: new Date(Date.now() + offset).toISOString(), html_url: origin + id,
})

test('jobbvarsler lukkes bare med bekreftet vellykket kjøring', async t => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  const notifications = notificationService(db.sql)
  const failure = run(1, 'failure', -60000)
  async function alert(id = 1) {
    await notifications.publish({ key: 'job:failure:' + id, type: 'data',
      severity: 'warning', title: 'Kontroll feilet', detail: 'Opprinnelig feil', resource: origin + id })
  }
  async function refresh(runs, older = failure) {
    const github = {
      readFile: async () => null,
      api: async path => {
        if (path === 'actions/runs/1') {
          if (older instanceof Error) throw older
          return older
        }
        return { workflow_runs: runs }
      },
    }
    await jobService({ ...db, github, notifications }).get()
    return (await db.sql.query("SELECT * FROM ft_admin_notifications WHERE dedupe_key='job:failure:1'"))[0]
  }
  await t.test('samme kjørings-ID etter vellykket omkjøring', async () => {
    await alert()
    const item = await refresh([run(1, 'success')])
    assert.ok(item.resolved_at)
    assert.match(item.detail, /Bekreftet løst.*\/1/)
  })
  for (const conclusion of ['failure', 'cancelled', 'skipped', null])
    await t.test('nyere ' + conclusion + ' skjuler ikke den aktive feilen', async () => {
      await alert()
      const item = await refresh([run(2, conclusion), failure])
      assert.equal(item.resolved_at, null)
    })
  await t.test('en annen workflow beviser ikke at feilen er løst', async () => {
    await alert()
    assert.equal((await refresh([run(2, 'success', 0, 'deploy.yml'), failure])).resolved_at, null)
  })
  await t.test('nyere vellykket kjøring av samme workflow lukker feilen', async () => {
    await alert()
    assert.ok((await refresh([run(2, 'success'), failure])).resolved_at)
  })
  await t.test('eldre vellykket kjøring lukker ikke en nyere feil', async () => {
    await alert()
    assert.equal((await refresh([failure, run(2, 'success', -120000)])).resolved_at, null)
  })
  await t.test('lagret varsel utenfor historikksiden kontrolleres direkte', async () => {
    await alert()
    const item = await refresh([], run(1, 'success'))
    assert.ok(item.resolved_at)
    assert.match(item.detail, /Bekreftet løst.*\/1/)
  })
  await t.test('utilgjengelig GitHub lar varselet stå åpent', async () => {
    await alert()
    assert.equal((await refresh([], Error('GitHub unavailable'))).resolved_at, null)
  })
})

test('gamle Sven-varsler krever dokumentert fullført køkontroll', async t => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-22T08:30:00Z') })
  const notifications = notificationService(db.sql)
  const key = 'job:sven:2026-10-20'
  const completed = {
    id: 'confirmed-run', state: 'waiting',
    startedAt: '2026-10-21T07:04:57Z', finishedAt: '2026-10-21T07:08:03Z',
  }
  async function refresh(native) {
    await notifications.publish({key, type: 'editorial', severity: 'warning', title: 'Mangler status', detail: 'Original', resource: 'sven'})
    const github = {
      readFile: async () => native ? {content: JSON.stringify(native)} : null,
      api: async () => ({workflow_runs: []}),
    }
    await jobService({...db, github, notifications}).get()
    return (await db.sql.query('SELECT * FROM ft_admin_notifications WHERE dedupe_key=$1', [key]))[0]
  }
  for (const [label, entry] of [
    ['manglende fil', null],
    ['eldre kjøring', {...completed, startedAt: '2026-10-19T07:00:00Z', finishedAt: '2026-10-19T07:01:00Z'}],
    ['feilet kjøring', {...completed, state: 'failed'}],
    ['pågående kjøring', {...completed, state: 'researching', finishedAt: undefined}],
    ['manglende slutttid', {...completed, finishedAt: undefined}],
    ['ugyldig starttid', {...completed, startedAt: 'invalid'}],
    ['slutt før start', {...completed, finishedAt: '2026-10-20T07:00:00Z'}],
    ['fremtidig kjøring', {...completed, startedAt: '2026-10-23T07:00:00Z', finishedAt: '2026-10-23T07:01:00Z'}],
  ]) await t.test(label + ' lar varselet stå åpent', async () => {
    assert.equal((await refresh(entry ? {current: entry} : null)).resolved_at, null)
  })
  await t.test('fullført kontroll i historikken bekrefter gjenoppretting', async () => {
    const item = await refresh({history: [completed]})
    assert.ok(item.resolved_at)
    assert.match(item.detail, /confirmed-run.*2026-10-21T07:08:03Z/)
    assert.match(item.detail, /ikke etterregistrert/)
  })
  await t.test('norsk dato ved midnatt brukes for den opprinnelige varslingsdagen', async () => {
    const item = await refresh({current: {...completed, startedAt: '2026-10-19T22:30:00Z', finishedAt: '2026-10-19T22:31:00Z'}})
    assert.ok(item.resolved_at)
  })
})

test('planvarsler lukkes bare når forventet main-kjøring finnes', async t => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-10-22T07:00:00Z')})
  const notifications = notificationService(db.sql)
  const key = 'job:missing:budget-monitor.yml'
  async function refresh(runs) {
    await notifications.publish({key, type: 'data', severity: 'warning', title: 'Mangler kjøring', detail: 'Original'})
    const github = {readFile: async () => null, api: async path => {
      if (path.startsWith('actions/workflows/budget-monitor.yml')) {
        assert.match(path, /branch=main/)
        return {workflow_runs: runs}
      }
      return {workflow_runs: []}
    }}
    await jobService({...db, github, notifications}).get()
    return (await db.sql.query('SELECT * FROM ft_admin_notifications WHERE dedupe_key=$1', [key]))[0]
  }
  assert.equal((await refresh([])).resolved_at, null, 'ny frist alene er ikke bevis på gjenoppretting')
  const actual = {...run(2, 'failure'), created_at: '2026-10-22T06:30:00Z'}
  const item = await refresh([actual])
  assert.ok(item.resolved_at, 'en utført, men feilet jobb løser bare manglende kjøring')
  assert.match(item.detail, /Bekreftet kjøring:.*\/2/)
})
