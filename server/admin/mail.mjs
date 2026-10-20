import { createHash, randomUUID } from 'node:crypto'
import { fail, recordStore } from './core.mjs'
import { adminEmail } from './auth.mjs'

export function mailService({
  sql,
  fetcher = fetch,
  key = process.env.RESEND_API_KEY,
  from = process.env.FELLESTALL_EMAIL_FROM,
}) {
  const ready = Boolean(
    key && from && /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from),
  )
  const hash = (value) => createHash('sha256').update(value).digest('hex')
  async function send({ key: dedupe, recipient, type, subject, text }) {
    if (!ready)
      fail(
        'E-posttjenesten krever en tilkoblet leverandør og en bekreftet avsenderadresse.',
        503,
      )
    const id = randomUUID(),
      safeKey = hash(dedupe)
    const [claim] = await sql.query(
      `INSERT INTO ft_admin_deliveries(id,dedupe_key,recipient,type,subject,status,attempts,claimed_at)
      VALUES($1,$2,$3,$4,$5,'sending',1,now()) ON CONFLICT(dedupe_key) DO UPDATE
      SET status='sending',attempts=ft_admin_deliveries.attempts+1,claimed_at=now()
      WHERE ft_admin_deliveries.status IN ('failed','sending') AND ft_admin_deliveries.attempts<3
        AND ft_admin_deliveries.created_at>now()-interval '23 hours'
        AND (ft_admin_deliveries.status='failed' OR ft_admin_deliveries.claimed_at<now()-interval '2 minutes') RETURNING id`,
      [id, safeKey, recipient, type, subject],
    )
    if (!claim) return { duplicate: true }
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          'Idempotency-Key': safeKey,
        },
        body: JSON.stringify({ from, to: [recipient], subject, text }),
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok)
        throw Object.assign(Error('E-postleverandøren avviste sendingen.'), {
          code: 'EMAIL_HTTP_' + response.status,
        })
      const result = await response.json()
      await sql.query(
        "UPDATE ft_admin_deliveries SET status='sent',sent_at=now(),provider_id=$2,error_code=NULL WHERE id=$1",
        [claim.id, result.id || null],
      )
      return { sent: true }
    } catch (error) {
      await sql.query(
        "UPDATE ft_admin_deliveries SET status='failed',error_code=$2 WHERE id=$1",
        [claim.id, error.code || 'EMAIL_NETWORK'],
      )
      fail('E-posten kunne ikke bekreftes sendt. Se leveringsloggen.', 503)
    }
  }
  return {
    ready,
    send,
    async reset({ user, url }) {
      await send({
        key: 'password-reset:' + hash(url),
        recipient: user.email,
        type: 'security',
        subject: 'Velg passord for Fellestall-admin',
        text: `Du har bedt om å velge eller tilbakestille passordet ditt. Åpne denne lenken:\n\n${url}\n\nLenken utløper etter én time. Har du ikke bedt om dette, kan du se bort fra e-posten.`,
      })
    },
    async flush(notifications) {
      if (!ready) return { ready: false }
      const state = await notifications.list(),
        preferences = await recordStore(sql).list('preferences')
      const settings = preferences.find((p) => p.id === 'notifications')
        ?.data || {
        severity: 'warning',
        groupMinutes: 30,
        quietStart: '',
        quietEnd: '',
      }
      const recipients = state.recipients.length
        ? state.recipients.filter((r) => r.data.active).map((r) => r.data)
        : [
            {
              email: adminEmail,
              types: ['operations', 'data', 'editorial', 'security', 'quota'],
              digest: 'none',
              active: true,
            },
          ]
      const oslo = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Oslo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date()),
        clock = oslo.slice(-5),
        day = oslo.slice(0, 10)
      const quiet =
        settings.quietStart &&
        settings.quietEnd &&
        (settings.quietStart < settings.quietEnd
          ? clock >= settings.quietStart && clock < settings.quietEnd
          : clock >= settings.quietStart || clock < settings.quietEnd)
      const severity = { info: 0, warning: 1, critical: 2 }
      for (const recipient of recipients) {
        if (recipient.digest !== 'none') {
          const weekly = recipient.digest === 'weekly',
            monday =
              new Intl.DateTimeFormat('en-US', {
                timeZone: 'Europe/Oslo',
                weekday: 'short',
              }).format(new Date()) === 'Mon'
          if (clock < '08:00' || (weekly && !monday)) continue
          const days = weekly ? 7 : 1,
            items = state.items.filter(
              (n) =>
                recipient.types.includes(n.type) &&
                Date.now() - new Date(n.created_at).getTime() < days * 86400000,
            )
          if (!items.length) continue
          await send({
            key:
              'digest:' + recipient.email + ':' + recipient.digest + ':' + day,
            recipient: recipient.email,
            type: 'digest',
            subject: `Fellestall – ${weekly ? 'ukentlig' : 'daglig'} oppsummering`,
            text: items
              .map(
                (n) =>
                  (n.resolved_at ? 'Løst: ' : '') + n.title + '\n' + n.detail,
              )
              .join('\n\n'),
          })
          continue
        }
        const delivered = await sql.query(
          'SELECT notification_id,state_key FROM ft_admin_delivery_items WHERE recipient=$1',
          [recipient.email],
        )
        const candidates = state.items
          .filter(
            (n) =>
              recipient.types.includes(n.type) &&
              severity[n.severity] >= severity[settings.severity] &&
              (!quiet || n.severity === 'critical'),
          )
          .map((n) => ({
            ...n,
            stateKey: n.resolved_at
              ? new Date(n.resolved_at).toISOString()
              : 'open:' + new Date(n.opened_at || n.created_at).toISOString(),
          }))
          .filter(
            (n) =>
              !delivered.some(
                (d) => d.notification_id === n.id && d.state_key === n.stateKey,
              ),
          )
        const critical = candidates.some((n) => n.severity === 'critical')
        if (
          !candidates.length ||
          (!critical &&
            candidates.every(
              (n) =>
                Date.now() - new Date(n.resolved_at || n.created_at).getTime() <
                settings.groupMinutes * 60000,
            ))
        )
          continue
        const key =
          'group:' +
          recipient.email +
          ':' +
          candidates
            .map((n) => n.id + ':' + n.stateKey)
            .sort()
            .join(',')
        const result = await send({
          key,
          recipient: recipient.email,
          type: 'notification',
          subject: `Fellestall – ${candidates.length} statusoppdatering${candidates.length === 1 ? '' : 'er'}`,
          text:
            candidates
              .map(
                (n) =>
                  (n.resolved_at ? 'Tilbake i normal drift: ' : '') +
                  n.title +
                  '\n' +
                  n.detail,
              )
              .join('\n\n') + '\n\nSe https://fellestall.no/admin/#varsler',
        })
        // A duplicate may be an in-flight claim; only mark items when delivery is confirmed.
        const confirmed =
          result.sent ||
          (
            await sql.query(
              "SELECT id FROM ft_admin_deliveries WHERE dedupe_key=$1 AND status='sent'",
              [hash(key)],
            )
          ).length
        if (confirmed)
          for (const n of candidates)
            await sql.query(
              'INSERT INTO ft_admin_delivery_items(recipient,notification_id,state_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
              [recipient.email, n.id, n.stateKey],
            )
      }
      return { ready: true }
    },
  }
}
