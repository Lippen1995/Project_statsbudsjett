import React, { useState } from 'react'
import { bridgeRows, bridgeSteps } from './budget-bridge.js'
import { RUST, GRONN, INK, GRID, BLEK } from '../fellestall/design.js'
import { factText, number } from './model'
const money = (n) => `${number(n, 1)} mill. kr`
export function BudgetTotals({ report }) {
  const before = report.rows.reduce((s, r) => s + r.before, 0),
    after = report.rows.reduce((s, r) => s + r.after, 0),
    max = Math.max(before, after)
  return (
    <figure className="an-figure an-budget-figure">
      <figcaption>
        <h3>To budsjetter, samme avgrensning</h3>
        <p>Løpende kroner, uten finansposter og SPU-overføringer.</p>
      </figcaption>
      <svg
        viewBox="0 0 400 220"
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="Sammenligning av samlede budsjetter"
      >
        <title>{`${report.beforeLabel}: ${money(before)}. ${report.afterLabel}: ${money(after)}.`}</title>
        {[
          [report.beforeLabel, before],
          [report.afterLabel, after],
        ].map(([label, v], i) => (
          <g key={label}>
            <text x="15" y={35 + i * 100}>
              {label}
            </text>
            <rect
              x="15"
              y={45 + i * 100}
              width={(350 * v) / max}
              height="30"
              fill={i ? '#a84b35' : '#8c8577'}
            />
            <text x="15" y={95 + i * 100}>
              {money(v)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  )
}
export function BudgetChanges({ report }) {
  const rows = [...report.rows]
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .filter((r) => Math.abs(r.change) >= 0.1)
      .slice(0, 10),
    max = Math.max(1, ...rows.map((r) => Math.abs(r.change)))
  return (
    <figure className="an-figure an-budget-figure">
      <figcaption>
        <h3>Postene som flytter mest penger</h3>
        <p>
          Økninger og kutt mellom {report.beforeLabel.toLowerCase()} og{' '}
          {report.afterLabel.toLowerCase()}. Samme kapittel og post følger med ved
          departementsflytting.
        </p>
      </figcaption>
      <svg
        viewBox={`0 0 400 ${Math.max(120, rows.length * 78 + 35)}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="De største endringene per budsjettpost"
      >
        <title>{rows.map((r) => `${r.name}: ${money(r.change)}`).join('. ')}</title>
        <line x1="200" x2="200" y1="0" y2={rows.length * 78} stroke="#8c8577" />
        {rows.map((r, i) => (
          <g key={r.id}>
            <text x="8" y={i * 78 + 20} fontSize="14">
              {r.name.length > 45 ? r.name.slice(0, 42) + '…' : r.name}
            </text>
            <rect
              x={r.change < 0 ? 200 - (180 * Math.abs(r.change)) / max : 200}
              y={i * 78 + 32}
              width={Math.max(1, (180 * Math.abs(r.change)) / max)}
              height="18"
              fill={r.change < 0 ? '#546952' : '#a84b35'}
            />
            <text x="8" y={i * 78 + 68} fontSize="14">
              {money(r.change)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  )
}
export function BudgetEvidence({ report }) {
  const rows = [...report.rows]
    .filter((r) => Math.abs(r.change) >= 0.1)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 20)
  return (
    <section id="faktagrunnlag" className="an-evidence">
      <h2>Tallene bak analysen</h2>
      <p>
        De største endringene, i løpende mill. kroner. Kapittel og post er sammenligningsnøkkelen.
        Hele uttrekket følger med i analysens frosne datagrunnlag.
      </p>
      <div
        className="an-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Endringer per budsjettpost"
      >
        <table>
          <caption>
            {report.beforeLabel} mot {report.afterLabel}
          </caption>
          <thead>
            <tr>
              <th>Post</th>
              <th>{report.beforeLabel}</th>
              <th>{report.afterLabel}</th>
              <th>Endring</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.id}: {r.name}
                </th>
                <td>{number(r.before, 1)}</td>
                <td>{number(r.after, 1)}</td>
                <td>{number(r.change, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const bridgeMoney = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${number(Math.abs(v) / 1000, Math.abs(v) < 10 ? 3 : Math.abs(v) < 1000 ? 2 : 1)}`
const bridgeLabel = (label) => ({
  'Rammetilskudd til kommuner': 'Kommuner',
  'Rammetilskudd til fylkeskommuner': 'Fylker',
  'Husbanken - Bolig- og bygningsdirektoratet': 'Husbanken og bolig',
  'Kommunestruktur': 'Kommune- struktur',
  'Regional- og distriktsutvikling': 'Distrikts- utvikling',
  'Direktoratet for byggkvalitet': 'Byggkvalitet',
  'Tilskudd til Statens pensjonskasse': 'Statens pensjonskasse',
  'Bosetting av flyktninger og tiltak for innvandrere': 'Bosetting og integrering',
  'Klima- og miljødepartementet': 'Departementet',
  'Internasjonale klima- og utviklingstiltak': 'Internasjonale klimatiltak',
  'Norsk kulturminnefond': 'Kulturminne- fondet',
  'Miljødirektoratet': 'Miljø- direktoratet',
  'Fordeling av inntekt fra avgift på vindkraft': 'Vindkraft- avgift',
  'Flom- og skredforebygging': 'Flom og skred',
  'Reguleringsmyndigheten for energi': 'Energi- regulering',
  'Strømstønadsordning': 'Strømstøtte',
  'Norgespris for strøm': 'Norgespris strøm',
  'Norgespris for fjernvarme': 'Norgespris fjernvarme',
}[label] ?? label)
const labelLines = (fullLabel) => {
  const label = bridgeLabel(fullLabel)
  const lines = ['']
  const readable = label.replace(/Aktivitetsfinansiering/g, 'Aktivitets- finansiering').replace(/Investeringslån/g, 'Investerings- lån').replace(/Basisbevilgninger/g, 'Basis- bevilgninger').replace(/Innbyggertilskudd/g, 'Innbygger- tilskudd').replace(/Arbeidsavklaringspenger/g, 'Arbeids- avklarings- penger')
  const words = readable.split(' ').flatMap((word) => {
    const parts = []
    while (word.length > 14) { parts.push(word.slice(0, 13) + '-'); word = word.slice(13) }
    return [...parts, word]
  })
  for (const word of words) {
    const last = lines.length - 1
    if (lines[last] && (lines[last] + ' ' + word).length > 12) lines.push(word)
    else lines[last] += (lines[last] ? ' ' : '') + word
  }
  return lines
}

export function BudgetBridge({ report, graph = {} }) {
  const [path, setPath] = useState([])
  const scope = path.at(-1) ?? graph
  const { entries, total } = bridgeRows(report, scope)
  const steps = bridgeSteps(entries, total)
  const bars = [...steps, { id: 'total', label: 'Samlet endring', change: total, start: 0, end: total, total: true }]
  const W = Math.max(600, bars.length * 90 + 60), H = 360
  const left = 52, right = 10, top = 38, bottom = 248
  const values = bars.flatMap((b) => [b.start, b.end])
  const low = Math.min(0, ...values), high = Math.max(0, ...values)
  const span = high - low || 1
  const y = (v) => top + (bottom - top) * (high - v) / span
  const step = (W - left - right) / bars.length, width = step * 0.58
  const x = (i) => left + (i + 0.5) * step
  const drill = (entry) => {
    if (entry.drill) setPath([...path, entry.drill])
  }
  const scopeName = scope.chapter
    ? report.rows.find((r) => r.id.startsWith(scope.chapter + '-')).name.split(' – ')[0]
    : scope.department ? entries[0]?.rows[0]?.departmentName : 'Alle områder'
  const title = path.length ? scopeName : factText(graph.title ?? 'Hvor flytter pengene seg?', report)
  return (
    <figure className="an-figure an-budget-figure an-bridge">
      <figcaption>
        <div className="an-bridge-heading"><h3>{title}</h3><strong className="num">{bridgeMoney(total)}<small>mrd. kr netto</small></strong></div>
        <p>{factText((!path.length && graph.description) || `${report.beforeLabel} → ${report.afterLabel}. Løpende kroner.`, report)}</p>
      </figcaption>
      <div className="an-bridge-key"><span><i style={{ background: RUST }} />Økning</span><span><i style={{ background: GRONN }} />Reduksjon</span><span><i style={{ background: INK }} />Nettoendring</span><span>Milliarder kroner</span></div>
      {path.length > 0 && <button type="button" className="an-bridge-back" onClick={() => setPath(path.slice(0, -1))}>← Tilbake ett nivå</button>}
      <div className="an-bridge-scroll" tabIndex={0} role="region" aria-label={`${title}. Vannrett rulling ved behov.`}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, minWidth: W, display: 'block', margin: '0 auto' }} role="group" aria-label={`${title}. Samlet ${bridgeMoney(total)} milliarder kroner.`}>
          <title>{bars.map((r) => `${r.label}: ${bridgeMoney(r.change)} mrd. kr`).join('. ')}</title>
          {[0, 1, 2, 3, 4].map((i) => {
            const v = low + span * i / 4
            return <g key={i}><line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke={GRID} strokeDasharray="2 4" /><text x={left - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill={BLEK}>{number(v / 1000, Math.abs(span) < 1000 ? 2 : 1)}</text></g>
          })}
          <line x1={left} x2={W - right} y1={y(0)} y2={y(0)} stroke={BLEK} />
          {bars.map((b, i) => {
            const yy = y(Math.max(b.start, b.end)), color = b.total ? INK : b.change >= 0 ? RUST : GRONN
            const lines = labelLines(b.label)
            const clickable = !!b.drill
            return (
              <g key={b.id} className={clickable ? 'an-bridge-bar' : undefined}
                tabIndex={clickable ? 0 : undefined} role={clickable ? 'button' : undefined}
                aria-label={clickable ? `${b.label}: ${bridgeMoney(b.change)} mrd. kr. Åpne detaljert bro.` : undefined}
                onClick={clickable ? () => drill(b) : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drill(b) } } : undefined}>
                <title>{`${b.label}: ${bridgeMoney(b.change)} mrd. kr`}</title>
                {i > 0 && <line x1={x(i - 1) + width / 2} x2={x(i) - width / 2} y1={y(b.total ? total : b.start)} y2={y(b.total ? total : b.start)} stroke={BLEK} strokeDasharray="3 3" />}
                {clickable && <rect className="an-bridge-hit" x={x(i) - step / 2} y="12" width={step} height={H - 18} fill="transparent" />}
                <rect x={x(i) - width / 2} y={yy} width={width} height={Math.abs(y(b.start) - y(b.end))} fill={color} style={{ pointerEvents: 'none' }} />
                <text x={x(i)} y={yy - 10} textAnchor="middle" fontSize="14" fontWeight="700" fill={color} style={{ pointerEvents: 'none' }}>{bridgeMoney(b.change)}</text>
                <text x={x(i)} y={bottom + 24} textAnchor="middle" fontSize="12" fill={b.total ? INK : BLEK} fontWeight={b.total ? 700 : 500} style={{ pointerEvents: 'none' }}>
                  {lines.slice(0, 5).map((line, j) => <tspan key={j} x={x(i)} dy={j ? 15 : 0}>{j === 4 && lines.length > 5 ? line + '…' : line}</tspan>)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="an-bridge-hint">Sveip eller rull for å se hele broen. {entries.some((r) => r.drill) && 'Velg et område for å se postene bak.'}</p>
      <details className="an-bridge-data"><summary>Se beløpene bak broen</summary><div className="an-table-scroll"><table>
        <thead><tr><th scope="col">Område</th><th scope="col">{report.start}</th><th scope="col">{report.end}</th><th scope="col">Endring</th></tr></thead>
        <tbody>{entries.map((e) => <tr key={e.id}><th scope="row">{e.drill ? <button type="button" onClick={() => drill(e)}>{e.label} →</button> : e.label}</th><td>{money(e.before)}</td><td>{money(e.after)}</td><td>{money(e.change)}</td></tr>)}<tr className="an-bridge-total"><th scope="row">Samlet endring</th><td colSpan="2" /><td>{money(total)}</td></tr></tbody>
      </table></div></details>
    </figure>
  )
}

export function PoliticalEvidence({ report }) {
  const labels = {
    agreement: 'Budsjettavtale',
    'committee-recommendation': 'Komitéinnstilling',
    vote: 'Dokumentert stemmestøtte',
    'adopted-amendment': 'Vedtatt endringsforslag',
  }
  if (!report.politicalEvidence?.length) return null
  return (
    <section id="politiskgrunnlag" className="an-method">
      <h2>Dokumentasjonen bak partienes rolle</h2>
      <p>Stemmestøtte dokumenterer ikke i seg selv hvem som forhandlet frem en endring.</p>
      {report.politicalEvidence.map((item, i) => (
        <div key={i}>
          <h3>
            {labels[item.kind]} · {item.parties.join(', ')}
          </h3>
          <blockquote>{item.quote}</blockquote>
          <p>
            Berørte poster: {item.recordKeys.join(', ')}. <a href={item.url}>Les kilden ↗</a>
          </p>
        </div>
      ))}
    </section>
  )
}

export function PartyPriorities({ report }) {
  if (!report.partyPriorities?.length) return null
  const kinds = {
    programme: 'Partiprogram',
    'budget-request': 'Budsjettkrav',
    'alternative-budget': 'Alternativt budsjett',
    'stated-priority': 'Uttalt prioritering',
  }
  return (
    <section className="an-evidence" id="partiprioriteringer">
      <h2>Partienes dokumenterte prioriteringer</h2>
      <p>
        Kildene viser hva partiene har ønsket. Samsvar med et forslag dokumenterer ikke i seg selv
        gjennomslag i forhandlinger.
      </p>
      {report.partyPriorities.map((p) => (
        <div key={p.id}>
          <h3>
            {p.party} · {kinds[p.kind]}
            {p.period ? ` ${p.period.join('–')}` : p.referenceYear ? ` ${p.referenceYear}` : ''}
          </h3>
          <blockquote>{p.quote}</blockquote>
          <p>
            <a href={p.url}>Les originalkilden ↗</a> ·{' '}
            {p.sourceDate ? `Publisert ${p.sourceDate}` : 'Publiseringsdato ikke bekreftet'} ·
            Hentet {p.retrievedAt.slice(0, 10)}
          </p>
          {!!p.recordKeys.length && <p>Koblet til postene: {p.recordKeys.join(', ')}.</p>}
        </div>
      ))}
    </section>
  )
}
