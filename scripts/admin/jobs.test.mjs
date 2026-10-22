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
