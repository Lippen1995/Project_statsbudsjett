import React from 'react'
import { INK } from '../design'

/**
 * Tekst i en SVG-graf. Tar aldri imot pekerhendelser, slik at labels ikke
 * stjeler hover fra flatene under seg.
 */
export default function SvgTekst({
  x, y, children, fill = INK, size = 11, weight = 500,
  anchor = 'start', baseline, serif = false,
}) {
  return (
    <text
      x={x} y={y} fill={fill} fontSize={size} fontWeight={weight}
      textAnchor={anchor} dominantBaseline={baseline}
      style={{
        fontFamily: serif ? "'Playfair Display', serif" : "'Libre Franklin', sans-serif",
        fontVariantNumeric: 'tabular-nums',
        pointerEvents: 'none',
      }}
    >
      {children}
    </text>
  )
}

/** Forkort en label som ikke får plass, med ellipse */
export const kutt = (tekst, maks) =>
  String(tekst ?? '').length > maks ? String(tekst).slice(0, maks) + '…' : String(tekst ?? '')
