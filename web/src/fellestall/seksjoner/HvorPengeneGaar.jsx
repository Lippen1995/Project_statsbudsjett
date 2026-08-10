import React from 'react'
import { OMTALE, visNavn } from '../design'
import { perInnbygger } from '../kompakt'
import { belopMill, kr, pct } from '../tall'

/**
 * Utgiftene rangert, omregnet til kroner per innbygger. Søylebredden er relativ
 * til det største området, ikke til totalen – ellers ville de minste radene bli
 * usynlige striper.
 */
export default function HvorPengeneGaar({ utg, totalUtg, folk, aar, onAapneUtforsk }) {
  const storst = utg.length ? utg[0].mill : 0

  return (
    <section id="utgifter" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstopp ft-seksjonstopp--bunn">
        <div className="ft-seksjonstekst">
          <h2>Hvor pengene går</h2>
          <p>Utgifter i {aar}, omregnet til kroner per innbygger. Klikk for å utforske området.</p>
        </div>
        <div className="ft-hoyrestilt">
          <div className="ft-stikkord">Totalt per innbygger</div>
          <div className="ft-storTall">{kr(perInnbygger(totalUtg, folk))}</div>
        </div>
      </div>

      <div className="ft-utgiftsliste">
        {utg.map((r, i) => (
          <button
            key={r.node.i}
            type="button"
            className="ft-utgiftsrad"
            onClick={() => onAapneUtforsk('utgifter', [r.node])}
          >
            <span className="ft-radnr num">{String(i + 1).padStart(2, '0')}</span>
            <span className="ft-radmidt">
              <span className="ft-radtittel">
                <span className="ft-radnavn">{visNavn(r.node)}</span>
                <span className="ft-radandel num">{pct(totalUtg ? (r.mill / totalUtg) * 100 : 0)}</span>
              </span>
              <span className="ft-radtekst">{OMTALE[r.node.i] ?? r.node.n}</span>
              <span className="ft-bar">
                <span
                  className="ft-bar-fyll"
                  style={{ width: `${storst ? Math.min(100, (r.mill / storst) * 100).toFixed(1) : 0}%` }}
                />
              </span>
            </span>
            <span className="ft-radhoyre">
              <span className="ft-radper num">{kr(perInnbygger(r.mill, folk))}</span>
              <span className="ft-radmill num">{belopMill(r.mill)} kr</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
