import React, { useEffect, useState } from "react";
import { accountingObservation } from "./accounting-drill";
import { benchmarkObservations } from "./comparison";
import { entityName, formatNumber } from "./workspace-model";
import indicators from "./driver-indicators.json";

const BY_FUNCTION = {
  100: ["population"],
  110: ["population"],
  120: ["adminEmployed", "adminFte"],
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

const ADMIN_COSTS = [
  ["AGD50", "Varer og tjenester til egen produksjon"],
  ["AGD51", "Kjøp av tjenester som erstatter egen produksjon"],
];

const ADMIN_PAYROLL = ["adminPayrollA", "adminPayrollB"];

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
  const indicatorRow = (key, details, read) => ({
    key,
    ...details,
    own: read(target),
    reference: benchmarkObservations(peers.map((peer) => ({
      p: { perCapita: read(peer) },
    })), "median"),
  });
  const costRows = fn === "120" ? ADMIN_COSTS.map(([code, label]) =>
    indicatorRow(code, { label, table: "12367", unit: "kr/innb." }, (detail) =>
      accountingObservation(detail, year, fn, code).perCapita),
  ) : [];
  const payrollRate = fn === "120" ? [indicatorRow("adminPayrollRate", {
    label: "Estimert lønnsutgift per årsverk, ekskl. fellesutgifter",
    table: "12362",
    additionalTable: "11918",
    unit: "kr/årsverk",
    note: "Lønn og sosiale utgifter etter sykelønnsrefusjon i styring og administrasjon (FGK1a + FGK1b), delt på avtalte novemberårsverk i den bredere gruppen FGK1. Fellesutgifter holdes utenfor lønnssummen på grunn av store regnskapsføringer. Referansen er medianen av kommunenes egne estimater.",
  }, (detail) => {
    const code = detail.entity.code;
    const staff = value(code, "adminFte");
    const payroll = ADMIN_PAYROLL.map((key) => value(code, key));
    if (!(staff > 0) || !payroll.every(Number.isFinite)) return null;
    return payroll.reduce((sum, amount) => sum + amount, 0) * 1000 / staff;
  })] : [];
  const staffingRate = fn === "120" ? [indicatorRow("adminFteRate", {
    label: "Avtalte årsverk i FGK1 per 1 000 innbyggere",
    table: "11918",
    unit: "årsverk",
    note: "Beregnet med SSBs folketall (tabell 11820). Raten tar hensyn til kommunestørrelsen.",
  }, (detail) => {
    const code = detail.entity.code;
    const staff = value(code, "adminFte");
    const residents = value(code, "population");
    return Number.isFinite(staff) && residents > 0 ? staff / residents * 1000 : null;
  })] : [];
  const rows = [
    ...payrollRate,
    ...costRows,
    ...staffingRate,
    ...(keys || ["population"]).map((key) =>
      indicatorRow(key, indicators[key], (detail) => value(detail.entity.code, key))),
  ];

  return (
    <section className="cmp-driver-panel" aria-labelledby="cmp-driver-heading">
      <h3 id="cmp-driver-heading">Hva kan forklare tallene?</h3>
      <p className="cmp-footnote">
        {fn === "120"
          ? "SSB publiserer bemanning for administrasjon, styring og fellesutgifter (FGK1) samlet. Varer og tjenestekjøp gjelder funksjon 120."
          : keys
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
                      target="_blank" rel="noreferrer">SSB {row.table} ↗</a>
                      {row.additionalTable && (
                        <> · <a href={`https://www.ssb.no/statbank/table/${row.additionalTable}/`}
                          target="_blank" rel="noreferrer">SSB {row.additionalTable} ↗</a></>
                      )}
                    </small>
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
