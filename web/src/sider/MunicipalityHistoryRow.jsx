import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
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
import { autoFitAxis, municipalityHistory } from "./comparison";
import AxisPopover from "./AxisPopover";

const number = (v, digits = 0) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("nb-NO", { maximumFractionDigits: digits }).format(
        v,
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
  const [expanded, setExpanded] = useState(false),
    [closing, setClosing] = useState(false);
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
    setAxis(null);
  };
  const [mode, setMode] = useState("perCapita"),
    [secondary, setSecondary] = useState("none");
  const [from, setFrom] = useState(Math.max(years[0], selectedYear - 5)),
    [to, setTo] = useState(selectedYear);
  const [axis, setAxis] = useState(null);
  const [primaryBounds, setPrimaryBounds] = useState(EMPTY),
    [secondaryBounds, setSecondaryBounds] = useState(EMPTY);
  const closeAxis = useCallback(() => setAxis(null), []);
  const id = useId();
  const history = useMemo(
    () => municipalityHistory(row.detail, years, sector, functionCode, mode),
    [row.detail, years, sector, functionCode, mode],
  );
  const data = history.filter((p) => p.year >= from && p.year <= to);
  const costUnit =
    mode === "amount" ? "Millioner kroner" : "Kroner per innbygger";
  const secondaryUnit = secondary === "growth" ? "Årsvekst (%)" : "Innbyggere";
  const primaryFit = autoFitAxis(data.map((p) => p.cost)),
    secondaryFit = autoFitAxis(data.map((p) => p[secondary]));
  const primaryDomain = [
    primaryBounds.min ?? primaryFit[0],
    primaryBounds.max ?? primaryFit[1],
  ];
  const secondaryDomain = [
    secondaryBounds.min ?? secondaryFit[0],
    secondaryBounds.max ?? secondaryFit[1],
  ];
  const customized =
    primaryBounds.min !== null ||
    primaryBounds.max !== null ||
    (secondary !== "none" &&
      (secondaryBounds.min !== null || secondaryBounds.max !== null));
  const openAxis = (side, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 264,
      height = 208;
    const preferred =
      side === "primary" ? rect.right + 6 : rect.left - width - 6;
    setAxis({
      side,
      left: Math.max(10, Math.min(window.innerWidth - width - 10, preferred)),
      top: Math.max(
        10,
        Math.min(window.innerHeight - height - 10, rect.top + 15),
      ),
    });
  };
  const changeMode = (value) => {
    setMode(value);
    setPrimaryBounds(EMPTY);
    setSecondaryBounds(EMPTY);
    closeAxis();
  };
  const changePeriod = (side, value) => {
    if (side === "from") setFrom(value);
    else setTo(value);
    setPrimaryBounds(EMPTY);
    setSecondaryBounds(EMPTY);
    closeAxis();
  };
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
          <div
            className="cmp-history-compact"
            aria-label={`Grafvalg for ${row.name}`}
          >
            <div className="cmp-view-switch" role="group" aria-label="Visning">
              <button
                aria-pressed={mode === "perCapita"}
                onClick={() => changeMode("perCapita")}
              >
                Per innbygger
              </button>
              <button
                aria-pressed={mode === "amount"}
                onClick={() => changeMode("amount")}
              >
                Nominelt
              </button>
            </div>
            <select
              aria-label="Sekundærakse"
              value={secondary}
              onChange={(e) => {
                setSecondary(e.target.value);
                setSecondaryBounds(EMPTY);
                closeAxis();
              }}
            >
              <option value="none">Ingen tilleggsserie</option>
              <option value="growth">Årsvekst (%)</option>
              <option value="population">Befolkning</option>
            </select>
            <div className="cmp-period-inline">
              <select
                aria-label="Fra år"
                value={from}
                onChange={(e) => changePeriod("from", +e.target.value)}
              >
                {years
                  .filter((y) => y <= to)
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
              <span aria-hidden="true">–</span>
              <select
                aria-label="Til år"
                value={to}
                onChange={(e) => changePeriod("to", +e.target.value)}
              >
                {years
                  .filter((y) => y >= from)
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="cmp-row-chart cmp-interactive-axes">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={data}
                margin={{ top: 12, right: 4, bottom: 8, left: 4 }}
                accessibilityLayer
              >
                <CartesianGrid stroke="#e2ddd3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                <YAxis
                  yAxisId="cost"
                  domain={primaryDomain}
                  allowDataOverflow
                  width={80}
                  tickCount={5}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => number(v, mode === "amount" ? 1 : 0)}
                  label={{
                    value: costUnit,
                    angle: -90,
                    position: "insideLeft",
                    offset: 2,
                    style: {
                      fontSize: 9,
                      fill: "#6b6a66",
                      textAnchor: "middle",
                    },
                  }}
                />
                {secondary !== "none" && (
                  <YAxis
                    yAxisId="secondary"
                    orientation="right"
                    domain={secondaryDomain}
                    allowDataOverflow
                    width={80}
                    tickCount={5}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      secondary === "growth" ? `${number(v, 1)} %` : number(v)
                    }
                    label={{
                      value: secondaryUnit,
                      angle: 90,
                      position: "insideRight",
                      offset: 2,
                      style: {
                        fontSize: 9,
                        fill: "#6b6a66",
                        textAnchor: "middle",
                      },
                    }}
                  />
                )}
                <Tooltip
                  labelFormatter={(y) => `Regnskapsår ${y}`}
                  formatter={(value, name) => [
                    name === "År/år-vekst"
                      ? `${number(value, 1)} %`
                      : name === "Befolkning"
                        ? `${number(value)} innbyggere`
                        : `${number(value, mode === "amount" ? 1 : 0)} ${mode === "amount" ? "mill. kr" : "kr per innbygger"}`,
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
            <button
              className="cmp-axis-hit cmp-axis-hit--left"
              aria-label={`Juster venstre Y-akse: ${costUnit.toLocaleLowerCase("nb")}`}
              title="Klikk for å justere aksen"
              aria-haspopup="dialog"
              onClick={(event) => openAxis("primary", event)}
            />
            {secondary !== "none" && (
              <button
                className="cmp-axis-hit cmp-axis-hit--right"
                aria-label={`Juster høyre Y-akse: ${secondaryUnit.toLocaleLowerCase("nb")}`}
                title="Klikk for å justere aksen"
                aria-haspopup="dialog"
                onClick={(event) => openAxis("secondary", event)}
              />
            )}
          </div>
          <div className="cmp-row-chart-legend">
            <span>
              <i />
              {mode === "amount" ? "Nominelt beløp" : "Per innbygger"}
            </span>
            {secondary !== "none" && (
              <span>
                <i className="secondary" />
                {secondary === "growth" ? "Årsvekst" : "Befolkning"}
              </span>
            )}
            <span
              className="cmp-scale-caption"
              title="Stolpene starter ved nedre aksegrense. Klikk på en Y-akse for å justere skalaen."
            >
              {customized ? "Tilpasset skala" : "Automatisk skala"}
            </span>
          </div>
          <details className="cmp-history-table">
            <summary>Tall og metode</summary>
            <p className="cmp-footnote">
              Skalaen tilpasses de synlige verdiene og starter ikke nødvendigvis
              på null. Klikk på aksen for å endre grensene. Årsveksten følger
              valgt visning og bruker foregående kalenderår.{" "}
              {secondary === "population"
                ? "Befolkning er rekonstruert fra inntekter totalt og per innbygger og kan avvike litt på grunn av avrunding. "
                : ""}
              Manglende år vises uten stolpe; linjen brytes ved manglende data.
            </p>
            <div className="cmp-table-wrap">
              <table>
                <caption>{row.name} · historiske verdier</caption>
                <thead>
                  <tr>
                    <th>År</th>
                    <th>{costUnit}</th>
                    {secondary !== "none" && <th>{secondaryUnit}</th>}
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
          {axis && (
            <AxisPopover
              axis={axis}
              unit={axis.side === "primary" ? costUnit : secondaryUnit}
              bounds={axis.side === "primary" ? primaryBounds : secondaryBounds}
              values={data.map(
                (p) => p[axis.side === "primary" ? "cost" : secondary],
              )}
              onClose={closeAxis}
              onApply={(bounds) => {
                if (axis.side === "primary") setPrimaryBounds(bounds);
                else setSecondaryBounds(bounds);
                closeAxis();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
