import { useState } from 'react'
import { api, useResource } from './api.js'
import { Field, Notice } from './shared.jsx'

export default function Login({ onLogin, expired }) {
  const params = new URLSearchParams(location.search),
    token =
      params.get('token') ||
      new URLSearchParams(location.hash.split('?')[1] || '').get('token')
  const [mode, setMode] = useState(token ? 'reset' : 'login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [backup, setBackup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [show, setShow] = useState(false)
  const config = useResource('/api/auth/config')
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'forgot') {
        await api('/api/auth/request-password-reset', {
          method: 'POST',
          body: JSON.stringify({
            email,
            redirectTo: '/admin/#tilbakestill-passord',
          }),
        })
        setMessage(
          'Hvis adressen tilhører en konto, vil du motta en lenke for å velge nytt passord.',
        )
        return
      }
      if (mode === 'reset') {
        await api('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, newPassword: password }),
        })
        setPassword('')
        history.replaceState(null, '', '/admin/')
        setMode('login')
        setMessage('Passordet er lagret. Du kan logge inn.')
        return
      }
      if (mode === 'factor')
        await api(
          '/api/auth/two-factor/' +
            (backup ? 'verify-backup-code' : 'verify-totp'),
          {
            method: 'POST',
            body: JSON.stringify({ code, trustDevice: false }),
          },
        )
      else {
        const result = await api('/api/auth/sign-in/email', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        setPassword('')
        if (result.twoFactorRedirect) {
          setMode('factor')
          return
        }
      }
      const user = await api('/api/admin/session')
      setPassword('')
      setCode('')
      onLogin(user)
    } catch (e) {
      setError(
        mode === 'login'
          ? 'Kunne ikke logge inn. Kontroller e-post og passord. Ved gjentatte forsøk må du vente fem minutter.'
          : e.message,
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ad ad-login">
      <aside className="ad-login-intro">
        <span className="ad-logo">
          Fellestall<span>.no</span>
        </span>
        <span className="ad-eyebrow">BAK TALLENE</span>
        <h1>
          Et godt overblikk.
          <br />
          <em>Også på innsiden.</em>
        </h1>
        <p>
          Administrer Fellestall, følg utviklingen og gi Sven et bedre grunnlag
          for neste analyse.
        </p>
        <div className="ad-login-grid" aria-hidden="true">
          {[48, 76, 42, 96, 64, 84, 100, 72, 90].map((v, i) => (
            <i key={i} style={{ height: v + '%' }} />
          ))}
        </div>
        <small>Offentlige tall. Innsikt for alle.</small>
      </aside>
      <main className="ad-login-main">
        <a className="ad-back" href="/">
          ← Til Fellestall.no
        </a>
        <form className="ad-login-form" onSubmit={submit}>
          <p className="ad-eyebrow">ADMINISTRASJON</p>
          <h2>
            {
              {
                login: 'Velkommen inn.',
                factor: 'Bekreft at det er deg.',
                forgot: 'Gjenopprett tilgang.',
                reset: 'Velg et nytt passord.',
              }[mode]
            }
          </h2>
          {expired && <Notice>Økten er utløpt. Logg inn igjen.</Notice>}
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          {['login', 'forgot'].includes(mode) && (
            <Field
              label="E-postadresse"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
          {['login', 'reset'].includes(mode) && (
            <>
              <Field
                label={
                  mode === 'reset' ? 'Nytt passord (minst 12 tegn)' : 'Passord'
                }
                type={show ? 'text' : 'password'}
                autoComplete={
                  mode === 'reset' ? 'new-password' : 'current-password'
                }
                minLength={mode === 'reset' ? 12 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="ad-text-button"
                aria-pressed={show}
                onClick={() => setShow(!show)}
              >
                {show ? 'Skjul passord' : 'Vis passord'}
              </button>
            </>
          )}
          {mode === 'factor' && (
            <>
              <Field
                label={
                  backup
                    ? 'En ubrukt reservekode'
                    : 'Engangskode fra autentiseringsappen'
                }
                value={code}
                autoComplete="one-time-code"
                inputMode={backup ? 'text' : 'numeric'}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <button
                className="ad-text-button"
                type="button"
                onClick={() => {
                  setBackup(!backup)
                  setCode('')
                }}
              >
                {backup ? 'Bruk autentiseringsappen' : 'Bruk en reservekode'}
              </button>
            </>
          )}
          <button className="ad-primary" disabled={busy}>
            {busy
              ? 'Venter …'
              : {
                  login: 'Logg inn',
                  factor: 'Bekreft kode',
                  forgot: 'Send gjenopprettingslenke',
                  reset: 'Lagre nytt passord',
                }[mode]}
          </button>
          {mode === 'login' && config.data?.recoveryEmailReady && (
            <button
              type="button"
              className="ad-text-button"
              onClick={() => setMode('forgot')}
            >
              Glemt passord?
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              className="ad-text-button"
              onClick={() => setMode('login')}
            >
              Tilbake til innlogging
            </button>
          )}
          <p className="ad-login-note">Privat arbeidsrom for Fellestall.</p>
        </form>
      </main>
    </div>
  )
}
