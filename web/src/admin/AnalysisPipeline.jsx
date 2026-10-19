import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const displayDate = value => new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(`${value}T12:00:00Z`))
const blank = () => ({ topic: '', instructions: '', scheduledDate: today() })

export default function AnalysisPipeline({ onDirty, onSaving }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [choosing, setChoosing] = useState(null)
  const [sven, setSven] = useState(null)
  const [revision, setRevision] = useState(0)
  const formRef = useRef(null)
  const dirty = Boolean((form && JSON.stringify(form) !== JSON.stringify(original)) || sven?.suggestion)
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => { onSaving(busy) }, [busy, onSaving])
  useEffect(() => () => { onDirty(false); onSaving(false) }, [onDirty, onSaving])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api('/api/admin/pipeline', { signal: controller.signal }).then(setData).catch(e => {
      if (e.name !== 'AbortError') setError(e.message)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  function scrollToEditor() {
    setTimeout(() => { formRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); formRef.current?.querySelector('input, button')?.focus() }, 0)
  }
  function edit(entry, manual = false) {
    if (busy || (dirty && !window.confirm('Forkaste ulagrede endringer i temaet?'))) return
    setSven(null); setForm(null); setOriginal(null); setDeleting(null); setError(''); setMessage('')
    if (entry?.source === 'sven' && !manual) { setChoosing(entry); scrollToEditor(); return }
    setChoosing(null)
    const value = entry ? { id: entry.id, topic: entry.topic, instructions: entry.instructions, scheduledDate: entry.scheduledDate } : blank()
    setForm(value); setOriginal(value); setDeleting(null); setError(''); setMessage('')
    scrollToEditor()
  }
  async function requestSuggestion(entry = null, previous = null) {
    if (busy || (!previous && dirty && !window.confirm('Forkaste ulagrede endringer og hente et Sven-forslag?'))) return
    setBusy(true); setError(''); setMessage(''); setForm(null); setOriginal(null); setChoosing(null); setDeleting(null)
    setSven(previous || { id: entry?.id, scheduledDate: entry?.scheduledDate, seenKeys: [] })
    scrollToEditor()
    try {
      const seenKeys = [...(previous?.seenKeys || []), ...(previous?.suggestion ? [previous.suggestion.topicKey] : [])]
      const result = await api('/api/admin/pipeline/suggest', { method: 'POST', body: JSON.stringify({ sha: data.sha, id: entry?.id, excludeKeys: seenKeys }) })
      setSven({ id: entry?.id, suggestion: result.suggestion, scheduledDate: previous?.scheduledDate || result.scheduledDate, seenKeys })
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  function editSuggestionManually() {
    const value = { ...(sven.id ? { id: sven.id } : {}), topic: sven.suggestion.topic, instructions: sven.suggestion.instructions, scheduledDate: sven.scheduledDate }
    const existing = data.items.find(entry => entry.id === sven.id)
    setOriginal(existing ? { id: existing.id, topic: existing.topic, instructions: existing.instructions, scheduledDate: existing.scheduledDate } : blank())
    setSven(null); setForm(value); scrollToEditor()
  }
  function cancel() {
    if (dirty && !window.confirm('Forkaste ulagrede endringer i temaet?')) return
    setForm(null); setOriginal(null); setSven(null); setChoosing(null)
  }
  function reload() {
    if (dirty && !window.confirm('Forkaste endringene og hente siste versjon av pipeline?')) return
    setForm(null); setOriginal(null); setSven(null); setChoosing(null); setDeleting(null); setRevision(r => r + 1)
  }
  async function change(action) {
    if (busy || !data?.writable) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api('/api/admin/pipeline', { method: 'PUT', body: JSON.stringify({ ...action, sha: data.sha }) })
      setData(result); setDeleting(null)
      if (['add', 'edit', 'generate'].includes(action.action)) { setForm(null); setOriginal(null); setSven(null); setChoosing(null) }
      setMessage(action.action === 'delete' ? 'Temaet er slettet fra den kommende køen.' : action.action === 'move' ? 'Rekkefølgen er lagret.' : 'Tema og instrukser er lagret i analysepipelinen.')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  if (loading) return <p className="ad-loading" role="status">Henter analysepipeline …</p>
  if (!data) return <div className="ad-notice ad-notice-error" role="alert">{error}<button className="ad-text-button" onClick={reload}>Prøv igjen</button></div>
  const locked = busy || !data.writable
  const ready = data.items.filter(i => i.scheduledDate <= today()).length
  return <>
    <div className="ad-pipeline-intro"><div><span className="ad-tag">{data.items.length} kommende {data.items.length === 1 ? 'tema' : 'temaer'}</span><p>Din retning. Svens neste analyse.</p><span className="ad-muted">Legg inn hva Sven skal undersøke, og når. Uten bestillinger planlegger Sven bare neste tema.</span></div><div className="ad-topic-buttons"><button className="ad-primary" onClick={() => requestSuggestion()} disabled={locked}>La Sven foreslå et tema <span aria-hidden="true">✦</span></button><button className="ad-secondary" onClick={() => edit()} disabled={locked}>Legg til tema selv <span aria-hidden="true">+</span></button></div></div>
    {!data.writable && <div className="ad-notice" role="status">Lagring blir tilgjengelig når administratorens skrivetilgang er konfigurert.</div>}
    {error && <div className="ad-notice ad-notice-error" role="alert">{error} <button type="button" className="ad-text-button" onClick={reload}>Hent oppdatert kø</button></div>}
    {message && <div className="ad-notice" role="status">{message}</div>}
    {choosing && <section ref={formRef} className="ad-panel ad-topic-choice"><header className="ad-panel-header"><div><p className="ad-eyebrow">REDIGER SVENS FORSLAG</p><h2>Hvordan vil du endre temaet?</h2></div><button className="ad-text-button" onClick={cancel}>Avbryt</button></header><p className="ad-panel-copy">{choosing.topic}</p><div className="ad-topic-choice-options"><button className="ad-topic-option" onClick={() => requestSuggestion(choosing)}><span aria-hidden="true">✦</span><strong>La Sven finne et nytt tema</strong><small>Få et annet forslag med et relevant tallgrunnlag. Dato og plass i køen beholdes.</small></button><button className="ad-topic-option" onClick={() => edit(choosing, true)}><span aria-hidden="true">✎</span><strong>Rediger selv</strong><small>Endre spørsmålet, instruksene eller datoen manuelt.</small></button></div></section>}
    {sven && <section ref={formRef} className="ad-panel ad-pipeline-form ad-sven-proposal"><header className="ad-panel-header"><div><p className="ad-eyebrow">ET FORSLAG FRA SVEN</p><h2>{sven.id ? 'Et nytt tema på samme plass.' : 'Neste idé, på din bestilling.'}</h2></div><span className="ad-tag">Til forhåndsvisning</span></header>
      {busy && <p className="ad-loading" role="status">Sven finner et nytt tema i tallgrunnlaget …</p>}
      {sven.suggestion ? <form onSubmit={e => { e.preventDefault(); change({ action: 'generate', ...(sven.id ? { id: sven.id } : {}), topicKey: sven.suggestion.topicKey, scheduledDate: sven.scheduledDate }) }}><div className="ad-topic-preview"><span className="ad-tag ad-pipeline-sven">Foreslått av Sven</span><h3>{sven.suggestion.topic}</h3><p>{sven.suggestion.instructions}</p><small>Forslaget bygger på tilgjengelige data og tar hensyn til tidligere analyser og temaene som allerede ligger i køen.</small></div><div className="ad-topic-date"><label htmlFor="sven-pipeline-date">Ønsket skrivedato</label><input id="sven-pipeline-date" type="date" value={sven.scheduledDate} onChange={e => setSven({ ...sven, scheduledDate: e.target.value })} required disabled={locked} /></div><div className="ad-topic-alternatives"><button type="button" className="ad-text-button" onClick={() => requestSuggestion(data.items.find(entry => entry.id === sven.id), sven)} disabled={locked}>Finn et annet tema</button><button type="button" className="ad-text-button" onClick={editSuggestionManually} disabled={locked}>Rediger forslaget selv</button></div><div className="ad-pipeline-form-footer"><p>{sven.id ? 'Det gamle temaet erstattes først når du godtar forslaget.' : 'Du legger til ett forslag. Sven fyller fortsatt ikke køen automatisk.'}</p><div><button type="button" className="ad-secondary" onClick={cancel} disabled={busy}>Avbryt</button><button className="ad-primary" disabled={locked}>{busy ? 'Lagrer …' : sven.id ? 'Erstatt med Svens forslag' : 'Legg Svens forslag i køen'}</button></div></div></form> : !busy && <div className="ad-panel-copy"><button className="ad-secondary" onClick={cancel}>Lukk</button></div>}
    </section>}
    {form && <section ref={formRef} className="ad-panel ad-pipeline-form"><header className="ad-panel-header"><h2>{form.id ? 'Rediger tema' : 'Et nytt tema for Sven'}</h2>{dirty && <span className="ad-tag ad-unsaved">Ulagrede endringer</span>}</header>
      <form onSubmit={e => { e.preventDefault(); change({ ...form, action: form.id ? 'edit' : 'add' }) }}>
        <div className="ad-pipeline-fields"><div><label htmlFor="pipeline-topic">Tema eller spørsmål</label><input id="pipeline-topic" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} minLength={5} maxLength={180} required disabled={locked} placeholder="F.eks. har sykehusene fått mer eller mindre å rutte med?" /></div><div><label htmlFor="pipeline-date">Ønsket skrivedato</label><input id="pipeline-date" type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} required disabled={locked} /></div></div>
        <label htmlFor="pipeline-instructions">Instrukser til Sven <span className="ad-muted">· valgfritt</span></label><textarea id="pipeline-instructions" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} maxLength={12000} disabled={locked} placeholder="Hva skal sammenlignes? Hvilke spørsmål, kilder eller avgrensninger er viktige?" rows={5} />
        <div className="ad-pipeline-form-footer"><p>Temaet starter tidligst på valgt dato. Sven må finne relevant dokumentasjon før han skriver.</p><div><button type="button" className="ad-secondary" onClick={cancel} disabled={busy}>Avbryt</button><button className="ad-primary" disabled={locked || !dirty}>{busy ? 'Lagrer …' : form.id ? 'Lagre tema' : 'Legg i pipeline'}</button></div></div>
      </form>
    </section>}
    <section className="ad-panel"><header className="ad-panel-header"><div><p className="ad-eyebrow">KOMMENDE ANALYSER</p><h2>Dette ligger i køen.</h2></div><span className="ad-tag">{ready} klare</span></header>
      {data.items.length ? <ol className="ad-pipeline-list">{data.items.map((entry, index) => <li key={entry.id}>
        <div className="ad-pipeline-position" aria-label={`Plass ${index + 1}`}>{String(index + 1).padStart(2, '0')}</div>
        <div className="ad-pipeline-item"><div className="ad-pipeline-meta"><span className={`ad-tag ${entry.source === 'sven' ? 'ad-pipeline-sven' : ''}`}>{entry.source === 'sven' ? 'Foreslått av Sven' : 'Lagt til av administrator'}</span><time dateTime={entry.scheduledDate}>{displayDate(entry.scheduledDate)}</time>{entry.scheduledDate <= today() && <span className="ad-good">Klar for neste kjøring</span>}</div><h3>{entry.topic}</h3>{entry.instructions && <p>{entry.instructions}</p>}{entry.requestedBy === 'admin' && <small className="ad-muted ad-topic-origin">Foreslått på din bestilling</small>}{entry.editedBy === 'admin' && <small className="ad-muted">Justert av administrator</small>}
          {deleting === entry.id ? <div className="ad-pipeline-delete"><span>Slette dette temaet fra køen?</span><button className="ad-text-button" onClick={() => change({ action: 'delete', id: entry.id })} disabled={locked}>Ja, slett temaet</button><button className="ad-text-button" onClick={() => setDeleting(null)} disabled={busy}>Avbryt</button></div> : <div className="ad-pipeline-actions"><button onClick={() => edit(entry)} disabled={locked}>Rediger<span className="ad-visually-hidden"> {entry.topic}</span></button><button onClick={() => setDeleting(entry.id)} disabled={locked || dirty}>Slett<span className="ad-visually-hidden"> {entry.topic}</span></button></div>}
        </div>
        <div className="ad-pipeline-move"><button aria-label={`Flytt opp: ${entry.topic}`} disabled={locked || dirty || index === 0} onClick={() => change({ action: 'move', id: entry.id, index: index - 1 })}>↑</button><button aria-label={`Flytt ned: ${entry.topic}`} disabled={locked || dirty || index === data.items.length - 1} onClick={() => change({ action: 'move', id: entry.id, index: index + 1 })}>↓</button></div>
      </li>)}</ol> : <div className="ad-empty"><h3>Plass til Svens neste idé.</h3><p>Når køen er tom, velger Sven ett nytt tema ved neste planlegging. Han fyller ikke opp en lang liste. Du kan også legge inn en bestilling selv.</p></div>}
    </section>
    <div className="ad-columns"><section className="ad-panel"><header className="ad-panel-header"><h2>Dato og rekkefølge</h2></header><p className="ad-panel-copy">Køen sjekkes daglig kl. 09.00 i norsk tid. Det øverste temaet som har nådd datoen sin, tas først. Flytt temaer med pilene. Bestillinger etter dagens kontroll venter til neste kjøring. En åpen gjennomgang kan utsette neste tema; datoen er ikke en publiseringsdato.</p></section><section className="ad-panel"><header className="ad-panel-header"><h2>Når Sven velger selv</h2></header><p className="ad-panel-copy">Med en tom kø foreslår Sven bare neste analyse til en kommende mandag. Både egne bestillinger og Svens forslag kan redigeres, flyttes og slettes. En ferdig tekst går fortsatt til menneskelig gjennomgang.</p></section></div>
    {data.history.length > 0 && <details className="ad-panel ad-pipeline-history"><summary>Tidligere temaer <span className="ad-muted">· {data.history.length}</span></summary><ul>{data.history.slice(-10).reverse().map((event, i) => <li key={`${event.entry.id}-${i}`}><span>{event.entry.topic}</span>{event.status === 'delivered' ? <a href={event.reviewUrl} target="_blank" rel="noreferrer">Til gjennomgang ↗</a> : <small>{event.status === 'replaced' ? 'Erstattet med et nytt forslag' : 'Slettet fra køen'}</small>}</li>)}</ul></details>}
    <p className="ad-footnote">Temaer og generelle instrukser versjoneres i prosjektets offentlige arkiv. Ikke legg inn sensitivt materiale.</p>
  </>
}
