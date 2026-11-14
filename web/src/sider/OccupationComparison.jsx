import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MunicipalityRankingList from "./MunicipalityRankingList";
import CostChart, { CostTable, useReducedMotion } from "./CostChart";
import { benchmarkObservations } from "./comparison";
import { deviation, entityName, formatNumber, percent } from "./workspace-model";

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
  const reduced = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const [secondary, setSecondary] = useState("none");
  const [inspected, setInspected] = useState(String(year));
  const history = data ? years.map((y) => {
    const { own, rate, amount } = compare(data[y], target, peers, y, code);
    const previous = data[y - 1] ? compare(data[y - 1], target, peers, y - 1, code) : null;
    return {
      code: String(y), label: String(y), a: own.rate, b: rate.value,
      own: { name: entityName(target), year: y, perCapita: own.rate, amount: own.amount, growth: deviation(own.rate, previous?.own.rate) },
      reference: { name: "Median", perCapita: rate.value, amount, growth: deviation(rate.value, previous?.rate.value) },
      percent: deviation(own.rate, rate.value),
    };
  }) : [];
  const selected = history.find((row) => row.code === inspected) ?? history.at(-1);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!closing) return;
    if (reduced) { onClose(); return; }
    const timer = setTimeout(onClose, 210);
    return () => clearTimeout(timer);
  }, [closing, reduced, onClose]);

  return createPortal(
    <dialog ref={dialog} className={`ft cmp-inspect-modal cmp-occupation-modal ${closing ? "cmp-dialog-closing" : ""}`}
      aria-labelledby={heading} onCancel={(event) => { event.preventDefault(); setClosing(true); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) setClosing(true);
      }}>
      <header className="cmp-inspect-head">
        <div>
          <div className="cmp-eyebrow">{entityName(target)} · {code === "doctor" ? "Kommunehelsetjenesten" : "Omsorgstjenestene"}</div>
          <h2 id={heading}>{label}</h2>
        </div>
        <button type="button" autoFocus className="cmp-dialog-close" aria-label="Lukk sammenligning" onClick={() => setClosing(true)}>×</button>
      </header>
      {!data ? <Loading error={error} retry={retry} /> : (
        <>
          <div className="cmp-dialog-options">
            <select aria-label="Sekundærakse" value={secondary} onChange={(event) => setSecondary(event.target.value)}>
              <option value="none">Ingen tilleggsserie</option>
              <option value="growth">År/år-endring (%)</option>
            </select>
          </div>
          <div className="cmp-chart-legend"><span><i />{entityName(target)}</span><span><i className="peer" />Median i utvalget</span></div>
          <CostChart rows={history} paired history staffing secondary={secondary} title={label} chartKey={code}
            onInspect={(row) => setInspected(row.code)} />
          <div className="cmp-inspect-selector">
            <label className="cmp-inline-label">Tall for
              <select aria-label="Vis tall for år" value={selected?.code ?? ""} onChange={(event) => setInspected(event.target.value)}>
                {history.map((row) => <option key={row.code}>{row.label}</option>)}
              </select>
            </label>
            <span>Klikk på Y-aksen for å tilpasse skalaen.</span>
          </div>
          <CostTable row={selected} context={label} compact staffing history />
        </>
      )}
      <h3>Kommunene i {year}</h3>
      <p className="cmp-footnote">Årsverk per 1 000 innbyggere (totalt antall årsverk).</p>
      <MunicipalityRankingList
        rows={[target, ...peers].map((detail) => {
          const own = observation(current, detail, year, code);
          return { code: detail.entity.code, a: own.rate, own: { ...own, name: entityName(detail) } };
        }).sort((a, b) => (
          (b.a ?? -Infinity) - (a.a ?? -Infinity) || a.own.name.localeCompare(b.own.name, "nb")
        ))}
        selectedCode={target.entity.code}
        renderValue={({ own }) => <Value {...own} />}
      />
      <p className="cmp-footnote">Manglende verdier vises som «–». Referansen utelater {entityName(target)}.</p>
    </dialog>,
    document.body,
  );
}

export default function OccupationComparison({ target, peers, year, years }) {
  const { data, error, retry } = useYears([year]);
  const [selection, setSelection] = useState(null);
  const [sort, setSort] = useState({ key: null, ascending: false });
  const columns = [["label", "Yrke"], ["own", entityName(target)], ["median", "Median i utvalget"], ["percent", "Avvik (%)"]];
  const changeSort = (key) => setSort((previous) => ({
    key, ascending: previous.key === key ? !previous.ascending : key === "label",
  }));
  const current = data?.[year];
  const rows = current?.occupations.map(([code, label]) => {
    const stats = compare(current, target, peers, year, code);
    return { code, label, ...stats, percent: deviation(stats.own.rate, stats.rate.value) };
  }).filter(({ own, rate, amount }) => Number.isFinite(own.amount) || rate.count || Number.isFinite(amount));
  return (
    <section className="cmp-occupations" aria-labelledby="cmp-occupation-title">
      <div className="cmp-section-title">
        <h2 id="cmp-occupation-title">Årsverk etter yrke</h2><span>{year}</span>
      </div>
      <p className="cmp-footnote">Avtalte årsverk per 1 000 innbyggere (totalt antall årsverk i parentes). Klikk på et yrke for historikk og tall for hver kommune.</p>
      {!current ? <Loading error={error} retry={retry} /> : !rows.length ? <p>Ingen rapporterte årsverk i utvalget.</p> : (
        <div className="cmp-driver-table"><table>
          <thead><tr>{columns.map(([key, label]) => (
            <th key={key} scope="col" className="cmp-sort-heading"
              aria-sort={sort.key === key ? (sort.ascending ? "ascending" : "descending") : undefined}>
              <button type="button" onClick={() => changeSort(key)}>
                <span>{label}</span><span aria-hidden="true">{sort.key === key ? (sort.ascending ? "↑" : "↓") : "↕"}</span>
              </button>
            </th>
          ))}</tr></thead>
          {[[false, "Omsorgstjenestene"], [true, "Kommunehelsetjenesten"]].map(([doctors, title]) => {
            const group = rows.filter((row) => (row.code === "doctor") === doctors);
            if (sort.key) group.sort((a, b) => {
              const direction = sort.ascending ? 1 : -1;
              if (sort.key === "label") return direction * a.label.localeCompare(b.label, "nb");
              const value = (row) => sort.key === "own" ? row.own.rate : sort.key === "median" ? row.rate.value : row.percent;
              const left = value(a), right = value(b);
              if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
              if (!Number.isFinite(right)) return -1;
              return direction * (left - right);
            });
            return group.length > 0 && <tbody key={title}>
              <tr className="cmp-driver-group"><th scope="rowgroup" colSpan={4}>{title}</th></tr>
              {group.map((row) => <tr key={row.code}>
                <th scope="row"><button type="button" aria-haspopup="dialog" onClick={() => setSelection([row.code, row.label])}>{row.label} ↗</button></th>
                <td><Value {...row.own} /></td>
                <td><Value rate={row.rate.value} amount={row.amount} /><small>{row.rate.count}/{peers.length} med data</small></td>
                <td>{percent(row.percent)}</td>
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
