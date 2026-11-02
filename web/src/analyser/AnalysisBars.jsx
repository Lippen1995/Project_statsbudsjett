import React from 'react'
import { number } from './model'
import { plotScale } from './analysis-plot'

export const analysisColors = ['#C5452E', '#14594F', '#858077', '#715196', '#B07712']

export { plotScale as integerScale } from './analysis-plot'
export default function AnalysisBars({ years, series, label, forecastFrom, chartType = 'bar', axis = 'zero' }) {
  const W = Math.max(540, years.length * Math.max(52, series.length * 18 + 18) + 86)
  const H = 290, left = 72, right = chartType === 'line' && series.length === 1 ? 68 : 18, top = 20, bottom = 38
  const { min, max, ticks } = plotScale(series.flatMap(s => s.values), chartType === 'bar' || axis !== 'focused')
  const step = (W - left - right) / years.length
  const x = i => left + step * (i + .5)
  const bar = Math.min(36, step * .76 / series.length)
  const y = v => top + (H - top - bottom) * (max - v) / (max - min)
  return <div className="an-bars-scroll" tabIndex={0} role="region" aria-label={`${label}. Alle år vises; grafen kan rulles vannrett på små skjermer.`}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W, width: '100%' }} role="img" aria-label={label}>
      <desc>{years.map((year, i) => `${year}: ${series.map(s => `${s.label} ${number(s.values[i], 2)}`).join(', ')}`).join('. ')}</desc>
      {ticks.map(t => <g key={t}>
        <line x1={left} x2={W-right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#858077' : '#E4DFD5'} />
        <text x={left-10} y={y(t)+4} textAnchor="end" fontSize="12" fill="#706A60">{number(t, 0)}</text>
      </g>)}
      {chartType === 'line' && series.map((s, j) => <g key={`line-${j}`}>
        {s.values.slice(1).map((v, i) => <line key={i} x1={x(i)} x2={x(i+1)} y1={y(s.values[i])} y2={y(v)} stroke={s.color ?? analysisColors[j]} strokeWidth="3"
          strokeDasharray={forecastFrom !== undefined && years[i+1] >= forecastFrom ? '5 4' : undefined} />)}
      </g>)}
      {axis === 'focused' && (min > 0 || max < 0) && <g stroke="#706A60" strokeWidth="1.5" aria-hidden="true">
        <path d={`M${left-4},${H-bottom-2} l8,-5 m-8,10 l8,-5`} />
      </g>}
      {years.map((year, i) => <g key={year}>
        {series.map((s, j) => chartType === 'line' ? <g key={j}>
          <circle cx={x(i)} cy={y(s.values[i])} r={i === years.length-1 ? 4.5 : 3} fill={s.color ?? analysisColors[j]} stroke="#FAF8F3" strokeWidth="1.5">
            <title>{`${year} · ${s.label}: ${number(s.values[i], 2)}`}</title>
          </circle>
          {series.length === 1 && i === years.length-1 && <text x={x(i)+10} y={y(s.values[i])+4} fontSize="12" fontWeight="600" fill={s.color ?? analysisColors[j]}>{number(s.values[i], 0)}</text>}
        </g> : <rect key={j} x={x(i) + (j-series.length/2)*bar} y={Math.min(y(0),y(s.values[i]))}
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
