import React, { useEffect, useId, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { benchmarkObservations } from "./comparison";
import { entityName, formatNumber } from "./workspace-model";

const requests = new Map();

function loadYear(year) {
  if (!requests.has(year)) {
    requests.set(year, fetch(`/data/kostra/occupations/${year}.json`).then(async (response) => {
      if (!response.ok) throw new Error("Mangler SSB-uttrekk");
      return response.json();
    }).catch((error) => {
      requests.delete(year);
      throw error;
    }));
  }
  return requests.get(year);
}

function useYears(years) {
  const key = years.join(",");
  const [result, setResult] = useState(null);
  const [attempt, retry] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all(key.split(",").map((year) => loadYear(year).then((data) => [year, data])))
      .then((entries) => { if (active) setResult({ key, attempt, data: Object.fromEntries(entries) }); })
      .catch(() => { if (active) setResult({ key, attempt, error: true }); });
    return () => { active = false; };
  }, [key, attempt]);

  return {
    ...(result?.key === key && result.attempt === attempt ? result : null),
    retry: () => retry((n) => n + 1),
  };
}

function observation(data, detail, year, occupation) {
  let code = detail.entity.code;
  const previous = (detail.boundaryHistory || [])
    .filter((change) => change.relationType === "exact_successor" && change.changeYear > year)
    .sort((a, b) => b.changeYear - a.changeYear);
  for (const change of previous) {
    if (change.targetCode === code) code = change.sourceCode;
  }
  const index = data.occupations.findIndex(([id]) => id === occupation);
  const values = index >= 0 ? data.rows[code] : null;
  const amount = values?.[index * 2];
  const rate = values?.[index * 2 + 1];
  return { amount, rate: Number.isFinite(rate) ? rate / 10 : null };
}

function compare(data, target, peers, year, occupation) {
  const own = observation(data, target, year, occupation);
  const group = peers.map((peer) => observation(data, peer, year, occupation));
  const median = (key) => benchmarkObservations(
    group.map((row) => ({ p: { perCapita: row[key] } })), "median",
  );
  const rate = median("rate");
  return { own, rate, amount: median("amount").value };
}

function Value({ rate, amount }) {
  return <>{formatNumber(rate, 2)} <small>({formatNumber(amount, 1)})</small></>;
}

function Loading({ error, retry }) {
  return <p role={error ? "alert" : "status"}>
    {error ? <>Kunne ikke hente årsverk. <button type="button" onClick={retry}>Prøv igjen</button></> : "Henter årsverk fra SSB…"}
  </p>;
}

function OccupationHistory({ occupation, target, peers, years, year, current, onClose }) {
  const dialog = useRef(null);
  const heading = useId();
  const { data, error, retry } = useYears(years);
  const [code, label] = occupation;
  const history = data ? years.map((y) => {
    const { own, rate, amount } = compare(data[y], target, peers, y, code);
    return { year: y, own: own.rate, reference: rate.value, amount: own.amount, referenceAmount: amount };
  }) : [];

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      opener?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} className="ft cmp-inspect-modal cmp-occupation-modal" aria-labelledby={heading}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button type="button" className="cmp-dialog-close" aria-label="Lukk" onClick={onClose}>×</button>
      <p className="cmp-eyebrow">{entityName(target)} · {code === "doctor" ? "Kommunehelsetjenesten" : "Omsorgstjenestene"}</p>
      <h2 id={heading}>{label}</h2>
      <h3>Årsverk per 1 000 innbyggere over tid</h3>
      {!data ? <Loading error={error} retry={retry} /> : (
        <>
          <div className="cmp-chart-legend"><span><i />{entityName(target)}</span><span><i className="peer" />Median i utvalget</span></div>
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <LineChart data={history} margin={{ right: 15 }}>
              <CartesianGrid vertical={false} stroke="var(--strek)" />
              <XAxis dataKey="year" tickLine={false} />
              <YAxis width={45} tickLine={false} tickFormatter={(value) => formatNumber(value, 2)} />
              <Tooltip isAnimationActive={false} formatter={(value, name, item) => [
                `${formatNumber(value, 2)} (${formatNumber(item.payload[item.dataKey === "own" ? "amount" : "referenceAmount"], 1)} årsverk)`, name,
              ]} />
              <Line dataKey="own" name={entityName(target)} stroke="var(--gronn)" strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="reference" name="Median i utvalget" stroke="#897e6e" strokeDasharray="5 4" strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <details>
            <summary>Vis årstall i tabell</summary>
            <div className="cmp-driver-table"><table>
              <thead><tr><th scope="col">År</th><th scope="col">{entityName(target)}</th><th scope="col">Median</th></tr></thead>
              <tbody>{history.map((row) => <tr key={row.year}>
                <th scope="row">{row.year}</th><td><Value rate={row.own} amount={row.amount} /></td>
                <td><Value rate={row.reference} amount={row.referenceAmount} /></td>
              </tr>)}</tbody>
            </table></div>
          </details>
        </>
      )}
      <h3>Kommunene i {year}</h3>
      <div className="cmp-driver-table"><table>
        <thead><tr><th scope="col">Kommune</th><th scope="col">Per 1 000 innbyggere (totalt)</th></tr></thead>
        <tbody>{[target, ...peers].map((detail) => <tr key={detail.entity.code}>
          <th scope="row">{entityName(detail)}</th><td><Value {...observation(current, detail, year, code)} /></td>
        </tr>)}</tbody>
      </table></div>
    </dialog>
  );
}

export default function OccupationComparison({ target, peers, year, years }) {
  const { data, error, retry } = useYears([year]);
  const [selection, setSelection] = useState(null);
  const current = data?.[year];
  const rows = current?.occupations.map(([code, label]) => ({
    code, label, ...compare(current, target, peers, year, code),
  })).filter(({ own, rate, amount }) => Number.isFinite(own.amount) || rate.count || Number.isFinite(amount));
  return (
    <section className="cmp-occupations" aria-labelledby="cmp-occupation-title">
      <div className="cmp-section-title">
        <h2 id="cmp-occupation-title">Årsverk etter yrke</h2><span>{year}</span>
      </div>
      <p className="cmp-footnote">Avtalte årsverk per 1 000 innbyggere (totalt antall årsverk i parentes). Klikk på et yrke for historikk og tall for hver kommune.</p>
      {!current ? <Loading error={error} retry={retry} /> : !rows.length ? <p>Ingen rapporterte årsverk i utvalget.</p> : (
        <div className="cmp-driver-table"><table>
          <thead><tr><th scope="col">Yrke</th><th scope="col">{entityName(target)}</th><th scope="col">Median i utvalget</th><th scope="col">Avvik per 1 000</th></tr></thead>
          {[[false, "Omsorgstjenestene"], [true, "Kommunehelsetjenesten"]].map(([doctors, title]) => {
            const group = rows.filter((row) => (row.code === "doctor") === doctors);
            return group.length > 0 && <tbody key={title}>
              <tr className="cmp-driver-group"><th scope="rowgroup" colSpan={4}>{title}</th></tr>
              {group.map((row) => <tr key={row.code}>
                <th scope="row"><button type="button" aria-haspopup="dialog" onClick={() => setSelection([row.code, row.label])}>{row.label} ↗</button></th>
                <td><Value {...row.own} /></td>
                <td><Value rate={row.rate.value} amount={row.amount} /><small>{row.rate.count}/{peers.length} med data</small></td>
                <td>{formatNumber(row.own.rate != null && row.rate.value != null ? row.own.rate - row.rate.value : null, 2)}</td>
              </tr>)}
            </tbody>;
          })}
        </table></div>
      )}
      <p className="cmp-footnote">
        Leger dekker den bredere kommunehelsetjenesten. Yrkesfordelingen i omsorg gjelder omsorgstjenestene samlet.
        {" "}<a href="https://www.ssb.no/statbank/table/14533/">SSB 14533</a>
        {" · "}<a href="https://www.ssb.no/statbank/table/11996/">SSB 11996</a>
      </p>
      {selection && current && <OccupationHistory occupation={selection} target={target} peers={peers} years={years} year={year} current={current} onClose={() => setSelection(null)} />}
    </section>
  );
}
