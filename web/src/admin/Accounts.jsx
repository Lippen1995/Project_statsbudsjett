import { useEffect, useRef, useState } from 'react'
import { api, useResource } from './api.js'
import {
  Panel,
  Notice,
  Resource,
  Field,
  Select,
  Table,
  Check,
  ActionState,
  useAction,
  useAdmin,
  useUnsaved,
  date,
  saveFile,
} from './shared.jsx'

const roleOptions = [
  ['admin', 'Administrator'],
  ['editor', 'Redaktør'],
  ['viewer', 'Leser'],
]
export default function Accounts() {
  const { user } = useAdmin(),
    profile = useResource('/api/admin/accounts/profile'),
    users = useResource(user.role==='admin'?'/api/admin/accounts':null),
    action = useAction(() => {
      profile.reload()
      users.reload()
    }),
    [invite, setInvite] = useState({ email: '', name: '', role: 'editor' }),
    [change, setChange] = useState(null)
  useUnsaved(Boolean(invite.email) || Boolean(invite.name) || Boolean(change))
  return (
    <>
      <Resource state={profile}>
        {(d) => (
          <>
            <Panel title="Min konto">
              <dl className="ad-details">
                <div>
                  <dt>E-post</dt>
                  <dd>{d.user.email}</dd>
                </div>
                <div>
                  <dt>Rolle</dt>
                  <dd>{roleOptions.find((r) => r[0] === d.user.role)?.[1]}</dd>
                </div>
                <div>
                  <dt>Tofaktor</dt>
                  <dd>
                    {d.user.twoFactorEnabled ? 'Aktivert' : 'Ikke aktivert'}
                  </dd>
                </div>
                <div>
                  <dt>Passordgjenoppretting på e-post</dt>
                  <dd>
                    {d.recoveryEmailReady
                      ? 'Tilgjengelig'
                      : 'Venter på e-posttjeneste og bekreftet avsender'}
                  </dd>
                </div>
              </dl>
            </Panel>
            <PasswordChange />
            <TwoFactor
              enabled={d.user.twoFactorEnabled}
              onChange={profile.reload}
            />
            <Panel title="Aktive økter">
              <ActionState action={action} />
              <Table
                rows={d.sessions}
                columns={[
                  {
                    key: 'createdAt',
                    label: 'Opprettet',
                    render: (r) => date(r.createdAt),
                  },
                  {
                    key: 'updatedAt',
                    label: 'Sist brukt',
                    render: (r) => date(r.updatedAt),
                  },
                  {
                    key: 'expiresAt',
                    label: 'Utløper',
                    render: (r) => date(r.expiresAt),
                  },
                  { key: 'userAgent', label: 'Nettleser' },
                  {
                    key: 'current',
                    label: 'Handling',
                    render: (r) =>
                      r.current ? (
                        'Denne økten'
                      ) : (
                        <button
                          className="ad-text-button"
                          disabled={action.busy}
                          onClick={() =>
                            action.run(
                              'accounts/revoke',
                              { id: r.id },
                              'Økten er avsluttet.',
                            )
                          }
                        >
                          Avslutt økt
                        </button>
                      ),
                  },
                ]}
              />
            </Panel>
            {user.role === 'admin' && (
              <>
                <Panel title="Inviter en kollega">
                  <form
                    className="ad-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      action
                        .run(
                          'accounts/invite',
                          invite,
                          'Invitasjonen er sendt.',
                        )
                        .then((r) => {
                          if (r)
                            setInvite({ email: '', name: '', role: 'editor' })
                        })
                    }}
                  >
                    <Field
                      label="Navn"
                      value={invite.name}
                      onChange={(e) =>
                        setInvite({ ...invite, name: e.target.value })
                      }
                      required
                      minLength={2}
                    />
                    <Field
                      label="E-post"
                      type="email"
                      value={invite.email}
                      onChange={(e) =>
                        setInvite({ ...invite, email: e.target.value })
                      }
                      required
                    />
                    <Select
                      label="Rolle"
                      value={invite.role}
                      onChange={(role) => setInvite({ ...invite, role })}
                      options={roleOptions}
                    />
                    <p className="ad-muted">
                      Administratorer kan godkjenne publisering og håndtere
                      tilganger. Redaktører forbereder analyser og gir
                      tilbakemeldinger. Lesere har lesetilgang.
                    </p>
                    <button
                      className="ad-primary"
                      disabled={action.busy || !d.recoveryEmailReady}
                    >
                      Send invitasjon
                    </button>
                  </form>
                </Panel>
                <Panel title="Brukere og tilganger">
                  <Resource state={users}>
                    {(rows) => (
                      <Table
                        rows={rows}
                        columns={[
                          { key: 'name', label: 'Navn' },
                          { key: 'email', label: 'E-post' },
                          {
                            key: 'role',
                            label: 'Rolle',
                            render: (r) =>
                              roleOptions.find((o) => o[0] === r.role)?.[1],
                          },
                          {
                            key: 'banned',
                            label: 'Status',
                            render: (r) => (r.banned ? 'Deaktivert' : 'Aktiv'),
                          },
                          {
                            key: 'twoFactorEnabled',
                            label: 'Tofaktor',
                            render: (r) => (r.twoFactorEnabled ? 'Ja' : 'Nei'),
                          },
                          {
                            key: 'actions',
                            label: 'Handling',
                            render: (r) =>
                              r.email !== 'info@fjordinsight.com' &&
                              r.id !== user.id && (
                                <button
                                  className="ad-text-button"
                                  onClick={() =>
                                    setChange({
                                      id: r.id,
                                      email: r.email,
                                      role: r.role,
                                      banned: Boolean(r.banned),
                                      password: '',
                                    })
                                  }
                                >
                                  Endre tilgang
                                </button>
                              ),
                          },
                        ]}
                      />
                    )}
                  </Resource>
                  {change && (
                    <form
                      className="ad-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        action
                          .run(
                            'accounts/update',
                            change,
                            'Tilgangen er oppdatert.',
                          )
                          .then((r) => {
                            if (r) setChange(null)
                          })
                      }}
                    >
                      <h3>{change.email}</h3>
                      <Select
                        label="Rolle"
                        value={change.role}
                        onChange={(role) => setChange({ ...change, role })}
                        options={roleOptions}
                      />
                      <Check
                        label="Deaktiver kontoen og avslutt tilgangen"
                        checked={change.banned}
                        onChange={(e) =>
                          setChange({ ...change, banned: e.target.checked })
                        }
                      />
                      <Field
                        label="Bekreft med ditt nåværende passord"
                        type="password"
                        autoComplete="current-password"
                        value={change.password}
                        onChange={(e) =>
                          setChange({ ...change, password: e.target.value })
                        }
                        required
                      />
                      <div className="ad-actions">
                        <button className="ad-primary" disabled={action.busy}>
                          Lagre tilgang
                        </button>
                        <button
                          className="ad-secondary"
                          type="button"
                          onClick={() => setChange(null)}
                        >
                          Avbryt
                        </button>
                      </div>
                    </form>
                  )}
                </Panel>
              </>
            )}
          </>
        )}
      </Resource>
    </>
  )
}
function PasswordChange() {
  const [value, setValue] = useState({
      currentPassword: '',
      newPassword: '',
      revokeOtherSessions: true,
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  useUnsaved(Boolean(value.currentPassword) || Boolean(value.newPassword))
  return (
    <Panel title="Endre passord">
      <form
        className="ad-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            await api('/api/auth/change-password', {
              method: 'POST',
              body: JSON.stringify(value),
            })
            setValue({
              currentPassword: '',
              newPassword: '',
              revokeOtherSessions: true,
            })
            setMessage('Passordet er endret.')
          } catch (e) {
            setError(e.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <Field
          label="Nåværende passord"
          type="password"
          autoComplete="current-password"
          value={value.currentPassword}
          onChange={(e) =>
            setValue({ ...value, currentPassword: e.target.value })
          }
          required
        />
        <Field
          label="Nytt passord (minst 12 tegn)"
          type="password"
          minLength={12}
          autoComplete="new-password"
          value={value.newPassword}
          onChange={(e) => setValue({ ...value, newPassword: e.target.value })}
          required
        />
        <Check
          label="Avslutt andre innloggede økter"
          checked={value.revokeOtherSessions}
          onChange={(e) =>
            setValue({ ...value, revokeOtherSessions: e.target.checked })
          }
        />
        <button className="ad-primary" disabled={busy}>
          {busy ? 'Endrer …' : 'Endre passord'}
        </button>
      </form>
    </Panel>
  )
}
function TwoFactor({ enabled, onChange }) {
  const [password, setPassword] = useState(''),
    [setup, setSetup] = useState(null),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    canvas = useRef(null)
  useUnsaved(Boolean(password) || Boolean(setup))
  useEffect(() => {
    let cancelled = false
    if (setup?.totpURI)
      import('qrcode')
        .then(({ default: QR }) => {
          if (!cancelled && canvas.current)
            QR.toCanvas(canvas.current, setup.totpURI, {
              width: 220,
              margin: 2,
            })
        })
        .catch(() =>
          setError('QR-koden kunne ikke vises. Bruk oppsettsnøkkelen manuelt.'),
        )
    return () => {
      cancelled = true
    }
  }, [setup])
  async function run(path, body, done) {
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/auth/two-factor/' + path, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      done(result)
      setPassword('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Tofaktor og reservekoder">
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {setup ? (
        <>
          {setup.totpURI && (
            <>
              <p>
                Skann koden med en autentiseringsapp. Lagre reservekodene før du
                fullfører. Oppsettet aktiveres først når en engangskode er
                bekreftet.
              </p>
              <canvas ref={canvas} aria-label="QR-kode for autentiseringsapp" />
              <details>
                <summary>Manuell oppsettsnøkkel</summary>
                <code className="ad-secret">
                  {new URL(setup.totpURI).searchParams.get('secret')}
                </code>
              </details>
            </>
          )}
          <h3>Reservekoder – vises bare nå</h3>
          <ul className="ad-backup-codes">
            {setup.backupCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button
            className="ad-secondary"
            onClick={() =>
              saveFile(
                'fellestall-reservekoder.txt',
                setup.backupCodes.join('\n'),
                'text/plain',
              )
            }
          >
            Lagre reservekoder
          </button>
          {setup.totpURI ? (
            <form
              className="ad-form"
              onSubmit={(e) => {
                e.preventDefault()
                run('verify-totp', { code }, () => {
                  setSetup(null)
                  setCode('')
                  setMessage('Tofaktor er aktivert.')
                  onChange()
                })
              }}
            >
              <Field
                label="Engangskode fra appen"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                pattern="[0-9]{6}"
              />
              <button className="ad-primary" disabled={busy}>
                Bekreft og aktiver
              </button>
            </form>
          ) : (
            <button className="ad-primary" onClick={() => setSetup(null)}>
              Jeg har lagret kodene
            </button>
          )}
        </>
      ) : (
        <>
          <p>
            {enabled
              ? 'Tofaktor er aktivert. Nye reservekoder erstatter alle de gamle.'
              : 'Bruk en autentiseringsapp for et ekstra steg ved innlogging. Reservekoder gir tilgang hvis du mister appen.'}
          </p>
          <form
            className="ad-form"
            onSubmit={(e) => {
              e.preventDefault()
              run(
                enabled ? 'generate-backup-codes' : 'enable',
                { password },
                (result) => {
                  if (enabled) {
                    setSetup({ totpURI: '', backupCodes: result.backupCodes })
                    setMessage('Nye reservekoder er opprettet.')
                  } else setSetup(result)
                },
              )
            }}
          >
            <Field
              label="Bekreft med nåværende passord"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="ad-actions">
              <button className="ad-primary" disabled={busy}>
                {enabled ? 'Lag nye reservekoder' : 'Start oppsett av tofaktor'}
              </button>
              {enabled && (
                <button
                  type="button"
                  className="ad-secondary"
                  disabled={busy || !password}
                  onClick={() => {
                    if (window.confirm('Deaktivere tofaktor?'))
                      run('disable', { password }, () => {
                        setMessage('Tofaktor er deaktivert.')
                        onChange()
                      })
                  }}
                >
                  Deaktiver tofaktor
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </Panel>
  )
}
