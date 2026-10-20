import { recordStore } from './core.mjs'
import { adminEmail } from './auth.mjs'

// Read the real, provisioned Checkly account. No browser-supplied URLs or keys.
export function monitoringService({
  sql,
  notifications,
  fetcher = fetch,
  key = process.env.CHECKLY_API_KEY,
  accountId = process.env.CHECKLY_ACCOUNT_ID,
}) {
  let running
  const ready = Boolean(key && accountId)
  async function api(path) {
    const response = await fetcher('https://api.checklyhq.com' + path, {
      headers: {
        Authorization: `Bearer ${key}`,
        'x-checkly-account': accountId,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok)
      throw Object.assign(Error('Checkly-kontrollen kunne ikke oppdateres.'), {
        code: 'CHECKLY_' + response.status,
      })
    return response.json()
  }
  async function refresh() {
    if (!ready)
      return {
        available: false,
        reason: 'Checkly-tilgangen mangler på serveren.',
        checkedAt: null,
      }
    await sql.query(
      'UPDATE ft_admin_checkly_results SET attempts=GREATEST(runs-1,0),runs=GREATEST(runs-1,1) WHERE attempts IS NULL',
    )
    const [cached] = await sql.query(
      "SELECT data,checked_at FROM ft_admin_provider_cache WHERE provider='checkly'",
    )
    if (
      cached &&
      cached.data.version === 2 &&
      Date.now() - new Date(cached.checked_at).getTime() < 240000
    )
      return cached.data
    try {
      const [account, entitlements, checks, channels] = await Promise.all([
        api('/v1/accounts/me'),
        api('/v1/accounts/me/entitlements'),
        api('/v1/checks?limit=100'),
        api('/v1/alert-channels').catch(() => null),
      ])
      if (!Array.isArray(checks) || account.id !== accountId)
        throw Error('Ugyldig Checkly-konto eller svar')
      const apiChecks = checks.filter((c) => c.checkType === 'API'),
        states = []
      const month = new Date()
      month.setUTCDate(1)
      month.setUTCHours(0, 0, 0, 0)
      let complete = true
      for (const check of apiChecks.slice(0, 20)) {
        const [last] = await sql.query(
          'SELECT max(checked_at) AS latest,min(checked_at) AS oldest FROM ft_admin_checkly_results WHERE check_id=$1',
          [check.id],
        )
        const oldestAllowed = Date.now() - 6 * 86400000
        const created = Date.parse(check.created_at || '')
        const coverageStart = Math.max(
          month.getTime(),
          Number.isFinite(created) ? created : month.getTime(),
        )
        const tolerance = Math.max(120000, (check.frequency || 5) * 120000)
        if (
          last?.oldest
            ? new Date(last.oldest).getTime() > coverageStart + tolerance
            : coverageStart < oldestAllowed
        )
          complete = false
        const from = Math.max(
          month.getTime(),
          oldestAllowed,
          last?.latest
            ? new Date(last.latest).getTime() - 60000
            : Number.isFinite(created)
              ? created
              : 0,
        )
        let cursor = null,
          pages = 0,
          newest = null
        do {
          const result = await api(
            `/v2/check-results/${encodeURIComponent(check.id)}?limit=100&resultType=FINAL&from=${Math.floor(from / 1000)}&fields=id,created_at,startedAt,hasFailures,hasErrors,isDegraded,responseTime,attempts${cursor ? '&nextId=' + encodeURIComponent(cursor) : ''}`,
          )
          for (const entry of result.entries || []) {
            const at = entry.startedAt || entry.created_at
            if (!entry.id || !Number.isFinite(Date.parse(at))) continue
            newest ??= entry
            // The live FINAL payload counts the initial execution in `attempts`.
            const attempts = Number.isInteger(entry.attempts)
              ? Math.max(0, entry.attempts)
              : 1
            const runs = Math.max(1, attempts)
            await sql.query(
              `INSERT INTO ft_admin_checkly_results(id,check_id,check_name,checked_at,runs,failed,degraded,response_ms,attempts)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
              [
                entry.id,
                check.id,
                check.name,
                at,
                runs,
                Boolean(entry.hasFailures || entry.hasErrors),
                Boolean(entry.isDegraded),
                entry.responseTime ?? null,
                attempts,
              ],
            )
          }
          cursor = result.nextId
          pages++
        } while (cursor && pages < 10)
        if (cursor) complete = false
        const [lastResult] = await sql.query(
          'SELECT checked_at,failed,degraded,response_ms,attempts FROM ft_admin_checkly_results WHERE check_id=$1 ORDER BY checked_at DESC LIMIT 1',
          [check.id],
        )
        const expected = Math.max(60000, (check.frequency || 5) * 60000)
        const stale =
          !lastResult ||
          Date.now() - new Date(lastResult.checked_at).getTime() >
            expected * 2 + 120000
        const stopped = !check.activated || stale
        const locations = check.runParallel
          ? Math.max(1, check.locations?.length || 1)
          : 1
        let target = null
        try {
          const u = new URL(check.request?.url)
          target = u.origin + u.pathname
        } catch {}
        states.push({
          id: check.id,
          name: check.name,
          activated: check.activated,
          muted: check.muted,
          frequency: check.frequency,
          parallel: Boolean(check.runParallel),
          locations: check.locations || [],
          target,
          lastResult,
          stale,
          stopped,
          alertsConfirmed: Array.isArray(channels)
            ? channels.some(
                (channel) =>
                  channel.type === 'EMAIL' &&
                  String(channel.config?.address || '')
                    .split(',')
                    .map((e) => e.trim().toLowerCase())
                    .includes(adminEmail) &&
                  channel.sendFailure &&
                  channel.sendRecovery &&
                  channel.sendDegraded &&
                  channel.subscriptions?.some(
                    (s) => s.checkId === check.id && s.activated,
                  ),
              )
            : null,
          estimatedMonthly: check.activated
            ? Math.ceil(
                ((new Date(
                  Date.UTC(
                    new Date().getUTCFullYear(),
                    new Date().getUTCMonth() + 1,
                    0,
                  ),
                ).getUTCDate() *
                  1440) /
                  Math.max(1, check.frequency || 5)) *
                  locations,
              )
            : 0,
        })
        if (notifications && target?.startsWith('https://fellestall.no/'))
          await notifications.publish({
            key: 'monitor:' + check.id,
            type: 'operations',
            severity: stopped ? 'critical' : 'info',
            title: stopped
              ? 'Overvåkingen har stanset eller mangler nye resultater.'
              : 'Ekstern overvåking kjører.',
            detail: check.name,
            resource: 'overvaking',
            resolved: !stopped,
          })
      }
      const totals = await sql.query(
        'SELECT check_id,check_name,sum(runs)::int AS runs,count(*)::int AS checks FROM ft_admin_checkly_results WHERE checked_at>=$1 GROUP BY check_id,check_name ORDER BY runs DESC',
        [month.toISOString()],
      )
      const candidates = (entitlements.entitlements || []).filter(
        (e) =>
          e.type === 'metered' &&
          /api/i.test(e.key + ' ' + e.name) &&
          /run/i.test(e.key + ' ' + e.name),
      )
      const limit =
        candidates.find((e) => Number.isFinite(e.quantity))?.quantity ?? null
      const used = totals.reduce((n, r) => n + r.runs, 0),
        now = new Date(),
        daysInMonth = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
        ).getUTCDate()
      const daysElapsed = Math.max(1, (Date.now() - month.getTime()) / 86400000)
      const projected = Math.max(
        states.reduce((n, c) => n + c.estimatedMonthly, 0),
        Math.ceil((used / daysElapsed) * daysInMonth),
      )
      const data = {
        version: 2,
        available: true,
        checkedAt: now.toISOString(),
        account: {
          name: account.name,
          plan:
            account.planDisplayName ||
            entitlements.planDisplayName ||
            account.plan ||
            null,
          limits: (entitlements.entitlements || []).map((e) => ({
            key: e.key,
            name: e.name,
            type: e.type,
            quantity: e.quantity ?? null,
            enabled: e.enabled ?? null,
          })),
          trialEnd:
            account.settings?.trialEnd || account.settings?.trialEndsAt || null,
        },
        checks: states.filter((c) =>
          c.target?.startsWith('https://fellestall.no/'),
        ),
        quota: {
          limit,
          observedRuns: used,
          complete: complete && apiChecks.length <= 20,
          periodStart: month.toISOString(),
          periodEnd: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
          ).toISOString(),
          projected,
          byCheck: totals,
          source:
            'Faktiske Checkly-resultater. Kalenderperiode; leverandørens faktureringsperiode kan avvike.',
        },
      }
      if (notifications && limit)
        for (const threshold of [80, 90, 100])
          await notifications.publish({
            key: `quota:${month.toISOString().slice(0, 7)}:${threshold}`,
            type: 'quota',
            severity: threshold === 100 ? 'critical' : 'warning',
            title: `Checkly-forbruket har nådd ${threshold} prosent.`,
            detail: `${used} observerte kjøringer av en kvote på ${limit}.`,
            resource: 'overvaking',
            resolved: (used / limit) * 100 < threshold,
          })
      await sql.query(
        "INSERT INTO ft_admin_provider_cache(provider,data) VALUES('checkly',$1::jsonb) ON CONFLICT(provider) DO UPDATE SET data=EXCLUDED.data,checked_at=now()",
        [JSON.stringify(data)],
      )
      await sql.query(
        "DELETE FROM ft_admin_checkly_results WHERE checked_at<now()-interval '90 days'",
      )
      return data
    } catch (error) {
      return {
        ...(cached?.data || {}),
        available: false,
        stale: Boolean(cached),
        reason:
          'Checkly-data kan ikke hentes. Kontroller integrasjonens tilgang.',
        errorCode: error.code || 'CHECKLY_UNAVAILABLE',
      }
    }
  }
  return {
    ready,
    async peek() {
      const [row] = await sql.query(
        "SELECT data,checked_at FROM ft_admin_provider_cache WHERE provider='checkly'",
      )
      return row
        ? {
            ...row.data,
            stale: Date.now() - new Date(row.checked_at).getTime() > 600000,
          }
        : null
    },
    get() {
      running ||= refresh().finally(() => {
        running = null
      })
      return running
    },
    async integrations() {
      const policies = await recordStore(sql).list('integrationPolicies')
      return {
        checkly: ready,
        github: Boolean(process.env.FELLESTALL_GITHUB_TOKEN),
        email: Boolean(
          process.env.RESEND_API_KEY && process.env.FELLESTALL_EMAIL_FROM,
        ),
        policies,
      }
    },
  }
}
