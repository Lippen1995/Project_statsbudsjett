import React, { useId } from 'react'
import { number } from './model'
import { plotScale, periodChange } from './analysis-plot'

export const analysisColors = ['#C5452E', '#14594F', '#858077', '#715196', '#B07712']

export { plotScale as integerScale } from './analysis-plot'
export default function AnalysisBars({ years, series, label, forecastFrom, chartType = 'bar', axis = 'zero', annotation, activeSeries = 0 }) {
  const markerId = `period-arrow-${useId().replace(/:/g, '')}`
  const selected = series[activeSeries] ?? series[0]
  const growth = annotation === 'period-change' ? periodChange(selected.values) : null
  const signedGrowth = growth === null ? null : `${growth > 0 ? '+' : ''}${number(growth, 1)} %`
  const arrowColor = chartType === 'bar' ? '#14161A' : selected.color ?? analysisColors[activeSeries]
  const W = Math.max(540, years.length * Math.max(52, series.length * 18 + 18) + 86)
  const H = 290, left = 72, right = chartType === 'line' && series.length === 1 ? 68 : 18, top = 20, bottom = 38
  const { min, max, ticks } = plotScale(series.flatMap(s => s.values), chartType === 'bar' || axis !== 'focused')
  const step = (W - left - right) / years.length
  const x = i => left + step * (i + .5)
  const bar = Math.min(36, step * .76 / series.length)
  const y = v => top + (H - top - bottom) * (max - v) / (max - min)
  const first = { x: x(0), y: y(selected.values[0]) }
  const last = { x: x(years.length-1), y: y(selected.values.at(-1)) }
  const distance = Math.hypot(last.x-first.x, last.y-first.y) || 1
  const offset = { x: -(last.y-first.y)/distance, y: (last.x-first.x)/distance }
  const arrow = { x1: first.x+offset.x*12, y1: first.y+offset.y*12, x2: last.x+offset.x*12, y2: last.y+offset.y*12 }
  const badge = { x: (first.x+last.x)/2+offset.x*30, y: (first.y+last.y)/2+offset.y*30 }
  return <div className="an-bars-scroll" tabIndex={0} role="region" aria-label={`${label}. Alle år vises; grafen kan rulles vannrett på små skjermer.`}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W, width: '100%' }} role="img" aria-label={label}>
      <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={arrowColor} />
      </marker></defs>
      <desc>{years.map((year, i) => `${year}: ${series.map(s => `${s.label} ${number(s.values[i], 2)}`).join(', ')}`).join('. ')}</desc>
      {ticks.map(t => <g key={t}>
        <line x1={left} x2={W-right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#858077' : '#E4DFD5'} />
        <text x={left-10} y={y(t)+4} textAnchor="end" fontSize="12" fill="#706A60">{number(t, 0)}</text>
      </g>)}
      {chartType === 'line' && series.map((s, j) => <g key={`line-${j}`} opacity={annotation && j !== activeSeries ? .38 : 1}>
        {s.values.slice(1).map((v, i) => <line key={i} x1={x(i)} x2={x(i+1)} y1={y(s.values[i])} y2={y(v)} stroke={s.color ?? analysisColors[j]} strokeWidth="3"
          strokeDasharray={forecastFrom !== undefined && years[i+1] >= forecastFrom ? '5 4' : undefined} />)}
      </g>)}
      {axis === 'focused' && (min > 0 || max < 0) && <g stroke="#706A60" strokeWidth="1.5" aria-hidden="true">
        <path d={`M${left-4},${H-bottom-2} l8,-5 m-8,10 l8,-5`} />
      </g>}
      {years.map((year, i) => <g key={year}>
        {series.map((s, j) => chartType === 'line' ? <g key={j}>
          <circle cx={x(i)} cy={y(s.values[i])} r={i === years.length-1 ? 4.5 : 3} fill={s.color ?? analysisColors[j]} stroke="#FAF8F3" strokeWidth="1.5" opacity={annotation && j !== activeSeries ? .38 : 1}>
            <title>{`${year} · ${s.label}: ${number(s.values[i], 2)}`}</title>
          </circle>

        </g> : <rect key={j} x={x(i) + (j-series.length/2)*bar} y={Math.min(y(0),y(s.values[i]))}
          width={bar*.88} height={Math.abs(y(s.values[i])-y(0))} fill={s.color ?? analysisColors[j]}
          fillOpacity={forecastFrom !== undefined && year >= forecastFrom ? .45 : 1}
          stroke={forecastFrom !== undefined && year >= forecastFrom ? s.color ?? analysisColors[j] : 'none'}
          strokeDasharray={forecastFrom !== undefined && year >= forecastFrom ? '3 2' : undefined}>
          <title>{`${year} · ${s.label}: ${number(s.values[i], 2)}`}</title>
        </rect>)}
        <text x={left+step*(i+.5)} y={H-12} textAnchor="middle" fontSize="12" fill="#706A60">{year}</text>
      </g>)}
      {growth !== null && <g className="an-period-arrow" pointerEvents="none" aria-label={`${selected.label}: ${signedGrowth} fra ${years[0]} til ${years.at(-1)}`}>
        <title>{`${selected.label}: ${signedGrowth} fra ${years[0]} til ${years.at(-1)}. Samlet endring, ikke årlig vekst.`}</title>
        <line {...arrow} stroke={arrowColor} strokeWidth="1.8" strokeDasharray="5 4" markerEnd={`url(#${markerId})`} />
        <rect x={badge.x-42} y={badge.y-12} width="84" height="25" rx="12" fill="#FAF8F3" stroke={arrowColor} strokeOpacity=".25" />
        <text x={badge.x} y={badge.y+5} textAnchor="middle" fontSize="14" fontWeight="700" fill={arrowColor}>{signedGrowth}</text>
      </g>}
    </svg>
  </div>
}
