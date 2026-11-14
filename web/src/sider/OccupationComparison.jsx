import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MunicipalityRankingList from "./MunicipalityRankingList";
import CostChart, { CostTable, useReducedMotion } from "./CostChart";
import { occupationObservation as observation } from "./occupation-observation";
import { benchmarkObservations } from "./comparison";
import { deviation, entityName, formatNumber, percent } from "./workspace-model";

const requests = new Map();

function loadAsset(key) {
  if (!requests.has(key)) {
    requests.set(key, fetch(`/data/kostra/occupations/${key}.json`).then(async (response) => {
      if (!response.ok) throw new Error("Mangler SSB-uttrekk");
      return response.json();
    }).catch((error) => {
      requests.delete(key);
      throw error;
    }));
  }
  return requests.get(key);
}

function useOccupationAssets(assets) {
  const key = assets.join(",");
  const [result, setResult] = useState(null);
  const [attempt, retry] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all(key.split(",").map((asset) => loadAsset(asset).then((data) => [asset, data])))
      .then((entries) => { if (active) setResult({ key, attempt, data: Object.fromEntries(entries) }); })
      .catch(() => { if (active) setResult({ key, attempt, error: true }); });
    return () => { active = false; };
  }, [key, attempt]);

  return {
    ...(result?.key === key && result.attempt === attempt ? result : null),
    retry: () => retry((n) => n + 1),
  };
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

function Loading({ error, retry, label = "årsverk" }) {
  return <p role={error ? "alert" : "status"}>
    {error ? <>Kunne ikke hente {label}. <button type="button" onClick={retry}>Prøv igjen</button></> : `Henter ${label} fra SSB…`}
  </p>;
}

function OccupationDialog({ title, label, onClose, children }) {
  const dialog = useRef(null);
  const heading = useId();
  const reduced = useReducedMotion();
  const [closing, setClosing] = useState(false);

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
          <div className="cmp-eyebrow">{title}</div>
          <h2 id={heading}>{label}</h2>
        </div>
        <button type="button" autoFocus className="cmp-dialog-close" aria-label="Lukk sammenligning" onClick={() => setClosing(true)}>×</button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

function OccupationHistory({ occupation, target, peers, years, year, current, onClose }) {
  const { data, error, retry } = useOccupationAssets(years);
  const [code, label] = occupation;
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

  return (
    <OccupationDialog label={label} onClose={onClose}
      title={`${entityName(target)} · ${code === "doctor" ? "Kommunehelsetjenesten" : "Omsorgstjenestene"}`}>
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
    </OccupationDialog>
  );
}

function useSort(initialKey = null) {
  const [sort, setSort] = useState({ key: initialKey, ascending: false });
  const changeSort = (key) => setSort((previous) => ({
    key, ascending: previous.key === key ? !previous.ascending : key === "label",
  }));
  return { sort, changeSort };
}

function SortHeaders({ columns, sort, changeSort }) {
  return <thead><tr>{columns.map(([key, label]) => (
    <th key={key} scope="col" className="cmp-sort-heading"
      aria-sort={sort.key === key ? (sort.ascending ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => changeSort(key)}>
        <span>{label}</span><span aria-hidden="true">{sort.key === key ? (sort.ascending ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  ))}</tr></thead>;
}

function sortRows(rows, sort, read) {
  if (!sort.key) return rows;
  const direction = sort.ascending ? 1 : -1;
  return rows.sort((a, b) => {
    if (sort.key === "label") return direction * a.label.localeCompare(b.label, "nb");
    const left = read(a, sort.key), right = read(b, sort.key);
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
    if (!Number.isFinite(right)) return -1;
    return direction * (left - right);
  });
}

function StaffingTable({ target, peers, year, years }) {
  const { data, error, retry } = useOccupationAssets([year]);
  const [selection, setSelection] = useState(null);
  const sorting = useSort();
  const columns = [["label", "Yrke"], ["own", entityName(target)], ["median", "Median i utvalget"], ["percent", "Avvik (%)"]];
  const current = data?.[year];
  const rows = current?.occupations.map(([code, label]) => {
    const stats = compare(current, target, peers, year, code);
    return { code, label, ...stats, percent: deviation(stats.own.rate, stats.rate.value) };
  }).filter(({ own, rate, amount }) => Number.isFinite(own.amount) || rate.count || Number.isFinite(amount));
  return (
    <>
      <p className="cmp-footnote">Avtalte årsverk per 1 000 innbyggere (totalt antall årsverk i parentes). Klikk på et yrke for historikk og tall for hver kommune.</p>
      {!current ? <Loading error={error} retry={retry} /> : !rows.length ? <p>Ingen rapporterte årsverk i utvalget.</p> : (
        <div className="cmp-driver-table"><table>
          <SortHeaders columns={columns} {...sorting} />
          {[[false, "Omsorgstjenestene"], [true, "Kommunehelsetjenesten"]].map(([doctors, title]) => {
            const group = sortRows(rows.filter((row) => (row.code === "doctor") === doctors), sorting.sort,
              (row, key) => key === "own" ? row.own.rate : key === "median" ? row.rate.value : row.percent);
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
    </>
  );
}

const SICKNESS_SOURCE = "https://www.ssb.no/statbank/table/14789/";

function SicknessHistory({ occupation, baseline, years, year, onClose }) {
  const [secondary, setSecondary] = useState("none");
  const [inspected, setInspected] = useState(String(year));
  const [code, label, rates] = occupation;
  const history = years.map((period, i) => ({
    code: period, label: period, a: rates[i], b: baseline[i],
    own: { name: label, year: period, perCapita: rates[i], growth: deviation(rates[i], rates[i - 1]) },
    reference: { name: "Alle yrker", perCapita: baseline[i], growth: deviation(baseline[i], baseline[i - 1]) },
  }));
  const selected = history.find((row) => row.code === inspected);
  return (
    <OccupationDialog label={label} title="Hele landet · Legemeldt sykefravær" onClose={onClose}>
      <div className="cmp-dialog-options">
        <select aria-label="Sekundærakse" value={secondary} onChange={(event) => setSecondary(event.target.value)}>
          <option value="none">Ingen tilleggsserie</option>
          <option value="growth">År/år-endring (%)</option>
        </select>
      </div>
      <div className="cmp-chart-legend"><span><i />{label}</span><span><i className="peer" />Alle yrker</span></div>
      <CostChart rows={history} paired history sickness secondary={secondary} title={label} chartKey={code}
        onInspect={(row) => setInspected(row.code)} />
      <div className="cmp-inspect-selector">
        <label className="cmp-inline-label">Tall for
          <select aria-label="Vis tall for år" value={inspected} onChange={(event) => setInspected(event.target.value)}>
            {years.map((period) => <option key={period}>{period}</option>)}
          </select>
        </label>
        <span>Klikk på Y-aksen for å tilpasse skalaen.</span>
      </div>
      <CostTable row={selected} compact sickness history />
      <p className="cmp-footnote">Legemeldte fraværsdagsverk i prosent av avtalte dagsverk. <a href={SICKNESS_SOURCE}>SSB 14789</a></p>
    </OccupationDialog>
  );
}

function SicknessTable({ year }) {
  const { data, error, retry } = useOccupationAssets(["sickness"]);
  const [selection, setSelection] = useState(null);
  const sorting = useSort("rate");
  const columns = [["label", "Yrke"], ["rate", "Hele landet (%)"], ["difference", "Avvik fra alle yrker (pp)"]];
  const source = data?.sickness;
  const index = source?.years.indexOf(String(year)) ?? -1;
  const baseline = source?.occupations.find(([code]) => code === "0-9")?.[2];
  const reference = baseline?.[index];
  const rows = (source?.occupations ?? []).flatMap((occupation) => {
    const [code, label, rates] = occupation;
    if (code === "0-9") return [];
    const rate = rates[index];
    const difference = Number.isFinite(rate) && Number.isFinite(reference)
      ? Math.round((rate - reference) * 100) / 100 : null;
    return [{ code, label, rate, difference, occupation }];
  });
  return <>
    <p className="cmp-footnote">Legemeldt sykefravær for utvalgte yrker i hele landet, på tvers av sektorer. Klikk på et yrke for historikk.</p>
    {!source ? <Loading error={error} retry={retry} label="sykefravær" /> : index < 0 ? (
      <p>SSB har ikke publisert nasjonale yrkestall for {year}.</p>
    ) : (
      <div className="cmp-driver-table"><table>
        <SortHeaders columns={columns} {...sorting} />
        <tbody>
          <tr className="cmp-driver-group"><th scope="row">Alle yrker i Norge</th><td>{formatNumber(reference, 2)}</td><td>–</td></tr>
          {sortRows(rows, sorting.sort, (row, key) => row[key]).map((row) => (
            <tr key={row.code}>
              <th scope="row"><button type="button" aria-haspopup="dialog" onClick={() => setSelection(row.occupation)}>{row.label} ↗</button></th>
              <td>{formatNumber(row.rate, 2)}</td>
              <td>{row.difference > 0 ? "+" : ""}{formatNumber(row.difference, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    )}
    <p className="cmp-footnote">Avvik vises i prosentpoeng. <a href={SICKNESS_SOURCE}>SSB 14789</a></p>
    {selection && index >= 0 && <SicknessHistory occupation={selection} baseline={baseline} years={source.years}
      year={year} onClose={() => setSelection(null)} />}
  </>;
}

export default function OccupationComparison({ target, peers, year, years }) {
  const [view, setView] = useState("staffing");
  return (
    <section className="cmp-occupations" aria-labelledby="cmp-occupation-title">
      <div className="cmp-section-title">
        <h2 id="cmp-occupation-title">{view === "staffing" ? "Årsverk etter yrke" : "Sykefravær etter yrke"}</h2>
        <div className="cmp-occupation-controls">
          <div className="cmp-view-switch" role="group" aria-label="Visning etter yrke">
            <button type="button" aria-pressed={view === "staffing"} onClick={() => setView("staffing")}>Årsverk</button>
            <button type="button" aria-pressed={view === "sickness"} onClick={() => setView("sickness")}>Sykefravær</button>
          </div>
          <span>{year}</span>
        </div>
      </div>
      <div hidden={view !== "staffing"}><StaffingTable target={target} peers={peers} year={year} years={years} /></div>
      {view === "sickness" && <SicknessTable key={year} year={year} />}
    </section>
  );
}
