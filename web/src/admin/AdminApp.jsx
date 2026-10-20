import { useCallback, useEffect, useState } from 'react'
import Login from './Login.jsx'
import Accounts from './Accounts.jsx'
import { AdminContext } from './shared.jsx'
import {
  Overview,
  Operations as FullOperations,
  Jobs,
  Monitoring,
  DataQuality,
  Learning,
  Insights,
  Notifications,
  AuditHistory,
  Backups,
  Reports,
  Help,
  InstructionHistory,
} from './PlatformPages.jsx'
import { Reviews, Content, Distribution } from './Editorial.jsx'
import AnalysisPipeline from './AnalysisPipeline.jsx'
import LivePerformance from './LivePerformance.jsx'
import ServiceStatus from './ServiceStatus.jsx'
import { api, useResource } from './api.js'

const sections = [
  {
    id: 'oversikt',
    label: 'Oversikt',
    icon: 'chart',
    description: 'Status, oppgaver og neste steg.',
  },
  {
    id: 'pipeline',
    label: 'Analysepipeline',
    icon: 'pipeline',
    description: 'Bestem hva Sven skal undersøke, og når.',
  },
  {
    id: 'gjennomgang',
    label: 'Til gjennomgang',
    icon: 'check',
    description: 'Les, revider og godkjenn siste versjon.',
  },
  {
    id: 'sven',
    label: 'Sven',
    icon: 'spark',
    description: 'Instrukser og arbeidet bak analysene.',
  },
  {
    id: 'laring',
    label: 'Læring',
    icon: 'spark',
    description: 'Fra konkret tilbakemelding til godkjent regel.',
  },
  {
    id: 'innhold',
    label: 'Innhold',
    icon: 'pipeline',
    description: 'Publiserte analyser, metadata og rettelser.',
  },
  {
    id: 'distribusjon',
    label: 'Distribusjon',
    icon: 'arrow',
    description: 'LinkedIn, leveringskvitteringer og oppfølging.',
  },
  {
    id: 'data',
    label: 'Datakvalitet',
    icon: 'server',
    description: 'Åpne kilder, dekning, kontroller og dataversjoner.',
  },
  {
    id: 'ytelse',
    label: 'Ytelse',
    icon: 'pulse',
    description: 'Hvordan oppleves Fellestall?',
  },
  {
    id: 'trafikk',
    label: 'Trafikk',
    icon: 'chart',
    description: 'Se hvordan nettstedet blir brukt.',
  },
  {
    id: 'drift',
    label: 'Driftsstatus',
    icon: 'server',
    description: 'Tjenester, jobber, hendelser og vedlikehold.',
  },
  {
    id: 'overvaking',
    label: 'Overvåking og forbruk',
    icon: 'pulse',
    description: 'Eksterne kontroller og faktisk Checkly-forbruk.',
  },
  {
    id: 'varsler',
    label: 'Varsler',
    icon: 'pulse',
    description: 'Oppfølging, mottakere og oppsummeringer.',
  },
  {
    id: 'rapporter',
    label: 'Rapporter',
    icon: 'chart',
    description: 'Månedsrapporter som kan deles og skrives ut.',
  },
  {
    id: 'historikk',
    label: 'Endringshistorikk',
    icon: 'clock',
    description: 'Aktør, tidspunkt og før / etter.',
    admin: true,
  },
  {
    id: 'backup',
    label: 'Sikkerhetskopier',
    icon: 'server',
    description: 'Krypterte kopier og kontrollert gjenoppretting.',
    admin: true,
  },
  {
    id: 'kontoer',
    label: 'Konto og sikkerhet',
    icon: 'lock',
    description: 'Passord, tofaktor, økter og tilganger.',
  },
  {
    id: 'hjelp',
    label: 'Hjelp og forbedringer',
    icon: 'check',
    description: 'Veiledning, målemetode og kjente feil.',
  },
]
const date = (value) =>
  new Intl.DateTimeFormat('nb-NO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
const number = (value) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(value)

function Icon({ name, size = 20 }) {
  const paths = {
    pulse: 'M3 12h4l3-8 4 16 3-8h4',
    chart: 'M4 20V11m8 9V4m8 16v-7',
    pipeline:
      'M4 5h5v5H4zM15 14h5v5h-5zM9 7h5a3 3 0 0 1 3 3v4M7 10v5a3 3 0 0 0 3 3h5',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
    server: 'M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01',
    clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    arrow: 'M7 17 17 7M7 7h10v10',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
    exit: 'M9 4H4v16h5M13 8l4 4-4 4M8 12h13',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    check: 'm5 12 4 4L19 6',
    refresh:
      'M20 7v5h-5M4 17v-5h5M5.1 7a8 8 0 0 1 13.6-2L20 7M4 17l1.3 2a8 8 0 0 0 13.6-2',
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.chart} />
    </svg>
  )
}

function Logo() {
  return (
    <span className="ad-logo">
      Fellestall<span>.no</span>
    </span>
  )
}
function Notice({ children, error = false }) {
  return (
    <div
      className={`ad-notice ${error ? 'ad-notice-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
function Loading() {
  return (
    <p className="ad-loading" role="status">
      Henter oppdatert informasjon …
    </p>
  )
}
function ResourceState({ resource }) {
  return resource.loading ? (
    <Loading />
  ) : resource.error ? (
    <Notice error>
      {resource.error}{' '}
      <button className="ad-text-button" onClick={resource.reload}>
        Prøv igjen
      </button>
    </Notice>
  ) : null
}

function Panel({ title, eyebrow, children, extra }) {
  return (
    <section className="ad-panel">
      <header className="ad-panel-header">
        <div>
          {eyebrow && <p className="ad-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {extra}
      </header>
      {children}
    </section>
  )
}
function LogRows({ rows }) {
  return rows.length ? (
    <ul className="ad-log">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="ad-log-icon">
            <Icon name="clock" size={17} />
          </span>
          <div>
            <a href={r.url} target="_blank" rel="noreferrer">
              {r.title} <span aria-hidden="true">↗</span>
            </a>
            <small>
              {date(r.date)}
              {r.status && ` · ${r.conclusion || r.status}`}
            </small>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="ad-panel-copy">Ingen hendelser i denne oversikten.</p>
  )
}

function Sven({ onDirty, onSaving }) {
  const resource = useResource('/api/admin/sven/files')
  const [tab, setTab] = useState('Instrukser')
  const [id, setId] = useState('instructions')
  const [file, setFile] = useState(null)
  const [content, setContent] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const dirty = Boolean(file && file.content !== content)
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    onSaving(busy)
  }, [busy, onSaving])
  useEffect(() => () => onSaving(false), [onSaving])
  useEffect(() => () => onDirty(false), [onDirty])
  useEffect(() => {
    const controller = new AbortController()
    setFile(null)
    setError('')
    setMessage('')
    setReason('')
    api(`/api/admin/sven/file?id=${id}`, { signal: controller.signal })
      .then((value) => {
        setFile(value)
        setContent(value.content)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
    return () => controller.abort()
  }, [id, reload])
  function select(nextId, nextTab) {
    if (nextId === id && nextTab === tab) return
    if (
      busy ||
      (dirty &&
        !window.confirm('Du har ulagrede endringer. Vil du forkaste dem?'))
    )
      return
    if (file) setContent(file.content)
    setId(nextId)
    setTab(nextTab)
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api('/api/admin/sven/file', {
        method: 'PUT',
        body: JSON.stringify({ id, content, sha: file.sha, reason }),
      })
      setFile({ ...file, sha: result.sha, content })
      setReason('')
      setMessage(
        'Lagret i Svens arbeidsgrunnlag. Endringen brukes når Sven leser instruksjonene ved neste skrive- eller revisjonsøkt.',
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  if (!resource.data) return <ResourceState resource={resource} />
  return (
    <>
      <div className="ad-sven-intro">
        <img
          src="/bilder/sven-ai-analytiker.webp"
          alt="AI-generert portrett av Sven"
          width="72"
          height="72"
        />
        <div>
          <span className="ad-eyebrow">FELLESTALLS AI-ANALYTIKER</span>
          <h2>Et bedre grunnlag. Bedre analyser.</h2>
          <p>
            Her ser og endrer du instruksene og det redaksjonelle materialet
            Sven lærer av.
          </p>
        </div>
      </div>
      <div className="ad-tabs" role="group" aria-label="Sven-område">
        {['Instrukser', 'Trening', 'Logg'].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() =>
              select(t === 'Trening' ? 'handbook' : 'instructions', t)
            }
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Logg' ? (
        <Activity />
      ) : (
        <>
          {tab === 'Trening' && (
            <Notice>
              Sven lærer gjennom instruksjoner, referanser og tilbakemeldinger.
              Dette materialet er arbeidsgrunnlag ved neste økt; modellen
              finjusteres ikke her.
            </Notice>
          )}
          {!resource.data.writable && (
            <Notice>
              Skrivetilgang til GitHub mangler på serveren. Du kan lese
              materialet; lagring blir tilgjengelig når tilgangen er
              konfigurert.
            </Notice>
          )}
          <div className="ad-editor-layout">
            <nav className="ad-file-list" aria-label="Svens arbeidsfiler">
              {resource.data.files
                .filter((f) => f.group === tab)
                .map((f) => (
                  <button
                    key={f.id}
                    aria-current={id === f.id ? 'page' : undefined}
                    onClick={() => select(f.id, tab)}
                  >
                    {f.title}
                    <span>→</span>
                  </button>
                ))}
            </nav>
            <Panel
              title={file?.title || 'Henter arbeidsfil …'}
              extra={
                dirty && (
                  <span className="ad-tag ad-unsaved">Ulagrede endringer</span>
                )
              }
            >
              {error && (
                <Notice error>
                  {error}{' '}
                  <button
                    type="button"
                    className="ad-text-button"
                    onClick={() => {
                      if (
                        !dirty ||
                        window.confirm(
                          'Forkaste endringene og hente siste versjon?',
                        )
                      )
                        setReload((n) => n + 1)
                    }}
                  >
                    Hent siste versjon
                  </button>
                </Notice>
              )}
              {message && <Notice>{message}</Notice>}
              {file ? (
                <form className="ad-editor" onSubmit={save}>
                  <p className="ad-filepath">{file.path}</p>
                  <label className="ad-visually-hidden" htmlFor="sven-content">
                    {file.title}
                  </label>
                  <textarea
                    id="sven-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    disabled={busy || !resource.data.writable}
                  />
                  <label htmlFor="sven-reason">
                    Hva endrer du, og hvorfor?
                  </label>
                  <input
                    id="sven-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="F.eks. presiser hvordan kilder skal oppgis"
                    minLength={5}
                    maxLength={300}
                    required
                    disabled={busy || !resource.data.writable}
                  />
                  <div className="ad-editor-footer">
                    <small>
                      Lagres i prosjektets historikk. Filene ligger i et
                      offentlig repository; skriv bare generelle føringer og
                      åpne kilder her. Analysepublisering krever fortsatt egen
                      godkjenning.
                    </small>
                    <button
                      className="ad-primary"
                      disabled={!dirty || busy || !resource.data.writable}
                    >
                      {busy ? 'Lagrer …' : 'Lagre endringer'}
                      <Icon name="check" size={17} />
                    </button>
                  </div>
                </form>
              ) : (
                !error && <Loading />
              )}
            </Panel>
          </div>
          {file && (
            <Panel key={`${id}-${file.sha}`} title="Endringer i denne filen">
              <InstructionHistory id={id} />
            </Panel>
          )}
        </>
      )}
    </>
  )
}

function Activity() {
  const resource = useResource('/api/admin/log')
  if (!resource.data) return <ResourceState resource={resource} />
  return (
    <div className="ad-columns">
      <Panel title="Redaksjonelle endringer">
        <LogRows rows={resource.data.commits} />
      </Panel>
      <Panel title="Automatiske kjøringer">
        <LogRows rows={resource.data.runs} />
      </Panel>
    </div>
  )
}
export default function AdminApp() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [expired, setExpired] = useState(false)
  const [section, setSection] = useState(() =>
    sections.some((s) => s.id === location.hash.slice(1))
      ? location.hash.slice(1)
      : 'oversikt',
  )
  const [days, setDays] = useState(7)
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [saving, setSaving] = useState(false)
  const [forms, setForms] = useState({})
  const [actions, setActions] = useState({})
  const markDirty = useCallback(
    (id, value) =>
      setForms((previous) =>
        previous[id] === value ? previous : { ...previous, [id]: value },
      ),
    [],
  )
  const markBusy = useCallback(
    (id, value) =>
      setActions((previous) =>
        previous[id] === value ? previous : { ...previous, [id]: value },
      ),
    [],
  )
  const hasUnsaved = dirty || Object.values(forms).some(Boolean)
  const isSaving = saving || Object.values(actions).some(Boolean)
  useEffect(() => {
    const controller = new AbortController()
    api('/api/admin/session', {
      signal: controller.signal,
      skipSessionExpiry: true,
    })
      .then(setUser)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false)
      })
    const end = () => {
      setUser(null)
      setExpired(true)
    }
    window.addEventListener('admin-session-expired', end)
    return () => {
      controller.abort()
      window.removeEventListener('admin-session-expired', end)
    }
  }, [])
  useEffect(() => {
    const prevent = (e) => {
      if (hasUnsaved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [hasUnsaved])
  function navigate(id) {
    if (isSaving) return
    if (id === section) {
      setOpen(false)
      return
    }
    if (
      hasUnsaved &&
      !window.confirm('Du har ulagrede endringer. Vil du forkaste dem?')
    )
      return
    setDirty(false)
    setSection(id)
    setOpen(false)
    history.replaceState(null, '', `#${id}`)
  }
  async function logout() {
    if (isSaving) return
    if (
      hasUnsaved &&
      !window.confirm('Forkaste ulagrede endringer og logge ut?')
    )
      return
    setLoggingOut(true)
    try {
      await api('/api/auth/sign-out', { method: 'POST', body: '{}' })
      setUser(null)
      setDirty(false)
      setExpired(false)
    } catch {
      setError('Utloggingen kunne ikke fullføres. Prøv igjen.')
    } finally {
      setLoggingOut(false)
    }
  }
  if (checking)
    return (
      <div className="ad ad-initial">
        <Logo />
        <Loading />
      </div>
    )
  if (!user)
    return (
      <Login
        expired={expired}
        onLogin={(value) => {
          setUser(value)
          setExpired(false)
          setError('')
        }}
      />
    )
  const current = sections.find((s) => s.id === section)
  return (
    <AdminContext.Provider value={{ user, markDirty, markBusy }}>
      <div className="ad ad-shell">
        <a className="ad-skip" href="#admin-content">
          Hopp til innhold
        </a>
        <button
          className="ad-mobile-menu"
          aria-label="Meny"
          aria-expanded={open}
          aria-controls="admin-sidebar"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="menu" />
          <Logo />
          <span className="ad-visually-hidden">Meny</span>
        </button>
        {open && (
          <button
            className="ad-overlay"
            aria-label="Lukk meny"
            onClick={() => setOpen(false)}
          />
        )}
        <aside
          id="admin-sidebar"
          className={`ad-sidebar ${open ? 'ad-sidebar-open' : ''}`}
        >
          <div className="ad-brand">
            <Logo />
            <span className="ad-admin-label">
              <Icon name="lock" size={11} /> ADMINISTRASJON
            </span>
          </div>
          <p className="ad-nav-label">ARBEIDSROM</p>
          <nav aria-label="Administrasjon">
            {sections
              .filter((s) => !s.admin || user.role === 'admin')
              .map((s) => (
                <button
                  key={s.id}
                  aria-current={s.id === section ? 'page' : undefined}
                  onClick={() => navigate(s.id)}
                >
                  <Icon name={s.icon} />
                  <span>{s.label}</span>
                  {s.id === 'sven' && (
                    <i className="ad-nav-badge" aria-hidden="true">
                      AI
                    </i>
                  )}
                </button>
              ))}
          </nav>
          <div className="ad-sidebar-bottom">
            <a href="/" target="_blank" rel="noreferrer">
              Åpne Fellestall.no
              <Icon name="arrow" size={16} />
            </a>
            <div className="ad-account">
              <span className="ad-avatar">FI</span>
              <div>
                <strong>Fjord Insight</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <button onClick={logout} disabled={loggingOut}>
              <Icon name="exit" size={17} />
              {loggingOut ? 'Logger ut …' : 'Logg ut'}
            </button>
          </div>
        </aside>
        <div className="ad-workspace">
          <header className="ad-topbar">
            <span>
              Arbeidsrom <span aria-hidden="true">/</span>{' '}
              <strong>{current.label}</strong>
            </span>
            <span className="ad-private">
              <Icon name="lock" size={13} /> Privat område
            </span>
          </header>
          <main id="admin-content" className="ad-content" tabIndex={-1}>
            <div className="ad-page-heading">
              <div>
                <p className="ad-eyebrow">FELLESTALL · ADMINISTRASJON</p>
                <h1>
                  {current.label}
                  <span>.</span>
                </h1>
                <p>{current.description}</p>
              </div>
              {['ytelse', 'trafikk'].includes(section) && (
                <label className="ad-period">
                  <Icon name="clock" size={16} />
                  <span className="ad-visually-hidden">Måleperiode</span>
                  <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    {[7, 30, 90].map((d) => (
                      <option key={d} value={d}>
                        Siste {d} dager
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {error && <Notice error>{error}</Notice>}
            {section === 'ytelse' && (
              <>
                <ServiceStatus compact onOpen={() => navigate('drift')} />
                <LivePerformance />
              </>
            )}
            {section === 'oversikt' && <Overview navigate={navigate} />}
            {['ytelse', 'trafikk'].includes(section) && (
              <Insights section={section} days={days} />
            )}
            {section === 'gjennomgang' && <Reviews />}
            {section === 'laring' && <Learning />}
            {section === 'innhold' && <Content />}
            {section === 'distribusjon' && <Distribution />}
            {section === 'data' && <DataQuality />}
            {section === 'overvaking' && <Monitoring />}
            {section === 'varsler' && <Notifications />}
            {section === 'rapporter' && <Reports />}
            {section === 'backup' && <Backups />}
            {section === 'kontoer' && <Accounts />}
            {section === 'hjelp' && <Help />}
            {section === 'sven' && (
              <>
                <Jobs />
                <Sven onDirty={setDirty} onSaving={setSaving} />
              </>
            )}
            {section === 'pipeline' && (
              <AnalysisPipeline onDirty={setDirty} onSaving={setSaving} />
            )}
            {section === 'drift' && <FullOperations />}
            {section === 'historikk' && (
              <>
                <AuditHistory />
                <Activity />
              </>
            )}
            <footer className="ad-footer">
              <span>Fellestall.no</span>
              <span>Et godt grunnlag for bedre innsikt.</span>
            </footer>
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  )
}
