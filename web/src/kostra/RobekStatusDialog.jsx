import React, { useRef } from 'react'
import {
  formatRobekDuration,
  ROBEK_LEGAL_BASIS_DESCRIPTIONS,
  robekLegalBasisLetters,
  robekCurrentMunicipalities,
  robekStatusForMunicipality,
} from './robek'

const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(value) {
  if (!value) return 'nå'
  if (/^\d{4}$/.test(value)) return value
  return dateFormat.format(new Date(`${value}T12:00:00Z`))
}

export default function RobekStatusDialog({ municipalityCode, municipalityName }) {
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const status = robekStatusForMunicipality(municipalityCode)
  const currentMunicipalities = robekCurrentMunicipalities()
  const dialogId = `ko-robek-${municipalityCode}`
  const updated = formatDate(status.updated)
  const duration = status.currentPeriod
    ? formatRobekDuration(status.currentPeriod, status.updated)
    : null

  function openDialog() {
    dialogRef.current?.showModal()
  }

  function closeDialog() {
    dialogRef.current?.close()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ko-kommunestatistikkort ko-kommunestatistikk--${status.registered ? 'robek' : 'ok'}`}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={openDialog}
      >
        <span>ROBEK-status</span>
        <strong>{status.registered ? 'I ROBEK' : 'Ikke i ROBEK'}</strong>
        <small>
          {status.registered ? `${duration} · siden ${formatDate(status.currentPeriod.entered)}` : `Status ${updated}`}
        </small>
        <em>Se status og historikk</em>
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        className="ko-rangeringsdialog ko-robekdialog"
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
              <span className="ft-stikkord">ROBEK · status {updated}</span>
              <h3 id={`${dialogId}-tittel`}>ROBEK-status for {municipalityName}</h3>
              <p id={`${dialogId}-forklaring`}>
                Status, tidligere registreringer og den sist oppdaterte landsoversikten.
              </p>
            </div>
            <form method="dialog">
              <button type="submit" autoFocus aria-label="Lukk ROBEK-oversikten">Lukk</button>
            </form>
          </header>

          <div className="ko-robekdialogkropp">
            <section className={`ko-robekstatusboks ko-robekstatusboks--${status.registered ? 'registrert' : 'fri'}`}>
              <span className="ft-stikkord">Nåværende status</span>
              <h4>{status.registered ? `${municipalityName} er i ROBEK` : `${municipalityName} er ikke i ROBEK`}</h4>
              {status.registered ? (
                <>
                  <strong>{duration}</strong>
                  <p>Registrert siden {formatDate(status.currentPeriod.entered)}. Grunnlag: kommuneloven § 28-1 bokstav {status.legalBasis}.</p>
                </>
              ) : (
                <p>Kommunen står ikke i departementets register per {updated}.</p>
              )}
            </section>

            <div className="ko-robekforklaringsgrid">
              <section>
                <span className="ft-stikkord">Hva betyr ROBEK?</span>
                <h4>Statlig kontroll av viktige økonomiske vedtak</h4>
                <p>ROBEK er registeret for kommuner og fylkeskommuner i økonomisk ubalanse eller som ikke har vedtatt sentrale økonomidokumenter innen fristen.</p>
                <ul>
                  <li>Årsbudsjettet blir kontrollert av staten.</li>
                  <li>Lån og langsiktige leieavtaler må godkjennes.</li>
                  <li>Kommunen må vedta en plan for å gjenopprette økonomisk balanse.</li>
                </ul>
                {status.registered && (
                  <div className="ko-robekgrunnlag">
                    <strong>Grunnlaget for {municipalityName}</strong>
                    <ul>
                      {robekLegalBasisLetters(status.legalBasis).map((letter) => (
                        <li key={letter}><b>{letter}</b> {ROBEK_LEGAL_BASIS_DESCRIPTIONS[letter]}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section>
                <span className="ft-stikkord">Kommunens historikk</span>
                <h4>{status.periods.length > 0 ? `${status.periods.length} ${status.periods.length === 1 ? 'periode' : 'perioder'} siden 2001` : 'Ingen registrerte perioder siden 2001'}</h4>
                {status.periods.length > 0 ? (
                  <ol className="ko-robekhistorikk">
                    {status.periods.map((period, index) => (
                      <li key={`${period.entered}-${period.exited ?? 'na'}`}>
                        <span>{period.exited ? `Periode ${index + 1}` : 'Nåværende periode'}</span>
                        <strong>{formatRobekDuration(period, status.updated)}</strong>
                        <small>{formatDate(period.entered)}–{period.exited ? formatDate(period.exited) : 'nå'}</small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>Departementets historikk viser ingen ROBEK-registrering for kommunen.</p>
                )}
              </section>
            </div>

            <section className="ko-robekliste">
              <div>
                <span className="ft-stikkord">Hele ROBEK-listen</span>
                <h4>{currentMunicipalities.length} kommuner per {updated}</h4>
              </div>
              <div className="ko-robektabellramme">
                <table className="ko-robektabell">
                  <caption className="sr-only">Kommuner i ROBEK, start, varighet og registreringsgrunnlag per {updated}</caption>
                  <thead>
                    <tr><th scope="col">Kommune</th><th scope="col">Siden</th><th scope="col">Varighet</th><th scope="col">Grunnlag</th></tr>
                  </thead>
                  <tbody>
                    {currentMunicipalities.map((row) => {
                      const selected = row.code === String(municipalityCode)
                      return (
                        <tr key={row.code} className={selected ? 'valgt' : undefined} aria-current={selected ? 'true' : undefined}>
                          <th scope="row">{row.name}{selected && <small>Valgt kommune</small>}</th>
                          <td>{formatDate(row.currentPeriod.entered)}</td>
                          <td>{formatRobekDuration(row.currentPeriod, row.updated)}</td>
                          <td>§ 28-1 {row.legalBasis}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="ko-robekkilder">
              <span className="ft-stikkord">Kilder</span>
              <p>
                <a href={status.sourceUrl} target="_blank" rel="noreferrer">Departementets løpende ROBEK-register ↗</a>
                {' · '}
                <a href={status.historyUrl} target="_blank" rel="noreferrer">Historikk 2001–2025 ↗</a>
              </p>
              <small>Eksakt innmeldingsdato vises når den er publisert. Ellers vises året, og varigheten oppgis konservativt.</small>
            </footer>
          </div>
        </div>
      </dialog>
    </>
  )
}
