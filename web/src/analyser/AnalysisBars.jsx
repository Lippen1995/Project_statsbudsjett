import React from 'react'
import { number } from './model'

export const analysisColors = ['#C5452E', '#14594F', '#858077', '#715196', '#B07712']

// Integer ticks share one scale; zero is always visible and small ranges never
// produce repeated labels. Values retain their precision in titles and tables.
export function integerScale(values) {
  const low = Math.min(0, ...values), high = Math.max(0, ...values)
  const raw = (high - low || 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 5, 10].find(n => n * magnitude >= raw) * magnitude)
  const min = Math.floor(low / step) * step
  const max = Math.max(min + step, Math.ceil(high / step) * step)
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step) }
}

export default function AnalysisBars({ years, series, label, forecastFrom }) {
  const W = Math.max(540, years.length * Math.max(52, series.length * 18 + 18) + 86)
  const H = 290, left = 72, right = 14, top = 20, bottom = 38
  const { min, max, ticks } = integerScale(series.flatMap(s => s.values))
  const step = (W - left - right) / years.length
  const bar = Math.min(36, step * .76 / series.length)
  const y = v => top + (H - top - bottom) * (max - v) / (max - min)
  return <div className="an-bars-scroll" tabIndex={0} role="region" aria-label={`${label}. Alle år vises; grafen kan rulles vannrett på små skjermer.`}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W, width: '100%' }} role="img" aria-label={label}>
      <desc>{years.map((year, i) => `${year}: ${series.map(s => `${s.label} ${number(s.values[i], 2)}`).join(', ')}`).join('. ')}</desc>
      {ticks.map(t => <g key={t}>
        <line x1={left} x2={W-right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#858077' : '#E4DFD5'} />
        <text x={left-10} y={y(t)+4} textAnchor="end" fontSize="12" fill="#706A60">{number(t, 0)}</text>
      </g>)}
      {years.map((year, i) => <g key={year}>
        {series.map((s, j) => <rect key={j} x={left + step*(i+.5) + (j-series.length/2)*bar} y={Math.min(y(0),y(s.values[i]))}
          width={bar*.88} height={Math.abs(y(s.values[i])-y(0))} fill={s.color ?? analysisColors[j]}
          fillOpacity={forecastFrom !== undefined && year >= forecastFrom ? .45 : 1}
          stroke={forecastFrom !== undefined && year >= forecastFrom ? s.color ?? analysisColors[j] : 'none'}
          strokeDasharray={forecastFrom !== undefined && year >= forecastFrom ? '3 2' : undefined}>
          <title>{`${year} · ${s.label}: ${number(s.values[i], 2)}`}</title>
        </rect>)}
        <text x={left+step*(i+.5)} y={H-12} textAnchor="middle" fontSize="12" fill="#706A60">{year}</text>
      </g>)}
    </svg>
  </div>
}
