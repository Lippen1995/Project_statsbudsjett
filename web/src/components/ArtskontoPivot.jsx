import React, { useState, useMemo } from 'react'
import './ArtskontoPivot.css'
import { formatMillKr } from '../lib/format'

export default function ArtskontoPivot({ node, valgtAar, side }) {
  const [åpneKlasser, setÅpneKlasser] = useState(new Set())

  const artskonto = node?.artskonto?.[valgtAar]
  const harData = artskonto && Object.keys(artskonto).length > 0

  const grupper = useMemo(() => {
    if (!artskonto) return []
    const g = {}
    for (const [ak, data] of Object.entries(artskonto)) {
      // Kontoklasse-id og -navn kommer fra de faktiske regnskapsradene
      const klasse = data.klasse ?? ak[0] ?? '?'
      if (!g[klasse]) g[klasse] = { klasse, navn: data.klasseNavn ?? `Klasse ${klasse}`, poster: [], total: 0 }
      g[klasse].poster.push({ ak, navn: data.navn, belop: data.belop })
      g[klasse].total += data.belop
    }
    return Object.values(g)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .map(g => ({ ...g, poster: g.poster.sort((a, b) => Math.abs(b.belop) - Math.abs(a.belop)) }))
  }, [artskonto])

  const totalArtskonto = grupper.reduce((s, g) => s + g.total, 0)

  const toggleKlasse = (klasse) => {
    setÅpneKlasser(prev => {
      const next = new Set(prev)
      if (next.has(klasse)) next.delete(klasse)
      else next.add(klasse)
      return next
    })
  }

  if (!node) return (
    <div className="artskonto-tom">
      <p className="pivot-header-tittel">Artskonto</p>
      <p className="tom-tekst">Velg en post for å se artskontofordeling</p>
    </div>
  )

  if (node.niva !== 'post') return (
    <div className="artskonto-tom">
      <p className="pivot-header-tittel">Artskonto</p>
      <p className="tom-tekst">Bare tilgjengelig på postnivå</p>
    </div>
  )

  if (!harData) return (
    <div className="artskonto-tom">
      <p className="pivot-header-tittel">Artskonto – {node.navn}</p>
      <p className="tom-tekst">Ingen artskonto-data for {valgtAar}</p>
    </div>
  )

  return (
    <div className="artskonto">
      <div className="pivot-header">
        <p className="pivot-header-tittel">Artskonto</p>
        <p className="pivot-header-sub">{node.navn} · {valgtAar}</p>
      </div>

      <div className="pivot-liste">
        {grupper.map(g => {
          const andel = totalArtskonto > 0 ? (g.total / totalArtskonto) * 100 : 0
          const aapen = åpneKlasser.has(g.klasse)
          return (
            <div key={g.klasse} className="pivot-gruppe">
              <button
                className="pivot-gruppe-header"
                onClick={() => toggleKlasse(g.klasse)}
                aria-expanded={aapen}
              >
                <div className="pivot-bar-wrapper">
                  <div
                    className={`pivot-bar pivot-bar--${side === 'utgifter' ? 'rust' : 'teal'}`}
                    style={{ width: `${Math.min(andel, 100)}%` }}
                  />
                </div>
                <div className="pivot-gruppe-rad">
                  <span className="pg-kode num">{g.klasse}xxx</span>
                  <span className="pg-navn">{g.navn}</span>
                  <span className="pg-andel">{andel.toFixed(1)} %</span>
                  <span className="pg-belop num">{formatMillKr(g.total)}</span>
                  <span className="pg-pil">{aapen ? '▾' : '▸'}</span>
                </div>
              </button>

              {aapen && (
                <div className="pivot-detaljer">
                  {g.poster.map(p => (
                    <div key={p.ak} className="pivot-post">
                      <span className="pp-ak num">{p.ak}</span>
                      <span className="pp-navn">{p.navn}</span>
                      <span className="pp-belop num">{formatMillKr(p.belop)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
