import React, { useRef } from 'react'
import { formatKostraValue } from './model'

export default function MunicipalityFreeIncomeRankingDialog({ rows, selectedEntityId, selectedName, year }) {
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const selectedRowRef = useRef(null)
  const selected = rows.find((row) => row.id === selectedEntityId)
  const dialogId = `ko-frieinntektsrangering-${year}-${selectedEntityId.replace(':', '-')}`

  function openDialog() {
    if (!selected || !dialogRef.current) return
    dialogRef.current.showModal()
    requestAnimationFrame(() => selectedRowRef.current?.scrollIntoView({ block: 'center' }))
  }

  function closeDialog() {
    dialogRef.current?.close()
  }

  if (!selected) {
    return (
      <div>
        <span>Skatt + rammetilskudd</span>
        <strong>–</strong>
        <small>Rangering ikke tilgjengelig</small>
      </div>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ko-kommunestatistikkort ko-kommunestatistikk--uthevet"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={openDialog}
      >
        <span>Skatt + rammetilskudd</span>
        <strong className="num">{selected.rank} av {rows.length}</strong>
        <small>{selectedName} har {selected.rank}. høyeste beløp per innbygger i Norge.</small>
        <em>Vis hele listen</em>
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        className="ko-rangeringsdialog ko-frieinntektsdialog"
        aria-labelledby={`${dialogId}-tittel`}
        aria-describedby={`${dialogId}-forklaring`}
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog()
        }}
      >
        <div className="ko-rangeringsdialoginnhold">
          <header>
            <div>
              <span className="ft-stikkord">Rangering · {year}</span>
              <h3 id={`${dialogId}-tittel`}>Skatteinntekter og rammetilskudd per innbygger</h3>
              <p id={`${dialogId}-forklaring`}>
                {selectedName} er nummer {selected.rank} av {rows.length} kommuner. Summen inkluderer bare kommunens skatteinntekter og bokførte rammetilskudd.
              </p>
            </div>
            <form method="dialog">
              <button type="submit" autoFocus aria-label="Lukk rangeringen">Lukk</button>
            </form>
          </header>
          <div className="ko-rangeringstabellramme" tabIndex="0" aria-label="Rangering av skatt og rammetilskudd for alle kommuner">
            <table className="ko-rangeringstabell ko-frieinntektsrangeringstabell">
              <caption className="sr-only">Kommuner rangert etter skatteinntekter og bokført rammetilskudd per innbygger i {year}</caption>
              <thead>
                <tr>
                  <th scope="col">Plass</th>
                  <th scope="col">Kommune</th>
                  <th scope="col">Skatteinntekter</th>
                  <th scope="col">Rammetilskudd</th>
                  <th scope="col">Til sammen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    ref={row.selected ? selectedRowRef : undefined}
                    className={row.selected ? 'valgt' : undefined}
                    aria-current={row.selected ? 'true' : undefined}
                  >
                    <td className="num">{row.rank}</td>
                    <th scope="row">
                      {row.name}
                      {row.selected && <small>Valgt kommune</small>}
                    </th>
                    <td className="num">{formatKostraValue(row.taxPerCapita, 'perCapita')}</td>
                    <td className="num">{formatKostraValue(row.blockGrantPerCapita, 'perCapita')}</td>
                    <td className="num ko-utjevningssum">{formatKostraValue(row.totalPerCapita, 'perCapita')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </dialog>
    </>
  )
}
