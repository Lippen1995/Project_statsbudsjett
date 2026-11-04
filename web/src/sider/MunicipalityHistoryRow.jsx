import React, { useEffect, useId, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { municipalityHistory, validateAxisBounds } from "./comparison";

const number = (value, digits = 0) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("nb-NO", { maximumFractionDigits: digits }).format(
        value,
      )
    : "–";
const nominal = (amount) =>
  Number.isFinite(amount) ? `${number(amount / 1000, 1)} mill. kr` : "–";
const EMPTY = { min: null, max: null };

export default function MunicipalityHistoryRow({
  row,
  own,
  years,
  selectedYear,
  sector,
  functionCode,
  maximum,
}) {
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!closing) return;
    if (reducedMotion) {
      setExpanded(false);
      setClosing(false);
      return;
    }
    const timer = setTimeout(() => {
      setExpanded(false);
      setClosing(false);
    }, 180);
    return () => clearTimeout(timer);
  }, [closing, reducedMotion]);
  const toggle = () => {
    if (closing) {
      setClosing(false);
      return;
    }
    if (expanded && !reducedMotion) setClosing(true);
    else setExpanded((v) => !v);
  };
  const [mode, setMode] = useState("perCapita");
  const [secondary, setSecondary] = useState("none");
  const [from, setFrom] = useState(Math.max(years[0], selectedYear - 5));
  const [to, setTo] = useState(selectedYear);
  const [axisOpen, setAxisOpen] = useState(false);
  const [primaryBounds, setPrimaryBounds] = useState(EMPTY);
  const [secondaryBounds, setSecondaryBounds] = useState(EMPTY);
  const [draft, setDraft] = useState({
    min: "",
    max: "",
    secondaryMin: "",
    secondaryMax: "",
  });
  const [error, setError] = useState("");
  const id = useId();
  const history = useMemo(
    () => municipalityHistory(row.detail, years, sector, functionCode, mode),
    [row.detail, years, sector, functionCode, mode],
  );
  const data = history.filter((p) => p.year >= from && p.year <= to);
  const costUnit = mode === "amount" ? "mill. kr" : "kr per innbygger";
  const secondaryLabel =
    secondary === "growth" ? "År/år-vekst (%)" : "Befolkning (innbyggere)";
  const openAxis = () => {
    setDraft({
      min: primaryBounds.min ?? "",
      max: primaryBounds.max ?? "",
      secondaryMin: secondaryBounds.min ?? "",
      secondaryMax: secondaryBounds.max ?? "",
    });
    setError("");
    setAxisOpen(true);
  };
  const applyAxis = (e) => {
    e.preventDefault();
    const left = validateAxisBounds(draft.min, draft.max);
    const right = validateAxisBounds(draft.secondaryMin, draft.secondaryMax);
    if (left.error || (secondary !== "none" && right.error)) {
      setError(left.error || right.error);
      return;
    }
    // Resolve automatic ends against visible data so one-sided limits cannot invert the scale.
    for (const [bounds, key, label] of [
      [left, "cost", "Venstre akse"],
      ...(secondary !== "none" ? [[right, secondary, "Høyre akse"]] : []),
    ]) {
      const values = data.map((p) => p[key]).filter(Number.isFinite);
      if (!values.length) continue;
      const low = bounds.min ?? Math.min(0, ...values);
      const high = bounds.max ?? Math.max(0, ...values);
      if (low >= high) {
        setError(
          `${label}: grensene gir et tomt eller omvendt intervall. Oppgi både nedre og øvre grense.`,
        );
        return;
      }
    }
    setPrimaryBounds({ min: left.min, max: left.max });
    setSecondaryBounds({ min: right.min, max: right.max });
    setAxisOpen(false);
    setError("");
  };
  const domain = (bounds) => [
    bounds.min ?? ((min) => Math.min(0, min)),
    bounds.max ?? "auto",
  ];
  const cropped =
    primaryBounds.min !== null ||
    primaryBounds.max !== null ||
    (secondary !== "none" &&
      (secondaryBounds.min !== null || secondaryBounds.max !== null));
  return (
    <div
      className={`cmp-bar-row ${own ? "own" : ""} ${expanded ? "cmp-row-expanded" : ""}`}
    >
      <button
        className="cmp-row-trigger"
        aria-expanded={expanded && !closing}
        aria-controls={id}
        onClick={toggle}
      >
        <span className="cmp-row-heading">
          <span className="cmp-row-name">
            <span aria-hidden="true">{expanded && !closing ? "−" : "+"}</span>{" "}
            {row.name}
            {own ? " · din kommune" : ""}
          </span>
          <span className="cmp-row-values">
            <strong>{number(row.perCapita)} kr</strong>{" "}
            <span>({nominal(row.amount)})</span>
          </span>
        </span>
        <span className="cmp-bar-track">
          <span
            style={{
              width: `${Number.isFinite(row.perCapita) ? Math.min(100, (Math.max(0, row.perCapita) / maximum) * 100) : 0}%`,
            }}
          />
        </span>
      </button>
      {expanded && (
        <div
          id={id}
          className={`cmp-row-history ${closing ? "cmp-history-closing" : ""}`}
        >
          <div className="cmp-row-history-title">
            <h4>{row.name} over tid</h4>
            <span>Netto driftsutgifter · løpende kroner</span>
          </div>
          <div className="cmp-history-controls">
            <label>
              Visning
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setPrimaryBounds(EMPTY);
                  setSecondaryBounds(EMPTY);
                  setAxisOpen(false);
                }}
              >
                <option value="perCapita">Per innbygger</option>
                <option value="amount">Nominelt beløp</option>
              </select>
            </label>
            <label>
              Sekundærakse
              <select
                value={secondary}
                onChange={(e) => {
                  setSecondary(e.target.value);
                  setSecondaryBounds(EMPTY);
                  setAxisOpen(false);
                }}
              >
                <option value="none">Ingen</option>
                <option value="growth">År/år-vekst (%)</option>
                <option value="population">Befolkning</option>
              </select>
            </label>
            <label>
              Fra år
              <select
                value={from}
                onChange={(e) => {
                  setFrom(+e.target.value);
                  setPrimaryBounds(EMPTY);
                  setSecondaryBounds(EMPTY);
                  setAxisOpen(false);
                }}
              >
                {years
                  .filter((y) => y <= to)
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
            </label>
            <label>
              Til år
              <select
                value={to}
                onChange={(e) => {
                  setTo(+e.target.value);
                  setPrimaryBounds(EMPTY);
                  setSecondaryBounds(EMPTY);
                  setAxisOpen(false);
                }}
              >
                {years
                  .filter((y) => y >= from)
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
            </label>
          </div>
          <div className="cmp-axis-toolbar">
            <span>
              Venstre: {costUnit}
              {secondary !== "none" ? ` · Høyre: ${secondaryLabel}` : ""}
            </span>
            <button onClick={openAxis} aria-expanded={axisOpen}>
              Juster Y-aksene ↕
            </button>
          </div>
          {axisOpen && (
            <form className="cmp-axis-editor" onSubmit={applyAxis}>
              <fieldset>
                <legend>Venstre akse · {costUnit}</legend>
                <div>
                  <label>
                    Nedre grense
                    <input
                      type="number"
                      step="any"
                      value={draft.min}
                      placeholder="Automatisk"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, min: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Øvre grense
                    <input
                      type="number"
                      step="any"
                      value={draft.max}
                      placeholder="Automatisk"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, max: e.target.value }))
                      }
                    />
                  </label>
                </div>
              </fieldset>
              {secondary !== "none" && (
                <fieldset>
                  <legend>Høyre akse · {secondaryLabel}</legend>
                  <div>
                    <label>
                      Nedre grense
                      <input
                        type="number"
                        step="any"
                        value={draft.secondaryMin}
                        placeholder="Automatisk"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            secondaryMin: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Øvre grense
                      <input
                        type="number"
                        step="any"
                        value={draft.secondaryMax}
                        placeholder="Automatisk"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            secondaryMax: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </fieldset>
              )}
              {error && (
                <p role="alert" className="cmp-rust">
                  {error}
                </p>
              )}
              <div className="cmp-axis-actions">
                <button type="submit" className="cmp-primary">
                  Bruk aksegrenser
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrimaryBounds(EMPTY);
                    setSecondaryBounds(EMPTY);
                    setAxisOpen(false);
                    setError("");
                  }}
                >
                  Tilbakestill til automatisk
                </button>
                <button type="button" onClick={() => setAxisOpen(false)}>
                  Avbryt
                </button>
              </div>
            </form>
          )}
          {cropped && (
            <p className="cmp-axis-notice">
              Tilpasset akseskala · stolper kan være avkortet. Sammenlign
              verdiene, ikke bare stolpehøyden.
            </p>
          )}
          <div
            className="cmp-row-chart"
            onContextMenu={(e) => {
              e.preventDefault();
              openAxis();
            }}
            aria-label={`Stolpediagram for ${row.name}. Bruk knappen Juster Y-aksene for å endre grensene.`}
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart
                data={data}
                margin={{
                  top: 12,
                  right: secondary === "none" ? 8 : 16,
                  bottom: 8,
                  left: 4,
                }}
                accessibilityLayer
              >
                <CartesianGrid stroke="#e2ddd3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                <YAxis
                  yAxisId="cost"
                  domain={domain(primaryBounds)}
                  allowDataOverflow
                  tickFormatter={(v) => number(v, mode === "amount" ? 1 : 0)}
                  width={65}
                  tick={{ fontSize: 10 }}
                />
                {secondary !== "none" && (
                  <YAxis
                    yAxisId="secondary"
                    orientation="right"
                    domain={domain(secondaryBounds)}
                    allowDataOverflow
                    width={65}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      secondary === "growth" ? `${number(v, 1)} %` : number(v)
                    }
                  />
                )}
                <Tooltip
                  labelFormatter={(y) => `Regnskapsår ${y}`}
                  formatter={(value, name) => [
                    name === "År/år-vekst"
                      ? `${number(value, 1)} %`
                      : name === "Befolkning"
                        ? `${number(value)} innbyggere`
                        : `${number(value, mode === "amount" ? 1 : 0)} ${costUnit}`,
                    name,
                  ]}
                  contentStyle={{
                    background: "#fffdf9",
                    borderColor: "#e2ddd3",
                    fontSize: 11,
                  }}
                />
                <Bar
                  yAxisId="cost"
                  dataKey="cost"
                  name={mode === "amount" ? "Nominelt beløp" : "Per innbygger"}
                  fill={own ? "#14594f" : "#8e9e99"}
                  maxBarSize={34}
                  isAnimationActive={!reducedMotion}
                  animationDuration={650}
                  animationEasing="ease-out"
                />
                {secondary !== "none" && (
                  <Line
                    yAxisId="secondary"
                    dataKey={secondary}
                    name={secondary === "growth" ? "År/år-vekst" : "Befolkning"}
                    stroke="#c5452e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    isAnimationActive={!reducedMotion}
                    animationDuration={500}
                    animationEasing="ease-out"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="cmp-row-chart-legend">
            <span>
              <i />
              {mode === "amount" ? "Nominelt beløp" : "Per innbygger"}
            </span>
            {secondary !== "none" && (
              <span>
                <i className="secondary" />
                {secondary === "growth" ? "År/år-vekst" : "Befolkning"}
              </span>
            )}
          </div>
          <p className="cmp-footnote">
            Høyreklikk i grafen eller bruk «Juster Y-aksene». Årsveksten følger
            valgt visning og bruker foregående kalenderår.{" "}
            {secondary === "population"
              ? "Befolkning er rekonstruert fra inntekter totalt og per innbygger, og kan avvike litt på grunn av avrunding. "
              : ""}
            Manglende år vises uten stolpe; linjen brytes ved manglende data.
          </p>
          <details className="cmp-history-table">
            <summary>Se tallene bak grafen</summary>
            <div className="cmp-table-wrap">
              <table>
                <caption>{row.name} · historiske verdier</caption>
                <thead>
                  <tr>
                    <th>År</th>
                    <th>{costUnit}</th>
                    {secondary !== "none" && <th>{secondaryLabel}</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.year}>
                      <th>{p.year}</th>
                      <td>{number(p.cost, mode === "amount" ? 1 : 0)}</td>
                      {secondary !== "none" && (
                        <td>
                          {number(p[secondary], secondary === "growth" ? 1 : 0)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
