import { useState } from 'react'
import { api, useResource } from './api.js'
import ServiceStatus from './ServiceStatus.jsx'
import {
  Panel,
  Notice,
  Resource,
  Field,
  Select,
  Check,
  Table,
  Stat,
  RecordPanel,
  ActionState,
  SensitiveFields,
  JsonDiff,
  useAction,
  useAdmin,
  useUnsaved,
  fmt,
  date,
  saveFile,
  types,
  statuses,
} from './shared.jsx'

export function Overview({ navigate }) {
  const state = useResource('/api/admin/overview')
  return (
    <Resource state={state}>
      {(d) => (
        <>
          <div className="ad-stat-grid">
            <Stat
              label="Driftsstatus"
              value={
                {
                  operational: 'Normal drift',
                  degraded: 'Nedsatt ytelse',
                  outage: 'Driftsavvik',
                }[d.health.status] || 'Ukjent'
              }
              note={
                d.health.checkedAt
                  ? date(d.health.checkedAt)
                  : 'Ingen bekreftet kontroll'
              }
            />
            <Stat label="Temaer i pipeline" value={d.pipeline.items?.length} />
            <Stat label="Til gjennomgang" value={d.reviews.length} />
            <Stat
              label="Åpne varsler"
              value={
                d.notifications.items?.filter(
                  (n) => !n.resolved_at && !n.acknowledged,
                ).length
              }
            />
          </div>
          <div className="ad-columns">
            <Panel title="Dette trenger oppmerksomhet">
              <ul className="ad-link-list">
                {d.notifications.items
                  ?.filter((n) => !n.resolved_at && !n.acknowledged)
                  .slice(0, 8)
                  .map((n) => (
                    <li key={n.id}>
                      <button
                        className="ad-text-button"
                        onClick={() => navigate('varsler')}
                      >
                        {n.title}
                      </button>
                      <small>{n.detail}</small>
                    </li>
                  ))}
                {d.jobs.missing && (
                  <li>Dagens Sven-kjøring mangler bekreftet status.</li>
                )}
                {d.reviews.unavailable && (
                  <li>Gjennomganger kunne ikke hentes.</li>
                )}
                {!d.notifications.items?.some((n) => !n.resolved_at) && (
                  <li>Ingen aktive driftsvarsler registrert.</li>
                )}
              </ul>
            </Panel>
            <Panel title="Neste analyse">
              <h3>
                {d.pipeline.items?.find((i) => !i.paused)?.topic ||
                  'Ingen planlagt analyse i køen'}
              </h3>
              <p className="ad-muted">
                Skriving starter tidligst på datoen i køen. Publisering følger
                egen godkjenning.
              </p>
              <div className="ad-actions">
                <button
                  className="ad-secondary"
                  onClick={() => navigate('pipeline')}
                >
                  Åpne pipeline
                </button>
                <button
                  className="ad-secondary"
                  onClick={() => navigate('gjennomgang')}
                >
                  Gjennomgå analyser
                </button>
              </div>
            </Panel>
          </div>
          <Panel title="Datagrunnlaget">
            <p>
              Oppdatert:{' '}
              {d.data.updated ? date(d.data.updated) : 'Ikke registrert'}.{' '}
              {d.data.checks?.filter((c) => c.passed).length || 0} av{' '}
              {d.data.checks?.length || 0} kvalitetskontroller bestått.
            </p>
            <button className="ad-text-button" onClick={() => navigate('data')}>
              Se kilder, dekning og dataversjoner →
            </button>
          </Panel>
          <Jobs compact />
        </>
      )}
    </Resource>
  )
}
export function Jobs({ compact = false }) {
  const state = useResource('/api/admin/jobs'),
    { user } = useAdmin(),
    action = useAction(state.reload)
  return (
    <Panel
      title="Jobber og Svens aktivitet"
      extra={
        <button className="ad-text-button" onClick={state.reload}>
          Oppdater
        </button>
      }
    >
      <ActionState action={action} />
      <Resource state={state}>
        {(d) => (
          <>
            {d.missing && (
              <Notice>
                Dagens kontroll kl. 09.00 er ikke bekreftet av Sven.
              </Notice>
            )}
            <dl className="ad-details">
              <div>
                <dt>Arbeidssteg</dt>
                <dd>
                  {{
                    researching: 'Undersøker kilder',
                    writing: 'Skriver',
                    delivering: 'Leverer',
                    review: 'Til gjennomgang',
                    completed: 'Ferdig',
                    failed: 'Stoppet',
                    waiting: 'Venter',
                  }[d.native?.current?.state] || 'Ingen rapportert aktivitet'}
                </dd>
              </div>
              <div>
                <dt>Siste status</dt>
                <dd>{date(d.native?.current?.updatedAt)}</dd>
              </div>
              <div>
                <dt>Arbeidsnotat / stoppårsak</dt>
                <dd>{d.native?.current?.note || 'Ikke registrert'}</dd>
              </div>
              <div>
                <dt>Instruksversjon</dt>
                <dd>
                  {d.native?.current?.instructionCommit?.slice(0, 12) ||
                    'Ikke registrert'}
                </dd>
              </div>
              <div>
                <dt>Neste køkontroll</dt>
                <dd>Daglig kl. 09.00, norsk tid</dd>
              </div>
            </dl>
            <Table
              rows={d.runs.slice(0, compact ? 5 : 30)}
              columns={[
                {
                  key: 'name',
                  label: 'Jobb',
                  render: (r) => (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.name} ↗
                    </a>
                  ),
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (r) => r.conclusion || r.status,
                },
                {
                  key: 'updatedAt',
                  label: 'Sist oppdatert',
                  render: (r) => date(r.updatedAt),
                },
                ...(!compact && user.role === 'admin'
                  ? [
                      {
                        key: 'retry',
                        label: 'Handling',
                        render: (r) =>
                          r.conclusion === 'failure' &&
                          ['etl.yml', 'neon-check.yml', 'deploy.yml'].includes(
                            r.workflow,
                          ) && (
                            <button
                              className="ad-text-button"
                              disabled={action.busy}
                              onClick={() => {
                                if (
                                  window.confirm('Starte denne jobben på nytt?')
                                )
                                  action.run(
                                    'jobs/retry',
                                    { id: r.id },
                                    'Ny kjøring er bestilt.',
                                  )
                              }}
                            >
                              Prøv igjen
                            </button>
                          ),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        )}
      </Resource>
    </Panel>
  )
}
export function Monitoring() {
  const state = useResource('/api/admin/monitoring'),
    { user } = useAdmin()
  return (
    <>
      <Panel
        title="Ekstern overvåking og Checkly-forbruk"
        extra={
          <button className="ad-secondary" onClick={state.reload}>
            Hent siste kontroll
          </button>
        }
      >
        <Resource state={state}>
          {(d) => (
            <>
              {!d.available && (
                <Notice error>
                  {d.reason}
                  {d.stale ? ' Sist lagrede verdier vises nedenfor.' : ''}
                </Notice>
              )}
              {d.account && (
                <>
                  <div className="ad-stat-grid">
                    <Stat
                      label="Abonnement"
                      value={d.account.plan || 'Ukjent'}
                      note={
                        d.account.trialEnd
                          ? 'Prøveperiode til ' + date(d.account.trialEnd)
                          : 'Prøveperiodens sluttdato er ikke rapportert av leverandøren.'
                      }
                    />
                    <Stat
                      label="Observerte kjøringer denne måneden"
                      value={fmt(d.quota.observedRuns)}
                      note={
                        d.quota.complete
                          ? 'Perioden er dekket av lagrede resultater.'
                          : 'Delvis dekning; dette er et minimum.'
                      }
                    />
                    <Stat
                      label="API-kvote"
                      value={fmt(d.quota.limit)}
                      note={
                        d.quota.limit
                          ? fmt(
                              (d.quota.observedRuns / d.quota.limit) * 100,
                              1,
                            ) + ' % brukt'
                          : 'Kvoten er ikke oppgitt i leverandørsvaret.'
                      }
                    />
                    <Stat
                      label="Prognose for måneden"
                      value={fmt(d.quota.projected)}
                      note="Planlagte kjøringer og observert bruk; nye feilforsøk kan øke forbruket."
                    />
                  </div>
                  <p className="ad-footnote">
                    {d.quota.source} Sist hentet {date(d.checkedAt)}.
                  </p>
                  <Table
                    rows={d.checks}
                    columns={[
                      { key: 'name', label: 'Kontroll' },
                      {
                        key: 'activated',
                        label: 'Status',
                        render: (r) =>
                          !r.activated
                            ? 'Pauset'
                            : r.stopped
                              ? 'Ingen ferske resultater'
                              : r.lastResult?.failed
                                ? 'Feiler'
                                : r.lastResult?.degraded
                                  ? 'Nedsatt ytelse'
                                  : 'Operativ',
                      },
                      {
                        key: 'frequency',
                        label: 'Intervall',
                        render: (r) => r.frequency + ' min',
                      },
                      {
                        key: 'locations',
                        label: 'Steder',
                        render: (r) =>
                          r.locations.join(', ') +
                          (r.parallel ? ' · parallelt' : ' · vekselvis'),
                      },
                      {
                        key: 'lastResult',
                        label: 'Siste kontroll',
                        render: (r) => date(r.lastResult?.checked_at),
                      },
                      {
                        key: 'response',
                        label: 'Svartid',
                        render: (r) => fmt(r.lastResult?.response_ms) + ' ms',
                      },
                    ]}
                  />
                  <h3>Faktisk bruk per kontroll</h3>
                  <Table
                    rows={d.quota.byCheck}
                    columns={[
                      { key: 'check_name', label: 'Kontroll' },
                      {
                        key: 'runs',
                        label: 'Kjøringer inkl. nye forsøk',
                        render: (r) => fmt(r.runs),
                      },
                      {
                        key: 'checks',
                        label: 'Resultater',
                        render: (r) => fmt(r.checks),
                      },
                    ]}
                  />
                </>
              )}
            </>
          )}
        </Resource>
      </Panel>
      {user.role === 'admin' && <IntegrationStatus />}
      {user.role === 'admin' && (
        <RecordPanel
          collection="integrationPolicies"
          title="Integrasjoner: tilgang og utløpsdato"
          initial={{ integration: 'github', expiresAt: '', note: '' }}
          fields={[
            {
              key: 'integration',
              label: 'Integrasjon',
              options: [
                ['github', 'GitHub'],
                ['checkly', 'Checkly'],
                ['neon', 'Neon'],
                ['email', 'E-post'],
                ['linkedin', 'LinkedIn'],
              ],
            },
            {
              key: 'expiresAt',
              label: 'Kjent utløpsdato',
              type: 'date',
              required: false,
            },
            {
              key: 'note',
              label: 'Tilgang, eier og fornyelsesrutine',
              type: 'textarea',
              required: false,
            },
          ]}
        />
      )}
    </>
  )
}
export function Operations() {
  const { user } = useAdmin()
  return (
    <>
      <ServiceStatus />
      <Jobs />
      <RecordPanel
        collection="incidents"
        title="Hendelser og arbeidsnotater"
        initial={{
          title: '',
          note: '',
          status: 'investigating',
          service: 'website',
        }}
        fields={[
          { key: 'title', label: 'Tittel' },
          {
            key: 'service',
            label: 'Berørt tjeneste',
            options: [
              ['website', 'Nettside'],
              ['database', 'Database / innlogging'],
              ['sven', 'Sven'],
              ['data', 'Data'],
              ['distribution', 'Distribusjon'],
              ['other', 'Annet'],
            ],
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              ['investigating', 'Undersøkes'],
              ['identified', 'Årsak funnet'],
              ['monitoring', 'Følges opp'],
              ['resolved', 'Løst'],
            ],
          },
          {
            key: 'note',
            label: 'Oppdatering / årsak / tiltak',
            type: 'textarea',
          },
        ]}
      />
      <RecordPanel
        collection="maintenance"
        canWrite={user.role === 'admin'}
        title="Planlagt vedlikehold"
        initial={{ title: '', note: '', start: '', end: '', status: 'planned' }}
        fields={[
          { key: 'title', label: 'Tittel' },
          {
            key: 'start',
            label: 'Starter (norsk tid)',
            type: 'datetime-local',
          },
          { key: 'end', label: 'Slutter (norsk tid)', type: 'datetime-local' },
          {
            key: 'status',
            label: 'Status',
            options: [
              ['planned', 'Planlagt'],
              ['active', 'Pågår'],
              ['completed', 'Fullført'],
              ['cancelled', 'Avlyst'],
            ],
          },
          {
            key: 'note',
            label: 'Hva berøres?',
            type: 'textarea',
            required: false,
          },
        ]}
      />
      <Infrastructure />
    </>
  )
}
function Infrastructure() {
  const state = useResource('/api/admin/infrastructure')
  return (
    <Panel title="Domene og sertifikat">
      <Resource state={state}>
        {(d) => (
          <dl className="ad-details">
            <div>
              <dt>Domene</dt>
              <dd>fellestall.no</dd>
            </div>
            <div>
              <dt>TLS-sertifikat</dt>
              <dd>
                {d.ssl?.available
                  ? 'Gyldig til ' + date(d.ssl.expiresAt)
                  : d.ssl?.reason || 'Kunne ikke kontrolleres'}
              </dd>
            </div>
            <div>
              <dt>Domenefornyelse</dt>
              <dd>
                {d.domain?.expiresAt
                  ? date(d.domain.expiresAt)
                  : 'Registeret oppgir ikke en offentlig utløpsdato. Fornyelse må følges hos domeneforhandleren.'}
              </dd>
            </div>
          </dl>
        )}
      </Resource>
    </Panel>
  )
}
export function DataQuality() {
  const state = useResource('/api/admin/data'),
    { user } = useAdmin(),
    action = useAction(state.reload),
    [comparison, setComparison] = useState(null),
    [restore, setRestore] = useState(null),
    [reason, setReason] = useState('')
  useUnsaved(Boolean(restore?.password) || Boolean(reason))
  return (
    <>
      <ActionState action={action} />
      <Resource state={state}>
        {(d) => (
          <>
            <div className="ad-stat-grid">
              <Stat
                label="Datagrunnlag oppdatert"
                value={d.updated ? date(d.updated) : 'Ukjent'}
              />
              <Stat
                label="Kontroller bestått"
                value={`${d.checks.filter((c) => c.passed).length} / ${d.checks.length}`}
              />
              <Stat label="Datafiler" value={fmt(d.files.length)} />
              <Stat
                label="Publisering av data"
                value={d.gate?.held ? 'Holdt tilbake' : 'Åpen'}
              />
            </div>
            <Panel title="Kvalitetskontroller">
              <Table
                rows={d.checks}
                columns={[
                  { key: 'label', label: 'Kontroll' },
                  {
                    key: 'passed',
                    label: 'Resultat',
                    render: (r) =>
                      r.passed
                        ? 'Bestått'
                        : r.severity === 'review'
                          ? 'Faglig vurdering'
                          : 'Må undersøkes',
                  },
                  {
                    key: 'checked',
                    label: 'Kontrollerte verdier',
                    render: (r) => fmt(r.checked),
                  },
                  {
                    key: 'failures',
                    label: 'Avvik',
                    render: (r) => fmt(r.failures),
                  },
                ]}
              />
              {d.problems.length > 0 && (
                <details>
                  <summary>Registrerte avvik</summary>
                  <pre className="ad-pre">
                    {JSON.stringify(d.problems, null, 2)}
                  </pre>
                </details>
              )}
              <p className="ad-footnote">
                Summer kontrolleres med avrundingstoleranse. Faglig uventede,
                men gyldige endringer må vurderes mot kilden.
              </p>
            </Panel>
            <Panel title="Datasett, dekning og enheter">
              <Table
                rows={d.datasets}
                columns={[
                  {
                    key: 'label',
                    label: 'Datasett',
                    render: (r) => (
                      <a href={r.path} target="_blank" rel="noreferrer">
                        {r.label} ↗
                      </a>
                    ),
                  },
                  {
                    key: 'years',
                    label: 'År',
                    render: (r) =>
                      r.years?.length
                        ? r.years[0] + '–' + r.years.at(-1)
                        : 'Ikke oppgitt',
                  },
                  { key: 'unit', label: 'Enhet' },
                  { key: 'updated', label: 'Oppdatert' },
                ]}
              />
              <p className="ad-footnote">
                Budsjett er planlagte bevilgninger; regnskap viser faktisk
                bokført bruk. Nominelle beløp er løpende kroner. Reelle beløp er
                prisjusterte, og tall per innbygger tar også hensyn til
                befolkningsendringer. Grunnlag og metode følger hver analyse.
              </p>
            </Panel>
            <Panel title="Kilder">
              <ul className="ad-link-list">
                {d.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.name} ↗
                    </a>
                    <small>{s.license}</small>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Dataversjoner">
              <Table
                rows={d.snapshots.rows}
                empty={
                  d.snapshots.reason || 'Ingen dataversjoner er registrert.'
                }
                columns={[
                  {
                    key: 'id',
                    label: 'Versjon',
                    render: (r) => <code>{r.id.slice(0, 12)}</code>,
                  },
                  {
                    key: 'state',
                    label: 'Status',
                    render: (r) => (r.active ? 'Aktiv' : r.state),
                  },
                  {
                    key: 'created_at',
                    label: 'Opprettet',
                    render: (r) => date(r.created_at),
                  },
                  { key: 'file_count', label: 'Filer' },
                  {
                    key: 'actions',
                    label: 'Handling',
                    render: (r) => (
                      <div className="ad-actions">
                        <button
                          className="ad-text-button"
                          onClick={() =>
                            api('/api/admin/data/compare?id=' + r.id)
                              .then(setComparison)
                              .catch((e) => setComparison({ error: e.message }))
                          }
                        >
                          Sammenlign
                        </button>
                        {user.role === 'admin' &&
                          !r.active &&
                          r.state === 'verified' && (
                            <button
                              className="ad-text-button"
                              onClick={() =>
                                setRestore({
                                  snapshot: r.id,
                                  expected: d.snapshots.rows.find(
                                    (s) => s.active,
                                  )?.id,
                                  reason: '',
                                  confirm: '',
                                  password: '',
                                })
                              }
                            >
                              Tilbakefør
                            </button>
                          )}
                      </div>
                    ),
                  },
                ]}
              />
              {comparison &&
                (comparison.error ? (
                  <Notice error>{comparison.error}</Notice>
                ) : (
                  <>
                    <h3>{comparison.changes.length} endrede filer</h3>
                    <Table
                      rows={comparison.changes.slice(0, 80)}
                      columns={[
                        { key: 'path', label: 'Fil' },
                        { key: 'change', label: 'Endring' },
                        { key: 'bytes', label: 'Byte' },
                      ]}
                    />
                  </>
                ))}
              {restore && (
                <form
                  className="ad-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    action
                      .run(
                        'data/restore',
                        restore,
                        'Kontrollert tilbakeføring er bestilt.',
                      )
                      .then((r) => {
                        if (r) setRestore(null)
                      })
                  }}
                >
                  <Notice>
                    Tilbakefører dataversjon {restore.snapshot.slice(0, 12)}{' '}
                    gjennom den vanlige publiseringsjobben. Gjeldende aktiv
                    versjon kontrolleres igjen før aktivering.
                  </Notice>
                  <Field
                    label="Begrunnelse"
                    value={restore.reason}
                    onChange={(e) =>
                      setRestore({ ...restore, reason: e.target.value })
                    }
                    required
                    minLength={5}
                  />
                  <SensitiveFields value={restore} onChange={setRestore} />
                  <div className="ad-actions">
                    <button className="ad-primary" disabled={action.busy}>
                      Bestill tilbakeføring
                    </button>
                    <button
                      type="button"
                      className="ad-secondary"
                      onClick={() => setRestore(null)}
                    >
                      Avbryt
                    </button>
                  </div>
                </form>
              )}
            </Panel>
            {user.role === 'admin' && (
              <Panel title="Hold tilbake nye data">
                <form
                  className="ad-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    action
                      .run('data/hold', { held: !d.gate?.held, reason })
                      .then((r) => {
                        if (r) setReason('')
                      })
                  }}
                >
                  <p>
                    {d.gate?.held
                      ? 'Nye datapubliseringer er stanset: ' + d.gate.reason
                      : 'Stans aktivering av nye datasett mens et avvik undersøkes.'}
                  </p>
                  <Field
                    label="Begrunnelse"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={5}
                    required
                  />
                  <button className="ad-primary" disabled={action.busy}>
                    {d.gate?.held
                      ? 'Åpne datapublisering'
                      : 'Hold tilbake nye data'}
                  </button>
                </form>
              </Panel>
            )}
          </>
        )}
      </Resource>
      {user.role === 'admin' && (
        <RecordPanel
          collection="sourcePolicies"
          title="Forventede kildeoppdateringer"
          initial={{
            source: 'all',
            expectedDays: 30,
            nextExpected: '',
            note: '',
          }}
          fields={[
            {
              key: 'source',
              label: 'Datasett',
              options: [
                ['all', 'Hele datagrunnlaget'],
                ['utgifter.json', 'Statsutgifter'],
                ['inntekter.json', 'Statsinntekter'],
                ['kpi.json', 'Konsumprisindeks'],
                ['befolkning.json', 'Folkemengde'],
                ['bnp.json', 'Bruttonasjonalprodukt'],
                ['oljepengebruk.json', 'Oljepengebruk'],
                ['kostra/index.json', 'KOSTRA kommunetall'],
                ['budsjettarkiv/index.json', 'Budsjettarkiv'],
              ],
            },
            {
              key: 'expectedDays',
              label: 'Forventet intervall (dager)',
              type: 'number',
              min: 1,
              max: 730,
            },
            {
              key: 'nextExpected',
              label: 'Neste kjente oppdatering',
              type: 'date',
              required: false,
            },
            {
              key: 'note',
              label: 'Oppfølging',
              type: 'textarea',
              required: false,
            },
          ]}
        />
      )}
    </>
  )
}
export function Learning() {
  const state = useResource('/api/admin/learning'),
    { user } = useAdmin(),
    action = useAction(state.reload),
    [reason, setReason] = useState('')
  return (
    <>
      <Resource state={state}>
        {(d) => (
          <>
            <Panel title="Godkjente regler i Svens arbeidsgrunnlag">
              <ActionState action={action} />
              <Field
                label="Begrunnelse for neste regelendring"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Hva skal denne endringen forbedre?"
              />
              <div className="ad-records">
                {d.preferences.rules.map((r) => (
                  <article key={r.id}>
                    <div className="ad-record-heading">
                      <h3>{r.id}</h3>
                      <span className="ad-tag">
                        {r.status === 'active' ? 'Aktiv' : 'Arkivert'}
                      </span>
                    </div>
                    <p>{r.rule}</p>
                    {r.provenance && (
                      <small className="ad-muted">
                        Opphav:{' '}
                        {typeof r.provenance === 'string'
                          ? r.provenance
                          : r.provenance.source || r.provenance.kind}
                      </small>
                    )}
                    {user.role === 'admin' && (
                      <button
                        className="ad-text-button"
                        disabled={action.busy || reason.trim().length < 5}
                        onClick={() =>
                          action.run('learning/apply', {
                            action:
                              r.status === 'active' ? 'archive' : 'restore',
                            id: r.id,
                            sha: d.sha,
                            reason,
                          })
                        }
                      >
                        {r.status === 'active'
                          ? 'Deaktiver regelen'
                          : 'Gjenopprett regelen'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </Panel>
            <Panel title="Regelforslag som venter på godkjenning">
              <p className="ad-muted">
                En rettelse i én analyse blir ikke automatisk en ny regel.
                Administrator må godkjenne generelle regler eksplisitt.
              </p>
              {d.proposals
                .filter((r) => r.data.status === 'proposed')
                .map((r) => (
                  <article className="ad-rule" key={r.id}>
                    <h3>{r.data.title}</h3>
                    <p>{r.data.rule}</p>
                    <small>Opphav: {r.data.provenance}</small>
                    {user.role === 'admin' && (
                      <button
                        className="ad-primary"
                        disabled={action.busy || reason.trim().length < 5}
                        onClick={() =>
                          action.run(
                            'learning/apply',
                            {
                              action: 'approve',
                              id: r.id,
                              revision: r.revision,
                              sha: d.sha,
                              reason,
                            },
                            'Regelen er eksplisitt godkjent og lagt i Svens arbeidsgrunnlag.',
                          )
                        }
                      >
                        Godkjenn regel
                      </button>
                    )}
                  </article>
                ))}
              {!d.proposals.some((r) => r.data.status === 'proposed') && (
                <p>Ingen åpne regelforslag.</p>
              )}
            </Panel>
            <div className="ad-stat-grid">
              <Stat
                label="Åpne tilbakemeldinger"
                value={
                  d.feedback.filter((r) => r.data.status === 'open').length
                }
              />
              <Stat
                label="Behandlet / løst"
                value={
                  d.feedback.filter((r) => r.data.status !== 'open').length
                }
              />
              <Stat
                label="Aktive regler"
                value={
                  d.preferences.rules.filter((r) => r.status === 'active')
                    .length
                }
              />
            </div>
          </>
        )}
      </Resource>
      <RecordPanel
        collection="feedback"
        title="Strukturert tilbakemelding"
        initial={{
          article: '',
          category: 'language',
          note: '',
          correction: '',
          kind: 'correction',
          status: 'open',
          sourceVersion: '',
        }}
        fields={[
          { key: 'article', label: 'Analyse eller gjennomgang' },
          {
            key: 'sourceVersion',
            label: 'Versjon (valgfritt)',
            required: false,
          },
          {
            key: 'category',
            label: 'Område',
            options: [
              ['language', 'Språk'],
              ['sources', 'Kilder'],
              ['scope', 'Avgrensning'],
              ['numbers', 'Tall'],
              ['other', 'Annet'],
            ],
          },
          {
            key: 'kind',
            label: 'Bruk av tilbakemeldingen',
            options: [
              ['correction', 'Rettelse i denne analysen'],
              ['rule', 'Forslag til generell regel'],
            ],
          },
          { key: 'note', label: 'Hva er problemet?', type: 'textarea' },
          {
            key: 'correction',
            label: 'Ønsket rettelse',
            type: 'textarea',
            required: false,
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              ['open', 'Åpen'],
              ['reviewed', 'Vurdert'],
              ['resolved', 'Løst'],
            ],
          },
        ]}
      />
      {user.role === 'admin' && (
        <RecordPanel
          collection="rules"
          title="Opprett eller rediger regelforslag"
          filter={(r) => r.data.status === 'proposed'}
          initial={{
            title: '',
            rule: '',
            provenance: '',
            feedbackId: '',
            status: 'proposed',
            scope: 'all',
          }}
          fields={[
            { key: 'title', label: 'Navn på forslaget' },
            { key: 'rule', label: 'Generell instruks', type: 'textarea' },
            {
              key: 'provenance',
              label: 'Hvorfor trengs regelen? Kilde / gjennomgang',
              type: 'textarea',
            },
            {
              key: 'feedbackId',
              label: 'Tilbakemeldings-ID (valgfritt)',
              required: false,
            },
            {
              key: 'scope',
              label: 'Gjelder',
              options: [
                ['all', 'Alle analyser'],
                ['language', 'Språk'],
                ['sources', 'Kilder'],
                ['scope', 'Avgrensning'],
                ['numbers', 'Tall'],
              ],
            },
          ]}
        />
      )}
    </>
  )
}
export function Insights({ section, days }) {
  const [path, setPath] = useState(''),
    [device, setDevice] = useState(''),
    state = useResource(
      `/api/admin/insights?days=${days}&path=${encodeURIComponent(path)}&device=${device}`,
    ),
    performance = section === 'ytelse'
  return (
    <Resource state={state}>
      {(d) => (
        <>
          <div className="ad-stat-grid">
            <Stat
              label="Sidevisninger"
              value={fmt(d.totals.views)}
              note={
                d.viewsChange == null
                  ? 'Ingen sammenlignbar forrige periode'
                  : `${fmt(d.viewsChange, 1)} % mot foregående ${days} dager`
              }
            />
            <Stat
              label="LCP gjennomsnitt"
              value={d.totals.lcp == null ? '—' : fmt(d.totals.lcp) + ' ms'}
              note={fmt(d.totals.lcp_count) + ' målinger'}
            />
            <Stat
              label="INP gjennomsnitt"
              value={d.totals.inp == null ? '—' : fmt(d.totals.inp) + ' ms'}
              note={fmt(d.totals.inp_count) + ' målinger'}
            />
            <Stat
              label="CLS gjennomsnitt"
              value={fmt(d.totals.cls, 3)}
              note={fmt(d.totals.cls_count) + ' målinger'}
            />
          </div>
          {performance && d.deteriorated.length > 0 && (
            <Notice>
              Gjennomsnittet er mer enn 20 % svakere enn forrige periode for{' '}
              {d.deteriorated.map((s) => s.toUpperCase()).join(', ')}. Minst 20
              nye målinger ligger til grunn; undersøk utvalget og siden før
              tiltak.
            </Notice>
          )}
          <Panel
            title={
              performance ? 'Ytelse per side og enhet' : 'Sider og analyser'
            }
            extra={
              <a
                className="ad-secondary"
                href={`/api/admin/export?kind=pages&days=${days}`}
              >
                Last ned CSV
              </a>
            }
          >
            <div className="ad-form-inline">
              <Field
                label="Detaljfilter: sidesti"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/analyser/…/"
              />
              <Select
                label="Detaljfilter: enhet"
                value={device}
                onChange={setDevice}
                options={[
                  ['', 'Alle'],
                  ['mobile', 'Mobil'],
                  ['desktop', 'Datamaskin'],
                ]}
              />
            </div>
            <Table
              rows={d.pages}
              columns={[
                { key: 'path', label: 'Side' },
                {
                  key: 'views',
                  label: 'Visninger',
                  render: (r) => fmt(r.views),
                },
                ...(performance
                  ? [
                      {
                        key: 'lcp',
                        label: 'LCP (snitt)',
                        render: (r) => fmt(r.lcp) + ' ms',
                      },
                      {
                        key: 'lcp_count',
                        label: 'Målinger',
                        render: (r) => fmt(r.lcp_count),
                      },
                      {
                        key: 'inp',
                        label: 'INP (snitt)',
                        render: (r) => fmt(r.inp) + ' ms',
                      },
                    ]
                  : []),
              ]}
            />
            {performance && (
              <>
                <h3>P75 for valgt detaljutvalg</h3>
                <Table
                  rows={d.percentiles}
                  columns={[
                    {
                      key: 'metric',
                      label: 'Måling',
                      render: (r) => r.metric.toUpperCase(),
                    },
                    {
                      key: 'p75',
                      label: 'P75-intervall',
                      render: (r) =>
                        r.samples
                          ? `${fmt(r.lower, r.metric === 'cls' ? 3 : 0)}–${fmt(r.p75, r.metric === 'cls' ? 3 : 0)}${r.metric === 'cls' ? '' : ' ms'}`
                          : 'Ingen fordelingsdata ennå',
                    },
                    {
                      key: 'samples',
                      label: 'Antall målinger',
                      render: (r) => fmt(r.samples),
                    },
                  ]}
                />
                <p className="ad-footnote">
                  {d.method} Toppkortene viser hele perioden; filtrene gjelder
                  detaljutvalget.
                </p>
              </>
            )}
          </Panel>
          <Panel
            title="Daglig utvikling"
            extra={
              <a
                className="ad-text-button"
                href={`/api/admin/export?kind=daily&days=${days}`}
              >
                CSV
              </a>
            }
          >
            <div className="ad-trend" aria-label="Daglige sidevisninger">
              {d.daily.map((r) => (
                <div key={r.day} title={`${r.day}: ${r.views} visninger`}>
                  <span
                    style={{
                      height:
                        Math.max(
                          2,
                          (100 * r.views) /
                            Math.max(1, ...d.daily.map((x) => x.views)),
                        ) + '%',
                    }}
                  />
                  <small>{r.day.slice(5)}</small>
                </div>
              ))}
            </div>
            <details>
              <summary>Se målingene som tabell</summary>
              <Table
                rows={d.daily}
                columns={[
                  { key: 'day', label: 'Dato' },
                  { key: 'views', label: 'Visninger' },
                  {
                    key: 'lcp',
                    label: 'LCP',
                    render: (r) => fmt(r.lcp) + ' ms',
                  },
                  { key: 'lcp_count', label: 'Målinger' },
                ]}
              />
            </details>
          </Panel>
          {performance ? (
            <>
              <Panel title="Sammenlign utrullinger">
                <Table
                  rows={d.releases}
                  columns={[
                    {
                      key: 'release',
                      label: 'Kodeversjon',
                      render: (r) => <code>{r.release.slice(0, 12)}</code>,
                    },
                    ...['lcp', 'inp', 'cls'].map((metric) => ({
                      key: metric,
                      label: metric.toUpperCase() + ' P75',
                      render: (r) => {
                        const m = r.metrics.find((x) => x.metric === metric)
                        return m?.samples
                          ? `${fmt(m.lower, metric === 'cls' ? 3 : 0)}–${fmt(m.p75, metric === 'cls' ? 3 : 0)} (${fmt(m.samples)})`
                          : 'Ingen målinger'
                      },
                    })),
                  ]}
                />
              </Panel>
              <Panel
                title="JavaScript- og API-feil"
                extra={
                  <a
                    className="ad-text-button"
                    href={`/api/admin/export?kind=errors&days=${days}`}
                  >
                    CSV
                  </a>
                }
              >
                <Table
                  rows={d.errors}
                  columns={[
                    { key: 'path', label: 'Side / endepunkt' },
                    { key: 'detail', label: 'Feiltype' },
                    { key: 'counts', label: 'Antall' },
                    {
                      key: 'last_seen_at',
                      label: 'Sist sett',
                      render: (r) => date(r.last_seen_at),
                    },
                  ]}
                />
              </Panel>
            </>
          ) : (
            <>
              <div className="ad-columns">
                <Panel
                  title="Henvisningskilder"
                  extra={
                    <a
                      className="ad-text-button"
                      href={`/api/admin/export?kind=sources&days=${days}`}
                    >
                      CSV
                    </a>
                  }
                >
                  <Table
                    rows={d.sources}
                    columns={[
                      { key: 'label', label: 'Kilde' },
                      { key: 'views', label: 'Visninger' },
                    ]}
                  />
                </Panel>
                <Panel title="Enheter">
                  <Table
                    rows={d.devices}
                    columns={[
                      {
                        key: 'device',
                        label: 'Enhet',
                        render: (r) =>
                          r.device === 'mobile' ? 'Mobil' : 'Datamaskin',
                      },
                      { key: 'views', label: 'Visninger' },
                    ]}
                  />
                </Panel>
              </div>
              <Panel
                title="Funksjonsbruk og manglende sider"
                extra={
                  <a
                    className="ad-text-button"
                    href={`/api/admin/export?kind=features&days=${days}`}
                  >
                    CSV
                  </a>
                }
              >
                <Table
                  rows={d.features}
                  columns={[
                    {
                      key: 'feature',
                      label: 'Hendelse',
                      render: (r) =>
                        ({
                          filter: 'Filter',
                          compare: 'Sammenligning',
                          share: 'Deling',
                          download: 'Nedlasting',
                          search: 'Søk',
                          chart: 'Graf',
                          bot: 'Filtrert robot',
                          404: 'Side ikke funnet',
                        })[r.feature] || r.feature,
                    },
                    { key: 'path', label: 'Side' },
                    { key: 'counts', label: 'Antall' },
                  ]}
                />
                <p className="ad-footnote">
                  Kjente roboter filtreres fra visninger og måles separat. Ingen
                  besøks-ID, søketekst eller beregningsbeløp lagres.
                  Funksjonsbruk viser hendelser, ikke unike personer.
                </p>
              </Panel>
            </>
          )}
        </>
      )}
    </Resource>
  )
}
export function Notifications() {
  const [type, setType] = useState(''),
    [severity, setSeverity] = useState(''),
    state = useResource(
      `/api/admin/notifications?type=${type}&severity=${severity}`,
    ),
    { user } = useAdmin(),
    action = useAction(state.reload)
  return (
    <>
      <ActionState action={action} />
      <Panel title="Varslingsinnboks">
        <div className="ad-form-inline">
          <Select
            label="Type"
            value={type}
            onChange={setType}
            options={[['', 'Alle'], ...types]}
          />
          <Select
            label="Alvorlighet"
            value={severity}
            onChange={setSeverity}
            options={[
              ['', 'Alle'],
              ['info', 'Informasjon'],
              ['warning', 'Advarsel'],
              ['critical', 'Kritisk'],
            ]}
          />
        </div>
        <Resource state={state}>
          {(d) => (
            <>
              {!d.emailReady && (
                <Notice>
                  Checkly sender driftsvarsler gjennom den eksisterende kanalen.
                  Invitasjoner, samlet varsling og oppsummeringer aktiveres når
                  e-posttjenesten og avsenderdomenet er koblet til.
                </Notice>
              )}
              <div className="ad-records">
                {d.items.map((n) => (
                  <article key={n.id}>
                    <div className="ad-record-heading">
                      <h3>{n.title}</h3>
                      <span className="ad-tag">
                        {n.resolved_at
                          ? 'Løst'
                          : n.severity === 'critical'
                            ? 'Kritisk'
                            : n.severity === 'warning'
                              ? 'Advarsel'
                              : 'Informasjon'}
                      </span>
                    </div>
                    <p>{n.detail}</p>
                    <small className="ad-muted">
                      {date(n.created_at)}
                      {n.resolved_at ? ' · løst ' + date(n.resolved_at) : ''}
                    </small>
                    {user.role !== 'viewer' && !n.acknowledged && (
                      <button
                        className="ad-text-button"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            'records/acknowledgements',
                            { data: { key: n.dedupe_key, acknowledged: true } },
                            'Varslet er merket som lest.',
                          )
                        }
                      >
                        Marker som lest
                      </button>
                    )}
                    {n.acknowledged && <span className="ad-tag">Lest</span>}
                  </article>
                ))}
                {!d.items.length && <p>Ingen varsler i dette utvalget.</p>}
              </div>
              {user.role === 'admin' && (
                <>
                  <div className="ad-actions">
                    <button
                      className="ad-secondary"
                      disabled={action.busy || !d.emailReady}
                      onClick={() =>
                        action.run(
                          'notifications/test',
                          {},
                          'Testmail er bekreftet sendt til din konto.',
                        )
                      }
                    >
                      Send testmail til min konto
                    </button>
                  </div>
                  <h3>Siste e-postleveringer</h3>
                  <Table
                    rows={d.deliveries}
                    columns={[
                      { key: 'recipient', label: 'Mottaker' },
                      { key: 'subject', label: 'Emne' },
                      { key: 'status', label: 'Resultat' },
                      { key: 'error_code', label: 'Feilkode' },
                      {
                        key: 'sent_at',
                        label: 'Sendt',
                        render: (r) => date(r.sent_at),
                      },
                    ]}
                  />
                </>
              )}
            </>
          )}
        </Resource>
      </Panel>
      {user.role === 'admin' && (
        <>
          <RecordPanel
            collection="recipients"
            title="Mottakere og oppsummeringer"
            initial={{
              email: '',
              name: '',
              types: types.map((t) => t[0]),
              digest: 'none',
              active: true,
            }}
            fields={[
              { key: 'email', label: 'E-postadresse', type: 'email' },
              { key: 'name', label: 'Navn', required: false },
              {
                key: 'types',
                label: 'Varslingstyper',
                type: 'choices',
                choices: types,
              },
              {
                key: 'digest',
                label: 'Levering',
                options: [
                  ['none', 'Samlede statusvarsler'],
                  ['daily', 'Daglig oppsummering'],
                  ['weekly', 'Ukentlig oppsummering (mandag)'],
                ],
              },
              { key: 'active', label: 'Aktiv mottaker', type: 'checkbox' },
            ]}
          />
          <NotificationPreferences />
        </>
      )}
    </>
  )
}
function NotificationPreferences() {
  const state = useResource('/api/admin/records/preferences'),
    action = useAction(state.reload),
    [form, setForm] = useState(null)
  return (
    <Panel title="Alvorlighet, samling og stilleperiode">
      <ActionState action={action} />
      <Resource state={state}>
        {(rows) => {
          const row = rows.find((r) => r.id === 'notifications'),
            v = form ||
              row?.data || {
                digest: 'none',
                severity: 'warning',
                quietStart: '',
                quietEnd: '',
                groupMinutes: 30,
              }
          return (
            <form
              className="ad-form"
              onSubmit={(e) => {
                e.preventDefault()
                action
                  .run('records/preferences', {
                    id: 'notifications',
                    revision: row?.revision || 0,
                    data: v,
                  })
                  .then((r) => {
                    if (r) setForm(null)
                  })
              }}
            >
              <Select
                label="Laveste alvorlighet for statusmail"
                value={v.severity}
                onChange={(severity) => setForm({ ...v, severity })}
                options={[
                  ['info', 'Informasjon'],
                  ['warning', 'Advarsel'],
                  ['critical', 'Kritisk'],
                ]}
              />
              <Field
                label="Samle varsler i antall minutter"
                type="number"
                min={5}
                max={1440}
                value={v.groupMinutes}
                onChange={(e) =>
                  setForm({ ...v, groupMinutes: Number(e.target.value) })
                }
              />
              <div className="ad-form-inline">
                <Field
                  label="Stille fra (norsk tid)"
                  type="time"
                  value={v.quietStart}
                  onChange={(e) =>
                    setForm({ ...v, quietStart: e.target.value })
                  }
                />
                <Field
                  label="Stille til (norsk tid)"
                  type="time"
                  value={v.quietEnd}
                  onChange={(e) => setForm({ ...v, quietEnd: e.target.value })}
                />
              </div>
              <p className="ad-muted">
                Kritiske varsler omgår stilleperioden. Checkly-kanalen har egne
                innstillinger. Kvittering fra e-postleverandøren betyr mottatt
                for levering, og garanterer ikke plassering i innboksen.
              </p>
              <button className="ad-primary" disabled={action.busy || !form}>
                Lagre innstillinger
              </button>
            </form>
          )
        }}
      </Resource>
    </Panel>
  )
}
export function AuditHistory() {
  const [q, setQ] = useState(''),
    [actionFilter, setFilter] = useState(''),
    state = useResource(
      `/api/admin/audit?q=${encodeURIComponent(q)}&action=${encodeURIComponent(actionFilter)}`,
    )
  return (
    <Panel title="Aktør og endring">
      <div className="ad-form-inline">
        <Field
          label="Søk på aktør eller område"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Field
          label="Filter på handling"
          value={actionFilter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="f.eks. approve-publication"
        />
      </div>
      <Resource state={state}>
        {(rows) => (
          <div className="ad-records">
            {rows.map((r) => (
              <article key={r.id}>
                <div className="ad-record-heading">
                  <strong>{r.actor_email}</strong>
                  <time>{date(r.created_at)}</time>
                </div>
                <p>
                  {r.action} · {r.resource}
                </p>
                <details>
                  <summary>Se før og etter</summary>
                  <JsonDiff before={r.before_value} after={r.after_value} />
                </details>
              </article>
            ))}
            {!rows.length && <p>Ingen endringer i dette utvalget.</p>}
          </div>
        )}
      </Resource>
    </Panel>
  )
}
export function Backups() {
  const state = useResource('/api/admin/backups'),
    [label, setLabel] = useState(''),
    [preview, setPreview] = useState(null),
    [confirmation, setConfirmation] = useState({}),
    action = useAction(state.reload)
  useUnsaved(Boolean(confirmation.password) || Boolean(label))
  return (
    <>
      <ActionState action={action} />
      <BackupImport reload={state.reload} />
      <Panel title="Krypterte sikkerhetskopier">
        <p>
          Kopiene omfatter private admininnstillinger, tilbakemeldinger,
          hendelser og mottakere. Kontoer, økter og publiserte analyser
          håndteres separat. Det lages en automatisk døgnkopi når innholdet
          finnes; de 40 siste kopiene beholdes. Oppbevar også nedlastede kopier
          sikkert; prosjektets servernøkkel kreves ved åpning.
        </p>
        <form
          className="ad-form-inline"
          onSubmit={(e) => {
            e.preventDefault()
            action
              .run(
                'backups/create',
                { label },
                'Kryptert sikkerhetskopi er opprettet.',
              )
              .then((r) => {
                if (r) setLabel('')
              })
          }}
        >
          <Field
            label="Navn på ny sikkerhetskopi"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            minLength={5}
          />
          <button className="ad-primary" disabled={action.busy}>
            Opprett kopi
          </button>
        </form>
        <Resource state={state}>
          {(d) => (
            <Table
              rows={d.items}
              columns={[
                { key: 'label', label: 'Kopi' },
                {
                  key: 'created_at',
                  label: 'Opprettet',
                  render: (r) => date(r.created_at),
                },
                { key: 'record_count', label: 'Registreringer' },
                {
                  key: 'tested_at',
                  label: 'Gjenopprettingstest',
                  render: (r) =>
                    r.tested_at ? date(r.tested_at) : 'Ikke testet',
                },
                {
                  key: 'actions',
                  label: 'Handling',
                  render: (r) => (
                    <div className="ad-actions">
                      <button
                        className="ad-text-button"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            'backups/test',
                            { id: r.id },
                            'Kopien er faktisk gjenopprettet og kontrollert i et isolert databaseskjema.',
                          )
                        }
                      >
                        Test
                      </button>
                      <button
                        className="ad-text-button"
                        onClick={() =>
                          api('/api/admin/backups/preview?id=' + r.id).then(
                            (p) => {
                              setPreview(p)
                              setConfirmation({})
                            },
                          )
                        }
                      >
                        Forhåndsvis
                      </button>
                      <button
                        className="ad-text-button"
                        onClick={() =>
                          api('/api/admin/backups/download?id=' + r.id).then(
                            (p) =>
                              saveFile(
                                'fellestall-kryptert-' + r.id + '.json',
                                p,
                              ),
                          )
                        }
                      >
                        Last ned
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Resource>
      </Panel>
      {preview && (
        <Panel title="Forhåndsvis tilbakeføring">
          <p>{preview.note}</p>
          <Table
            rows={preview.records}
            columns={[
              { key: 'collection', label: 'Område' },
              { key: 'id', label: 'Registrering' },
              { key: 'backupRevision', label: 'Kopiens versjon' },
              { key: 'currentRevision', label: 'Gjeldende versjon' },
            ]}
          />
          <form
            className="ad-form"
            onSubmit={(e) => {
              e.preventDefault()
              action
                .run(
                  'backups/restore',
                  {
                    ...confirmation,
                    id: preview.id,
                    checksum: preview.checksum,
                    expectedVersion: preview.expectedVersion,
                  },
                  'Administratorinnholdet er gjenopprettet.',
                )
                .then((r) => {
                  if (r) {
                    setPreview(null)
                    setConfirmation({})
                  }
                })
            }}
          >
            <Field
              label="Begrunnelse"
              value={confirmation.reason || ''}
              onChange={(e) =>
                setConfirmation({ ...confirmation, reason: e.target.value })
              }
              required
              minLength={5}
            />
            <SensitiveFields value={confirmation} onChange={setConfirmation} />
            <div className="ad-actions">
              <button className="ad-primary" disabled={action.busy}>
                Gjenopprett testet kopi
              </button>
              <button
                className="ad-secondary"
                type="button"
                onClick={() => {
                  setPreview(null)
                  setConfirmation({})
                }}
              >
                Avbryt
              </button>
            </div>
          </form>
        </Panel>
      )}
    </>
  )
}
export function Reports() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    state = useResource('/api/admin/reports?month=' + month)
  return (
    <>
      <div className="ad-actions">
        <Field
          label="Rapportmåned"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <button className="ad-secondary" onClick={() => window.print()}>
          Skriv ut / lagre som PDF
        </button>
        {state.data && (
          <>
            <button
              className="ad-secondary"
              onClick={() => {
                const d = state.data,
                  escape = (v) =>
                    String(v ?? '').replace(
                      /[&<>"']/g,
                      (c) =>
                        ({
                          '&': '&amp;',
                          '<': '&lt;',
                          '>': '&gt;',
                          '"': '&quot;',
                          "'": '&#39;',
                        })[c],
                    )
                saveFile(
                  'fellestall-rapport-' + month + '.html',
                  `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Fellestall ${escape(month)}</title><style>body{font:16px/1.7 Georgia;max-width:900px;margin:40px auto;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #ddd}</style><h1>Fellestall · ${escape(month)}</h1><p>${escape(d.note)}</p><p>${escape(d.views)} sidevisninger.</p><h2>Mest leste sider</h2><table><tr><th>Side</th><th>Visninger</th></tr>${d.pages.map((r) => `<tr><td>${escape(r.path)}</td><td>${escape(r.views)}</td></tr>`).join('')}</table><h2>Kommentarer</h2>${(d.notes || []).map((n) => `<h3>${escape(n.title)}</h3><p>${escape(n.note)}</p>`).join('')}<h2>Driftshendelser</h2>${d.incidents.map((r) => `<p>${escape(date(r.created_at))}: ${escape(r.summary)}</p>`).join('')}<p>Generert ${escape(date(d.generatedAt))}. Kilde: Fellestalls anonyme målinger.</p></html>`,
                  'text/html',
                )
              }}
            >
              Last ned delbar rapport
            </button>
            <button
              className="ad-secondary"
              onClick={() => {
                const cell = (v) => '"' + String(v).replaceAll('"', '""') + '"'
                saveFile(
                  'fellestall-rapport-' + month + '.csv',
                  '\uFEFF"Dato";"Sidevisninger"\r\n' +
                    state.data.traffic
                      .map((r) => [cell(r.day), cell(r.views)].join(';'))
                      .join('\r\n'),
                  'text/csv',
                )
              }}
            >
              CSV
            </button>
          </>
        )}
      </div>
      <Resource state={state}>
        {(d) => (
          <>
            <div className="ad-stat-grid">
              <Stat label="Sidevisninger" value={fmt(d.views)} />
              <Stat label="Driftshendelser" value={d.incidents.length} />
              <Stat
                label="Registrerte adminendringer"
                value={d.changes.reduce((n, r) => n + r.count, 0)}
              />
            </div>
            {d.partial && (
              <Notice>
                Måneden ligger delvis utenfor lagringstiden på 90 dager.
              </Notice>
            )}
            <Panel title={'Månedsrapport · ' + d.month}>
              <p>{d.note}</p>
              <h3>Mest leste sider og analyser</h3>
              <Table
                rows={d.pages}
                columns={[
                  { key: 'path', label: 'Side' },
                  { key: 'views', label: 'Visninger' },
                ]}
              />
              <h3>Henvisningskilder</h3>
              <Table
                rows={d.sources}
                columns={[
                  { key: 'source', label: 'Kilde' },
                  { key: 'views', label: 'Visninger' },
                ]}
              />
              <h3>Driftshendelser</h3>
              <Table
                rows={d.incidents}
                columns={[
                  {
                    key: 'created_at',
                    label: 'Dato',
                    render: (r) => date(r.created_at),
                  },
                  { key: 'summary', label: 'Hendelse' },
                  { key: 'status', label: 'Status' },
                ]}
              />
              <h3>Funksjonsbruk</h3>
              <Table
                rows={d.features}
                columns={[
                  { key: 'feature', label: 'Funksjon' },
                  { key: 'counts', label: 'Hendelser' },
                ]}
              />
              <h3>Gjeldende datakvalitet</h3>
              <Table
                rows={d.quality.checks}
                columns={[
                  { key: 'label', label: 'Kontroll' },
                  {
                    key: 'passed',
                    label: 'Resultat',
                    render: (r) => (r.passed ? 'Bestått' : 'Til vurdering'),
                  },
                ]}
              />
              <h3>Kommentarer</h3>
              {d.notes?.map((n, i) => (
                <article key={i}>
                  <h4>{n.title}</h4>
                  <p className="ad-preserve">{n.note}</p>
                </article>
              ))}
              <h3>Endringer og publisering</h3>
              <Table
                rows={d.changes}
                columns={[
                  { key: 'action', label: 'Handling' },
                  { key: 'count', label: 'Antall' },
                ]}
              />
            </Panel>
          </>
        )}
      </Resource>
      <RecordPanel
        collection="reports"
        filter={(r) => r.data.month === month}
        title="Kommentarer til månedsrapportene"
        initial={{ month, title: '', note: '' }}
        fields={[
          { key: 'month', label: 'Måned', type: 'month' },
          { key: 'title', label: 'Overskrift' },
          {
            key: 'note',
            label: 'Kommentar og oppfølging',
            type: 'textarea',
            required: false,
          },
        ]}
      />
    </>
  )
}
export function Help() {
  return (
    <>
      <Panel title="Slik bruker du arbeidsrommet">
        <ol className="ad-guide">
          <li>
            <strong>Planlegg:</strong> Legg tema, skrivedato og åpne kilder i
            analysepipelinen. Pausede temaer tas ikke. Hasteprioriterte temaer
            som har nådd datoen sin tas først.
          </li>
          <li>
            <strong>Gjennomgå:</strong> Les utkastet og kildegrunnlaget, be om
            revisjon eller rett teksten. Hver endring nullstiller tidligere
            versjonsgodkjenning.
          </li>
          <li>
            <strong>Godkjenn:</strong> Fullfør sjekklisten for siste versjon og
            bekreft publisering med passord. Eksisterende tester og
            publiseringskontroller gjelder fortsatt.
          </li>
          <li>
            <strong>Forbedre:</strong> Registrer en konkret rettelse i Læring.
            Generelle regler foreslås og godkjennes separat.
          </li>
          <li>
            <strong>Følg drift:</strong> Ytelse viser faktiske
            nettlesermålinger. Drift viser tjenester og jobber. Overvåking viser
            eksterne Checkly-resultater og forbruk.
          </li>
          <li>
            <strong>Gjenopprett:</strong> Ta en kryptert kopi, kjør den isolerte
            gjenopprettingstesten, les forhåndsvisningen og bekreft siste
            versjon før tilbakeføring.
          </li>
        </ol>
      </Panel>
      <Panel title="Begreper og målemetode">
        <dl className="ad-details">
          <div>
            <dt>Sidevisning</dt>
            <dd>En målt sideinnlasting. Gir ikke antall personer.</dd>
          </div>
          <div>
            <dt>LCP</dt>
            <dd>
              Tiden til sidens største synlige innhold er vist. Lavere er bedre.
            </dd>
          </div>
          <div>
            <dt>INP</dt>
            <dd>
              Respons ved brukerhandlinger. Lavere er bedre. Krever en faktisk
              interaksjon.
            </dd>
          </div>
          <div>
            <dt>CLS</dt>
            <dd>Uventet flytting av synlig innhold. Lavere er bedre.</dd>
          </div>
          <div>
            <dt>P75</dt>
            <dd>
              Omtrent tre av fire målinger ligger under denne verdien. Vises som
              et intervall fra målebøtter med oppgitt måleantall.
            </dd>
          </div>
          <div>
            <dt>Tilgjengelighet</dt>
            <dd>
              Andel registrerte kontroller med normal drift. Tidsrom uten
              målinger vises som ukjent.
            </dd>
          </div>
          <div>
            <dt>Sven og læring</dt>
            <dd>
              Sven følger versjonerte instrukser og godkjente regler.
              Tilbakemeldinger endrer arbeidsgrunnlaget; de finjusterer ikke
              selve språkmodellen.
            </dd>
          </div>
          <div>
            <dt>Kilder og personvern</dt>
            <dd>
              Åpne kilder følger hvert datasett og hver analyse. Trafikk lagres
              aggregert i 90 dager, uten besøks-ID, rå søk, full
              henvisningsadresse eller beregningsbeløp.
            </dd>
          </div>
        </dl>
      </Panel>
      <RecordPanel
        collection="issues"
        title="Kjente feil og forbedringsforslag"
        initial={{
          title: '',
          note: '',
          type: 'improvement',
          status: 'open',
          priority: 'normal',
        }}
        fields={[
          { key: 'title', label: 'Tittel' },
          {
            key: 'note',
            label: 'Beskrivelse / fremgangsmåte / ønsket løsning',
            type: 'textarea',
          },
          {
            key: 'type',
            label: 'Type',
            options: [
              ['bug', 'Feil'],
              ['improvement', 'Forbedring'],
            ],
          },
          { key: 'status', label: 'Status', options: statuses },
          {
            key: 'priority',
            label: 'Prioritet',
            options: [
              ['low', 'Lav'],
              ['normal', 'Normal'],
              ['high', 'Høy'],
            ],
          },
        ]}
      />
    </>
  )
}

export function InstructionHistory({ id }) {
  const history = useResource('/api/admin/sven/history?id=' + id),
    { user } = useAdmin(),
    [version, setVersion] = useState(null),
    [confirmation, setConfirmation] = useState({}),
    action = useAction(() => {
      setVersion(null)
      setConfirmation({})
      history.reload()
    })
  useUnsaved(Boolean(confirmation.password))
  return (
    <>
      <ActionState action={action} />
      <Resource state={history}>
        {(rows) => (
          <Table
            rows={rows}
            columns={[
              { key: 'title', label: 'Endring' },
              { key: 'date', label: 'Dato', render: (r) => date(r.date) },
              {
                key: 'diff',
                label: 'Handling',
                render: (r) => (
                  <button
                    className="ad-text-button"
                    onClick={() =>
                      api(`/api/admin/learning/version?id=${id}&commit=${r.id}`)
                        .then(setVersion)
                        .catch((e) => setVersion({ error: e.message }))
                    }
                  >
                    Sammenlign / gjenopprett
                  </button>
                ),
              },
            ]}
          />
        )}
      </Resource>
      {version &&
        (version.error ? (
          <Notice error>{version.error}</Notice>
        ) : (
          <>
            <JsonDiff
              before={version.previous.content}
              after={version.current.content}
            />
            {user.role === 'admin' && (
              <form
                className="ad-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  action.run(
                    'learning/restore',
                    {
                      id,
                      commit: version.commit,
                      sha: version.current.sha,
                      ...confirmation,
                    },
                    'Den tidligere instruksversjonen er gjenopprettet som en ny endring.',
                  )
                }}
              >
                <Field
                  label="Begrunnelse"
                  value={confirmation.reason || ''}
                  onChange={(e) =>
                    setConfirmation({ ...confirmation, reason: e.target.value })
                  }
                  required
                  minLength={5}
                />
                <SensitiveFields
                  value={confirmation}
                  onChange={setConfirmation}
                />
                <button className="ad-primary" disabled={action.busy}>
                  Gjenopprett tidligere versjon
                </button>
              </form>
            )}
          </>
        ))}
    </>
  )
}

function BackupImport({ reload }) {
  const [backup, setBackup] = useState(null),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    action = useAction(() => {
      setBackup(null)
      setPassword('')
      reload()
    })
  useUnsaved(Boolean(backup))
  return (
    <Panel title="Importer en nedlastet sikkerhetskopi">
      <ActionState action={action} />
      {error && <Notice error>{error}</Notice>}
      <Field
        label="Kryptert Fellestall-kopi"
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          try {
            const file = e.target.files[0]
            if (!file) return
            if (file.size > 2900000) throw Error('Kopien er for stor.')
            setBackup(JSON.parse(await file.text()))
            setError('')
          } catch (e) {
            setError(e.message)
          }
        }}
      />
      {backup && (
        <form
          className="ad-form"
          onSubmit={(e) => {
            e.preventDefault()
            action.run(
              'backups/import',
              { backup, password },
              'Kopien er importert. Kjør gjenopprettingstesten før bruk.',
            )
          }}
        >
          <p>{backup.label}</p>
          <Field
            label="Bekreft import med nåværende passord"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="ad-actions">
            <button className="ad-primary" disabled={action.busy}>
              Importer og kontroller filen
            </button>
            <button
              className="ad-secondary"
              type="button"
              onClick={() => {
                setBackup(null)
                setPassword('')
              }}
            >
              Avbryt
            </button>
          </div>
        </form>
      )}
    </Panel>
  )
}

function IntegrationStatus() {
  const state = useResource('/api/admin/integrations')
  return (
    <Panel title="Tilkoblede tjenester">
      <Resource state={state}>
        {(d) => (
          <>
            <Table
              rows={[
                {
                  name: 'GitHub',
                  ready: d.github,
                  scope:
                    'Arbeidsfiler og analysepipeline. Publisering trenger Contents, Pull requests, Issues og Actions med skriveadgang.',
                },
                {
                  name: 'Checkly',
                  ready: d.checkly,
                  scope:
                    'Lesetilgang til kontroller, resultater, varslingskanaler og abonnement.',
                },
                {
                  name: 'E-post',
                  ready: d.email,
                  scope:
                    'Invitasjoner, passordgjenoppretting og samlede varsler. Krever en bekreftet avsender.',
                },
              ]}
              columns={[
                { key: 'name', label: 'Tjeneste' },
                {
                  key: 'ready',
                  label: 'Serveroppsett',
                  render: (r) =>
                    r.ready ? 'Tilkobling konfigurert' : 'Mangler oppsett',
                },
                { key: 'scope', label: 'Bruk og nødvendig tilgang' },
              ]}
            />
            <p className="ad-muted">
              Faktisk tilgjengelighet kontrolleres ved bruk. Nøkler
              administreres som hemmeligheter i Vercel. Noter kjente
              utløpsdatoer nedenfor.
            </p>
          </>
        )}
      </Resource>
    </Panel>
  )
}
