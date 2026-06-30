import React, { useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Bar
} from 'recharts'
import { byggTidsserie, byggYoY, perInnbygger } from '../lib/data'
import { formatMillKr, formatAvvik, formatCAGR, formatTotalEndring } from '../lib/format'
import './Historikkgraf.css'

const RUST = '#b84c2e'
const TEAL = '#0d7c6e'
const GOLD = '#b08c3a'
const TEAL_LIGHT = '#e6f4f1'
const RUST_LIGHT = '#fdf0ec'

export default function Historikkgraf({ node, years, budsjettAar, perPerson, befolkning, side }) {
  const alle = useMemo(() => {
    if (!node?.serier) return []
    const extraYears = budsjettAar > Math.max(...years) ? [...years, budsjettAar] : years
    return byggTidsserie(node, extraYears)
  }, [node, years, budsjettAar])

  const sisteRegnskapsAar = Math.max(...years)

  const data = useMemo(() => {
    return alle.map(d => {
      const scale = v => {
        if (v == null) return null
        return perPerson ? perInnbygger(v, befolkning, d.aar) : v
      }
      const erPrognose = d.aar > sisteRegnskapsAar
      return {
        aar: d.aar,
        regnskap: erPrognose ? null : scale(d.regnskap),
        regnskapPrognose: erPrognose ? scale(d.saldert) : null,
        saldert: scale(d.saldert),
        revidert: d.revidert !== d.saldert ? scale(d.revidert) : null,
        erPrognose,
      }
    })
  }, [alle, perPerson, befolkning, sisteRegnskapsAar])

  // For area: legg til broen (siste regnskapsår → prognoseår)
  const dataForArea = useMemo(() => {
    return data.map((d, i) => {
      if (!d.erPrognose) return { ...d, areaRegnskap: d.regnskap }
      // Prognose: vis ingenting i area
      return { ...d, areaRegnskap: null }
    })
  }, [data])

  const yoyData = useMemo(() => {
    const regnskapsData = alle.filter(d => d.aar <= sisteRegnskapsAar)
    return byggYoY(regnskapsData)
  }, [alle, sisteRegnskapsAar])

  const regnskapsSerier = alle.filter(d => d.aar <= sisteRegnskapsAar && d.regnskap != null)
  const forsteReg = regnskapsSerier[0]?.regnskap
  const sisteReg = regnskapsSerier[regnskapsSerier.length - 1]?.regnskap
  const antallRegAar = regnskapsSerier.length - 1

  const sisteSaldert = alle.find(d => d.aar === sisteRegnskapsAar)?.saldert
  const avvik = formatAvvik(sisteReg, sisteSaldert)
  const cagr = formatCAGR(forsteReg, sisteReg, antallRegAar)
  const endring = formatTotalEndring(forsteReg, sisteReg)

  const farge = side === 'utgifter' ? RUST : TEAL
  const flate = side === 'utgifter' ? RUST_LIGHT : TEAL_LIGHT

  const formatYAxis = v => {
    if (v == null) return ''
    if (perPerson) return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(v))
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + ' mrd'
    return v.toFixed(0)
  }

  if (!node || alle.length === 0) return (
    <div className="historikk-tom">
      <p>Velg en post i hierarkiet for å se historikk</p>
    </div>
  )

  return (
    <div className="historikk">
      <div className="historikk-header">
        <h3 className="historikk-tittel">{node.navn}</h3>
        {node.tag && <span className="historikk-tag">{node.tag}</span>}
      </div>

      {/* Hovvedgraf: regnskap + budsjettlinjer */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={dataForArea} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={farge} stopOpacity={0.15} />
              <stop offset="95%" stopColor={farge} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="aar"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip content={<GrafTooltip perPerson={perPerson} farge={farge} />} />

          {/* Flate: regnskapstall */}
          <Area
            type="monotone"
            dataKey="areaRegnskap"
            stroke={farge}
            strokeWidth={2}
            fill="url(#areaGrad)"
            dot={false}
            activeDot={{ r: 4, fill: farge }}
            connectNulls={false}
            name="Regnskap"
          />

          {/* Stiplet forlengelse: prognoseår */}
          <Line
            type="monotone"
            dataKey="regnskapPrognose"
            stroke={farge}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 4, fill: 'white', stroke: farge, strokeWidth: 2 }}
            connectNulls={false}
            name="Prognose (saldert)"
          />

          {/* Saldert budsjett: prikket linje */}
          <Line
            type="monotone"
            dataKey="saldert"
            stroke={GOLD}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            activeDot={false}
            name="Saldert budsjett"
          />

          {/* Revidert budsjett hvis avviker */}
          <Line
            type="monotone"
            dataKey="revidert"
            stroke="#9ca3af"
            strokeWidth={1}
            strokeDasharray="2 4"
            dot={false}
            activeDot={false}
            name="Revidert budsjett"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Avvik og nøkkeltall */}
      {avvik && (
        <p className="avvik-tekst">{avvik}</p>
      )}

      <div className="nokkeltal">
        {cagr && <Nokkeltal label={`CAGR ${years[0]}–${sisteRegnskapsAar}`} verdi={cagr} />}
        {endring && <Nokkeltal label="Total endring" verdi={endring} />}
      </div>

      {/* Y/Y-vekststripe */}
      {yoyData.length > 1 && (
        <div className="yoy-seksjon">
          <p className="yoy-label">År/år-vekst (regnskap)</p>
          <ResponsiveContainer width="100%" height={60}>
            <ComposedChart data={yoyData} margin={{ top: 4, right: 16, bottom: 0, left: 52 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="aar" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Bar
                dataKey="yoy"
                fill={farge}
                radius={[2, 2, 0, 0]}
                maxBarSize={24}
                label={false}
              />
              <Tooltip
                formatter={(v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)} %` : '–'}
                labelFormatter={v => `${v}`}
              />
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

function GrafTooltip({ active, payload, label, perPerson, farge }) {
  if (!active || !payload?.length) return null

  const fmt = v => v == null ? '–' : perPerson
    ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' kr'
    : formatMillKr(v)

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
    </div>
  )
}
