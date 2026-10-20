import { useState } from 'react'
import { api, useResource } from './api.js'
import { Article } from '../analyser/AnalyseApp.jsx'
import { factText } from '../analyser/model.js'
import { currentAnalyses } from '../analyser/topics.js'
import '../fellestall/fellestall.css'
import '../analyser/analyser.css'
import {
  Panel,
  Notice,
  Resource,
  Field,
  Table,
  Check,
  ActionState,
  SensitiveFields,
  JsonDiff,
  useAction,
  useAdmin,
  useUnsaved,
  date,
} from './shared.jsx'

function Preview({ article }) {
  return (
    <div className="ft an ad-article-preview">
      <Article article={article} preview />
    </div>
  )
}
const labels = {
  title: 'Tittel',
  description: 'Søkebeskrivelse',
  lead: 'Ingress',
  conclusion: 'Konklusjon',
  linkedin: 'LinkedIn-tekst',
}
function CopyEditor({ copy, onChange, presentation, onPresentation }) {
  const [tagText, setTagText] = useState((presentation.tags || []).join(', '))
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState('')
  return (
    <div className="ad-form">
      {Object.entries(labels).map(([key, label]) => (
        <Field key={key} label={label}>
          {(id) => (
            <textarea
              id={id}
              value={copy[key]}
              onChange={(e) => onChange({ ...copy, [key]: e.target.value })}
              rows={key === 'linkedin' ? 5 : 3}
              required
              maxLength={
                key === 'title'
                  ? 120
                  : key === 'description'
                    ? 220
                    : key === 'linkedin'
                      ? 1400
                      : undefined
              }
            />
          )}
        </Field>
      ))}
      <Notice>
        Alle tall i teksten bruker kontrollerte faktumreferanser, for eksempel{' '}
        {'{{fact:change}}'}. Behold eksisterende referanser. Tallgrunnlaget
        endres gjennom en ny faglig revisjon.
      </Notice>
      {copy.sections.map((s, i) => (
        <fieldset key={i}>
          <legend>Seksjon {i + 1}</legend>
          <Field
            label="Overskrift"
            value={s.heading}
            onChange={(e) =>
              onChange({
                ...copy,
                sections: copy.sections.map((v, j) =>
                  j === i ? { ...v, heading: e.target.value } : v,
                ),
              })
            }
          />
          <Field label="Avsnitt (tom linje mellom avsnitt)">
            {(id) => (
              <textarea
                id={id}
                rows={Math.min(16, Math.max(5, s.paragraphs.length * 4))}
                value={s.paragraphs.join('\n\n')}
                onChange={(e) =>
                  onChange({
                    ...copy,
                    sections: copy.sections.map((v, j) =>
                      j === i
                        ? { ...v, paragraphs: e.target.value.split(/\n\s*\n/) }
                        : v,
                    ),
                  })
                }
              />
            )}
          </Field>
        </fieldset>
      ))}
      <fieldset>
        <legend>Delingsbilde og emneord</legend>
        <Field
          label="Bilde i Fellestalls bildebibliotek (valgfritt)"
          value={presentation.image || ''}
          onChange={(e) =>
            onPresentation({ ...presentation, image: e.target.value })
          }
          placeholder="/bilder/…"
        />
        <Field
          label="Last opp delingsbilde"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files[0]
            if (!file) return
            setUploading(true)
            setError('')
            try {
              if (file.size > 15000000)
                throw Error('Velg et bilde mindre enn 15 MB.')
              const bitmap = await createImageBitmap(file),
                canvas = document.createElement('canvas'),
                scale = Math.min(1, 1200 / bitmap.width)
              canvas.width = bitmap.width * scale
              canvas.height = bitmap.height * scale
              canvas
                .getContext('2d')
                .drawImage(bitmap, 0, 0, canvas.width, canvas.height)
              bitmap.close()
              let quality = 0.85,
                encoded
              do {
                encoded = canvas.toDataURL('image/jpeg', quality).split(',')[1]
                quality -= 0.1
              } while (encoded.length > 90000 && quality > 0.15)
              if (encoded.length > 100000)
                throw Error('Bildet er for stort. Velg et enklere bilde.')
              const result = await api('/api/admin/editorial/image', {
                method: 'POST',
                body: JSON.stringify({ content: encoded }),
              })
              onPresentation({ ...presentation, image: result.path })
            } catch (e) {
              setError(e.message)
            } finally {
              setUploading(false)
              e.target.value = ''
            }
          }}
        />
        {error && <Notice error>{error}</Notice>}
        {uploading && <p role="status">Lagrer bilde …</p>}
        <Field
          label="Beskrivelse av bildet"
          value={presentation.imageAlt || ''}
          onChange={(e) =>
            onPresentation({ ...presentation, imageAlt: e.target.value })
          }
        />
        <Field
          label="Emneord (kommaseparert)"
          value={tagText}
          onChange={(e) => {
            setTagText(e.target.value)
            onPresentation({
              ...presentation,
              tags: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }}
        />
        <p className="ad-muted">
          Bildet og teksten er del av versjonen som må godkjennes. Bilder
          publiseres i prosjektets åpne bildebibliotek.
        </p>
      </fieldset>
    </div>
  )
}
function SocialPreview({ article }) {
  const image = article.presentation?.image || '/delingsbilde.png',
    t = (v) => factText(v, article.report)
  return (
    <div className="ad-social-card">
      <img
        src={image}
        alt={article.presentation?.imageAlt || 'Delingsbilde for Fellestall'}
        loading="lazy"
      />
      <div>
        <small>FELLESTALL.NO</small>
        <h3>{t(article.copy.title)}</h3>
        <p>{t(article.copy.description)}</p>
        <p className="ad-social-copy">{t(article.copy.linkedin)}</p>
      </div>
    </div>
  )
}
function LinkChecks({ article }) {
  const action = useAction(),
    [results, setResults] = useState(null)
  return (
    <Panel title="Kontroller lenker og bilde">
      <ActionState action={action} />
      <button
        className="ad-secondary"
        disabled={action.busy}
        onClick={() =>
          action
            .run(
              'editorial/links',
              { slug: article.slug, number: article.number },
              'Lenkekontrollen er ferdig.',
            )
            .then((r) => {
              if (r) setResults(r)
            })
        }
      >
        Kjør kontroll
      </button>
      {results && (
        <Table
          rows={results.items}
          columns={[
            {
              key: 'url',
              label: 'Adresse',
              render: (r) => (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.url} ↗
                </a>
              ),
            },
            { key: 'status', label: 'Svar' },
            { key: 'note', label: 'Merknad' },
          ]}
        />
      )}
    </Panel>
  )
}
export function Reviews() {
  const state = useResource('/api/admin/editorial/reviews'),
    [number, setNumber] = useState(null)
  return number ? (
    <Review key={number} number={number} onBack={() => setNumber(null)} />
  ) : (
    <Panel
      title="Analyser til gjennomgang"
      extra={
        <button className="ad-secondary" onClick={state.reload}>
          Oppdater
        </button>
      }
    >
      <Resource state={state}>
        {(rows) => (
          <Table
            rows={rows}
            empty="Ingen åpne analysegjennomganger."
            columns={[
              { key: 'title', label: 'Analyse' },
              {
                key: 'updatedAt',
                label: 'Oppdatert',
                render: (r) => date(r.updatedAt),
              },
              {
                key: 'status',
                label: 'Status',
                render: (r) =>
                  r.status === 'draft' ? 'Utkast' : 'Venter på gjennomgang',
              },
              {
                key: 'open',
                label: 'Handling',
                render: (r) => (
                  <button
                    className="ad-primary"
                    onClick={() => setNumber(r.number)}
                  >
                    Åpne gjennomgang
                  </button>
                ),
              },
            ]}
          />
        )}
      </Resource>
    </Panel>
  )
}
function Review({ number, onBack }) {
  const state = useResource('/api/admin/editorial/review?number=' + number)
  return (
    <>
      <button className="ad-text-button" onClick={onBack}>
        ← Til gjennomgangsinnboksen
      </button>
      <Resource state={state}>
        {(d) => <ReviewVersion key={d.head} detail={d} reload={state.reload} />}
      </Resource>
    </>
  )
}
function ReviewVersion({ detail: d, reload }) {
  const { user } = useAdmin(),
    [copy, setCopy] = useState(d.article.copy),
    [presentation, setPresentation] = useState(
      d.article.presentation || { image: '', imageAlt: '', tags: [] },
    ),
    [tab, setTab] = useState('preview'),
    [comment, setComment] = useState(''),
    [processed, setProcessed] = useState([]),
    [confirmation, setConfirmation] = useState({}),
    [diff, setDiff] = useState(null),
    action = useAction(reload)
  const dirty =
    JSON.stringify(copy) !== JSON.stringify(d.article.copy) ||
    JSON.stringify(presentation) !==
      JSON.stringify(
        d.article.presentation || { image: '', imageAlt: '', tags: [] },
      ) ||
    processed.length > 0
  useUnsaved(dirty || Boolean(comment) || Boolean(confirmation.password))
  const checklist = useResource('/api/admin/records/checklists'),
    [checks, setChecks] = useState(null),
    checkAction = useAction(checklist.reload)
  const row = checklist.data?.find(
      (r) => r.data.article === String(d.number) && r.data.head === d.head,
    ),
    checked = checks ||
      row?.data || {
        article: String(d.number),
        head: d.head,
        numbers: false,
        sources: false,
        scope: false,
        title: false,
        conclusion: false,
        images: false,
        note: '',
      }
  const article = { ...d.article, copy, presentation }
  return (
    <>
      <div className="ad-review-heading">
        <div>
          <span className="ad-tag">Versjon {d.head.slice(0, 12)}</span>
          <h2>{factText(d.article.copy.title, d.article.report)}</h2>
          <p>
            Godkjenning gjelder bare innholdet du ser i denne lagrede versjonen.
          </p>
        </div>
        <a
          className="ad-secondary"
          href={d.url}
          target="_blank"
          rel="noreferrer"
        >
          Se gjennomgangen i GitHub ↗
        </a>
      </div>
      <ActionState action={action} />
      <div className="ad-tabs" role="group" aria-label="Gjennomgangsvisning">
        {[
          ['preview', 'Forhåndsvisning'],
          ['edit', 'Rediger tekst'],
          ['social', 'Sosial deling'],
          ['diff', 'Versjoner'],
        ].map(([v, l]) => (
          <button key={v} aria-pressed={tab === v} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'preview' && <Preview article={article} />}{' '}
      {tab === 'social' && (
        <Panel title="Forhåndsvisning av LinkedIn og deling">
          <SocialPreview article={article} />
        </Panel>
      )}
      {tab === 'edit' && (
        <Panel title="Revider utkastet">
          {user.role === 'viewer' ? (
            <Notice>Du har lesetilgang.</Notice>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                action.run(
                  'editorial/save',
                  {
                    number: d.number,
                    head: d.head,
                    fileSha: d.fileSha,
                    copy,
                    presentation,
                    processedFeedbackIds: processed,
                  },
                  'Ny tekstversjon er lagret. Godkjenning må gis på nytt.',
                )
              }}
            >
              <CopyEditor
                copy={copy}
                onChange={setCopy}
                presentation={presentation}
                onPresentation={setPresentation}
              />
              <button className="ad-primary" disabled={action.busy || !dirty}>
                Lagre ny utkastversjon
              </button>
            </form>
          )}
        </Panel>
      )}
      {tab === 'diff' && (
        <Panel title="Tidligere versjoner">
          <Table
            rows={d.commits}
            columns={[
              { key: 'title', label: 'Endring' },
              { key: 'at', label: 'Dato', render: (r) => date(r.at) },
              {
                key: 'diff',
                label: 'Handling',
                render: (r) => (
                  <button
                    className="ad-text-button"
                    onClick={() =>
                      api(
                        `/api/admin/editorial/previous?number=${d.number}&sha=${r.sha}`,
                      )
                        .then(setDiff)
                        .catch((e) => setDiff({ error: e.message }))
                    }
                  >
                    Sammenlign tekst
                  </button>
                ),
              },
            ]}
          />
          {diff &&
            (diff.error ? (
              <Notice error>{diff.error}</Notice>
            ) : (
              <JsonDiff before={diff.previous.copy} after={diff.current.copy} />
            ))}
        </Panel>
      )}
      <Panel title="Kommentarer og revisjonsønsker">
        <div className="ad-records">
          {d.feedback.map((f) => (
            <article key={f.id}>
              <strong>{f.actor}</strong>
              <small className="ad-muted"> · {date(f.at)}</small>
              <p className="ad-preserve">{f.body}</p>
              {f.processed ? (
                <span className="ad-tag">Behandlet</span>
              ) : (
                user.role !== 'viewer' && (
                  <Check
                    label="Endringsønsket er behandlet i denne redigeringen"
                    checked={processed.includes(f.id)}
                    onChange={(e) =>
                      setProcessed(
                        e.target.checked
                          ? [...processed, f.id]
                          : processed.filter((id) => id !== f.id),
                      )
                    }
                  />
                )
              )}
            </article>
          ))}
          {!d.feedback.length && <p>Ingen kommentarer registrert.</p>}
        </div>
        {user.role !== 'viewer' && (
          <form
            className="ad-form"
            onSubmit={(e) => {
              e.preventDefault()
              action
                .run(
                  'editorial/comment',
                  { number: d.number, head: d.head, body: comment },
                  'Revisjonsønsket er lagt i gjennomgangen.',
                )
                .then((r) => {
                  if (r) setComment('')
                })
            }}
          >
            <Field label="Hva skal Sven revidere?">
              {(id) => (
                <textarea
                  id={id}
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  minLength={5}
                  required
                />
              )}
            </Field>
            <button className="ad-secondary" disabled={action.busy || dirty}>
              Bestill revisjon av denne versjonen
            </button>
            <small className="ad-muted">
              Kommentarer i GitHub er offentlige. Lagre tekstendringer først.
            </small>
          </form>
        )}
      </Panel>
      <LinkChecks article={{ ...d.article, number: d.number }} />
      {user.role !== 'viewer' && (
        <Panel title="Sjekkliste for denne eksakte versjonen">
          <ActionState action={checkAction} />
          <form
            className="ad-form"
            onSubmit={(e) => {
              e.preventDefault()
              checkAction
                .run(
                  'records/checklists',
                  {
                    id: row?.id || `review-${d.number}-${d.head}`,
                    revision: row?.revision || 0,
                    data: checked,
                  },
                  'Sjekklisten er lagret for denne versjonen.',
                )
                .then((r) => {
                  if (r) setChecks(null)
                })
            }}
          >
            {[
              ['numbers', 'Tall og beregninger er kontrollert'],
              ['sources', 'Kildene støtter påstandene'],
              ['scope', 'Periode, enhet og avgrensning er tydelige'],
              ['title', 'Tittel og ingress er dekkende'],
              ['conclusion', 'Konklusjonen følger av grunnlaget'],
              ['images', 'Grafer, bilder og delingstekst er gjennomgått'],
            ].map(([key, label]) => (
              <Check
                key={key}
                label={label}
                disabled={dirty}
                checked={checked[key]}
                onChange={(e) =>
                  setChecks({ ...checked, [key]: e.target.checked })
                }
              />
            ))}
            <button
              className="ad-secondary"
              disabled={checkAction.busy || dirty || !checks}
            >
              Lagre sjekkliste
            </button>
          </form>
        </Panel>
      )}
      {user.role === 'admin' && (
        <Panel title="Godkjenn publisering">
          <Notice>
            Godkjenningen gjelder lagret versjon {d.head.slice(0, 12)}. Endres
            teksten, kreves en ny gjennomgang. Tester og publiseringskontroller
            kjøres før siden går live.
          </Notice>
          <form
            className="ad-form"
            onSubmit={(e) => {
              e.preventDefault()
              action
                .run(
                  'editorial/approve',
                  {
                    number: d.number,
                    head: d.head,
                    hash: d.hash,
                    ...confirmation,
                  },
                  'Denne eksakte versjonen er godkjent for publisering.',
                )
                .then((r) => {
                  if (r) setConfirmation({})
                })
            }}
          >
            <SensitiveFields
              word="GODKJENN"
              value={confirmation}
              onChange={setConfirmation}
            />
            <button
              className="ad-primary"
              disabled={
                action.busy ||
                dirty ||
                Boolean(checks) ||
                ![
                  'numbers',
                  'sources',
                  'scope',
                  'title',
                  'conclusion',
                  'images',
                ].every((k) => checked[k])
              }
            >
              Godkjenn eksakt versjon
            </button>
          </form>
        </Panel>
      )}
    </>
  )
}
export function Content() {
  const state = useResource('/api/admin/editorial/published'),
    [selection, setSelection] = useState(null)
  return (
    <Resource state={state}>
      {(d) =>
        selection ? (
          <PublishedEditor
            key={selection}
            article={currentAnalyses(d.articles).find(
              (a) => a.slug === selection,
            )}
            registrySha={d.sha}
            onBack={() => setSelection(null)}
            reload={state.reload}
          />
        ) : (
          <Panel title="Publiserte analyser">
            <Table
              rows={currentAnalyses(d.articles)}
              columns={[
                {
                  key: 'title',
                  label: 'Analyse',
                  render: (r) => factText(r.copy.title, r.report),
                },
                { key: 'topic', label: 'Tema' },
                {
                  key: 'publishedAt',
                  label: 'Publisert',
                  render: (r) => date(r.publishedAt),
                },
                {
                  key: 'actions',
                  label: 'Handling',
                  render: (r) => (
                    <div className="ad-actions">
                      <button
                        className="ad-text-button"
                        onClick={() => setSelection(r.slug)}
                      >
                        Metadata / rettelse
                      </button>
                      <a
                        href={'/analyser/' + r.slug + '/'}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Åpne ↗
                      </a>
                    </div>
                  ),
                },
              ]}
            />
          </Panel>
        )
      }
    </Resource>
  )
}
function PublishedEditor({ article: a, registrySha, onBack, reload }) {
  const { user } = useAdmin(),
    [copy, setCopy] = useState(a.copy),
    [presentation, setPresentation] = useState(
      a.presentation || { image: '', imageAlt: '', tags: [] },
    ),
    [withdraw, setWithdraw] = useState(null),
    action = useAction()
  useUnsaved(
    JSON.stringify(copy) !== JSON.stringify(a.copy) ||
      Boolean(withdraw?.password),
  )
  return (
    <>
      <button className="ad-text-button" onClick={onBack}>
        ← Til publiserte analyser
      </button>
      <ActionState action={action} />
      <Panel title="Retting og metadata">
        <p>
          Endringer i publisert tekst og delingsmetadata oppretter en ny
          gjennomgang. Gjeldende analyse erstattes først etter godkjenning.
        </p>
        {user.role !== 'viewer' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              action.run(
                'editorial/revise',
                {
                  slug: a.slug,
                  hash: a.approval.contentHash,
                  copy,
                  presentation,
                },
                'Ny gjennomgang er bestilt.',
              )
            }}
          >
            <CopyEditor
              copy={copy}
              onChange={setCopy}
              presentation={presentation}
              onPresentation={setPresentation}
            />
            <button className="ad-primary" disabled={action.busy}>
              Send rettelse til gjennomgang
            </button>
          </form>
        )}
      </Panel>
      <Panel title="Sosial forhåndsvisning">
        <SocialPreview article={{ ...a, copy, presentation }} />
      </Panel>
      <LinkChecks article={a} />
      {user.role === 'admin' && (
        <Panel title="Trekk tilbake analysen">
          <p>
            Fjerner denne analysen og tidligere erstattede utgaver fra
            publisering. Teksten bevares i tilbaketrekkingsarkivet og
            endringshistorikken.
          </p>
          {!withdraw ? (
            <button
              className="ad-secondary"
              onClick={() =>
                setWithdraw({ reason: '', confirm: '', password: '' })
              }
            >
              Forbered tilbaketrekking
            </button>
          ) : (
            <form
              className="ad-form"
              onSubmit={(e) => {
                e.preventDefault()
                action
                  .run(
                    'editorial/withdraw',
                    {
                      slug: a.slug,
                      hash: a.approval.contentHash,
                      sha: registrySha,
                      ...withdraw,
                    },
                    'Tilbaketrekking er lagret og publiseres gjennom vanlig utrulling.',
                  )
                  .then((r) => {
                    if (r) {
                      setWithdraw(null)
                      reload()
                      onBack()
                    }
                  })
              }}
            >
              <Field
                label="Begrunnelse"
                value={withdraw.reason}
                onChange={(e) =>
                  setWithdraw({ ...withdraw, reason: e.target.value })
                }
                required
                minLength={5}
              />
              <SensitiveFields
                word="TREKK TILBAKE"
                value={withdraw}
                onChange={setWithdraw}
              />
              <div className="ad-actions">
                <button className="ad-primary" disabled={action.busy}>
                  Trekk tilbake
                </button>
                <button
                  className="ad-secondary"
                  type="button"
                  onClick={() => setWithdraw(null)}
                >
                  Avbryt
                </button>
              </div>
            </form>
          )}
        </Panel>
      )}
    </>
  )
}
export function Distribution() {
  const state = useResource('/api/admin/distribution'),
    { user } = useAdmin(),
    [selected, setSelected] = useState(null),
    [confirm, setConfirm] = useState(''),
    [reconcile, setReconcile] = useState(null),
    action = useAction(state.reload)
  return (
    <Panel title="LinkedIn: forhåndsvisning og distribusjon">
      <ActionState action={action} />
      <Resource state={state}>
        {(rows) => (
          <div className="ad-records">
            {rows.map((r) => (
              <article key={r.slug}>
                <div className="ad-record-heading">
                  <h3>{factText(r.title, r.report)}</h3>
                  <span className="ad-tag">
                    {r.receipt?.status === 'sent'
                      ? 'Sendt'
                      : r.receipt?.status === 'pending'
                        ? 'Uavklart forsøk'
                        : 'Ikke sendt'}
                  </span>
                </div>
                <p className="ad-social-copy">{factText(r.text, r.report)}</p>
                <a
                  href={'/analyser/' + r.slug + '/'}
                  target="_blank"
                  rel="noreferrer"
                >
                  fellestall.no/analyser/{r.slug}/ ↗
                </a>
                {r.receipt?.postId && <p>Kvittering: {r.receipt.postId}</p>}
                {user.role === 'admin' && r.receipt?.status !== 'sent' && (
                  <div className="ad-actions">
                    <button
                      className="ad-secondary"
                      onClick={() => {
                        setSelected(r)
                        setConfirm('')
                      }}
                    >
                      {r.receipt?.status === 'pending'
                        ? 'Avstem tidligere forsøk'
                        : 'Forbered sending'}
                    </button>
                  </div>
                )}
              </article>
            ))}
            {selected && (
              <form
                className="ad-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  action
                    .run(
                      selected.receipt?.status === 'pending'
                        ? 'distribution/reconcile'
                        : 'distribution/retry',
                      {
                        slug: selected.slug,
                        hash: selected.hash,
                        confirm,
                        ...reconcile,
                      },
                      'Handlingen er registrert.',
                    )
                    .then((r) => {
                      if (r) {
                        setSelected(null)
                        setReconcile(null)
                        setConfirm('')
                      }
                    })
                }}
              >
                <h3>{factText(selected.title, selected.report)}</h3>
                {selected.receipt?.status === 'pending' ? (
                  <>
                    <Notice>
                      Kontroller organisasjonssiden i LinkedIn før du avstemmer.
                      Et ukjent resultat skal aldri utløse en automatisk ny
                      sending.
                    </Notice>
                    <Check
                      label="Jeg har kontrollert det faktiske LinkedIn-resultatet"
                      required
                      checked={Boolean(reconcile?.checked)}
                      onChange={(e) =>
                        setReconcile({
                          ...reconcile,
                          checked: e.target.checked,
                        })
                      }
                    />
                    <Field
                      label="LinkedIn post-ID hvis sendt (urn:li:share:… eller urn:li:ugcPost:…), ellers tom"
                      value={reconcile?.postId || ''}
                      onChange={(e) =>
                        setReconcile({ ...reconcile, postId: e.target.value })
                      }
                    />
                    <Field
                      label="Begrunnelse / kontrollgrunnlag"
                      value={reconcile?.reason || ''}
                      onChange={(e) =>
                        setReconcile({ ...reconcile, reason: e.target.value })
                      }
                      required
                      minLength={5}
                    />
                    <p>
                      Uten post-ID markerer du etter kontroll at innlegget ikke
                      ble sendt. Ny sending må bestilles separat.
                    </p>
                  </>
                ) : (
                  <Notice>
                    Distribusjonsjobben sender bare godkjent innhold som er
                    tilgjengelig på nettsiden, og blokkerer duplikater. Den
                    behandler neste usendte analyse i den eksisterende køen.
                  </Notice>
                )}
                <Field
                  label={
                    selected.receipt?.status === 'pending'
                      ? 'Skriv AVSTEM'
                      : 'Skriv SEND'
                  }
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                <div className="ad-actions">
                  <button className="ad-primary" disabled={action.busy}>
                    Bekreft
                  </button>
                  <button
                    type="button"
                    className="ad-secondary"
                    onClick={() => setSelected(null)}
                  >
                    Avbryt
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </Resource>
    </Panel>
  )
}
