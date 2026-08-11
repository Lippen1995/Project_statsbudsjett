import React, { useState } from 'react'
import SvgTekst from './SvgTekst'
import { BLEK, GRID, GRID_MORK, PAPIR, INK } from '../design'
import { belopMill } from '../tall'

/**
 * Linjegraf med valgfri hover-tooltip og dra-for-å-velge-periode.
 *
 * serier: [{ farge, punkter: [{v}], bredde, stiplet }] – ett punkt per år
 * tips:   (i) => { tittel, linjer: [{farge, tekst}] } slår på tooltip
 * velg:   (fraIdx, tilIdx) => void slår på periodevalg ved dra
 * fraNull: false lar y-aksen starte over null (for indeksgrafer)
 */
/**
 * anslagFra: indeks der tallene går fra å være målt til å være anslått. Området
 * fra og med der får en svak bakgrunn, og linjene tegnes stiplet, slik at en
 * prognose ikke kan leses som et utfall.
 */
export default function LinjeGraf({
  serier, aar, W = 356, H = 150, fraNull = true, aksefmt, tips, velg, mork = false,
  anslagFra = null,
}) {
  const [hover, setHover] = useState(null)
  const [dragg, setDragg] = useState(null)

  const ml = 44, mr = 8, mt = 10, mb = 20
  const alle = serier.flatMap((s) => s.punkter.map((p) => p.v)).filter((v) => v != null)
  if (!alle.length) return <div className="ft-graf-tom">Ingen data</div>

  const maks = Math.max(...alle, fraNull ? 0 : -Infinity)
  const min = fraNull
    ? Math.min(...alle, 0)
    : Math.min(...alle) - (Math.max(...alle) - Math.min(...alle)) * 0.15
  const x = (i, len) => ml + (len > 1 ? (i * (W - ml - mr)) / (len - 1) : 0)
  const y = (v) => mt + (H - mt - mb) * (1 - (v - min) / (maks - min || 1))

  const idxFra = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const steg = (W - ml - mr) / Math.max(1, aar.length - 1)
    return Math.max(0, Math.min(aar.length - 1, Math.round((px - ml) / steg)))
  }

  const svgProps = {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    style: { display: 'block', overflow: 'visible' },
  }
  if (velg) {
    svgProps.style = { ...svgProps.style, cursor: 'crosshair', userSelect: 'none' }
    svgProps.onMouseDown = (e) => { e.preventDefault(); const i = idxFra(e); setDragg({ a: i, b: i }) }
    // Indeksen må leses ut av hendelsen med én gang. Inne i en setState-
    // oppdaterer kjører koden først ved neste render, og da har React nullet
    // ut currentTarget – som felte hele treet midt i et dra.
    svgProps.onMouseMove = (e) => {
      if (!dragg) return
      const i = idxFra(e)
      setDragg((d) => (d ? { ...d, b: i } : d))
    }
    svgProps.onMouseLeave = () => setDragg(null)
    svgProps.onMouseUp = () => {
      if (!dragg) return
      const a = Math.min(dragg.a, dragg.b), b = Math.max(dragg.a, dragg.b)
      setDragg(null)
      setHover(null)
      if (b - a >= 1) velg(a, b)
    }
  }

  const info = hover != null && tips ? tips(hover) : null
  const linjer = info ? info.linjer.filter(Boolean) : []
  const boksB = info ? Math.max(info.tittel.length, ...linjer.map((l) => l.tekst.length)) * 6.4 + 26 : 0
  const boksH = 22 + linjer.length * 16
  const hx = hover != null ? x(hover, aar.length) : 0
  const bx = hx + boksB + 14 > W ? hx - boksB - 12 : hx + 12

  return (
    <svg {...svgProps}>
      {/* Rutenett med verdiakse */}
      {[0, 1, 2, 3].map((g) => {
        const v = min + ((maks - min) * g) / 3
        return (
          <g key={`g${g}`}>
            <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke={mork ? GRID_MORK : GRID} strokeWidth={1} />
            <SvgTekst x={ml - 6} y={y(v) + 3} size={9} fill={BLEK} anchor="end">
              {aksefmt ? aksefmt(v) : belopMill(v)}
            </SvgTekst>
          </g>
        )
      })}

      {/* Valgt periode, tegnet under linjene */}
      {dragg && (
        <rect
          x={x(Math.min(dragg.a, dragg.b), aar.length)}
          y={mt}
          width={Math.max(1, x(Math.max(dragg.a, dragg.b), aar.length) - x(Math.min(dragg.a, dragg.b), aar.length))}
          height={H - mt - mb}
          fill={mork ? 'rgba(227,178,60,.18)' : 'rgba(199,70,46,.14)'}
          stroke={mork ? '#E3B23C' : '#C7462E'}
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Anslagsområdet, tegnet under linjene */}
      {anslagFra != null && anslagFra > 0 && anslagFra < aar.length && (
        <g style={{ pointerEvents: 'none' }}>
          <rect
            x={x(anslagFra - 0.5, aar.length)}
            y={mt}
            width={Math.max(0, W - mr - x(anslagFra - 0.5, aar.length))}
            height={H - mt - mb}
            fill={mork ? 'rgba(247,245,240,.05)' : 'rgba(20,22,26,.045)'}
          />
          <line
            x1={x(anslagFra - 0.5, aar.length)} x2={x(anslagFra - 0.5, aar.length)}
            y1={mt} y2={H - mb}
            stroke={mork ? '#5A5C63' : '#C9C4BA'} strokeWidth={1} strokeDasharray="2 3"
          />
        </g>
      )}

      {serier.map((s, si) => {
        // Punktene beholder sin indeks, så anslagsgrensen treffer riktig år selv
        // om serien har hull
        const pts = s.punkter
          .map((p, i) => (p.v == null ? null : { i, xy: [x(i, s.punkter.length), y(p.v)] }))
          .filter(Boolean)
        if (!pts.length) return null
        const bane = (liste) =>
          'M' + liste.map((p) => `${p.xy[0].toFixed(1)},${p.xy[1].toFixed(1)}`).join('L')
        const grense = anslagFra == null ? pts.length : pts.findIndex((p) => p.i >= anslagFra)
        const malt = grense < 0 ? pts : pts.slice(0, grense)
        // Anslagsdelen starter på siste målte punkt, så linjen ikke får et brudd
        const anslag = grense < 0 ? [] : pts.slice(Math.max(0, grense - 1))
        const felles = {
          fill: 'none',
          stroke: s.farge,
          strokeWidth: s.bredde ?? 2,
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
          style: { animation: `ftTonInn .8s ${120 + si * 130}ms ease both` },
        }
        const siste = pts[pts.length - 1].xy
        return (
          <g key={`l${si}`}>
            {malt.length > 1 && (
              <path d={bane(malt)} {...felles} strokeDasharray={s.stiplet ? '4 3' : undefined} />
            )}
            {anslag.length > 1 && <path d={bane(anslag)} {...felles} strokeDasharray="3 3" />}
            <circle cx={siste[0]} cy={siste[1]} r={3} fill={s.farge} />
          </g>
        )
      })}

      {/* Årsakse – bare hvert n-te år, så labelene ikke kolliderer */}
      {aar.map((a, i) =>
        i % Math.ceil(aar.length / 5) === 0 || i === aar.length - 1 ? (
          <SvgTekst
            key={`x${a}`}
            x={x(i, aar.length)}
            y={H - 4}
            size={9}
            fill={BLEK}
            anchor={i === 0 ? 'start' : i === aar.length - 1 ? 'end' : 'middle'}
          >
            {a}
          </SvgTekst>
        ) : null
      )}

      {/* Usynlige hover-bånd, ett per år */}
      {tips &&
        aar.map((a, i) => {
          const bandW = (W - ml - mr) / Math.max(1, aar.length - 1)
          return (
            <rect
              key={`hv${i}`}
              x={x(i, aar.length) - bandW / 2}
              y={mt}
              width={bandW}
              height={H - mt - mb}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}

      {info && (
        <>
          <line x1={hx} x2={hx} y1={mt} y2={H - mb} stroke={mork ? '#5A5C63' : '#B4B0A8'} strokeWidth={1} strokeDasharray="3 3" />
          {serier.map((s, si) => {
            const v = s.punkter[hover]?.v
            return v == null ? null : (
              <circle key={`hp${si}`} cx={hx} cy={y(v)} r={4} fill={s.farge} stroke={mork ? INK : '#FFFDF9'} strokeWidth={2} />
            )
          })}
          <g style={{ pointerEvents: 'none' }}>
            <rect x={bx} y={mt + 4} width={boksB} height={boksH} rx={4} fill={mork ? '#22242A' : INK} opacity={0.97} />
            <SvgTekst x={bx + 11} y={mt + 20} size={11} weight={700} fill={PAPIR}>{info.tittel}</SvgTekst>
            {linjer.map((l, li) => (
              <g key={`tl${li}`}>
                <rect x={bx + 11} y={mt + 30 + li * 16} width={8} height={2} fill={l.farge} />
                <SvgTekst x={bx + 25} y={mt + 35 + li * 16} size={11} fill="#D8D4CC">{l.tekst}</SvgTekst>
              </g>
            ))}
          </g>
        </>
      )}
    </svg>
  )
}
