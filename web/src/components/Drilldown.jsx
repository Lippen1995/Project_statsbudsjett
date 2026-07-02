import React, { useMemo, useState } from 'react'
import { filtrerNoder, perInnbygger } from '../lib/data'
import { formatMillKr } from '../lib/format'
import './Drilldown.css'

export default function Drilldown({
  hierarki, side, valgtAar, perPerson, befolkning,
  skjulFin, sti, fokusNode, onDrill, onBreadcrumb, onToppnivaa,
}) {
  const [sokeTekst, setSokeTekst] = useState('')

  const rotNoder = useMemo(
    () => filtrerNoder(hierarki, { skjulFin }),
    [hierarki, skjulFin]
  )

  const gjeldende = useMemo(() => {
    if (sti.length === 0) return rotNoder
    const siste = sti[sti.length - 1]
    const barn = filtrerNoder(siste.children ?? [], { skjulFin })
    return barn
  }, [sti, rotNoder, skjulFin])

  const erPrognose = valgtAar > (gjeldende[0]?.serier ? Object.keys(gjeldende[0].serier).length : 0)

  const serie = 'regnskap'  // Vi viser alltid regnskap i drilldown

  const skaler = (v) => perPerson ? perInnbygger(v, befolkning, valgtAar) : v

  const filtrert = useMemo(() => {
    if (!sokeTekst) return gjeldende
    const q = sokeTekst.toLowerCase()
    return gjeldende.filter(n => n.navn.toLowerCase().includes(q) || (n.tag ?? '').toLowerCase().includes(q))
  }, [gjeldende, sokeTekst])

  const totalBrutto = filtrert.reduce((s, n) => s + (n.serier?.[valgtAar]?.[serie] ?? 0), 0)

  return (
    <div className="drilldown">
      <div className="drilldown-header">
        <Breadcrumb sti={sti} onToppnivaa={onToppnivaa} onBreadcrumb={onBreadcrumb} side={side} />
        <div className="drilldown-topprad">
          <span className="drilldown-total num">
            {formatMillKr(skaler(totalBrutto))}
            {perPerson && ' /person'}
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
        {filtrert.length === 0 && (
          <p className="ingen-treff">Ingen treff</p>
        )}
        {filtrert.map(node => {
          const v = node.serier?.[valgtAar]?.[serie] ?? 0
          const andel = totalBrutto > 0 ? (v / totalBrutto) * 100 : 0
          const skalerV = skaler(v)
          const erFokus = fokusNode?.id === node.id
          const harBarn = (node.children?.length ?? 0) > 0

          return (
            <div
              key={node.id}
              className={`drilldown-rad ${erFokus ? 'fokus' : ''}`}
              role="listitem"
              tabIndex={0}
              onClick={() => onDrill(node, sti[sti.length - 1])}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onDrill(node, sti[sti.length - 1])}
              aria-label={`${node.navn}: ${formatMillKr(skalerV)}`}
              aria-expanded={harBarn ? erFokus : undefined}
            >
              <div className="rad-bar-wrapper">
                <div
                  className={`rad-bar rad-bar--${side === 'utgifter' ? 'rust' : 'teal'}`}
                  style={{ width: `${Math.min(andel, 100)}%` }}
                />
              </div>
              <div className="rad-innhold">
                <div className="rad-venstre">
                  <span className="rad-navn">{node.navn}</span>
                  {node.tag && <span className="rad-tag">{node.tag}</span>}
                  {node.fin && <span className="merke merke--fin">fin.</span>}
                  {node.transfer && <span className="merke merke--spu">SPU</span>}
                </div>
                <div className="rad-hoyre">
                  <span className="rad-belop num">{formatMillKr(skalerV)}</span>
                  <span className="rad-andel">{andel.toFixed(1)} %</span>
                  {harBarn && <span className="rad-pil" aria-hidden>›</span>}
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
