import React from 'react'
import { formatKostraGrowthAmount } from './model'

const percentFormat = new Intl.NumberFormat('nb-NO', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export default function KostraGrowthSummary({ growth }) {
  return (
    <div className="ko-grafvekst">
      <div>
        <span>Årlig vekst</span>
        <strong className="num">{formatKostraGrowthAmount(growth?.amount)}</strong>
      </div>
      <div>
        <span>Y/Y vekst</span>
        <strong className="num">{Number.isFinite(growth?.yoy) ? `${percentFormat.format(growth.yoy)} %` : '–'}</strong>
      </div>
    </div>
  )
}
