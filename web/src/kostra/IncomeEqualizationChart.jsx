import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { expenseEqualizationChartRows, incomeEqualizationChartRows } from './model'

const W = 520
const H = 300
const MARGIN = { top: 22, right: 18, bottom: 48, left: 45 }
const RUST = '#C5452E'
const INK = '#191918'
const MUTED = '#8A8178'
const GRID = '#DED8CE'
const TOOLTIP_GAP = 12
const VIEWPORT_MARGIN = 8
const kr = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })
const CHART_COPY = {
  income: {
    title: 'Skatt før og etter utjevning',
    description: 'Hvert punkt er en kommune. Punkter over diagonalen får tillegg; punkter under får trekk.',
    aria: 'Skatt per innbygger før og etter inntektsutjevning',
    equalizationLabel: 'Netto utjevning',
  },
  expense: {
    title: 'Illustrert finansieringsbehov før og etter utjevning',
    description: 'Netto driftsutgifter er utgangspunktet. Utjevningen endrer finansieringen, ikke kommunens rapporterte utgifter.',
    aria: 'Illustrert finansieringsbehov per innbygger før og etter utgiftsutjevning',
    equalizationLabel: 'Utgiftsutjevning',
  },
}

function axisLabel(value) {
  return `${Math.round(value / 1000)}k`
}

export default function IncomeEqualizationChart({ index, year, selectedEntityId, selectedName }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)
  const [chartType, setChartType] = useState('income')
  const [hovered, setHovered] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState(null)
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!hovered || !tooltip) {
      setTooltipPosition(null)
      return
    }
    const rect = tooltip.getBoundingClientRect()
    let left = hovered.clientX + TOOLTIP_GAP
    let top = hovered.clientY + TOOLTIP_GAP
    if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = hovered.clientX - TOOLTIP_GAP - rect.width
    }
    if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = hovered.clientY - TOOLTIP_GAP - rect.height
    }
    setTooltipPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - rect.width - VIEWPORT_MARGIN)),
      top: Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - rect.height - VIEWPORT_MARGIN)),
    })
  }, [hovered])
  const incomeRows = incomeEqualizationChartRows(index, year, selectedEntityId)
  const expenseRows = expenseEqualizationChartRows(index, year, selectedEntityId)
  const effectiveChartType = chartType === 'expense' && expenseRows.length > 0 ? 'expense' : 'income'
  const rows = effectiveChartType === 'expense' ? expenseRows : incomeRows
  const copy = CHART_COPY[effectiveChartType]
  if (rows.length === 0) return null

  const values = rows.flatMap((row) => [row.before, row.after])
  const step = 10_000
  const min = Math.floor(Math.min(...values) / step) * step
  const max = Math.ceil(Math.max(...values) / step) * step
  const plotWidth = W - MARGIN.left - MARGIN.right
  const plotHeight = H - MARGIN.top - MARGIN.bottom
  const x = (value) => MARGIN.left + (value - min) / (max - min) * plotWidth
  const y = (value) => MARGIN.top + (max - value) / (max - min) * plotHeight
  const ticks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4)
  const selected = rows.find((row) => row.selected)
  const active = hovered?.row ?? null

  function showNearest(event) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const pointerX = (event.clientX - rect.left) / rect.width * W
    const pointerY = (event.clientY - rect.top) / rect.height * H
    const nearest = rows.reduce((best, row) => {
      const distance = Math.hypot(x(row.before) - pointerX, y(row.after) - pointerY)
      return !best || distance < best.distance ? { row, distance } : best
    }, null)
    setHovered(nearest?.distance <= 11
      ? { row: nearest.row, clientX: event.clientX, clientY: event.clientY }
      : null)
  }

  function selectChart(nextType) {
    setChartType(nextType)
    setHovered(null)
  }

  return (
    <figure className="ko-utjevninggraf">
      <div className="ko-utjevninggrafhode">
        <figcaption>
          <strong>{copy.title}</strong>
          <span>{copy.description}</span>
        </figcaption>
        <div className="ft-bytter ko-utjevninggrafvelger" role="group" aria-label="Velg utjevningsgraf">
          <button type="button" className={`ft-bytte ${effectiveChartType === 'income' ? 'aktiv' : ''}`} aria-pressed={effectiveChartType === 'income'} onClick={() => selectChart('income')}>Inntekter</button>
          <button type="button" className={`ft-bytte ${effectiveChartType === 'expense' ? 'aktiv' : ''}`} aria-pressed={effectiveChartType === 'expense'} disabled={expenseRows.length === 0} onClick={() => selectChart('expense')}>Finansieringsbehov</button>
        </div>
      </div>
      <div
        className="ko-utjevninggrafplot"
        role="img"
        aria-label={`${copy.aria} for ${rows.length} kommuner i ${year}. ${selectedName} er markert.`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          onPointerMove={showNearest}
          onPointerLeave={() => setHovered(null)}
          aria-hidden="true"
        >
          {ticks.map((tick) => <g key={tick}>
            <line x1={MARGIN.left} x2={W - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke={GRID} />
            <text x={MARGIN.left - 7} y={y(tick) + 3} textAnchor="end" fill={MUTED} fontSize="9">{axisLabel(tick)}</text>
            <text x={x(tick)} y={H - MARGIN.bottom + 17} textAnchor="middle" fill={MUTED} fontSize="9">{axisLabel(tick)}</text>
          </g>)}
          <line x1={x(min)} y1={y(min)} x2={x(max)} y2={y(max)} stroke={MUTED} strokeDasharray="3 4" />
          {rows.filter((row) => !row.selected).map((row) => (
            <circle key={row.id} cx={x(row.before)} cy={y(row.after)} r="2.8" fill={MUTED} opacity={active?.id === row.id ? 1 : .48}>
              <title>{row.name}</title>
            </circle>
          ))}
          {selected && <g>
            <circle cx={x(selected.before)} cy={y(selected.after)} r="9" fill="none" stroke={RUST} strokeWidth="1.5" opacity=".35" />
            <circle cx={x(selected.before)} cy={y(selected.after)} r="4.5" fill={RUST} stroke="#FAF8F3" strokeWidth="1.5"><title>{selected.name}</title></circle>
            <text x={x(selected.before) + 9} y={y(selected.after) - 8} fill={INK} fontSize="10" fontWeight="700">{selected.name}</text>
          </g>}
          <text x={MARGIN.left} y="11" fill={MUTED} fontSize="9">Etter utjevning</text>
          <text x={MARGIN.left + plotWidth / 2} y={H - 9} textAnchor="middle" fill={MUTED} fontSize="9">Før utjevning · kr per innbygger</text>
        </svg>
        {active && createPortal(<div
          ref={tooltipRef}
          className="ko-utjevningtooltip"
          style={{
            left: `${tooltipPosition?.left ?? VIEWPORT_MARGIN}px`,
            top: `${tooltipPosition?.top ?? VIEWPORT_MARGIN}px`,
            visibility: tooltipPosition ? 'visible' : 'hidden',
          }}
          aria-live="polite"
        >
          <strong>{active.name}</strong>
          <span>Før utjevning <b>{kr.format(active.before)} kr</b></span>
          <span>Etter utjevning <b>{kr.format(active.after)} kr</b></span>
          <span>{copy.equalizationLabel} <b>{active.equalization > 0 ? '+' : active.equalization < 0 ? '−' : ''}{kr.format(Math.abs(active.equalization))} kr</b></span>
        </div>, document.body)}
      </div>
      <div className="ko-utjevninggraflegend" aria-hidden="true">
        <span><i />Andre kommuner</span>
        <span><i className="valgt" />{selectedName}</span>
      </div>
    </figure>
  )
}
