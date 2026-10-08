import React, { useState } from 'react'
import FondStromGraf from '../grafer/FondStromGraf'
import LinjeGraf from '../grafer/LinjeGraf'
import { oljeTidsserie, oljeMakroTidsserie, oljeGrafSerier, oljeDifferanser, oljeStromTidsserie } from '../oljetall'
import { GULL } from '../design'
import { belopMill, kr, pct, n0, n1 } from '../tall'

const RETTESNOR = 3
const OVERFORING = '#91B5C5'
const LINJENOTE = 'Heltrukket linje: historiske tall. Stiplet linje: siste budsjett.'

function FondSammenligning({ overforinger, makro }) {
  const grupper = [
    { navn: 'Oljepengebruk', rader: makro, farge: GULL },
    { navn: 'Overføring fra fondet', rader: overforinger, farge: OVERFORING },
  ]
  const aar = [...new Set(grupper.flatMap((g) => g.rader.map((r) => r.aar)))].sort((a, b) => a - b)
  if (aar.length < 2) return null
  const serier = grupper.flatMap((g) => {
    const indeks = new Map(g.rader.map((r, i) => [r.aar, i]))
    return oljeGrafSerier(g.rader, 'belop', g.farge).map((s, i) => ({
      ...s,
      navn: `${g.navn} – ${i === 0 ? 'historiske tall' : 'siste budsjett'}`,
      punkter: aar.map((y) => s.punkter[indeks.get(y)] ?? { v: null }),
    }))
  })
  return (
    <div className="ft-fondgraf">
      <div className="ft-stikkord">Oljepengebruk og overføring, milliarder kroner</div>
      <div className="ft-fondgraf-flate">
        <LinjeGraf
          serier={serier}
          aar={aar}
          beskrivelse="Oljepengebruk (strukturelt oljekorrigert underskudd) og overføring fra fondet, milliarder kroner"
          W={520}
          H={230}
          mork
          aksefmt={(v) => n0.format(v / 1000)}
          tips={(i) => {
            const punkter = grupper.map((g) => ({ ...g, rad: g.rader.find((r) => r.aar === aar[i]) }))
            const [olje, overforing] = punkter.map((p) => p.rad)
            return {
              tittel: String(aar[i]),
              linjer: [
                ...punkter.map((p) => p.rad && ({ farge: p.farge, tekst: `${p.navn}: ${belopMill(p.rad.belop)} kr (${p.rad.type})` })),
                olje && overforing && { farge: 'transparent', tekst: `Oljepengebruk minus overføring: ${belopMill(olje.belop - overforing.belop)} kr` },
              ],
            }
          }}
        />
      </div>
      <p className="ft-fondnote ft-fondlegend">
        {grupper.map((g) => <span key={g.navn}><i style={{ background: g.farge }} aria-hidden="true" />{g.navn}</span>)}
      </p>
      <p className="ft-fondnote">{LINJENOTE} Historisk oljepengebruk er Finansdepartementets siste anslag for regnskapsår.</p>
    </div>
  )
}

function FondGraf({ tittel, rader, felt, farge, prosent = false, historiskAnslag = false }) {
  const vis = rader.filter((r) => r[felt] != null)
  if (vis.length < 2) return null
  const serier = oljeGrafSerier(vis, felt, farge)
  if (historiskAnslag) serier[0].navn = 'Historiske anslag'
  const formater = (v) => prosent ? pct(v, 1) : felt === 'perPerson' ? kr(Math.round(v / 100) * 100) : `${belopMill(v)} kr`
  return (
    <div className="ft-fondgraf">
      <div className="ft-stikkord">{tittel}</div>
      <div className="ft-fondgraf-flate">
        <LinjeGraf
          serier={prosent ? [...serier, { farge: '#8C8A84', stiplet: true, bredde: 1.5, navn: 'Rettesnor', punkter: vis.map(() => ({ v: RETTESNOR })) }] : serier}
          aar={vis.map((r) => r.aar)}
          beskrivelse={tittel}
          W={520}
          H={230}
          mork
          aksefmt={(v) => prosent ? `${n1.format(v)} %` : felt === 'perPerson' ? n0.format(v) : n0.format(v / 1000)}
          tips={(i) => ({
            tittel: String(vis[i].aar),
            linjer: [
              { farge, tekst: `${vis[i].type}: ${formater(vis[i][felt])}` },
              prosent && { farge: '#8C8A84', tekst: 'Rettesnor: 3,0 %' },
              felt === 'perPerson' && vis[i].befolkningsanslag && { farge: 'transparent', tekst: 'SSBs anslag for folkemengde 1. januar' },
              vis[i].fondsanslag && { farge: 'transparent', tekst: 'Finansdepartementets anslag på fondsverdi' },
              historiskAnslag && { farge: 'transparent', tekst: 'Strukturelt oljekorrigert underskudd' },
            ],
          })}
        />
      </div>
      <p className="ft-fondnote">
        {historiskAnslag ? 'Heltrukket linje: siste anslag for regnskapsår. Stiplet linje: siste budsjettanslag.' : LINJENOTE}
        {prosent && ' Grå stiplet linje: rettesnoren på 3 prosent.'}
        {felt === 'perPerson' && vis.some((r) => r.befolkningsanslag) && <> For {vis.filter((r) => r.befolkningsanslag).map((r) => r.aar).join(', ')} brukes <a href="https://www.ssb.no/statbank/table/14282/">SSBs befolkningsanslag (hovedalternativet)</a>.</>}
      </p>
    </div>
  )
}

export default function Oljefondet({ data, aar }) {
  const [valgtAar, setValgtAar] = useState(null)
  const overforinger = oljeTidsserie(data)
  const makro = oljeMakroTidsserie(data)
  const aarListe = [...new Set([...overforinger, ...makro].map((r) => r.aar))].sort((a, b) => a - b)
  const visAar = valgtAar ?? aarListe.at(-1) ?? aar
  const overforing = overforinger.find((r) => r.aar === visAar)
  const olje = makro.find((r) => r.aar === visAar)
  const differanser = oljeDifferanser(overforing, olje)

  return (
    <section id="oljefondet" className="ft-seksjon ft-seksjon--mork" data-avslor>
      <div className="ft-seksjon-innhold">
        <div className="ft-seksjonstekst ft-seksjonstopp">
          <div>
            <h2>Oljefondet: hva som spares, hva som brukes</h2>
            <p>
              Statens netto olje- og gassinntekter går inn i fondet. Overføringen tilbake finansierer
              statsbudsjettet. Oljepengebruk måler den underliggende bruken av fondsmidler, korrigert
              for konjunkturer og andre midlertidige forhold. Det er dette målet som sammenlignes
              med handlingsregelens rettesnor på 3 prosent over tid.
            </p>
          </div>
        </div>

        <label className="ft-fondaar">
          Vis tall for
          <select value={visAar} onChange={(e) => setValgtAar(Number(e.target.value))}>
            {aarListe.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="ft-fondtall">
          <div>
            <div className="ft-stikkord">Oljepengebruk</div>
            <div className="ft-fondbelop">{olje ? `${belopMill(olje.belop)} kr` : '–'}</div>
            <div className="ft-fondunder">{olje?.type ?? 'Underskuddsanslag mangler'} · {visAar}</div>
          </div>
          <div>
            <div className="ft-stikkord">Oljepengebruk som andel av fondet</div>
            <div className="ft-fondbelop">{pct(olje?.prosent, 1)}</div>
            <div className="ft-fondunder">
              {olje?.prosent == null ? 'Fondsverdi mangler' : `${olje.prosent <= RETTESNOR ? 'Under' : 'Over'} rettesnoren på 3 prosent`}
              {olje?.fondsanslag && ' · anslått fondsverdi'}
            </div>
          </div>
          <div>
            <div className="ft-stikkord">Overføring fra fondet</div>
            <div className="ft-fondbelop">{overforing ? `${belopMill(overforing.belop)} kr` : '–'}</div>
            <div className="ft-fondunder">{overforing?.type ?? 'Overføring mangler'} · {visAar}</div>
            {overforing?.perPerson != null && <div className="ft-fondunder">{kr(Math.round(overforing.perPerson / 100) * 100)} per innbygger{overforing.befolkningsanslag ? ' (SSBs befolkningsanslag)' : ''}</div>}
          </div>
        </div>

        <FondStromGraf rader={oljeStromTidsserie(data)} />

        <div className="ft-fondgrafer">
          <FondSammenligning overforinger={overforinger} makro={makro} />
          <FondGraf tittel="Oljepengebruk som andel av fondet" rader={makro} felt="prosent" farge={GULL} prosent historiskAnslag />
          <FondGraf tittel="Overføring per innbygger, løpende kroner" rader={overforinger} felt="perPerson" farge={OVERFORING} />
          <div className="ft-fondforklaring">
            <h3>Hvorfor er tallene forskjellige?</h3>
            <dl className="ft-fondbegreper">
              <div>
                <dt>Oljekorrigert underskudd</dt>
                <dd>Statsbudsjettets finansieringsbehov uten petroleum og lånetransaksjoner.</dd>
              </div>
              <div>
                <dt>Overføring fra fondet</dt>
                <dd>Vedtatt overføring, eller bokført beløp i regnskapet. Kan avvike fra underskuddet når anslag og vedtak oppdateres til ulik tid.</dd>
              </div>
              <div>
                <dt>Oljepengebruk</dt>
                <dd>Underskuddet korrigert for konjunkturer og midlertidige forhold. Måler underliggende fondsbruk og sammenlignes med 3-prosentregelen.</dd>
              </div>
            </dl>
            {olje && (
              <>
                <details className="ft-fonddetaljer">
                  <summary>Tall for {visAar} – {olje.type}</summary>
                <div className="ft-fondtabell-wrap">
                  <table className="ft-fondtabell" aria-label={`Tall for ${visAar} – ${olje.type}`}>
                    <thead><tr><th scope="col">Mål</th><th scope="col">Beløp</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Oljepengebruk (strukturelt underskudd)</th><td>{belopMill(olje.belop)} kr</td></tr>
                      <tr><th scope="row">Oljekorrigert underskudd</th><td>{belopMill(olje.oljekorrigert)} kr</td></tr>
                      <tr><th scope="row">Overføring fra fondet ({overforing?.type.toLowerCase() ?? 'mangler'})</th><td>{overforing ? `${belopMill(overforing.belop)} kr` : '–'}</td></tr>
                    </tbody>
                  </table>
                </div>
                </details>
                <p>
                  Forskjellen mellom oljepengebruk og oljekorrigert underskudd er {belopMill(differanser.strukturell)} kr.
                </p>
                  <details className="ft-fonddetaljer">
                    <summary>Korreksjonene bak forskjellen</summary>
                  {olje.korreksjoner && <p>Den består av {belopMill(olje.korreksjoner.renter)} kr i korreksjoner for netto renter og overføringer fra Norges Bank,
                    {' '}{belopMill(olje.korreksjoner.regnskap)} kr i særskilte regnskapsforhold og {belopMill(olje.korreksjoner.konjunkturer)} kr i korreksjoner for skatter og dagpenger.</p>}
                  </details>
                {differanser.overforing != null && (
                  <p>
                    Overføringen er {belopMill(Math.abs(differanser.overforing))} kr {differanser.overforing < 0 ? 'lavere' : 'høyere'} enn det oljekorrigerte underskuddet.
                    {overforing.budsjett
                      ? ' Underskuddsanslaget kan endres før overføringen justeres ved nysalderingen.'
                      : ' Regnskapet kan avvike fra anslaget ved nysalderingen.'}
                  </p>
                )}
                <details className="ft-fonddetaljer">
                  <summary>Kilder og forbehold</summary>
                <p className="ft-fondnote">
                  Underskuddstall: <a href={olje.kilde.url}>{olje.kilde.navn} {olje.kilde.budsjett_aar}</a>.
                  {' '}Budsjettanslagene er Finansdepartementets publiserte anslag; Stortingets senere bevilgningsendringer kan gi andre tall.
                  {' '}Overføringen hentes separat fra <a href="https://statsregnskapet.dfo.no/last-ned">DFØs budsjettvedtak og statsregnskap</a>.
                </p>
                </details>
              </>
            )}
            <p className="ft-fondnote">
              <a href="https://www.regjeringen.no/no/tema/okonomi-og-budsjett/statsbudsjett/ord-og-begreper-i-statsbudsjettet/strukturelt-oljekorrigert-budsjettunderskudd/id2860071/">Finansdepartementets begrepsforklaring</a>.
              {' '}<a href="https://www.regjeringen.no/no/dokumenter/prop.-96-s-20252026/id3159643/?ch=1">Eksempel på at overføringsbevilgningen oppdateres ved nysalderingen</a>.
            </p>
          </div>
        </div>

        <p className="ft-fotnote">
          Oljepengebruk er et beregnet anslag, også for regnskapsår, og historiske anslag kan revideres.
          For budsjettår brukes revidert budsjett foran saldert budsjett og forslag. Når regnskap foreligger,
          erstattes budsjettpunktene av historiske tall. Andelen av fondet beregnes mot markedsverdien ved
          inngangen til året; for framtidige år brukes Finansdepartementets publiserte prosentanslag når fondsverdien ennå er ukjent.
          Beløp per innbygger er ikke justert for prisvekst.
        </p>
      </div>
    </section>
  )
}
