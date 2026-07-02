import React from 'react'
import './Toppkontroll.css'

export default function Toppkontroll({
  side, setSide,
  valgtAar, setValgtAar,
  aarMin, aarMax,
  perPerson, setPerPerson,
  skjulFin, setSkjulFin,
}) {
  return (
    <div className="toppkontroll">
      <div className="kontroll-gruppe">
        <button
          className={`side-knapp ${side === 'utgifter' ? 'aktiv-rust' : ''}`}
          onClick={() => setSide('utgifter')}
          aria-pressed={side === 'utgifter'}
        >
          Utgifter
        </button>
        <button
          className={`side-knapp ${side === 'inntekter' ? 'aktiv-teal' : ''}`}
          onClick={() => setSide('inntekter')}
          aria-pressed={side === 'inntekter'}
        >
          Inntekter
        </button>
      </div>

      <div className="kontroll-gruppe aarsvelger">
        <label htmlFor="aarsslider" className="kontroll-label">
          År: <span className="num">{valgtAar}</span>
        </label>
        <input
          id="aarsslider"
          type="range"
          min={aarMin}
          max={aarMax}
          value={valgtAar ?? aarMin}
          onChange={e => setValgtAar(+e.target.value)}
          aria-label={`Velg år, nå: ${valgtAar}`}
        />
        <div className="slider-ticks">
          <span>{aarMin}</span>
          <span>{aarMax}</span>
        </div>
      </div>

      <div className="kontroll-gruppe toggles">
        <Toggle
          id="per-person"
          label="Per innbygger"
          checked={perPerson}
          onChange={setPerPerson}
        />
        <Toggle
          id="skjul-fin"
          label="Skjul finanstransaksjoner"
          checked={skjulFin}
          onChange={setSkjulFin}
        />
      </div>
    </div>
  )
}

function Toggle({ id, label, checked, onChange }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  )
}
