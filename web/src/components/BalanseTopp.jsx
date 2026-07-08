import React from 'react'
import { filtrerNoder, sumVerdi, transformVerdi } from '../lib/data'
import { formatVerdi } from '../lib/format'
import './BalanseTopp.css'

function summer(hierarki, aar, serie, skjulFin, modus, ctx) {
  const noder = skjulFin ? filtrerNoder(hierarki, { skjulFin: true }) : hierarki
  const raa = noder.reduce((s, n) => s + sumVerdi(n, aar, serie), 0)
  return transformVerdi(raa, aar, modus, ctx)
}

export default function BalanseTopp({ utgifter, inntekter, valgtAar, modus, modusCtx, skjulFin, meta }) {
  if (!valgtAar) return null

  const sisteRegnskapsAar = meta.siste_regnskap_aar
  const sisteBudsjettAar = meta.siste_budsjett_aar
  const erPrognoseAar = valgtAar > sisteRegnskapsAar

  const primaerSerie = erPrognoseAar ? 'saldert' : 'regnskap'
  const primaerLabel = erPrognoseAar
    ? `Saldert budsjett ${valgtAar}`
    : `Regnskap ${valgtAar}`

  const uPrimaer = summer(utgifter, valgtAar, primaerSerie, skjulFin, modus, modusCtx)
  const iPrimaer = summer(inntekter, valgtAar, primaerSerie, skjulFin, modus, modusCtx)

  const uBudsjett = summer(utgifter, sisteBudsjettAar, 'saldert', skjulFin, modus, modusCtx)
  const iBudsjett = summer(inntekter, sisteBudsjettAar, 'saldert', skjulFin, modus, modusCtx)
  const visBudsjettlinje = !(erPrognoseAar && valgtAar === sisteBudsjettAar)

  const diff = (iPrimaer ?? 0) - (uPrimaer ?? 0)
  const fmt = v => formatVerdi(v, modus)
  const modusSuffiks = modus === 'fast' ? ` (faste ${modusCtx.basisAar}-kr)`
    : modus === 'bnp' ? ' (% av BNP)' : modus === 'person' ? ' (per innbygger)' : ''

  return (
    <div className="balanse-topp panel">
      <div className="balanse-rad">
        <div className="balanse-kort balanse-kort--teal">
          <div className="kort-tittel">Inntekter</div>
          <div className="kort-verdi num">{fmt(iPrimaer)}</div>
          <div className="kort-serie">
            {primaerLabel}
            {erPrognoseAar && <span className="prognose-merke">prognose</span>}
          </div>
          {visBudsjettlinje && (
            <div className="kort-budsjett num">
              {fmt(iBudsjett)} <span className="kb-label">budsjett {sisteBudsjettAar}</span>
            </div>
          )}
        </div>

        <div className="balanse-diff">
          <span className={`diff-tall num ${diff >= 0 ? 'positiv' : 'negativ'}`}>
            {diff >= 0 ? '+' : ''}{fmt(diff)}
          </span>
          <span className="diff-label">
            {diff >= 0 ? 'overskudd' : 'underskudd'} {valgtAar}
          </span>
        </div>

        <div className="balanse-kort balanse-kort--rust">
          <div className="kort-tittel">Utgifter</div>
          <div className="kort-verdi num">{fmt(uPrimaer)}</div>
          <div className="kort-serie">
            {primaerLabel}
            {erPrognoseAar && <span className="prognose-merke">prognose</span>}
          </div>
          {visBudsjettlinje && (
            <div className="kort-budsjett num">
              {fmt(uBudsjett)} <span className="kb-label">budsjett {sisteBudsjettAar}</span>
            </div>
          )}
        </div>
      </div>
      <p className="balanse-note">
        {skjulFin && 'Finanstransaksjoner (90-poster) og SPU-overføringer er skjult'}
        {modusSuffiks && <span className="modus-note">{modusSuffiks}</span>}
      </p>
    </div>
  )
}
