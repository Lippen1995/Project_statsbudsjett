import React, { useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Bar
} from 'recharts'
import { byggTidsserie, byggYoY, transformVerdi } from '../lib/data'
import { formatVerdi, formatAvvik, formatCAGR, formatTotalEndring } from '../lib/format'
import './Historikkgraf.css'

const RUST = '#b84c2e'
const TEAL = '#0d7c6e'
const GOLD = '#b08c3a'
const BLAA = '#3b6ea5'   // sammenligningsserie

// Kjente hendelser som forklarer hopp i grafene
const HENDELSER = [
  { aar: 2020, tekst: 'Pandemien' },
  { aar: 2022, tekst: 'Strømstøtte / Ukraina' },
]

export default function Historikkgraf({
  node, years, budsjettAar, modus, modusCtx, side, pinnedNode, onPin, skjulFin,
}) {
  const sisteRegnskapsAar = Math.max(...years)
  const extraYears = budsjettAar > sisteRegnskapsAar ? [...years, budsjettAar] : years

  const skaler = (v, aar) => transformVerdi(v, aar, modus, modusCtx)

  const alle = useMemo(
    () => (node?.serier || node?.children) ? byggTidsserie(node, extraYears, skjulFin) : [],
    [node, extraYears, skjulFin]
  )

  const pinnetSerie = useMemo(
    () => (pinnedNode?.serier || pinnedNode?.children) ? byggTidsserie(pinnedNode, extraYears, skjulFin) : null,
    [pinnedNode, extraYears, skjulFin]
  )

  const data = useMemo(() => {
    return alle.map((d, i) => {
      const erPrognose = d.aar > sisteRegnskapsAar
      const p = pinnetSerie?.[i]
      return {
        aar: d.aar,
        areaRegnskap: erPrognose ? null : skaler(d.regnskap, d.aar),
        regnskapPrognose: erPrognose ? skaler(d.saldert, d.aar) : null,
        saldert: skaler(d.saldert, d.aar),
        revidert: (d.revidert != null && d.revidert !== d.saldert) ? skaler(d.revidert, d.aar) : null,
        sammenlign: p ? skaler(erPrognose ? p.saldert : p.regnskap, d.aar) : null,
        erPrognose,
      }
    })
  }, [alle, pinnetSerie, modus, modusCtx, sisteRegnskapsAar])

  const yoyData = useMemo(
    () => byggYoY(alle.filter(d => d.aar <= sisteRegnskapsAar)),
    [alle, sisteRegnskapsAar]
  )

  const regnskapsSerier = alle.filter(d => d.aar <= sisteRegnskapsAar && d.regnskap != null)
  const forsteReg = regnskapsSerier[0]?.regnskap
  const sisteReg = regnskapsSerier[regnskapsSerier.length - 1]?.regnskap
  const antallRegAar = regnskapsSerier.length - 1
  const sisteSaldert = alle.find(d => d.aar === sisteRegnskapsAar)?.saldert

  // CAGR/endring gir bare mening på løpende/faste kroner
  const visVekst = modus === 'lopende' || modus === 'fast'
  const avvik = formatAvvik(sisteReg, sisteSaldert)
  const cagr = visVekst ? formatCAGR(forsteReg, sisteReg, antallRegAar) : null
  const endring = visVekst ? formatTotalEndring(forsteReg, sisteReg) : null

  const farge = side === 'utgifter' ? RUST : TEAL

  const formatYAxis = v => {
    if (v == null) return ''
    if (modus === 'person') return new Intl.NumberFormat('nb-NO', { notation: 'compact' }).format(v)
    if (modus === 'bnp') return v.toFixed(0) + '%'
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + ' mrd'
    return v.toFixed(0)
  }

  if (!node || alle.length === 0) return (
    <div className="historikk-tom"><p>Velg en post i hierarkiet for å se historikk</p></div>
  )

  const hendelserIVindu = HENDELSER.filter(h => h.aar >= years[0] && h.aar <= sisteRegnskapsAar)
  const erPinnet = pinnedNode?.id === node.id

  return (
    <div className="historikk">
      <div className="historikk-header">
        <div className="historikk-tittelrad">
          <h3 className="historikk-tittel">{node.navn}</h3>
          {node.tag && <span className="historikk-tag">{node.tag}</span>}
        </div>
        {onPin && node.id !== 'rot' && (
          <button
            className={`pin-knapp ${erPinnet ? 'aktiv' : ''}`}
            onClick={() => onPin(erPinnet ? null : node)}
            title={erPinnet ? 'Fjern sammenligning' : 'Fest som sammenligning'}
          >
            {erPinnet ? '📌 festet' : '📌 sammenlign'}
          </button>
        )}
      </div>
      {pinnedNode && !erPinnet && (
        <p className="sammenlign-note">
          <span className="sml-dot" style={{ background: BLAA }} /> {pinnedNode.navn}
          <button className="sml-fjern" onClick={() => onPin(null)}>×</button>
        </p>
      )}

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={farge} stopOpacity={0.15} />
              <stop offset="95%" stopColor={farge} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="aar" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<GrafTooltip modus={modus} farge={farge} pinnetNavn={pinnedNode?.navn} />} />

          {hendelserIVindu.map(h => (
            <ReferenceLine key={h.aar} x={h.aar} stroke="#cbd5e1" strokeDasharray="2 2"
              label={{ value: h.tekst, position: 'top', fontSize: 9, fill: '#94a3b8' }} />
          ))}

          <Area type="monotone" dataKey="areaRegnskap" stroke={farge} strokeWidth={2}
            fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: farge }}
            connectNulls={false} name="Regnskap" />
          <Line type="monotone" dataKey="regnskapPrognose" stroke={farge} strokeWidth={2}
            strokeDasharray="6 4" dot={{ r: 4, fill: 'white', stroke: farge, strokeWidth: 2 }}
            connectNulls={false} name="Prognose (saldert)" />
          <Line type="monotone" dataKey="saldert" stroke={GOLD} strokeWidth={1.5}
            strokeDasharray="3 3" dot={false} activeDot={false} name="Saldert budsjett" />
          <Line type="monotone" dataKey="revidert" stroke="#9ca3af" strokeWidth={1}
            strokeDasharray="2 4" dot={false} activeDot={false} name="Revidert budsjett" />
          {pinnedNode && !erPinnet && (
            <Line type="monotone" dataKey="sammenlign" stroke={BLAA} strokeWidth={1.5}
              dot={false} activeDot={{ r: 3, fill: BLAA }} connectNulls={false} name="Sammenligning" />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {avvik && <p className="avvik-tekst">{avvik}</p>}

      {(cagr || endring) && (
        <div className="nokkeltal">
          {cagr && <Nokkeltal label={`CAGR ${years[0]}–${sisteRegnskapsAar}`} verdi={cagr} />}
          {endring && <Nokkeltal label="Total endring" verdi={endring} />}
        </div>
      )}

      {visVekst && yoyData.length > 1 && (
        <div className="yoy-seksjon">
          <p className="yoy-label">År/år-vekst (regnskap)</p>
          <ResponsiveContainer width="100%" height={60}>
            <ComposedChart data={yoyData} margin={{ top: 4, right: 16, bottom: 0, left: 52 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="aar" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Bar dataKey="yoy" fill={farge} radius={[2, 2, 0, 0]} maxBarSize={24} />
              <Tooltip formatter={v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)} %` : '–'} labelFormatter={v => `${v}`} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Nokkeltal({ label, verdi }) {
  return (
    <div className="nokkeltal-kort">
      <span className="nk-label">{label}</span>
      <span className="nk-verdi num">{verdi}</span>
    </div>
  )
}

function GrafTooltip({ active, payload, label, modus, farge, pinnetNavn }) {
  if (!active || !payload?.length) return null
  const fmt = v => formatVerdi(v, modus)
  const row = payload[0]?.payload ?? {}
  return (
    <div className="graf-tooltip panel">
      <div className="tt-aar">{label}</div>
      {row.erPrognose && <div className="tt-prognose">prognose</div>}
      <div className="tt-rad">
        <span className="tt-dot" style={{ background: farge }} />
        <span>Regnskap</span>
        <span className="num">{fmt(row.areaRegnskap ?? row.regnskapPrognose)}</span>
      </div>
      <div className="tt-rad">
        <span className="tt-dot" style={{ background: '#b08c3a' }} />
        <span>Saldert</span>
        <span className="num">{fmt(row.saldert)}</span>
      </div>
      {row.revidert != null && (
        <div className="tt-rad">
          <span className="tt-dot" style={{ background: '#9ca3af' }} />
          <span>Revidert</span>
          <span className="num">{fmt(row.revidert)}</span>
        </div>
      )}
      {row.sammenlign != null && (
        <div className="tt-rad">
          <span className="tt-dot" style={{ background: '#3b6ea5' }} />
          <span>{pinnetNavn ?? 'Sammenligning'}</span>
          <span className="num">{fmt(row.sammenlign)}</span>
        </div>
      )}
    </div>
  )
}
