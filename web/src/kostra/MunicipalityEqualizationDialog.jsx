import React, { useMemo, useRef, useState } from 'react'
import { formatKostraValue, sortMunicipalityEqualizationRows } from './model'

const DEFAULT_SORT = { key: 'totalPerCapita', direction: 'asc' }

function SortableHeader({ sort, sortKey, onSort, children }) {
  const active = sort.key === sortKey
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
  const arrow = active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" onClick={() => onSort(sortKey)}>
        <span>{children}</span><span aria-hidden="true">{arrow}</span>
      </button>
    </th>
  )
}

export default function MunicipalityEqualizationDialog({ rows, selectedEntityId, selectedName, year }) {
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const tableFrameRef = useRef(null)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const sortedRows = useMemo(
    () => sortMunicipalityEqualizationRows(rows, sort.key, sort.direction),
    [rows, sort],
  )
  const selected = rows.find((row) => row.id === selectedEntityId)
  const dialogId = `ko-utjevningsrangering-${year}-${selectedEntityId.replace(':', '-')}`

  function openDialog() {
    if (!selected || !dialogRef.current) return
    setSort(DEFAULT_SORT)
    dialogRef.current.showModal()
    requestAnimationFrame(() => {
      if (tableFrameRef.current) tableFrameRef.current.scrollTop = 0
    })
  }

  function closeDialog() {
    dialogRef.current?.close()
  }

  function changeSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
    requestAnimationFrame(() => {
      if (tableFrameRef.current) tableFrameRef.current.scrollTop = 0
    })
  }

  if (!selected) {
    return (
      <div>
        <span>Samlet utjevning per innbygger</span>
        <strong>–</strong>
        <small>Inntekts- og utgiftsutjevning er ikke tilgjengelig</small>
      </div>
    )
  }

  const status = selected.totalPerCapita < 0 ? 'contributor' : selected.totalPerCapita > 0 ? 'recipient' : 'neutral'
  const selectedSummary = selected.totalPerCapita < 0
    ? `${selectedName} har et samlet trekk på ${formatKostraValue(Math.abs(selected.totalPerCapita), 'perCapita')}.`
    : selected.totalPerCapita > 0
      ? `${selectedName} har et samlet tillegg på ${formatKostraValue(selected.totalPerCapita, 'perCapita')}.`
      : `${selectedName} har ingen netto utjevning.`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ko-kommunestatistikkort ko-kommunestatistikk--${status}`}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={openDialog}
      >
        <span>Samlet utjevning per innbygger</span>
        <strong className="num">{formatKostraValue(selected.totalPerCapita, 'perCapita')}</strong>
        <small>Inntektsutjevning + utgiftsutjevning</small>
        <em>Vis alle kommuner</em>
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        className="ko-rangeringsdialog ko-utjevningsdialog"
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
              <span className="ft-stikkord">Kommuner · {year}</span>
              <h3 id={`${dialogId}-tittel`}>Samlet utjevning per innbygger</h3>
              <p id={`${dialogId}-forklaring`}>
                {selectedSummary} Negative tall er trekk, positive tall er tillegg. Listen viser {rows.length} kommuner og er sortert med laveste verdi først.
              </p>
            </div>
            <form method="dialog">
              <button type="submit" autoFocus aria-label="Lukk kommunelisten">Lukk</button>
            </form>
          </header>
          <div ref={tableFrameRef} className="ko-rangeringstabellramme" tabIndex="0" aria-label="Utjevning for alle kommuner">
            <table className="ko-rangeringstabell ko-utjevningsrangeringstabell">
              <caption className="sr-only">Kommunenes inntektsutjevning, utgiftsutjevning og samlede utjevning per innbygger i {year}</caption>
              <thead>
                <tr>
                  <SortableHeader sort={sort} sortKey="name" onSort={changeSort}>Kommune</SortableHeader>
                  <SortableHeader sort={sort} sortKey="incomePerCapita" onSort={changeSort}>Inntektsutjevning</SortableHeader>
                  <SortableHeader sort={sort} sortKey="expensePerCapita" onSort={changeSort}>Utgiftsutjevning</SortableHeader>
                  <SortableHeader sort={sort} sortKey="totalPerCapita" onSort={changeSort}>Samlet utjevning</SortableHeader>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.selected ? 'valgt' : undefined}
                    aria-current={row.selected ? 'true' : undefined}
                  >
                    <th scope="row">
                      {row.name}
                      {row.selected && <small>Valgt kommune</small>}
                    </th>
                    <td className="num">{formatKostraValue(row.incomePerCapita, 'perCapita')}</td>
                    <td className="num">{formatKostraValue(row.expensePerCapita, 'perCapita')}</td>
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
