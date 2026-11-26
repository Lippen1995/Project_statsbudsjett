import { createHash } from 'node:crypto'

export function customerMail({ key = process.env.RESEND_API_KEY,
  from = process.env.FELLESTALL_CUSTOMER_EMAIL_FROM || process.env.FELLESTALL_EMAIL_FROM, fetcher = fetch } = {}) {
  const ready = Boolean(key && from && /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from))
  async function send({ user, url }, purpose) {
    if (!ready) throw Error('Kundeinnloggingens e-posttjeneste er ikke konfigurert.')
    const verify = purpose === 'verify'
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
        'Idempotency-Key': createHash('sha256').update('customer:' + purpose + ':' + url).digest('hex') },
      body: JSON.stringify({ from, to: [user.email], subject: verify ? 'Bekreft e-postadressen din hos Fellestall' : 'Velg nytt passord for Fellestall',
        text: (verify ? 'Bekreft e-postadressen din for å bruke Fellestall.' : 'Du har bedt om å velge et nytt passord for Fellestall.') +
          '\n\n' + url + '\n\nLenken utløper etter én time. Hvis du ikke ba om dette, kan du se bort fra e-posten.' }),
    })
    if (!response.ok) throw Error('Kundeinnloggingens e-post kunne ikke bekreftes sendt.')
  }
  return { ready, verify: value=>send(value,'verify'), reset: value=>send(value,'reset') }
}
