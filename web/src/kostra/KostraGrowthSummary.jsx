import React from 'react'
import { formatKostraValue } from './model'

const percentFormat = new Intl.NumberFormat('nb-NO', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

function signedAmount(value) {
  if (!Number.isFinite(value)) return '–'
  const formatted = formatKostraValue(value, 'amount')
  return value > 0 ? `+${formatted}` : formatted
}

export default function KostraGrowthSummary({ growth }) {
  return (
    <div className="ko-grafvekst">
      <div>
        <span>Årlig vekst</span>
        <strong className="num">{signedAmount(growth?.amount)}</strong>
      </div>
      <div>
        <span>Y/Y vekst</span>
        <strong className="num">{Number.isFinite(growth?.yoy) ? `${percentFormat.format(growth.yoy)} %` : '–'}</strong>
      </div>
    </div>
  )
}
