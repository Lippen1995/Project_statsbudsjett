import React, { useMemo, useState } from 'react'
import {
  filtrerNoder, sumVerdi, byggArtskontoTre, transformVerdi,
  byggSokeindeks, sokGlobalt, lastNedCSV,
} from '../lib/data'
import { formatVerdi } from '../lib/format'
import './Drilldown.css'

export default function Drilldown({
  hierarki, side, valgtAar, modus, modusCtx,
  skjulFin, sti, fokusNode, fokusDetaljer,
  onDrill, onFokus, onBreadcrumb, onToppnivaa, onNaviger,
}) {
  const [sokeTekst, setSokeTekst] = useState('')

  const rotNoder = useMemo(
    () => filtrerNoder(hierarki, { skjulFin }),
    [hierarki, skjulFin]
  )

  const sokeindeks = useMemo(() => byggSokeindeks(rotNoder), [rotNoder])
  const globaleTreff = useMemo(
    () => sokeTekst.trim().length >= 2 ? sokGlobalt(sokeindeks, sokeTekst.trim()) : null,
    [sokeindeks, sokeTekst]
  )

  const gjeldende = useMemo(() => {
    if (sti.length === 0) return rotNoder
    const siste = sti[sti.length - 1]
    if (siste.children?.length) {
      return filtrerNoder(siste.children, { skjulFin })
    }
    if (siste.niva === 'post') {
      return byggArtskontoTre(siste, fokusDetaljer)
    }
    return []
  }, [sti, rotNoder, skjulFin, fokusDetaljer])

  const erArtskontoNivaa = gjeldende[0]?.niva === 'kontoklasse' || gjeldende[0]?.niva === 'artskonto'
  const skaler = v => transformVerdi(v, valgtAar, modus, modusCtx)

  const rader = useMemo(() =>
    gjeldende
      .map(n => ({ node: n, verdi: sumVerdi(n, valgtAar, 'regnskap') }))
      .sort((a, b) => Math.abs(b.verdi) - Math.abs(a.verdi)),
    [gjeldende, valgtAar]
  )
  const totalBrutto = rader.reduce((s, r) => s + r.verdi, 0)

  const eksporter = () => {
    const csvRader = rader.map(({ node, verdi }) => ({
      navn: node.navn,
      tag: node.tag,
      verdi: Math.round(skaler(verdi) * 10) / 10,
      andel: totalBrutto !== 0 ? (verdi / totalBrutto) * 100 : 0,
    }))
    const stinavn = sti.length ? sti[sti.length - 1].navn : `alle-${side}`
    lastNedCSV(csvRader, `statsregnskap-${stinavn}-${valgtAar}.csv`.replace(/[^\wæøåÆØÅ.-]+/g, '_'))
  }

  // Globalt søk aktivt → vis trefflista med full sti
  if (globaleTreff) {
    return (
      <div className="drilldown">
        <div className="drilldown-header">
          <div className="drilldown-topprad">
            <span className="drilldown-total">{globaleTreff.length} treff</span>
            <input className="soke-input" type="search" placeholder="Søk i alle poster…"
              value={sokeTekst} onChange={e => setSokeTekst(e.target.value)} autoFocus
              aria-label="Globalt søk" />
          </div>
        </div>
        <div className="drilldown-liste" role="list">
          {globaleTreff.length === 0 && <p className="ingen-treff">Ingen treff</p>}
          {globaleTreff.map(({ node, sti: nodeSti }) => {
            const v = skaler(sumVerdi(node, valgtAar, 'regnskap'))
            return (
              <div key={node.id} className="drilldown-rad" role="listitem" tabIndex={0}
                onClick={() => { onNaviger([...nodeSti, node]); setSokeTekst('') }}
                onKeyDown={e => (e.key === 'Enter') && (onNaviger([...nodeSti, node]), setSokeTekst(''))}>
                <div className="rad-innhold">
                  <div className="rad-venstre">
                    <span className="rad-navn">{node.navn}</span>
                    <span className="rad-sti">
                      {[side === 'utgifter' ? 'Utgifter' : 'Inntekter', ...nodeSti.map(n => n.tag ?? n.navn)].join(' › ')}
                    </span>
                  </div>
                  <span className="rad-belop num">{formatVerdi(v, modus)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="drilldown">
      <div className="drilldown-header">
        <Breadcrumb sti={sti} onToppnivaa={onToppnivaa} onBreadcrumb={onBreadcrumb} side={side} />
        <div className="drilldown-topprad">
          <span className="drilldown-total num">
            {formatVerdi(skaler(totalBrutto), modus)}
            {erArtskontoNivaa && <span className="nivaa-merke">artskonto</span>}
          </span>
          <div className="topprad-hoyre">
            <button className="ikon-knapp" onClick={eksporter} title="Last ned som CSV" aria-label="Last ned som CSV">↓ CSV</button>
            <input className="soke-input" type="search" placeholder="Søk…"
              value={sokeTekst} onChange={e => setSokeTekst(e.target.value)}
              aria-label="Søk i poster" />
          </div>
        </div>
      </div>

      <div className="drilldown-liste" role="list">
        {rader.length === 0 && (
          <p className="ingen-treff">Ingen underliggende data for dette året</p>
        )}
        {rader.map(({ node, verdi }) => {
          const andel = totalBrutto !== 0 ? (verdi / totalBrutto) * 100 : 0
          const skalerV = skaler(verdi)
          const erFokus = fokusNode?.id === node.id
          const kanDrilles = (node.children?.length ?? 0) > 0 || node.niva === 'post'
          const handleKlikk = () => kanDrilles ? onDrill(node) : onFokus(node)

          return (
            <div
              key={node.id}
              className={`drilldown-rad ${erFokus ? 'fokus' : ''}`}
              role="listitem"
              tabIndex={0}
              onClick={handleKlikk}
              onMouseEnter={() => onFokus(node)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleKlikk())}
              aria-label={`${node.navn}: ${formatVerdi(skalerV, modus)}`}
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
                  <span className="rad-belop num">{formatVerdi(skalerV, modus)}</span>
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
