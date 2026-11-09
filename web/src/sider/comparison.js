// All amounts in the KOSTRA exports are NOK 1,000. Never substitute missing data with zero.
export const COMPARISON_ROUTE = "#sider/sammenlign-din-kommune";
export const SECTORS = [
  ["FGK8b", "Grunnskole"],
  ["FGK9", "Helse og omsorg"],
  ["FGK7", "Barnehage"],
  ["FGK1b", "Administrasjon"],
  ["FGK13", "Barnevern"],
  ["FGK12", "Sosiale tjenester"],
  ["FGK2", "Kultur"],
  ["FGK6a", "Eiendomsforvaltning"],
  ["FGK5", "Samferdsel"],
  ["FGK3", "Plan, byggesak og miljø"],
  ["FGK17", "Brann og ulykkesvern"],
];
export function readComparisonRoute(hash) {
  const q = new URLSearchParams(hash.split("?")[1] || "");
  return {
    code: /^\d{4}$/.test(q.get("kommune") || "") ? q.get("kommune") : "1103",
    year: Number(q.get("aar")) || null,
    budgetView: q.get("visning") === "budsjett",
    peers: q.has("mot")
      ? q
          .get("mot")
          .split(",")
          .filter((c) => /^\d{4}$/.test(c))
          .slice(0, 12)
      : null,
  };
}
export function defaultPeers(entities, code) {
  const target = entities.find((e) => e.code === code);
  return entities
    .filter(
      (e) =>
        e.kind === "municipality" &&
        e.code !== code &&
        e.code !== "0301" &&
        target?.peer_group_id &&
        e.peer_group_id === target.peer_group_id,
    )
    .map((e) => e.code)
    .slice(0, 12);
}
export function point(detail, year, sector = "", functionCode = "") {
  const source = functionCode
    ? detail?.functions?.find((f) => f.code === functionCode)?.metrics
        ?.net_expenses
    : sector
      ? detail?.services?.find((s) => s.code === sector)?.metrics?.net_expenses
      : detail?.overview?.net_expenses;
  return source?.[year] || null;
}
export function population(detail, year) {
  const p = detail?.overview?.revenues?.[year];
  return Number.isFinite(p?.amount) &&
    Number.isFinite(p?.perCapita) &&
    p.perCapita > 0
    ? (p.amount * 1000) / p.perCapita
    : null;
}
export function benchmark(
  details,
  year,
  sector = "",
  functionCode = "",
  method = "median",
) {
  return benchmarkObservations(details.map((d) => ({
    p: point(d, year, sector, functionCode),
    population: population(d, year),
  })), method);
}
export function benchmarkObservations(observations, method) {
  const values = observations.filter(({ p }) => Number.isFinite(p?.perCapita));
  if (!values.length) return { value: null, count: 0 };
  if (method === "weighted") {
    // Exact aggregate expense / reconstructed population, never an average of ratios.
    const valid = values.filter(
      (v) => Number.isFinite(v.p.amount) && v.population > 0,
    );
    const totalPopulation = valid.reduce((s, v) => s + v.population, 0);
    return {
      value:
        totalPopulation > 0
          ? (valid.reduce((s, v) => s + v.p.amount, 0) * 1000) / totalPopulation
          : null,
      count: valid.length,
    };
  }
  const sorted = values.map((v) => v.p.perCapita).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    value:
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    count: sorted.length,
  };
}
export function comparison(
  target,
  peers,
  year,
  sector = "",
  functionCode = "",
  method = "median",
) {
  const own = point(target, year, sector, functionCode);
  const reference = benchmark(peers, year, sector, functionCode, method);
  const gap =
    Number.isFinite(own?.perCapita) && Number.isFinite(reference.value)
      ? own.perCapita - reference.value
      : null;
  const pop = population(target, year);
  return {
    own,
    reference,
    gap,
    percent:
      gap != null && reference.value > 0 ? (gap / reference.value) * 100 : null,
    gapAmount: gap != null && pop > 0 ? (gap * pop) / 1000 : null,
  };
}
export function svenFindings(target, peers, year, method) {
  return SECTORS.map(([code, name]) => ({
    code,
    name,
    ...comparison(target, peers, year, code, "", method),
  }))
    .filter(
      (r) => r.reference.count >= 3 && r.gapAmount > 0 && r.percent != null,
    )
    .sort((a, b) => b.gapAmount - a.gapAmount);
}
export function scenarioTotal(items, year) {
  return items
    .filter((i) => i.enabled)
    .reduce((sum, i) => {
      if (year < i.start) return sum;
      const first = year === i.start;
      return (
        sum +
        i.annual * (first ? i.firstYearShare / 100 : 1) -
        (first ? i.oneOff : 0)
      );
    }, 0);
}
export function validateScenario(item) {
  return (
    item &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    item.name.length <= 180 &&
    typeof item.enabled === "boolean" &&
    ["annual", "oneOff", "start", "firstYearShare"].every((k) =>
      Number.isFinite(item[k]),
    ) &&
    item.annual >= 0 &&
    item.oneOff >= 0 &&
    item.start >= 2026 &&
    item.start <= 2100 &&
    item.firstYearShare >= 0 &&
    item.firstYearShare <= 100
  );
}

/** Year-on-year growth must use the preceding calendar year, never bridge missing years. */
export function municipalityHistory(
  detail,
  years,
  sector = "",
  functionCode = "",
  mode = "perCapita",
) {
  return years.map((year) => {
    const current = point(detail, year, sector, functionCode)?.[mode];
    const previous = point(detail, Number(year) - 1, sector, functionCode)?.[
      mode
    ];
    return {
      year,
      cost: Number.isFinite(current)
        ? mode === "amount"
          ? current / 1000
          : current
        : null,
      growth:
        Number.isFinite(current) && Number.isFinite(previous) && previous > 0
          ? (current / previous - 1) * 100
          : null,
      population: population(detail, year),
    };
  });
}

export function validateAxisBounds(min, max) {
  const low = String(min).trim() === "" ? null : Number(min);
  const high = String(max).trim() === "" ? null : Number(max);
  if (
    (low !== null && !Number.isFinite(low)) ||
    (high !== null && !Number.isFinite(high))
  )
    return {
      error:
        "Skriv gyldige tall eller la feltet stå tomt for automatisk grense.",
    };
  if (low !== null && high !== null && low >= high)
    return { error: "Nedre grense må være lavere enn øvre grense." };
  return { min: low, max: high };
}

/** Fit both ends to the visible observations; zero is not a forced baseline. */
export function autoFitAxis(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  const min = Math.min(...finite),
    max = Math.max(...finite);
  if (min === 0 && max === 0) return [-1, 1];
  const spread = max - min || Math.abs(min) * 0.2;
  const padding = spread * 0.08;
  const roughStep = (spread + 2 * padding) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const ratio = roughStep / magnitude;
  const step =
    (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * magnitude;
  const low = Math.floor((min - padding) / step) * step;
  const high = Math.ceil((max + padding) / step) * step;
  return [Number(low.toPrecision(12)), Number(high.toPrecision(12))];
}
