import React from 'react'

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
        <strong className="num">{Number.isFinite(growth?.annual) ? `${percentFormat.format(growth.annual)} %` : '–'}</strong>
      </div>
      <div>
        <span>Y/Y vekst</span>
        <strong className="num">{Number.isFinite(growth?.yoy) ? `${percentFormat.format(growth.yoy)} %` : '–'}</strong>
      </div>
    </div>
  )
}
