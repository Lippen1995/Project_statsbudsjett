import React, { useId, useState } from "react";
import { accountingArtBreakdown } from "../kostra/explorer";
import { ACCOUNT_SECTIONS, accountingComparison } from "./accounting-drill";
import { entityName, formatNumber as n, nominal, referenceName } from "./workspace-model";

const perPerson = (value) => Number.isFinite(value) ? `${n(value)} kr` : "–";

function Values({ row, referenceSize }) {
  const gap = Number.isFinite(row.own.perCapita) && Number.isFinite(row.reference)
    ? row.own.perCapita - row.reference : null;
  return <>
    <td>
      {perPerson(row.own.perCapita)}
      {Number.isFinite(row.own.amount) && <small>({nominal(row.own.amount)})</small>}
    </td>
    <td>
      {perPerson(row.reference)}
      {row.count > 0 && row.count < referenceSize && <small>{row.count} av {referenceSize}</small>}
    </td>
    <td>{Number.isFinite(gap) && gap > 0 ? "+" : ""}{perPerson(gap)}</td>
  </>;
}

export default function AccountingDrill({ target, peers, year, method, functions = [], functionCode, other }) {
  const [selection, setSelection] = useState({ functionCode: "", post: "" });
  const id = useId();
  const selected = functionCode
    || functions.find(({ code }) => code === selection.functionCode)?.code
    || functions[0]?.code;
  const post = selection.functionCode === selected ? selection.post : "";
  const read = (code) => accountingComparison(target, peers, year, selected, code, method, other);
  const reference = other ? entityName(other) : referenceName(method);
  const referenceSize = other ? 1 : peers.length;
  const gross = read("AGD10");
  const sections = ACCOUNT_SECTIONS.map(([name, posts]) => [
    name, posts.map(([code, label, children = []]) => ({
      code, label, children, row: read(code),
    })).filter(({ row }) => row.reported),
  ]).filter(([, posts]) => posts.length);
  const { reconciliation } = accountingArtBreakdown(target, year, selected);

  return (
    <section className="cmp-accounting" aria-label="Regnskapsposter og artskontoer">
      {!functionCode && functions.length > 0 && (
        <label className="cmp-account-filter">
          KOSTRA-funksjon
          <select value={selected} onChange={(event) => setSelection({ functionCode: event.target.value, post: "" })}>
            {functions.map(({ code, name }) => <option value={code} key={code}>{code} · {name}</option>)}
          </select>
        </label>
      )}
      {sections.length > 0 ? (
        <>
          <div className="cmp-account-table">
            <table>
              <caption>Regnskapsposter · {year} · kroner per innbygger</caption>
              <thead>
                <tr>
                  <th scope="col">Regnskapspost</th>
                  <th scope="col">{entityName(target)}</th>
                  <th scope="col">{reference}</th>
                  <th scope="col">Avvik</th>
                </tr>
              </thead>
              {sections.map(([name, posts]) => (
                <tbody key={name}>
                  <tr className="cmp-account-section">
                    <th scope="rowgroup" colSpan={4}>{name}</th>
                  </tr>
                  {name === "Brutto driftsutgifter" && gross.reported && (
                    <tr>
                      <th scope="row">Sum brutto driftsutgifter</th>
                      <Values row={gross} referenceSize={referenceSize} />
                    </tr>
                  )}
                  {posts.map(({ code, label, row, children }) => (
                    <React.Fragment key={code}>
                      <tr>
                        <th scope="row">
                          <button type="button" aria-expanded={post === code}
                            aria-controls={post === code ? `${id}-${code}` : undefined}
                            onClick={() => setSelection({ functionCode: selected, post: post === code ? "" : code })}>
                            <span aria-hidden="true">{post === code ? "−" : "+"}</span> {label}
                          </button>
                        </th>
                        <Values row={row} referenceSize={referenceSize} />
                      </tr>
                      {post === code && (
                        <tr className="cmp-account-arts">
                          <td colSpan={4}>
                            <div id={`${id}-${code}`}>
                              <table aria-label={`Artskontoer og artsgrupper for ${label}`}>
                                <thead className="sr-only">
                                  <tr>
                                    <th scope="col">KOSTRA-art</th>
                                    <th scope="col">{entityName(target)}</th>
                                    <th scope="col">{reference}</th>
                                    <th scope="col">Avvik</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[code, ...children].map((artCode) => {
                                    const art = artCode === code ? row : read(artCode);
                                    if (!art.reported) return null;
                                    return <tr key={artCode}>
                                      <th scope="row"><small>{artCode}</small>{art.name}</th>
                                      <Values row={art} referenceSize={referenceSize} />
                                    </tr>;
                                  })}
                                </tbody>
                              </table>
                              {code === "AG16" && <p>090 og 099 inngår i lønnsposten. Sykelønnsrefusjon (710) er allerede trukket fra.</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="cmp-footnote">Funksjonsoversikten viser netto driftsutgifter. Her vises bruttoposter og rapporterte inntektsarter separat. Beløpet i parentes er kommunens total. Manglende data vises som «–». Kilde er SSB/KOSTRA, tabell 12367.</p>
          {reconciliation.status === "difference" && <p className="cmp-footnote">
            For {entityName(target)} er summen av hovedartene {n(Math.abs(reconciliation.difference) * 1000)} kr {reconciliation.difference < 0 ? "lavere" : "høyere"} enn rapportert bruttototal.
          </p>}
        </>
      ) : (
        <p className="cmp-footnote">Ingen regnskapsposter er rapportert for denne funksjonen og året i det valgte kommuneutvalget.</p>
      )}
    </section>
  );
}
