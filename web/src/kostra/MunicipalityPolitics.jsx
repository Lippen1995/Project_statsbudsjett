import React, { useEffect, useState } from 'react'
import { partiFarge, partiKort } from '../lib/partier'

// Shared lazy chunk keeps the nationwide register out of the initial page bundle.
let politicsPromise
const loadPolitics = () => politicsPromise ||= import('./municipal-politics.json').then((module) => module.default)

const LOGOS = {
  'Arbeiderpartiet': 'ap.svg',
  'Høyre': 'h.svg',
  'Fremskrittspartiet': 'frp.svg',
  'Sosialistisk Venstreparti': 'sv.svg',
  'Rødt': 'r.svg',
  'Miljøpartiet De Grønne': 'mdg.svg',
  'Kristelig Folkeparti': 'krf.svg',
  'Venstre': 'v.png',
}
const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' })

function Party({ name, fullName = false }) {
  const [failed, setFailed] = useState(false)
  const logo = LOGOS[name]
  return (
    <span className="ko-parti" title={name}>
      {logo && !failed
        ? <img src={`${import.meta.env.BASE_URL}bilder/partier/${logo}`} width="24" height="24" alt="" onError={() => setFailed(true)} />
        : <span className="ko-partifarge" style={{ background: partiFarge(name) }} aria-hidden="true" />}
      <span>{fullName ? name : <><span aria-hidden="true">{name === 'Rødt' ? name : partiKort(name)}</span><span className="sr-only">{name}</span></>}</span>
    </span>
  )
}

export default function MunicipalityPolitics({ code, mayorOnly = false }) {
  const [politics, setPolitics] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    let active = true
    loadPolitics().then((data) => { if (active) setPolitics(data) }).catch(() => {
      politicsPromise = undefined
      if (active) setLoadFailed(true)
    })
    return () => { active = false }
  }, [])
  if (!politics && !loadFailed) return <aside className="ko-politikk" aria-label="Politisk ledelse"><span className="ft-stikkord">Politisk ledelse</span><p>Henter opplysninger …</p></aside>
  const record = politics?.municipalities[code]
  if (!record) {
    return (
      <aside className="ko-politikk ko-politikk--mangler" aria-label="Politisk ledelse">
        <span className="ft-stikkord">Politisk ledelse</span>
        <p>{loadFailed ? 'Kunne ikke hente politiske opplysninger. Prøv å laste siden på nytt.' : mayorOnly ? 'Opplysninger om ordfører er ikke tilgjengelige ennå.' : 'Opplysninger om ordfører og styrende samarbeid er ikke tilgjengelige ennå.'}</p>
      </aside>
    )
  }
  const { mayor, executive, government, election } = record
  const sourceAge = Math.floor((Date.now() - Date.parse(record.sourceFetchedAt)) / 86400000)
  const verificationAge = record.verifiedAt ? Math.floor((Date.now() - Date.parse(record.verifiedAt)) / 86400000) : 0
  const needsReview = Boolean(record.reviewReasons?.length || verificationAge > politics.reviewAfterDays)
  const governmentLabel = government.kind === 'source-reported' ? government.label : `${government.label}${needsReview ? ' · sist bekreftet' : ''}`
  return (
    <aside className="ko-politikk" aria-label={`Politisk ledelse i ${record.name}`}>
      <span className="ft-stikkord">Politisk ledelse</span>
      <div className="ko-ordforer">
        <div><span className="ko-politikketikett">{mayor.provenance === 'reported' ? 'Ordfører · registrert' : 'Ordfører'}</span><a href={mayor.source} className="ko-ordforernavn">{mayor.name}</a></div>
        <Party name={mayor.party} fullName />
      </div>
      {!mayorOnly && executive && <div className="ko-ordforer">
        <div><span className="ko-politikketikett">Byrådsleder</span><a href={executive.source} className="ko-ordforernavn">{executive.name}</a></div>
        {executive.party && <Party name={executive.party} fullName />}
      </div>}
      {(record.fetchFailed || sourceAge > 7 || needsReview) && <p className="ko-politikkstatus" role="status">{record.fetchFailed || sourceAge > 7 ? 'Kildeoppdateringen er forsinket. ' : ''}{needsReview ? 'Bekreftede opplysninger trenger ny kontroll. ' : ''}Se dato og kilder nedenfor.</p>}
      {!mayorOnly && <div className="ko-styrende">
        <span className="ko-politikketikett">{governmentLabel}</span>
        <ul aria-label={governmentLabel}>{government.parties.map((name) => <li key={name}><Party name={name} /></li>)}</ul>
        <p>{government.parties.length ? government.note : 'Kilden oppgir ikke hvilke partier som samarbeider. Det utledes ikke av ordførerens parti.'}</p>
      </div>}
      {!mayorOnly && election && <details className="ko-kommunevalg">
        <summary>Kommunevalget {election.year}<span>{election.totalSeats} mandater</span></summary>
        <div className="ko-mandatstripe" aria-hidden="true">{election.results.map((row) => <i key={row.party} style={{ flex: row.seats, background: partiFarge(row.party) }} />)}</div>
        <table>
          <caption className="sr-only">Mandatfordeling etter kommunevalget {election.year} i {record.name}</caption>
          <thead><tr><th scope="col">Parti</th><th scope="col">Mandater</th></tr></thead>
          <tbody>{election.results.map((row) => <tr key={row.party}><th scope="row"><Party name={row.party} fullName /></th><td className="num">{row.seats}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Totalt</th><td className="num">{election.totalSeats}</td></tr></tfoot>
        </table>
        <p>Mandater ved valget, før eventuelle partibytter.</p>
        <a href={election.source}>Kilde: kommunens valgoppgjør ↗</a>
      </details>}
      <details className="ko-politikkilder">
        <summary>Kilder · hentet {dateFormat.format(new Date(`${record.sourceFetchedAt}T12:00:00Z`))}</summary>
        <p>Hentedato viser når kilden sist ble lest, ikke når kommunen sist endret ledelse.{record.verifiedAt && ` Bekreftet mot egne kilder ${dateFormat.format(new Date(`${record.verifiedAt}T12:00:00Z`))}.`}</p>
        {record.reviewReasons?.length > 0 && <p>{record.reviewReasons.join(' ')}</p>}
        <ul><li><a href={mayor.source}>Ordfører · kilde ↗</a></li>{!mayorOnly && executive && <li><a href={executive.source}>Byrådsleder · kilde ↗</a></li>}{!mayorOnly && government.sources.map((source) => <li key={source.url}><a href={source.url}>{source.label} ↗</a></li>)}</ul>
        {!mayorOnly && <p>SV-logo: laget for Sosialistisk Venstreparti, via <a href="https://commons.wikimedia.org/wiki/File:Sosialistisk_Venstreparti_logo.svg">Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Uendret.</p>}
      </details>
    </aside>
  )
}
