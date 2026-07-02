import React, { useMemo, useState } from 'react'
import { filtrerNoder, sumVerdi, byggArtskontoTre, perInnbygger } from '../lib/data'
import { formatMillKr } from '../lib/format'
import './Drilldown.css'

export default function Drilldown({
  hierarki, side, valgtAar, perPerson, befolkning,
  skjulFin, sti, fokusNode, onDrill, onFokus, onBreadcrumb, onToppnivaa,
}) {
  const [sokeTekst, setSokeTekst] = useState('')

  const rotNoder = useMemo(
    () => filtrerNoder(hierarki, { skjulFin }),
    [hierarki, skjulFin]
  )

  // Gjeldende nivå: barn av siste breadcrumb-node.
  // På post-nivå (ingen children) går vi videre til artskonto-treet —
  // kontoklasser og enkeltkontoer vises som rader i samme liste.
  const gjeldende = useMemo(() => {
    if (sti.length === 0) return rotNoder
    const siste = sti[sti.length - 1]
    if (siste.children?.length) {
      return filtrerNoder(siste.children, { skjulFin })
    }
    if (siste.niva === 'post') {
      return byggArtskontoTre(siste)
    }
    return []
  }, [sti, rotNoder, skjulFin])

  const erArtskontoNivaa = gjeldende[0]?.niva === 'kontoklasse' || gjeldende[0]?.niva === 'artskonto'

  const skaler = (v) => perPerson ? (perInnbygger(v, befolkning, valgtAar) ?? v) : v

  const filtrert = useMemo(() => {
    if (!sokeTekst) return gjeldende
    const q = sokeTekst.toLowerCase()
    return gjeldende.filter(n => n.navn.toLowerCase().includes(q) || (n.tag ?? '').toLowerCase().includes(q))
  }, [gjeldende, sokeTekst])

  // Rekursiv sum av filtrerte bladnoder — se sumVerdi
  const rader = useMemo(() =>
    filtrert
      .map(n => ({ node: n, verdi: sumVerdi(n, valgtAar, 'regnskap') }))
      .sort((a, b) => Math.abs(b.verdi) - Math.abs(a.verdi)),
    [filtrert, valgtAar]
  )
  const totalBrutto = rader.reduce((s, r) => s + r.verdi, 0)

  return (
    <div className="drilldown">
      <div className="drilldown-header">
        <Breadcrumb sti={sti} onToppnivaa={onToppnivaa} onBreadcrumb={onBreadcrumb} side={side} />
        <div className="drilldown-topprad">
          <span className="drilldown-total num">
            {formatMillKr(skaler(totalBrutto))}
            {perPerson && ' /person'}
            {erArtskontoNivaa && <span className="nivaa-merke">artskonto</span>}
          </span>
          <input
            className="soke-input"
            type="search"
            placeholder="Søk…"
            value={sokeTekst}
            onChange={e => setSokeTekst(e.target.value)}
            aria-label="Søk i poster"
          />
        </div>
      </div>

      <div className="drilldown-liste" role="list">
        {rader.length === 0 && (
          <p className="ingen-treff">
            {sokeTekst ? 'Ingen treff' : 'Ingen underliggende data for dette året'}
          </p>
        )}
        {rader.map(({ node, verdi }) => {
          const andel = totalBrutto !== 0 ? (verdi / totalBrutto) * 100 : 0
          const skalerV = skaler(verdi)
          const erFokus = fokusNode?.id === node.id
          // Poster kan drilles videre til artskonto; kontoklasser til enkeltkontoer
          const kanDrilles = (node.children?.length ?? 0) > 0
            || node.niva === 'post'
          const handleKlikk = () => kanDrilles ? onDrill(node) : onFokus(node)

          return (
            <div
              key={node.id}
              className={`drilldown-rad ${erFokus ? 'fokus' : ''}`}
              role="listitem"
              tabIndex={0}
              onClick={handleKlikk}
              onMouseEnter={() => onFokus(node)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleKlikk()}
              aria-label={`${node.navn}: ${formatMillKr(skalerV)}`}
            >
              <div className="rad-bar-wrapper">
                <div
                  className={`rad-bar rad-bar--${side === 'utgifter' ? 'rust' : 'teal'}`}
                  style={{ width: `${Math.min(Math.abs(andel), 100)}%` }}
                />
              </div>
              <div className="rad-innhold">
                <div className="rad-venstre">
                  <span className="rad-navn">{node.navn}</span>
                  {node.tag && <span className="rad-tag">{node.tag}</span>}
                  {node.fin && <span className="merke merke--fin">90-post</span>}
                  {node.transfer && <span className="merke merke--spu">SPU</span>}
                </div>
                <div className="rad-hoyre">
                  <span className="rad-belop num">{formatMillKr(skalerV)}</span>
                  <span className="rad-andel">{Math.abs(andel).toFixed(1)} %</span>
                  <span className="rad-pil" aria-hidden>{kanDrilles ? '›' : ''}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Breadcrumb({ sti, onToppnivaa, onBreadcrumb, side }) {
  return (
    <nav className="breadcrumb" aria-label="Hierarkinivå">
      <button className="bc-item bc-rot" onClick={onToppnivaa}>
        {side === 'utgifter' ? 'Alle utgifter' : 'Alle inntekter'}
      </button>
      {sti.map((node, i) => (
        <React.Fragment key={node.id}>
          <span className="bc-sep" aria-hidden>›</span>
          <button
            className={`bc-item ${i === sti.length - 1 ? 'bc-aktiv' : ''}`}
            onClick={() => onBreadcrumb(i)}
          >
            {node.tag ?? node.navn}
          </button>
        </React.Fragment>
      ))}
    </nav>
  )
}
