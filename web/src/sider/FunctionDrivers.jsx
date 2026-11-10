import React, { useEffect, useState } from "react";
import { benchmarkObservations } from "./comparison";
import { entityName, formatNumber } from "./workspace-model";
import indicators from "./driver-indicators.json";

const BY_FUNCTION = {
  100: ["population"],
  110: ["population"],
  120: ["population", "travel"],
  121: ["buildingArea"],
  130: ["officeArea"],
  201: ["kindergarten", "kindergartenStaff"],
  202: ["pupils", "teacherRatio", "schoolSupport"],
  211: ["kindergartenSupport", "kindergarten"],
  221: ["preschoolArea", "kindergartenArea"],
  222: ["schoolArea", "schools", "schoolSize"],
  223: ["pupils", "travel"],
  232: ["healthStaff"],
  234: ["activity"],
  241: ["doctor"],
  242: ["welfareCases", "jobless"],
  244: ["childProtectionStaff", "childProtection"],
  251: ["childProtectionOpen"],
  252: ["childProtectionPlaced"],
  253: ["institution", "institutionOlder", "institutionCost"],
  254: ["homeCare", "homeCareYoung", "homeCareOlder"],
  257: ["homeCare", "homeCareYoung", "homeCareOlder"],
  258: ["homeCare", "homeCareYoung", "homeCareOlder"],
  261: ["institutionArea", "institution", "institutionCost"],
  265: ["housing"],
  273: ["jobless"],
  281: ["welfareCases", "longWelfare", "jobless"],
  283: ["housing"],
  332: ["roadLength", "roadSurface", "roadLight", "roadCost"],
  350: ["sewageTreatment", "sewageFee"],
  353: ["sewageNetwork", "sewageFee"],
  354: ["sewageFee"],
  373: ["cinemaVisits"],
  381: ["sportsArea"],
  386: ["cultureArea"],
};

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

  const keys = BY_FUNCTION[fn];
  const value = (code, key) => dataset?.rows[code]?.[dataset.columns.indexOf(key)];
  const rows = (keys || ["population"]).map((key) => {
    const own = value(target.entity.code, key);
    const reference = benchmarkObservations(peers.map((peer) => ({
      p: { perCapita: value(peer.entity.code, key) },
    })), "median");
    return { key, ...indicators[key], own, reference };
  });

  return (
    <section className="cmp-driver-panel" aria-labelledby="cmp-driver-heading">
      <h3 id="cmp-driver-heading">Hva kan forklare tallene?</h3>
      <p className="cmp-footnote">
        {keys
          ? "SSB-indikatorer gir kontekst for kostnadsforskjellen. De viser tjenesteomfang, bemanning eller kostnad per enhet der slike tall finnes."
          : "Denne funksjonen har foreløpig ingen egne indikatorer i Fellestall. SSBs folketall gir generell kontekst."}
        {" "}Tallene kan belyse forskjeller, men viser ikke hvor mye hver faktor forklarer.
      </p>
      {error ? (
        <p role="alert">
          Kunne ikke hente SSB-indikatorene for {year}.{" "}
          <button type="button" onClick={() => { setError(false); setAttempt((n) => n + 1); }}>Prøv igjen</button>
        </p>
      ) : !dataset ? (
        <p role="status">Henter SSB-indikatorer…</p>
      ) : (
        <div className="cmp-driver-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Indikator · {year}</th>
                <th scope="col">{entityName(target)}</th>
                <th scope="col">Median i utvalget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.label} <span>({row.unit})</span>
                    <small>{row.note} <a href={`https://www.ssb.no/statbank/table/${row.table}/`}
                      target="_blank" rel="noreferrer">SSB {row.table} ↗</a></small>
                  </th>
                  <td>{formatNumber(row.own, 1)}</td>
                  <td>
                    {formatNumber(row.reference.value, 1)}
                    <small>{row.reference.count}/{peers.length} med data</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
