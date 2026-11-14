import React, { useEffect, useId, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import data from "./stavanger-budget.json";
import { useReducedMotion } from "./CostChart";
import { formatNumber as number } from "./workspace-model";
import "./budget-workspace.css";

const ADOPTED = "adopted-2026";
const PROPOSAL = "proposal-2027";
const ACCOUNTS = "accounts-2025";
const POPULATION = 151669;
const SERIES = [
  ["actual", "Regnskap", "actual"],
  ["original", "Opprinnelig budsjett", "original"],
  ["adjusted", "Justert budsjett", "adjusted"],
  ["proposal", "Budsjettforslag", "proposal"],
  ["adoptedPlan", "Vedtatt økonomiplan", "plan"],
  ["proposedPlan", "Foreslått økonomiplan", "plan"],
];
export const publishedBudgetYears = [
  { year: 2025, label: "Budsjett" },
  ...data.groups.operations.sources[ADOPTED].columns
    .filter(({ kind }) => kind === "original")
    .map(({ year }) => ({ year, label: "Vedtatt budsjett" })),
  ...data.groups.operations.sources[PROPOSAL].columns
    .filter(({ kind }) => kind === "proposal" || kind === "proposedPlan")
    .map(({ year, kind }) => ({ year, label: kind === "proposal" ? "Budsjettforslag" : "Økonomiplan" })),
];

const CHART_SLOTS = [
  ["actual"],
  ["original", "proposal", "adoptedPlan", "proposedPlan"],
  ["adjusted"],
];

function observations(group, metric, version) {
  const result = new Map();
  for (const doc of [ACCOUNTS, ADOPTED, ...(version === PROPOSAL ? [PROPOSAL] : [])]) {
    const source = group.sources[doc];
    source.columns.forEach(({ year, kind, label }, index) => {
      if (kind === "reference" || (kind === "adoptedPlan" && version !== ADOPTED)) return;
      const amount = group.rows[metric][doc][index];
      const row = result.get(year) ?? { year, observations: {} };
      row.observations[kind] = { amount, doc, label };
      result.set(year, row);
    });
  }
  return [...result.values()].sort((a, b) => a.year - b.year);
}

function amounts(row, kind) {
  return row?.observations[kind]?.amount ?? null;
}

function signed(value) {
  return `${value > 0 ? "+" : ""}${number(value / 1000, 3)} mill. kr`;
}

function YearDetails({ row, visible, group, metric, tooltip = false, perCapita }) {
  if (!row) return null;
  return (
    <div className={tooltip ? "cmp-cost-tooltip cmp-budget-tooltip" : "cmp-budget-detail"}>
      <div className="cmp-tooltip-heading">{metric}<span>{row.year}</span></div>
      <table>
        <thead>
          <tr>
            <th scope="col">Tallgrunnlag</th>
            <th scope="col">Mill. kr</th>
            {perCapita && <th scope="col">Kr/innb.</th>}
            {!tooltip && <th scope="col">Kilde</th>}
          </tr>
        </thead>
        <tbody>
          {visible.filter(([kind]) => row.observations[kind]).map(([kind, label]) => {
            const { amount, doc, label: originalLabel } = row.observations[kind];
            return (
              <tr key={kind}>
                <th scope="row">{label}</th>
                <td>{amount === null ? "–" : number(amount / 1000, 3)}</td>
                {perCapita && <td>{amount === null ? "–" : number(amount * 1000 / POPULATION)}</td>}
                {!tooltip && (
                  <td>
                    <a href={data.documents[doc].url} target="_blank" rel="noreferrer">
                      {data.documents[doc].label}
                    </a>
                    <small title={originalLabel}>{group.section} · {originalLabel}</small>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BudgetChart({ rows, visible, selectedYear, onYear, metric, perCapita }) {
  const id = useId();
  const reduced = useReducedMotion();
  const series = visible.filter(([kind]) => rows.some((row) => amounts(row, kind) !== null));
  const divisor = perCapita ? POPULATION / 1000 : 1000;
  const slots = CHART_SLOTS.map((kinds) => series.filter(([kind]) => kinds.includes(kind)))
    .filter((slot) => slot.length > 0);
  const points = rows.map((row) => ({
    ...row,
    bars: slots.map((slot) => {
      const match = slot.find(([kind]) => amounts(row, kind) !== null);
      return match
        ? { value: amounts(row, match[0]) / divisor, style: match[2] }
        : { value: null };
    }),
  }));
  const fill = {
    actual: "var(--gronn)",
    original: "#9fb8b0",
    adjusted: "#e2dfd7",
    proposal: `url(#${id}-proposal)`,
    plan: `url(#${id}-plan)`,
  };
  return (
    <>
      <div className="cmp-budget-plot-title">
        <span>{perCapita ? "Kroner per innbygger · fast folketall" : "Millioner kroner"}</span>
        <span>Velg et år for kilder og tall</span>
      </div>
      <div className="cmp-budget-chart">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 650, height: 300 }}>
          <ComposedChart
            data={points}
            accessibilityLayer
            margin={{ top: 14, right: 14, bottom: 6, left: 0 }}
            barGap={3}
          >
            <defs>
              <pattern id={`${id}-proposal`} width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="#d4e4de" />
                <path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" stroke="#478175" strokeWidth="1" />
              </pattern>
              <pattern id={`${id}-plan`} width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="#e8e2d6" />
                <path d="M0,2 H6" stroke="#9b8f77" strokeWidth="1" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--strek)" />
            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: "var(--dempet)", fontSize: 12 }} />
            <YAxis width={68} tickFormatter={(value) => number(value, 1)} axisLine={false} tickLine={false} tick={{ fill: "var(--dempet)", fontSize: 11 }} />
            <ReferenceLine y={0} stroke="var(--strek)" />
            {series.some(([kind]) => kind === "actual") && rows.some((row) => row.year > 2025) && (
              <ReferenceLine x={2025} position="end" stroke="var(--dempet)" strokeDasharray="3 4" />
            )}
            <ReferenceLine x={selectedYear} stroke="var(--strek)" />
            <Tooltip
              isAnimationActive={!reduced}
              cursor={{ fill: "var(--cmp-hover)" }}
              content={({ active, payload }) => active && payload?.length ? (
                <YearDetails row={payload[0].payload} visible={series} metric={metric} tooltip perCapita={perCapita} />
              ) : null}
            />
            {slots.map((slot, index) => (
              <Bar
                key={slot[0][0]}
                dataKey={(point) => point.bars[index].value}
                maxBarSize={42}
                isAnimationActive={!reduced}
                animationDuration={450}
                onClick={(entry) => onYear(entry.payload.year)}
                cursor="pointer"
              >
                {points.map((point) => {
                  const { style } = point.bars[index];
                  return <Cell key={point.year} fill={fill[style]} stroke={style === "adjusted" ? "#a49b8b" : undefined} />;
                })}
              </Bar>
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="cmp-chart-legend cmp-budget-legend" aria-label="Forklaring">
        {series.map(([kind, label, style]) => <span key={kind}><i className={style} />{label}</span>)}
      </div>
    </>
  );
}

export default function BudgetWorkspace({ code, name, onStavanger, year, onYear }) {
  const [groupKey, setGroup] = useState("operations");
  const [metric, setMetric] = useState(data.groups.operations.default);
  const [version, setVersion] = useState(PROPOSAL);
  const [view, setView] = useState("both");
  const [perCapita, setPerCapita] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyTrigger = useRef(null);
  const [inspection, setInspection] = useState(null);
  const inspect = (y) => {
    if (publishedBudgetYears.some(({ year: option }) => option === y)) {
      setInspection(null);
      onYear(y);
    } else setInspection({ budgetYear: year, year: y });
  };

  if (code !== data.municipality) {
    return (
      <section className="cmp-workspace cmp-budget">
        <h2>Budsjett og regnskap</h2>
        <p>Budsjettdekning i denne visningen: Stavanger. {name} kan analyseres i regnskapsfanen.</p>
        <button className="cmp-primary" onClick={onStavanger}>Vis Stavanger</button>
      </section>
    );
  }

  const group = data.groups[groupKey];
  const effectiveVersion = year > 2029 ? PROPOSAL : version;
  const rows = observations(group, metric, effectiveVersion);
  const visible = SERIES.filter(([kind]) => view === "both" || (view === "actual" ? kind === "actual" : kind !== "actual"));
  const displayed = rows.filter((row) => visible.some(([kind]) => amounts(row, kind) !== null));
  const inspectedYear = inspection?.budgetYear === year ? inspection.year : year;
  const selected = displayed.find((row) => row.year === inspectedYear) ?? displayed.at(-1);
  const annual = rows.find((row) => row.year === 2025);
  const actual = amounts(annual, "actual");
  const adjusted = amounts(annual, "adjusted");
  const original2026 = amounts(rows.find((row) => row.year === 2026), "original");
  const proposalReference = group.rows[metric][PROPOSAL][0];

  return (
    <section className="cmp-workspace cmp-budget" aria-labelledby="cmp-budget-title">
      <header className="cmp-editorial-head">
        <div>
          <div className="cmp-eyebrow">Stavanger · Kommunekassen</div>
          <h2 id="cmp-budget-title">Budsjett og regnskap</h2>
          <p>Stavangers publiserte oppstillinger for kommunekassen. Velg et regnskapsår for å sammenligne kommunekonsern.</p>
        </div>
        <span>Offisielle oppstillinger</span>
      </header>

      <div className="cmp-budget-controls">
        <label>
          Oppstilling
          <select value={groupKey} onChange={(event) => {
            const next = event.target.value;
            setGroup(next);
            setMetric(data.groups[next].default);
          }}>
            {Object.entries(data.groups).map(([key, value]) => (
              <option key={key} value={key}>{value.label} · {value.section}</option>
            ))}
          </select>
        </label>
        <label>
          Budsjettpost
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {[group.default, ...Object.keys(group.rows).filter((row) => row !== group.default)].map((row) => (
              <option key={row}>{row}</option>
            ))}
          </select>
        </label>
        <label>
          Økonomiplan
          <select value={effectiveVersion} onChange={(event) => setVersion(event.target.value)}>
            {[PROPOSAL, ADOPTED].map((doc) => <option key={doc} value={doc} disabled={doc === ADOPTED && year > 2029}>{data.documents[doc].label}</option>)}
          </select>
        </label>
      </div>

      <div className="cmp-budget-viewbar">
        <div className="cmp-budget-segments" aria-label="Tallgrunnlag">
          {[["actual", "Regnskap"], ["budget", "Budsjett"], ["both", "Begge"]].map(([key, label]) => (
            <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
          ))}
        </div>
        <label className="cmp-budget-units">
          Måleenhet
          <select value={perCapita ? "population" : "amount"} onChange={(event) => setPerCapita(event.target.value === "population")}>
            <option value="amount">Beløp</option>
            <option value="population">Per innbygger</option>
          </select>
        </label>
      </div>

      <BudgetChart
        rows={displayed} visible={visible} metric={metric} perCapita={perCapita}
        selectedYear={selected?.year} onYear={inspect}
      />

      <button type="button" className="cmp-budget-history" ref={historyTrigger} onClick={() => setHistoryOpen(true)}>Åpne historikk ↗</button>
      {historyOpen && (
        <BudgetHistory group={group} metric={metric} rows={rows} onClose={() => { setHistoryOpen(false); historyTrigger.current?.focus(); }} />
      )}

      {perCapita && <p className="cmp-budget-note">
        Alle år er delt på {number(POPULATION)} innbyggere, folketallet 1. januar 2026.
        {" "}<a href="https://www.ssb.no/befolkning/folketall/artikler/de-storste-byene-og-tettstedene-i-norge" target="_blank" rel="noreferrer">SSB</a>
      </p>}

      <div className="cmp-budget-years" aria-label="Velg år">
        {displayed.map((row) => (
          <button key={row.year} aria-pressed={selected?.year === row.year} onClick={() => inspect(row.year)}>{row.year}</button>
        ))}
      </div>
      <div aria-live="polite">
        <YearDetails row={selected} visible={visible} group={group} metric={metric} perCapita={perCapita} />
      </div>
      {view === "both" && selected?.year === 2025 && actual !== null && adjusted !== null && (
        <p className="cmp-budget-note"><strong>Avvik mot justert budsjett</strong> {signed(actual - adjusted)} i 2025, beregnet som regnskap minus budsjett.</p>
      )}
      {view !== "actual" && effectiveVersion === PROPOSAL && original2026 !== null && proposalReference !== null && original2026 !== proposalReference && (
        <p className="cmp-budget-note">
          <strong>To publiserte tall for 2026.</strong> Vedtaket viser {number(original2026 / 1000, 3)} mill. kr for denne posten.
          Sammenligningskolonnen i 2027-forslaget viser {number(proposalReference / 1000, 3)} mill. kr. Grafen bruker vedtaket for 2026.
        </p>
      )}
      <details className="cmp-method cmp-budget-method">
        <summary>Kilder og metode</summary>
        <div>
          <p>
            Regnskap 2024 og 2025 og begge budsjettversjonene for 2025 kommer fra årsregnskapet for 2025.
            2026 viser det opprinnelige vedtaket. Fra 2027 følger grafen valgt økonomiplan.
          </p>
          <p>
            Beløp og fortegn følger oppstillingene. Inntekter og overskudd kan derfor vises med minus.
            Beløpene er vist uten prisjustering. Lokale bevilgninger følger Stavangers budsjettinndeling.
          </p>
          <ul>
            {Object.entries(group.sources).map(([doc, source]) => (
              <li key={doc}>
                <a href={data.documents[doc].url} target="_blank" rel="noreferrer">{data.documents[doc].label}</a>
                {" · "}<a href={source.url} target="_blank" rel="noreferrer">Talltabell ({group.section})</a>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}


function BudgetHistory({ group, metric, rows, onClose }) {
  const dialog = useRef(null);
  const [year, setYear] = useState(null);
  const [perCapita, setPerCapita] = useState(false);
  const lastActual = rows.findLast((row) => Number.isFinite(amounts(row, "actual")))?.year;
  const history = rows.filter((row) => Number.isFinite(amounts(row, "actual"))
    || (row.year > lastActual && SERIES.some(([kind]) => kind !== "actual" && Number.isFinite(amounts(row, kind)))));
  const selected = history.find((row) => row.year === year) ?? history.at(-1);
  const visible = SERIES.filter(([kind]) => kind !== "adjusted");
  const points = history.map((row) => row.year <= lastActual
    ? { ...row, observations: { actual: row.observations.actual } }
    : row);
  const selectedPoint = points.find((row) => row.year === selected?.year);
  useEffect(() => {
    const modal = dialog.current;
    modal.showModal();
    return () => modal.close();
  }, []);
  return (
    <dialog ref={dialog} className="ft cmp-inspect-modal" aria-labelledby="cmp-budget-history-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button type="button" className="cmp-dialog-close" aria-label="Lukk" onClick={onClose}>×</button>
      <p className="cmp-eyebrow">Stavanger · Kommunekassen · {group.section}</p>
      <h2 id="cmp-budget-history-title">{metric}</h2>
      <div className="cmp-budget-viewbar">
        <label className="cmp-budget-units">
          Måleenhet
          <select value={perCapita ? "population" : "amount"} onChange={(event) => setPerCapita(event.target.value === "population")}>
            <option value="amount">Beløp</option>
            <option value="population">Per innbygger · fast folketall</option>
          </select>
        </label>
      </div>
      <BudgetChart rows={points} visible={visible} selectedYear={selected?.year} onYear={setYear} metric={metric} perCapita={perCapita} />
      <label>
        Tall for{" "}
        <select value={selected?.year ?? ""} onChange={(event) => setYear(Number(event.target.value))}>
          {history.map((row) => <option key={row.year}>{row.year}</option>)}
        </select>
      </label>
      <YearDetails row={selectedPoint} visible={visible} group={group} metric={metric} perCapita={perCapita} />
    </dialog>
  );
}
