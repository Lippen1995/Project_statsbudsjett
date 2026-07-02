import React from 'react'
import { filtrerNoder, perInnbygger } from '../lib/data'
import { formatMillKr } from '../lib/format'
import './BalanseTopp.css'

function summer(hierarki, aar, serie, skjulFin) {
  const noder = skjulFin ? filtrerNoder(hierarki, { skjulFin: true }) : hierarki
  return noder.reduce((s, n) => s + (n.serier?.[aar]?.[serie] ?? 0), 0)
}

export default function BalanseTopp({ utgifter, inntekter, valgtAar, perPerson, befolkning, skjulFin, meta }) {
  if (!valgtAar) return null

  const erPrognose = valgtAar > meta.siste_regnskap_aar
  const serie = erPrognose ? 'saldert' : 'regnskap'

  let u = summer(utgifter, valgtAar, serie, skjulFin)
  let i = summer(inntekter, valgtAar, serie, skjulFin)

  if (perPerson) {
    u = perInnbygger(u, befolkning, valgtAar) ?? u
    i = perInnbygger(i, befolkning, valgtAar) ?? i
  }

  const diff = i - u
  const diffSign = diff >= 0 ? '+' : ''

  return (
    <div className="balanse-topp panel">
      <div className="balanse-rad">
        <BalanseKort
          tittel="Inntekter"
          verdi={i}
          farge="teal"
          serie={serie}
          erPrognose={erPrognose}
          perPerson={perPerson}
        />
        <div className="balanse-diff">
          <span className={`diff-tall num ${diff >= 0 ? 'positiv' : 'negativ'}`}>
            {diffSign}{formatMillKr(diff, { compact: true })}
          </span>
          <span className="diff-label">{diff >= 0 ? 'overskudd' : 'underskudd'}</span>
          {erPrognose && <span className="prognose-merke">prognose</span>}
        </div>
        <BalanseKort
          tittel="Utgifter"
          verdi={u}
          farge="rust"
          serie={serie}
          erPrognose={erPrognose}
          perPerson={perPerson}
        />
      </div>
      {skjulFin && (
        <p className="balanse-note">
          Finanstransaksjoner og SPU-overføringer er skjult
        </p>
      )}
    </div>
  )
}

function BalanseKort({ tittel, verdi, farge, erPrognose, perPerson }) {
  return (
    <div className={`balanse-kort balanse-kort--${farge}`}>
      <div className="kort-tittel">{tittel}</div>
      <div className={`kort-verdi num`}>
        {perPerson
          ? new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(verdi)) + ' kr'
          : formatMillKr(verdi)
        }
      </div>
      <div className="kort-serie">
        {erPrognose ? 'saldert budsjett' : 'regnskap'}
      </div>
    </div>
  )
}
