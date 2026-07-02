import React from 'react'
import { filtrerNoder, sumVerdi, perInnbygger } from '../lib/data'
import { formatMillKr } from '../lib/format'
import './BalanseTopp.css'

function summer(hierarki, aar, serie, skjulFin) {
  const noder = skjulFin ? filtrerNoder(hierarki, { skjulFin: true }) : hierarki
  // sumVerdi (rekursiv) — forhåndsberegnede serier på toppnivå
  // inkluderer fin/SPU selv når barna er filtrert bort
  return noder.reduce((s, n) => s + sumVerdi(n, aar, serie), 0)
}

const fmtKr = v =>
  new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' kr'

export default function BalanseTopp({ utgifter, inntekter, valgtAar, perPerson, befolkning, skjulFin, meta }) {
  if (!valgtAar) return null

  const sisteRegnskapsAar = meta.siste_regnskap_aar
  const sisteBudsjettAar = meta.siste_budsjett_aar
  const erPrognoseAar = valgtAar > sisteRegnskapsAar

  // Primærserie for valgt år: regnskap, eller saldert hvis regnskap ikke finnes ennå
  const primaerSerie = erPrognoseAar ? 'saldert' : 'regnskap'
  const primaerLabel = erPrognoseAar
    ? `Saldert budsjett ${valgtAar}`
    : `Regnskap ${valgtAar}`

  const skaler = (v, aar) => perPerson ? (perInnbygger(v, befolkning, aar) ?? v) : v

  const uPrimaer = skaler(summer(utgifter, valgtAar, primaerSerie, skjulFin), valgtAar)
  const iPrimaer = skaler(summer(inntekter, valgtAar, primaerSerie, skjulFin), valgtAar)

  // Sekundærtall: siste vedtatte budsjett (vises alltid, med årstall)
  const uBudsjett = skaler(summer(utgifter, sisteBudsjettAar, 'saldert', skjulFin), sisteBudsjettAar)
  const iBudsjett = skaler(summer(inntekter, sisteBudsjettAar, 'saldert', skjulFin), sisteBudsjettAar)
  const visBudsjettlinje = !(erPrognoseAar && valgtAar === sisteBudsjettAar)

  const diff = iPrimaer - uPrimaer
  const fmt = v => perPerson ? fmtKr(v) : formatMillKr(v)

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
      {skjulFin && (
        <p className="balanse-note">
          Finanstransaksjoner (90-poster) og SPU-overføringer er skjult
        </p>
      )}
    </div>
  )
}
