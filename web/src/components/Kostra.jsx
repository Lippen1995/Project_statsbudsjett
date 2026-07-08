import React, { useState, useMemo } from 'react'
import { formatMillKr } from '../lib/format'
import './Kostra.css'

/**
 * KOSTRA – kommunale og fylkeskommunale regnskapstall (SSB).
 * Velg en enhet (kommune / fylke / hele landet) og se driftsutgiftene fordelt
 * på funksjon (tjenesteområde) for et gitt år. Skjules helt hvis kostra mangler.
 */
const TYPER = [
  { id: 'kommune', label: 'Kommuner' },
  { id: 'fylke', label: 'Fylker' },
  { id: 'land', label: 'Hele landet' },
  { id: 'gruppe', label: 'KOSTRA-grupper' },
]

export default function Kostra({ kostra }) {
  const enheter = kostra?.enheter ?? []
  const aarListe = kostra?.aar ?? []

  // Hvilke enhetstyper finnes faktisk i dataene
  const tilgjengeligeTyper = useMemo(() => {
    const set = new Set(enheter.map(e => e.type))
    return TYPER.filter(t => set.has(t.id))
  }, [enheter])

  const [type, setType] = useState(tilgjengeligeTyper[0]?.id ?? 'kommune')
  const [sok, setSok] = useState('')
  const enheterAvType = useMemo(
    () => enheter.filter(e => e.type === type),
    [enheter, type]
  )
  const [valgtId, setValgtId] = useState(enheterAvType[0]?.id ?? null)
  const [aar, setAar] = useState(aarListe[aarListe.length - 1] ?? null)

  if (!kostra || enheter.length === 0) return null

  const filtrerte = sok.trim().length >= 1
    ? enheterAvType.filter(e => e.navn.toLowerCase().includes(sok.trim().toLowerCase()))
    : enheterAvType

  const valgt = enheterAvType.find(e => e.id === valgtId) ?? filtrerte[0] ?? enheterAvType[0]

  const rader = useMemo(() => {
    if (!valgt) return []
    return (valgt.children ?? [])
      .map(f => ({ node: f, verdi: f.serier?.[aar]?.regnskap ?? 0 }))
      .filter(r => Math.abs(r.verdi) >= 0.05)
      .sort((a, b) => Math.abs(b.verdi) - Math.abs(a.verdi))
  }, [valgt, aar])

  const total = rader.reduce((s, r) => s + r.verdi, 0)

  const byttType = (t) => {
    setType(t)
    setSok('')
    const første = enheter.find(e => e.type === t)
    setValgtId(første?.id ?? null)
  }

  return (
    <section className="panel kostra-panel">
      <div className="k-header">
        <div>
          <h2 className="k-tittel">Kommune- og fylkesregnskap (KOSTRA)</h2>
          <p className="k-undertittel">
            Driftsutgifter per tjenesteområde · kilde: SSB KOSTRA
          </p>
        </div>
        <label className="k-aarvelger">
          År
          <select value={aar ?? ''} onChange={e => setAar(Number(e.target.value))}>
            {aarListe.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      <div className="k-typer" role="tablist">
        {tilgjengeligeTyper.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={type === t.id}
            className={`k-type ${type === t.id ? 'aktiv' : ''}`}
            onClick={() => byttType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="k-velg">
        <input
          className="k-sok"
          type="search"
          placeholder={`Søk i ${TYPER.find(t => t.id === type)?.label.toLowerCase() ?? 'enheter'}…`}
          value={sok}
          onChange={e => setSok(e.target.value)}
          aria-label="Søk etter enhet"
        />
        <select
          className="k-enhet"
          value={valgt?.id ?? ''}
          onChange={e => setValgtId(e.target.value)}
          aria-label="Velg enhet"
          size={1}
        >
          {filtrerte.map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}
        </select>
      </div>

      {valgt && (
        <div className="k-innhold">
          <div className="k-total-rad">
            <span className="k-enhet-navn">{valgt.navn}</span>
            <span className="k-total num">{formatMillKr(total)}</span>
          </div>

          <div className="k-liste" role="list">
            {rader.length === 0 && (
              <p className="k-tom">Ingen registrerte funksjonstall for {aar}.</p>
            )}
            {rader.map(({ node, verdi }) => {
              const andel = total !== 0 ? (verdi / total) * 100 : 0
              return (
                <div key={node.id} className="k-rad" role="listitem"
                  title={`${node.tag ?? ''} ${node.navn}`}>
                  <div className="k-bar-wrapper">
                    <div className="k-bar" style={{ width: `${Math.min(Math.abs(andel), 100)}%` }} />
                  </div>
                  <div className="k-rad-innhold">
                    <span className="k-rad-navn">{node.navn}</span>
                    <span className="k-rad-hoyre">
                      <span className="k-rad-belop num">{formatMillKr(verdi)}</span>
                      <span className="k-rad-andel">{Math.abs(andel).toFixed(1)} %</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
