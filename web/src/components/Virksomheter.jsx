import React, { useMemo } from 'react'
import { formatMillKr } from '../lib/format'
import './Virksomheter.css'

/**
 * «Hvem bruker pengene» — virksomhetsfordeling på en post.
 * Vises kun når fokusnoden er en post og detaljene har virksomhetsdata.
 */
export default function Virksomheter({ node, detaljer, valgtAar, side }) {
  const virk = detaljer?.virksomheter?.[valgtAar]

  const rader = useMemo(() => {
    if (!virk) return []
    return Object.entries(virk)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => Math.abs(b.belop) - Math.abs(a.belop))
  }, [virk])

  if (!node || node.niva !== 'post') return null
  if (!rader.length) return null

  const total = rader.reduce((s, r) => s + r.belop, 0)

  return (
    <section className="panel virk-panel">
      <div className="virk-header">
        <p className="virk-tittel">Hvem bruker pengene</p>
        <p className="virk-sub">{node.navn} · {valgtAar}</p>
      </div>
      <div className="virk-liste">
        {rader.map(r => {
          const andel = total !== 0 ? (r.belop / total) * 100 : 0
          return (
            <div key={r.id} className={`virk-rad ${r.id === '_ovrige' ? 'virk-ovrige' : ''}`}>
              <div className="virk-bar-wrapper">
                <div className={`virk-bar virk-bar--${side === 'utgifter' ? 'rust' : 'teal'}`}
                  style={{ width: `${Math.min(Math.abs(andel), 100)}%` }} />
              </div>
              <div className="virk-innhold">
                <span className="virk-navn">{r.navn}</span>
                <span className="virk-andel">{Math.abs(andel).toFixed(1)} %</span>
                <span className="virk-belop num">{formatMillKr(r.belop)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
