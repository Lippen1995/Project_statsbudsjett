import React, { useState } from 'react'
import politics from './municipal-politics.json'
import { partiFarge, partiKort } from '../lib/partier'

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

export default function MunicipalityPolitics({ code }) {
  const record = politics.municipalities[code]
  if (!record) {
    return (
      <aside className="ko-politikk ko-politikk--mangler" aria-label="Politisk ledelse">
        <span className="ft-stikkord">Politisk ledelse nå</span>
        <p>Opplysninger om ordfører og styrende samarbeid er ikke tilgjengelige ennå.</p>
      </aside>
    )
  }
  const { mayor, government, election } = record
  return (
    <aside className="ko-politikk" aria-label={`Politisk ledelse i ${record.name}`}>
      <span className="ft-stikkord">Politisk ledelse nå</span>
      <div className="ko-ordforer">
        <div><span className="ko-politikketikett">Ordfører</span><a href={mayor.source} className="ko-ordforernavn">{mayor.name}</a></div>
        <Party name={mayor.party} fullName />
      </div>
      <div className="ko-styrende">
        <span className="ko-politikketikett">{government.label}</span>
        <ul aria-label={government.label}>{government.parties.map((name) => <li key={name}><Party name={name} /></li>)}</ul>
        <p>{government.note}</p>
      </div>
      {election && <details className="ko-kommunevalg">
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
        <summary>Kilder · kontrollert {dateFormat.format(new Date(`${record.checkedAt}T12:00:00Z`))}</summary>
        <ul><li><a href={mayor.source}>Ordfører · {record.name} kommune ↗</a></li>{government.sources.map((source) => <li key={source.url}><a href={source.url}>{source.label} ↗</a></li>)}</ul>
        <p>SV-logo: laget for Sosialistisk Venstreparti, via <a href="https://commons.wikimedia.org/wiki/File:Sosialistisk_Venstreparti_logo.svg">Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Uendret.</p>
      </details>
    </aside>
  )
}
