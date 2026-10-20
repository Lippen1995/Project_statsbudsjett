import tls from 'node:tls'

export function infrastructureService({ sql, notifications, fetcher = fetch }) {
  async function certificate() {
    return new Promise((resolve) => {
      const socket = tls.connect({
        host: 'fellestall.no',
        port: 443,
        servername: 'fellestall.no',
        rejectUnauthorized: true,
      })
      let done = false
      const finish = (value) => {
        if (done) return
        done = true
        socket.destroy()
        resolve(value)
      }
      socket.setTimeout(5000, () =>
        finish({
          available: false,
          reason: 'Sertifikatkontrollen brukte for lang tid.',
        }),
      )
      socket.once('error', () =>
        finish({
          available: false,
          reason: 'TLS-sertifikatet kunne ikke kontrolleres.',
        }),
      )
      socket.once('secureConnect', () => {
        const cert = socket.getPeerCertificate()
        finish(
          cert.valid_to
            ? {
                available: true,
                expiresAt: new Date(cert.valid_to).toISOString(),
                issuer: cert.issuer?.O || null,
              }
            : {
                available: false,
                reason: 'Sertifikatets utløpsdato er ukjent.',
              },
        )
      })
    })
  }
  return {
    async get() {
      const [cached] = await sql.query(
        "SELECT data,checked_at FROM ft_admin_provider_cache WHERE provider='infrastructure'",
      )
      if (
        cached &&
        Date.now() - new Date(cached.checked_at).getTime() < 3600000
      )
        return cached.data
      const ssl = await certificate()
      let domain = { expiresAt: null }
      try {
        const response = await fetcher(
          'https://rdap.norid.no/domain/fellestall.no',
          { signal: AbortSignal.timeout(5000), redirect: 'error' },
        )
        if (response.ok) {
          const value = await response.json(),
            expiry = value.events?.find((e) => e.eventAction === 'expiration')
          if (expiry && Number.isFinite(Date.parse(expiry.eventDate)))
            domain.expiresAt = new Date(expiry.eventDate).toISOString()
        }
      } catch {}
      if (!domain.expiresAt) {
        const [policy] = await sql.query(
          "SELECT data FROM ft_admin_records WHERE collection='integrationPolicies' AND data->>'integration'='domain' AND data->>'expiresAt' IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
        )
        if (policy?.data?.expiresAt)
          domain = { expiresAt: policy.data.expiresAt, source: 'admin' }
      }
      if (notifications && ssl.available)
        await notifications.publish({
          key: 'infrastructure:ssl',
          type: 'operations',
          severity: 'warning',
          title: 'TLS-sertifikatet utløper snart.',
          detail: 'Gyldig til ' + ssl.expiresAt,
          resource: 'drift',
          resolved: Date.parse(ssl.expiresAt) - Date.now() > 30 * 86400000,
        })
      if (notifications && domain.expiresAt)
        await notifications.publish({
          key: 'infrastructure:domain',
          type: 'operations',
          severity: 'warning',
          title: 'Domenet må fornyes snart.',
          detail: 'Registrert utløpsdato ' + domain.expiresAt,
          resource: 'drift',
          resolved: Date.parse(domain.expiresAt) - Date.now() > 30 * 86400000,
        })
      const data = { ssl, domain, checkedAt: new Date().toISOString() }
      await sql.query(
        "INSERT INTO ft_admin_provider_cache(provider,data) VALUES('infrastructure',$1::jsonb) ON CONFLICT(provider) DO UPDATE SET data=EXCLUDED.data,checked_at=now()",
        [JSON.stringify(data)],
      )
      return data
    },
  }
}
export async function checkLinks(urls, fetcher = fetch) {
  const allowed = (host) =>
    [
      'fellestall.no',
      'www.fellestall.no',
      'ssb.no',
      'www.ssb.no',
      'data.ssb.no',
      'regjeringen.no',
      'www.regjeringen.no',
      'statsbudsjettet.no',
      'www.statsbudsjettet.no',
      'riksrevisjonen.no',
      'www.riksrevisjonen.no',
      'stortinget.no',
      'www.stortinget.no',
      'norges-bank.no',
      'www.norges-bank.no',
      'nbim.no',
      'www.nbim.no',
      'lovdata.no',
      'www.nrk.no',
      'nrk.no',
    ].includes(host)
  const items = []
  for (let i = 0; i < urls.length; i += 4)
    items.push(
      ...(await Promise.all(
        urls.slice(i, i + 4).map(async (raw) => {
          let url
          try {
            url = new URL(raw, 'https://fellestall.no')
            if (
              url.protocol !== 'https:' ||
              url.username ||
              url.password ||
              url.port ||
              !allowed(url.hostname)
            )
              return {
                url: raw,
                status: 'Ikke testet',
                note: 'Åpne kilden manuelt; domenet er utenfor den automatiske kontrollen.',
              }
          } catch {
            return {
              url: raw,
              status: 'Ugyldig adresse',
              note: 'Kontroller lenken.',
            }
          }
          try {
            for (let hop = 0; hop < 4; hop++) {
              const response = await fetcher(url, {
                method: 'HEAD',
                redirect: 'manual',
                signal: AbortSignal.timeout(5000),
              })
              if ([301, 302, 303, 307, 308].includes(response.status)) {
                const next = new URL(response.headers.get('location'), url)
                if (
                  !allowed(next.hostname) ||
                  next.protocol !== 'https:' ||
                  next.port ||
                  next.username ||
                  next.password
                )
                  return {
                    url: raw,
                    status: 'Viderekobling',
                    note: 'Kontroller videremålet manuelt.',
                  }
                url = next
                continue
              }
              return {
                url: raw,
                status: String(response.status),
                note: response.ok
                  ? 'Svar mottatt; faglig innhold må fortsatt kontrolleres.'
                  : response.status === 405
                    ? 'Kilden tillater ikke automatisk HEAD-kontroll.'
                    : 'Undersøk lenken manuelt.',
              }
            }
            return {
              url: raw,
              status: 'For mange viderekoblinger',
              note: 'Kontroller manuelt.',
            }
          } catch {
            return {
              url: raw,
              status: 'Ukjent',
              note: 'Tidsavbrudd eller nettverksfeil; betyr ikke nødvendigvis at lenken er brutt.',
            }
          }
        }),
      )),
    )
  return { items, checkedAt: new Date().toISOString() }
}
