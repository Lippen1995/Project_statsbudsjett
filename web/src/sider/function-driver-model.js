import { accountingObservation, ACCOUNT_SECTIONS } from "./accounting-drill.js";
import { benchmarkObservations, point } from "./comparison.js";
import { DRIVER_RATES, PUBLISHED_RATE_COUNTS } from "./function-driver-rates.js";
import { FUNCTION_DRIVERS, PENSION_FUNCTIONS } from "./function-driver-selection.js";

const expenseArts = ACCOUNT_SECTIONS[0][1];
const incomeArts = ACCOUNT_SECTIONS[1][1];

function indicatorRow(key, description, target, peers, read) {
  const own = read(target);
  const reference = benchmarkObservations(
    peers.map((peer) => ({ p: { perCapita: read(peer) } })),
    "median",
  );
  return { key, ...description, own, reference };
}

export function functionDriverRows({ target, peers, year, fn, dataset, indicators }) {
  const value = (code, key) => dataset?.rows[code]?.[dataset.columns.indexOf(key)];
  const available = (row) => Number.isFinite(row.own) || row.reference.count > 0;
  const activity = (FUNCTION_DRIVERS[fn] || []).map((key) => {
    const description = indicators[key];
    const rate = DRIVER_RATES[key];
    const rawKey = rate ? key : PUBLISHED_RATE_COUNTS[key];
    const row = indicatorRow(key, description, target, peers, ({ entity: { code } }) => {
      const amount = value(code, key);
      if (!rate) return amount;
      const denominator = value(code, rate.denominator);
      return Number.isFinite(amount) && Number.isFinite(denominator) && denominator > 0
        ? amount / denominator * rate.scale
        : null;
    });
    if (rate) {
      row.unit = rate.unit ?? [description.unit === "antall" ? "" : description.unit, rate.suffix]
        .filter(Boolean).join(" ");
      row.note = rate.note ?? row.note;
      const denominatorTable = indicators[rate.denominator].table;
      if (denominatorTable !== row.table) row.denominatorTable = denominatorTable;
    }
    if (rawKey) {
      row.rawOwn = value(target.entity.code, rawKey);
      row.rawUnit = indicators[rawKey].unit;
    }
    return row;
  }).filter((row) => available(row) || Number.isFinite(row.rawOwn));
  const accounting = (arts) => arts
    .map(([code, label]) => indicatorRow(
      code, { label, table: "12367", unit: "kr/innb." }, target, peers,
      (detail) => accountingObservation(detail, year, fn, code).perCapita,
    ))
    .filter(available)
    .filter((row) => [row.own, row.reference.value].some((value) => Number.isFinite(value) && value !== 0))
    .sort((a, b) => materiality(b) - materiality(a));

  if (PENSION_FUNCTIONS.has(fn)) {
    const parts = accounting([["A090", "Pensjon og forsikring"], ["A099", "Arbeidsgiveravgift"]]);
    const previous = indicatorRow(
      "previous", { label: `Netto driftsutgift på samme funksjon i ${year - 1}`, table: "12362", unit: "kr/innb.",
        note: "Viser om årets regnskapsføring avviker fra foregående år." }, target, peers,
      (detail) => point(detail, year - 1, "", fn)?.perCapita,
    );
    return { activity, accounts: [...parts, ...[previous].filter(available)] };
  }

  const expenses = accounting(expenseArts);
  const income = accounting(incomeArts);
  const candidates = [...expenses, ...income].sort((a, b) => materiality(b) - materiality(a));
  const wanted = Math.min(4, Math.max(1, 6 - activity.length));
  const accounts = candidates.slice(0, wanted);
  const last = accounts.at(-1);
  if (wanted > 1 && last && income.length && !accounts.some((row) => income.includes(row))) {
    accounts[wanted - 1] = income[0];
  }
  return { activity, accounts };
}

function materiality(row) {
  if (Number.isFinite(row.own) && Number.isFinite(row.reference.value)) {
    return Math.abs(row.own - row.reference.value);
  }
  return Math.abs(row.own ?? row.reference.value ?? 0);
}
