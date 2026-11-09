import React, { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import AxisPopover from "./AxisPopover";
import {
  chartDomain,
  formatNumber as n,
  nominal,
  percent,
} from "./workspace-model";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return reduced;
}
export function CostTable({
  row,
  history = false,
  context = "",
  compact = false,
}) {
  if (!row?.own) return null;
  const { own, reference: ref } = row;
  const metrics = [
    [compact ? "Per innbygger" : "Kr per innb.", `${n(own.perCapita)} kr`, `${n(ref?.perCapita)} kr`],
    [compact ? "Nominelt beløp" : "Totalt", nominal(own.amount), nominal(ref?.amount)],
    [
      "Folketall",
      own.population > 0 ? `≈ ${n(own.population)}` : "–",
      ref?.population > 0 ? `≈ ${n(ref.population)}` : "–",
    ],
    [compact ? "Avvik per innbygger" : "Avvik per innb.", percent(row.percent), "–"],
    ...(history
      ? [[compact ? "År/år-endring" : "År/år", percent(own.growth), percent(ref?.growth)]]
      : []),
  ];
  return (
    <div
      className={`cmp-cost-tooltip ${compact ? "cmp-cost-tooltip--inline" : "cmp-cost-tooltip--hover"}`}
    >
      <div className="cmp-tooltip-heading">
        {context || row.context || own.name}
        <span>{own.year}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">Nøkkeltall</th>
            <th scope="col">{own.name}</th>
            <th scope="col">{ref?.name || "Referanse"}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(([label, value, other]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
              <td>{other}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {compact && ref?.calculated && (
        <p>
          Referansebeløpet er beregnet ved {own.name}s folketall. Referansen
          bygger på {ref.count} kommuner.
        </p>
      )}
    </div>
  );
}
function ChartTooltip({ active, payload, history, context }) {
  if (!active || !payload?.length) return null;
  return (
    <CostTable
      row={payload[0].payload}
      history={history}
      context={payload[0].payload.context || context}
    />
  );
}
const EMPTY = { min: null, max: null };
export default function CostChart({
  rows,
  paired = false,
  vertical = false,
  history = false,
  mode = "perCapita",
  secondary = "none",
  title,
  categoryLabel = "Tjenesteområde / funksjon",
  onSelect,
  selected,
  deltas = false,
  chartKey,
  onInspect,
  animate = true,
}) {
  const reduced = useReducedMotion();
  const [bounds, setBounds] = useState(EMPTY),
    [secondaryBounds, setSecondaryBounds] = useState(EMPTY),
    [axis, setAxis] = useState(null);
  const closeAxis = useCallback(() => setAxis(null), []);
  useEffect(() => {
    setBounds(EMPTY);
    setSecondaryBounds(EMPTY);
    closeAxis();
  }, [chartKey, closeAxis]);
  const values = rows.flatMap((r) => (paired ? [r.a, r.b] : [r.a]));
  const primary = chartDomain(values, bounds),
    second = chartDomain(
      rows.map((r) =>
        secondary === "growth" ? r.own.growth : r.own.population,
      ),
      secondaryBounds,
    );
  const unit = mode === "amount" ? "Millioner kroner" : "Kroner per innbygger";
  const secondUnit =
    secondary === "growth" ? "År/år-endring (%)" : "Innbyggere";
  const openAxis = (side, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAxis({
      side,
      left: Math.max(
        10,
        Math.min(
          window.innerWidth - 274,
          side === "primary" ? rect.right + 4 : rect.left - 270,
        ),
      ),
      top: Math.max(10, Math.min(window.innerHeight - 235, rect.top)),
    });
  };
  const deltaLabel = (series) => (props) => {
    const row = rows[props.index];
    if (!row) return null;
    const higher =
      !Number.isFinite(row.a) || (Number.isFinite(row.b) && row.b > row.a)
        ? "b"
        : "a";
    if (series !== higher) return null;
    return (
      <text
        x={props.x + props.width / 2}
        y={props.y - 10}
        textAnchor="middle"
        className="cmp-delta-label"
      >
        {percent(row.percent)}
      </text>
    );
  };
  return (
    <div className="cmp-cost-chart" role="group" aria-label={title}>
      <div className="cmp-chart-units">
        <span>{unit}</span>
        {secondary !== "none" && <span>{secondUnit}</span>}
      </div>
      <div className={paired && !history ? "cmp-category-scroll" : ""}>
        <div
          style={
            paired && !history ? { minWidth: rows.length * 65 + 82 } : undefined
          }
          className={`cmp-chart-plot ${secondary !== "none" ? "cmp-chart-plot--secondary" : ""}`}
        >
          <ResponsiveContainer
            width="100%"
            height={vertical ? 390 : 295}
            minWidth={0}
          >
            <ComposedChart
              key={chartKey}
              data={rows}
              margin={{
                top: deltas ? 26 : 15,
                right: secondary !== "none" ? 12 : 8,
                left: 0,
                bottom: 16,
              }}
              barGap={3}
              accessibilityLayer
              onClick={(state) => {
                const row = rows[state?.activeTooltipIndex];
                if (row) {
                  onInspect?.(row);
                  onSelect?.(row.code);
                }
              }}
            >
              <CartesianGrid vertical={false} stroke="var(--strek)" />
              <XAxis
                dataKey="label"
                interval={vertical ? 0 : "preserveStartEnd"}
                angle={vertical ? -90 : 0}
                textAnchor={vertical ? "end" : "middle"}
                height={vertical ? 135 : 48}
                tickMargin={10}
                tick={{ fontSize: 11, fill: "var(--dempet)" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: vertical
                    ? "Kommune"
                    : history
                      ? "Regnskapsår"
                      : categoryLabel,
                  position: "insideBottom",
                  offset: -6,
                  style: { fill: "var(--dempet)", fontSize: 11 },
                }}
              />
              <YAxis
                yAxisId="cost"
                domain={primary.domain}
                ticks={primary.ticks}
                allowDataOverflow
                width={72}
                tickFormatter={(v) => n(v, mode === "amount" ? 1 : 0)}
                tick={{ fontSize: 11, fill: "var(--dempet)" }}
                axisLine={false}
                tickLine={false}
              />
              {secondary !== "none" && (
                <YAxis
                  yAxisId="secondary"
                  orientation="right"
                  domain={second.domain}
                  ticks={second.ticks}
                  allowDataOverflow
                  width={76}
                  tickFormatter={(v) =>
                    secondary === "growth" ? `${n(v, 1)} %` : n(v)
                  }
                  tick={{ fontSize: 11, fill: "var(--dempet)" }}
                  axisLine={false}
                  tickLine={false}
                />
              )}
              <Tooltip
                content={<ChartTooltip history={history} context={title} />}
                isAnimationActive={false}
                cursor={{ fill: "var(--cmp-hover)" }}
                wrapperStyle={{ outline: "none", zIndex: 20, transition: "none" }}
              />
              <Bar
                yAxisId="cost"
                dataKey="a"
                name="Kommune"
                fill="var(--gronn)"
                maxBarSize={34}
                isAnimationActive={animate && !reduced}
                animationDuration={850}
                animationEasing="ease-out"
              >
                {rows.map((row) => (
                  <Cell
                    key={row.code}
                    fill={
                      paired || row.selected
                        ? "var(--gronn)"
                        : "var(--cmp-peer)"
                    }
                    fillOpacity={selected && selected !== row.code ? 0.6 : 1}
                  />
                ))}
                {deltas && <LabelList content={deltaLabel("a")} />}
              </Bar>
              {paired && (
                <Bar
                  yAxisId="cost"
                  dataKey="b"
                  name="Referanse"
                  fill="var(--cmp-peer)"
                  maxBarSize={34}
                  isAnimationActive={animate && !reduced}
                  animationBegin={90}
                  animationDuration={850}
                  animationEasing="ease-out"
                >
                  {deltas && <LabelList content={deltaLabel("b")} />}
                </Bar>
              )}
              {secondary !== "none" && (
                <Line
                  yAxisId="secondary"
                  dataKey={(row) =>
                    secondary === "growth" ? row.own.growth : row.own.population
                  }
                  name={secondUnit}
                  stroke="var(--rust)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={animate && !reduced}
                  animationDuration={850}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <button
            className="cmp-axis-hit cmp-axis-hit--left"
            aria-label={`Juster venstre Y-akse: ${unit}`}
            aria-haspopup="dialog"
            onClick={(event) => openAxis("primary", event)}
          />
          {secondary !== "none" && (
            <button
              className="cmp-axis-hit cmp-axis-hit--right"
              aria-label={`Juster høyre Y-akse: ${secondUnit}`}
              aria-haspopup="dialog"
              onClick={(event) => openAxis("secondary", event)}
            />
          )}
        </div>
      </div>
      {axis && (
        <AxisPopover
          axis={axis}
          unit={axis.side === "primary" ? unit : secondUnit}
          bounds={axis.side === "primary" ? bounds : secondaryBounds}
          values={
            axis.side === "primary"
              ? values
              : rows.map((r) =>
                  secondary === "growth" ? r.own.growth : r.own.population,
                )
          }
          onClose={closeAxis}
          onApply={(value) => {
            (axis.side === "primary" ? setBounds : setSecondaryBounds)(value);
            closeAxis();
          }}
        />
      )}
    </div>
  );
}
