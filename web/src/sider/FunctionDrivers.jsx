import React, { useEffect, useState } from "react";
import { entityName, formatNumber } from "./workspace-model";
import indicators from "./driver-indicators.json";
import { FUNCTION_NOTES } from "./function-driver-selection";
import { functionDriverRows } from "./function-driver-model";

const years = new Map();

function loadDrivers(year) {
  if (!years.has(year)) {
    years.set(year, fetch(`/data/kostra/drivers/${year}.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Mangler SSB-uttrekk");
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data?.columns) || !data.rows) {
          throw new Error("Ugyldig SSB-uttrekk");
        }
        return data;
      })
      .catch((error) => {
        years.delete(year);
        throw error;
      }));
  }
  return years.get(year);
}

export default function FunctionDrivers({ target, peers, year, fn }) {
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadDrivers(year).then((data) => {
      if (active) setDataset(data);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [year, attempt]);

  const { activity, accounts } = functionDriverRows({ target, peers, year, fn, dataset, indicators });
  const groups = [["Tjeneste, bemanning og behov", activity], ["Regnskap", accounts]];

  return (
    <section className="cmp-driver-panel" aria-labelledby="cmp-driver-heading">
      <h3 id="cmp-driver-heading">Hva kan forklare tallene?</h3>
      <p className="cmp-footnote">Forskjellen er kommunens tall minus medianen i utvalget. For prosenttall vises den i prosentpoeng. Regnskapsartene viser hvor forskjellene er bokført.</p>
      {FUNCTION_NOTES[fn] && <p className="cmp-footnote">{FUNCTION_NOTES[fn]}</p>}
      {!activity.length && dataset && (
        <p className="cmp-footnote">Ingen egne tjenesteindikatorer med data i dette utvalget og året.</p>
      )}
      {error ? (
        <p role="alert">
          Kunne ikke hente SSB-indikatorene for {year}.{" "}
          <button type="button" onClick={() => { setError(false); setAttempt((n) => n + 1); }}>Prøv igjen</button>
        </p>
      ) : !dataset ? (
        <p role="status">Henter SSB-indikatorer…</p>
      ) : !activity.length && !accounts.length ? (
        <p role="status">Ingen sammenlignbare observasjoner for denne funksjonen og året.</p>
      ) : (
        <div className="cmp-driver-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Indikator · {year}</th>
                <th scope="col">{entityName(target)}</th>
                <th scope="col">Median i utvalget</th>
                <th scope="col">Forskjell</th>
              </tr>
            </thead>
            {groups.filter(([, rows]) => rows.length).map(([group, rows]) => (
              <tbody key={group}>
                <tr className="cmp-driver-group"><th scope="rowgroup" colSpan={4}>{group}</th></tr>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      {row.label} <span>({row.unit})</span>
                      <small>
                        {row.note}{" "}
                        {row.source === "KDD" ? (
                          <a href="https://www.regjeringen.no/id547024/" target="_blank" rel="noreferrer">Grønt hefte, tabell E-k ↗</a>
                        ) : (
                          <a href={`https://www.ssb.no/statbank/table/${row.table}/`} target="_blank" rel="noreferrer">SSB {row.table} ↗</a>
                        )}
                      </small>
                    </th>
                    <td>{formatNumber(row.own, row.unit === "indeks" ? 2 : 1)}</td>
                    <td>
                      {formatNumber(row.reference.value, row.unit === "indeks" ? 2 : 1)}
                      <small>{row.reference.count}/{peers.length} med data</small>
                    </td>
                    <td>{formatNumber(Number.isFinite(row.own) && Number.isFinite(row.reference.value)
                      ? row.own - row.reference.value : null, row.unit === "indeks" ? 2 : 1)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
