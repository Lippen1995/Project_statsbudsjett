export function historicalMunicipalityCode(detail, year) {
  let code = detail.entity.code;
  const previous = (detail.boundaryHistory || [])
    .filter((change) => change.relationType === "exact_successor" && change.changeYear > year)
    .sort((a, b) => b.changeYear - a.changeYear);
  for (const change of previous) {
    if (change.targetCode === code) code = change.sourceCode;
  }
  return code;
}

export function occupationObservation(data, detail, year, occupation) {
  if (!data) return { amount: null, rate: null };
  const code = historicalMunicipalityCode(detail, year);
  const index = data.occupations.findIndex(([id]) => id === occupation);
  const values = index >= 0 ? data.rows[code] : null;
  const amount = values?.[index * 2];
  const rate = values?.[index * 2 + 1];
  return { amount, rate: Number.isFinite(rate) ? rate / 10 : null };
}

export function absenceObservation(data, detail, year, fn) {
  const index = data?.functions.findIndex(([id]) => id === fn) ?? -1;
  const values = index >= 0 ? data.rows[historicalMunicipalityCode(detail, year)] : null;
  const agreed = values?.[index * 2] ?? null;
  const excluding = values?.[index * 2 + 1] ?? null;
  const amount = Number.isFinite(agreed) && Number.isFinite(excluding) && agreed >= excluding
    ? Math.round((agreed - excluding) * 10) / 10 : null;
  return { agreed, excluding, amount, rate: amount !== null && agreed > 0 ? amount / agreed * 100 : null };
}
