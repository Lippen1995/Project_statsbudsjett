import { createContext, useContext, useEffect, useId, useState } from 'react'
import { api, useResource } from './api.js'

export const AdminContext = createContext({
  user: { role: 'viewer' },
  markDirty: () => {},
  markBusy: () => {},
})
export const useAdmin = () => useContext(AdminContext)
export const fmt = (value, digits = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('nb-NO', { maximumFractionDigits: digits }).format(
        value,
      )
export const date = (value) =>
  !value
    ? 'Ikke registrert'
    : new Intl.DateTimeFormat('nb-NO', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Oslo',
      }).format(new Date(value))
export function useUnsaved(dirty) {
  const { markDirty } = useAdmin(),
    id = useId()
  useEffect(() => {
    markDirty(id, dirty)
    return () => markDirty(id, false)
  }, [id, dirty, markDirty])
}
export function Panel({ title, children, extra }) {
  return (
    <section className="ad-panel">
      <header className="ad-panel-header">
        <h2>{title}</h2>
        {extra}
      </header>
      <div className="ad-body">{children}</div>
    </section>
  )
}
export function Notice({ children, error }) {
  return (
    <div
      className={`ad-notice ${error ? 'ad-notice-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
export function Resource({ state, children }) {
  return state.loading ? (
    <p className="ad-loading" role="status">
      Henter oppdatert informasjon …
    </p>
  ) : state.error ? (
    <Notice error>
      {state.error}{' '}
      <button className="ad-text-button" onClick={state.reload}>
        Prøv igjen
      </button>
    </Notice>
  ) : (
    children(state.data)
  )
}
export function Field({ label, children, ...props }) {
  const id = useId()
  return (
    <div className="ad-field">
      <label htmlFor={id}>{label}</label>
      {children ? children(id) : <input id={id} {...props} />}
    </div>
  )
}
export function Select({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o[0]} value={o[0]}>
              {o[1]}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}
export function Check({ label, ...props }) {
  return (
    <label className="ad-check">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}
export function Table({ columns, rows, empty = 'Ingen registreringer ennå.' }) {
  return !rows?.length ? (
    <p className="ad-muted">{empty}</p>
  ) : (
    <div className="ad-table-scroll">
      <table className="ad-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || r.sha || i}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function Stat({ label, value, note }) {
  return (
    <article className="ad-stat">
      <small>{label}</small>
      <strong>{value ?? '—'}</strong>
      {note && <p>{note}</p>}
    </article>
  )
}
export function useAction(onSuccess) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const { markBusy } = useAdmin(),
    id = useId()
  useEffect(() => {
    markBusy(id, busy)
    return () => markBusy(id, false)
  }, [id, busy, markBusy])
  return {
    busy,
    error,
    message,
    clear() {
      setError('')
      setMessage('')
    },
    async run(path, body, success = 'Endringen er lagret.') {
      if (busy) return
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const result = await api('/api/admin/' + path, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setMessage(result.note || success)
        await onSuccess?.(result)
        return result
      } catch (e) {
        setError(e.message)
      } finally {
        setBusy(false)
      }
    },
  }
}
export function ActionState({ action }) {
  return (
    <>
      {action.error && <Notice error>{action.error}</Notice>}
      {action.message && <Notice>{action.message}</Notice>}
    </>
  )
}
export function saveFile(name, data, type = 'application/json') {
  const url = URL.createObjectURL(
      new Blob(
        [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
        { type },
      ),
    ),
    a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function JsonDiff({ before, after }) {
  const left =
      typeof before === 'string' ? before : JSON.stringify(before, null, 2),
    right = typeof after === 'string' ? after : JSON.stringify(after, null, 2)
  return (
    <div className="ad-diff">
      <div>
        <strong>Før</strong>
        <pre>{left || 'Ingen tidligere verdi'}</pre>
      </div>
      <div>
        <strong>Etter</strong>
        <pre>{right || 'Slettet'}</pre>
      </div>
    </div>
  )
}
export function SensitiveFields({ value, onChange, word = 'GJENOPPRETT' }) {
  return (
    <div className="ad-sensitive">
      <Field
        label={`Skriv ${word} for å bekrefte`}
        value={value.confirm || ''}
        onChange={(e) => onChange({ ...value, confirm: e.target.value })}
        autoComplete="off"
        required
      />
      <Field
        label="Nåværende passord"
        type="password"
        autoComplete="current-password"
        value={value.password || ''}
        onChange={(e) => onChange({ ...value, password: e.target.value })}
        required
      />
    </div>
  )
}
const format = (v) =>
  typeof v === 'boolean'
    ? v
      ? 'Ja'
      : 'Nei'
    : Array.isArray(v)
      ? v.join(', ')
      : (v ?? '—')
function osloInput(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(value))
      .replace(' ', 'T')
  } catch {
    return ''
  }
}
function osloISO(value) {
  if (!value) return ''
  const naive = Date.parse(value + 'Z')
  let guess = naive
  for (let i = 0; i < 3; i++) {
    const represented = Date.parse(osloInput(new Date(guess)) + 'Z')
    guess += naive - represented
  }
  return Number.isFinite(guess) && osloInput(guess) === value
    ? new Date(guess).toISOString()
    : value
}
export function RecordPanel({
  collection,
  title,
  fields,
  initial,
  canWrite = true,
  filter = () => true,
}) {
  const state = useResource('/api/admin/records/' + collection),
    [editing, setEditing] = useState(null),
    [data, setData] = useState(null),
    { user } = useAdmin()
  const action = useAction(() => {
    setData(null)
    setEditing(null)
    state.reload()
  })
  useUnsaved(Boolean(data))
  const writable = canWrite && user.role !== 'viewer'
  function edit(row) {
    if (data && !window.confirm('Forkaste ulagrede endringer?')) return
    setEditing(row || null)
    setData(structuredClone(row?.data || initial))
    action.clear()
  }
  return (
    <Panel
      title={title}
      extra={
        writable && (
          <button className="ad-secondary" onClick={() => edit(null)}>
            Legg til
          </button>
        )
      }
    >
      <ActionState action={action} />
      {data && (
        <form
          className="ad-form"
          onSubmit={(e) => {
            e.preventDefault()
            action.run('records/' + collection, {
              id: editing?.id,
              revision: editing?.revision || 0,
              data,
            })
          }}
        >
          {fields.map((f) =>
            f.options ? (
              <Select
                key={f.key}
                label={f.label}
                value={data[f.key] || ''}
                onChange={(v) => setData({ ...data, [f.key]: v })}
                options={f.options}
              />
            ) : f.type === 'checkbox' ? (
              <Check
                key={f.key}
                label={f.label}
                checked={Boolean(data[f.key])}
                onChange={(e) =>
                  setData({ ...data, [f.key]: e.target.checked })
                }
              />
            ) : f.type === 'choices' ? (
              <fieldset key={f.key}>
                <legend>{f.label}</legend>
                {f.choices.map(([v, label]) => (
                  <Check
                    key={v}
                    label={label}
                    checked={(data[f.key] || []).includes(v)}
                    onChange={(e) =>
                      setData({
                        ...data,
                        [f.key]: e.target.checked
                          ? [...(data[f.key] || []), v]
                          : (data[f.key] || []).filter((x) => x !== v),
                      })
                    }
                  />
                ))}
              </fieldset>
            ) : (
              <Field key={f.key} label={f.label}>
                {(id) =>
                  f.type === 'textarea' ? (
                    <textarea
                      id={id}
                      value={data[f.key] || ''}
                      onChange={(e) =>
                        setData({ ...data, [f.key]: e.target.value })
                      }
                      rows={4}
                      required={f.required !== false}
                    />
                  ) : (
                    <input
                      id={id}
                      type={f.type || 'text'}
                      min={f.min}
                      max={f.max}
                      value={
                        f.type === 'datetime-local'
                          ? osloInput(data[f.key])
                          : (data[f.key] ?? '')
                      }
                      required={f.required !== false}
                      onChange={(e) =>
                        setData({
                          ...data,
                          [f.key]:
                            f.type === 'number'
                              ? Number(e.target.value)
                              : f.type === 'datetime-local'
                                ? osloISO(e.target.value)
                                : e.target.value,
                        })
                      }
                    />
                  )
                }
              </Field>
            ),
          )}
          <div className="ad-actions">
            <button className="ad-primary" disabled={action.busy}>
              Lagre
            </button>
            <button
              type="button"
              className="ad-secondary"
              disabled={action.busy}
              onClick={() => setData(null)}
            >
              Avbryt
            </button>
          </div>
        </form>
      )}
      <Resource state={state}>
        {(rows) => (
          <div className="ad-records">
            {rows.filter(filter).map((row) => (
              <article key={row.id}>
                <div className="ad-record-heading">
                  <h3>
                    {row.data.title ||
                      row.data.name ||
                      row.data.email ||
                      row.data.source ||
                      row.data.integration ||
                      row.data.article ||
                      'Innstilling'}
                  </h3>
                  {writable && (
                    <div className="ad-actions">
                      <button
                        className="ad-text-button"
                        onClick={() => edit(row)}
                        disabled={action.busy}
                      >
                        Rediger
                      </button>
                      <button
                        className="ad-text-button"
                        disabled={action.busy}
                        onClick={() => {
                          if (window.confirm('Slette denne registreringen?'))
                            action.run(
                              'records/' + collection,
                              {
                                action: 'delete',
                                id: row.id,
                                revision: row.revision,
                              },
                              'Registreringen er slettet.',
                            )
                        }}
                      >
                        Slett
                      </button>
                    </div>
                  )}
                </div>
                <dl className="ad-details">
                  {fields
                    .filter((f) => !['title', 'name'].includes(f.key))
                    .map((f) => (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd>
                          {f.options
                            ? f.options.find(
                                (o) => o[0] === row.data[f.key],
                              )?.[1] || format(row.data[f.key])
                            : ['datetime-local', 'date'].includes(f.type) &&
                                row.data[f.key]
                              ? date(row.data[f.key])
                              : format(row.data[f.key])}
                        </dd>
                      </div>
                    ))}
                </dl>
                <small className="ad-muted">
                  Sist endret {date(row.updated_at)}
                </small>
              </article>
            ))}
            {!rows.filter(filter).length && (
              <p className="ad-muted">Ingen registreringer ennå.</p>
            )}
          </div>
        )}
      </Resource>
    </Panel>
  )
}
export const types = [
  ['operations', 'Drift'],
  ['data', 'Datakvalitet'],
  ['editorial', 'Analyser'],
  ['security', 'Sikkerhet'],
  ['quota', 'Forbruk'],
]
export const statuses = [
  ['open', 'Åpen'],
  ['in-progress', 'Under arbeid'],
  ['resolved', 'Løst'],
]
