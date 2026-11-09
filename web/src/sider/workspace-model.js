import { benchmark, point, population } from "./comparison.js";
import { accountingBenchmark, accountingObservation } from "./accounting-drill.js";

export const formatNumber = (value, digits = 0) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("nb-NO", { maximumFractionDigits: digits }).format(
        value,
      )
    : "–";
export const nominal = (value) =>
  Number.isFinite(value) ? `${formatNumber(value / 1000, 1)} mill. kr` : "–";
export const percent = (value) =>
  Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${formatNumber(value, 1)} %`
    : "–";
export const deviation = (value, reference) =>
  Number.isFinite(value) && Number.isFinite(reference) && reference > 0
    ? (value / reference - 1) * 100
    : null;
export const referenceName = (method) =>
  method === "weighted" ? "Vektet snitt" : "Median";
export const entityName = (detail) => detail?.entity?.name || "Ukjent kommune";
export function observation(
  detail,
  year,
  sector = "",
  fn = "",
  mode = "perCapita",
  art = "",
) {
  const read = (y) => art ? accountingObservation(detail, y, fn, art) : point(detail, y, sector, fn);
  const current = read(year), previous = read(Number(year) - 1);
  return {
    name: entityName(detail),
    year,
    perCapita: current?.perCapita ?? null,
    amount: current?.amount ?? null,
    population: population(detail, year),
    growth: deviation(current?.[mode], previous?.[mode]),
  };
}
export function comparisonRow(
  target,
  peers,
  year,
  sector = "",
  fn = "",
  method = "median",
  other = null,
  mode = "perCapita",
  art = "",
) {
  const own = observation(target, year, sector, fn, mode, art);
  const readReference = (y) => art
    ? accountingBenchmark(peers, y, fn, art, method)
    : benchmark(peers, y, sector, fn, method);
  const currentReference = other ? null : readReference(year);
  const ref = other
    ? observation(other, year, sector, fn, mode, art)
    : {
        name: referenceName(method),
        year,
        perCapita: currentReference.value,
        amount: null,
        population: null,
        calculated: true,
      };
  if (ref.calculated) {
    ref.amount =
      Number.isFinite(ref.perCapita) && own.population > 0
        ? (ref.perCapita * own.population) / 1000
        : null;
    const prev = readReference(year - 1).value;
    const prevAmount =
      Number.isFinite(prev) && population(target, year - 1) > 0
        ? (prev * population(target, year - 1)) / 1000
        : null;
    ref.growth = deviation(
      mode === "amount" ? ref.amount : ref.perCapita,
      mode === "amount" ? prevAmount : prev,
    );
    ref.count = currentReference.count;
  }
  return {
    code: String(year),
    label: String(year),
    own,
    reference: ref,
    a: Number.isFinite(own[mode])
      ? own[mode] / (mode === "amount" ? 1000 : 1)
      : null,
    b: Number.isFinite(ref[mode])
      ? ref[mode] / (mode === "amount" ? 1000 : 1)
      : null,
    percent: deviation(own.perCapita, ref.perCapita),
  };
}
export function peerRows(target, peers, year, sector, fn, method, other, mode, art = "") {
  // Every row uses the same focal municipality's peer reference.
  return (other ? [target, other] : [target, ...peers])
    .map((detail) => ({
      ...comparisonRow(detail, peers, year, sector, fn, method, other, mode, art),
      code: detail.entity.code,
      label: entityName(detail),
      selected: detail.entity.code === target.entity.code,
    }))
    .sort(
      (a, b) =>
        (b.a ?? -Infinity) - (a.a ?? -Infinity) ||
        a.label.localeCompare(b.label, "nb"),
    );
}
export function chartDomain(values, bounds = { min: null, max: null }) {
  const finite = values.filter(Number.isFinite);
  let low = finite.length ? Math.min(...finite) : 0,
    high = finite.length ? Math.max(...finite) : 1;
  const span = high - low || Math.max(Math.abs(high) * 0.2, 1);
  const raw = (span * 1.3) / 4,
    magnitude = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / magnitude,
    step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * magnitude;
  low = Math.floor((low - span * 0.15) / step) * step;
  high = Math.ceil((high + span * 0.15) / step) * step;
  if (finite.every((v) => v >= 0)) low = Math.max(0, low);
  const min = bounds.min ?? low,
    max = bounds.max ?? high;
  const domain = min < max ? [min, max] : [low, high];
  const increment =
    bounds.min != null || bounds.max != null
      ? (domain[1] - domain[0]) / 4
      : step;
  const ticks = [];
  for (
    let value = domain[0], i = 0;
    value <= domain[1] + increment * 0.001 && i < 12;
    value += increment, i++
  )
    ticks.push(Number(value.toPrecision(12)));
  return { domain, ticks };
}
