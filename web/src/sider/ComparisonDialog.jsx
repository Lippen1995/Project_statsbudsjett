import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadKostraDetail } from "../lib/kostra";
import { benchmarkObservations, population, SECTORS } from "./comparison";
import CostChart, { CostTable, useReducedMotion } from "./CostChart";
import AccountingDrill from "./AccountingDrill";
import FunctionDrivers from "./FunctionDrivers";
import { OWN_PURCHASES, PURCHASE_REMAINDER } from "./accounting-drill";
import { usePurchaseArts, withPurchaseArts } from "./use-purchase-arts";
import {
  comparisonRow,
  peerRows,
  referenceName,
  entityName,
} from "./workspace-model";

export default function ComparisonDialog({
  target,
  peers,
  entities,
  year,
  years,
  sector,
  fn = "",
  account,
  method,
  onClose,
  initialView = "history",
}) {
  const dialog = useRef(null),
    reduced = useReducedMotion();
  const [closing, setClosing] = useState(false),
    [view, setView] = useState(initialView),
    [mode, setMode] = useState("perCapita"),
    [compare, setCompare] = useState("peers"),
    [secondary, setSecondary] = useState("none");
  const [from, setFrom] = useState(Math.max(years[0], year - 5)),
    [to, setTo] = useState(year),
    [inspected, setInspected] = useState(null);
  const [extra, setExtra] = useState(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = dialog.current,
      opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    if (reduced) {
      onClose();
      return;
    }
    const timer = setTimeout(onClose, 210);
    return () => clearTimeout(timer);
  }, [closing, reduced, onClose]);
  const all = useMemo(() => [target, ...peers], [target, peers]);
  const loaded = all.find((d) => d.entity.code === compare);
  useEffect(() => {
    if (compare === "peers" || loaded) {
      setError("");
      return;
    }
    let active = true;
    setExtra(null);
    setError("");
    loadKostraDetail("municipality", compare)
      .then((value) => {
        if (!value) throw new Error("Kommuneregnskapet mangler.");
        if (active) setExtra(value);
      })
      .catch((e) => {
        if (active) setError(e.message || "Kunne ikke hente kommunen.");
      });
    return () => {
      active = false;
    };
  }, [compare, loaded, retry]);
  const other =
    compare === "peers"
      ? null
      : loaded || (extra?.entity.code === compare ? extra : null);
  const waiting = compare !== "peers" && !other;
  const name = account?.label || (fn
    ? `${fn} · ${target.functions?.find((f) => f.code === fn)?.name || "Funksjon"}`
    : SECTORS.find((s) => s[0] === sector)?.[1] || "Samlet netto drift");
  const period = years.filter((y) => y >= from && y <= to);
  const accounts = view === "accounts";
  const drivers = view === "drivers";
  const purchaseDrill = ["A260", "A270", PURCHASE_REMAINDER].includes(account?.code);
  const { purchaseArts, pending: artsPending, error: artsError, retry: retryArts } =
    usePurchaseArts(purchaseDrill ? fn : "");
  const chartTarget = withPurchaseArts(target, purchaseArts);
  const chartPeers = peers.map((peer) => withPurchaseArts(peer, purchaseArts));
  const chartOther = withPurchaseArts(other, purchaseArts);
  const peerPopulation = drivers ? benchmarkObservations(peers.map((peer) => ({
    p: { perCapita: population(peer, year) || null },
  })), "median").value : null;
  const rows = waiting || accounts || drivers || artsPending || artsError
    ? []
    : view === "history"
      ? period.map((y) =>
          comparisonRow(chartTarget, chartPeers, y, sector, fn, method, chartOther, mode, account?.code),
        )
      : peerRows(chartTarget, chartPeers, year, sector, fn, method, chartOther, mode, account?.code);
  const row =
    rows.find((r) => r.code === inspected) ||
    (view === "history" ? rows.at(-1) : rows.find((r) => r.selected));
  const reset = () => setInspected(null);
  const key = [
    target.entity.code,
    sector,
    fn,
    account?.code,
    method,
    compare,
    view,
    mode,
    from,
    to,
  ].join("-");
  return createPortal(
    <dialog
      ref={dialog}
      className={`ft cmp-inspect-modal ${closing ? "cmp-dialog-closing" : ""}`}
      aria-labelledby="cmp-inspect-title"
      onCancel={(e) => {
        e.preventDefault();
        setClosing(true);
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          setClosing(true);
      }}
    >
      <header className="cmp-inspect-head">
        <div>
          <div className="cmp-eyebrow">
            {entityName(target)} · kommunekonsern ·{" "}
            {view === "history" ? `${from}–${to}` : year}
          </div>
          <h2 id="cmp-inspect-title">
            {fn && !account
              ? name
              : `${entityName(target)} ${view === "history" ? "over tid" : "· sammenligning"}`}
          </h2>
          {(!fn || account) && <p>{name}</p>}
        </div>
        <button
          autoFocus
          className="cmp-dialog-close"
          aria-label="Lukk sammenligning"
          onClick={() => setClosing(true)}
        >
          ×
        </button>
      </header>
      <div className="cmp-dialog-toolbar">
        <div
          className="cmp-view-switch"
          role="group"
          aria-label="Sammenligningsvisning"
        >
          {[
            ...(fn && !account ? [["drivers", "Nøkkeltall og drivere"]] : []),
            ["history", "Historikk"],
            ["peers", "Kommunene"],
            ...(fn && !account ? [["accounts", "Regnskapsposter"]] : []),
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                reset();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {!drivers && (
          <label className="cmp-inline-label">
            Sammenlign med
            <select
              aria-label="Sammenlign med"
              value={compare}
              onChange={(e) => {
                setCompare(e.target.value);
                reset();
              }}
            >
              <option value="peers">
                {referenceName(method)} · sammenligningsgruppen
              </option>
              {entities
                .filter((e) => e.code !== target.entity.code)
                .map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {!accounts && !drivers && (
        <>
          <div className="cmp-dialog-options">
            <div className="cmp-view-switch" role="group" aria-label="Måleenhet">
              {[
                ["perCapita", "Per innbygger"],
                ["amount", "Nominelt"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={mode === value}
                  onClick={() => {
                    setMode(value);
                    reset();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === "history" && (
              <>
                <select
                  aria-label="Sekundærakse"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                >
                  <option value="none">Ingen tilleggsserie</option>
                  <option value="growth">År/år-endring (%)</option>
                  <option value="population">Befolkning</option>
                </select>
                <div className="cmp-period-inline">
                  <select
                    aria-label="Fra år"
                    value={from}
                    onChange={(e) => {
                      setFrom(+e.target.value);
                      reset();
                    }}
                  >
                    {years
                      .filter((y) => y <= to)
                      .map((y) => (
                        <option key={y}>{y}</option>
                      ))}
                  </select>
                  <span>–</span>
                  <select
                    aria-label="Til år"
                    value={to}
                    onChange={(e) => {
                      setTo(+e.target.value);
                      reset();
                    }}
                  >
                    {years
                      .filter((y) => y >= from)
                      .map((y) => (
                        <option key={y}>{y}</option>
                      ))}
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="cmp-chart-legend">
            <span>
              <i />
              {entityName(target)}
            </span>
            <span>
              <i className="peer" />
              {other
                ? entityName(other)
                : view === "history"
                  ? referenceName(method)
                  : "Sammenligningskommuner"}
            </span>
            {view === "history" && secondary !== "none" && (
              <span>
                <i className="secondary" />
                {secondary === "growth" ? "År/år-endring" : "Befolkning"}
              </span>
            )}
          </div>
        </>
      )}
      {drivers ? (
        <>
          <CostTable
            row={comparisonRow(target, peers, year, sector, fn, method)}
            context="Netto driftsutgifter"
            peerPopulation={peerPopulation}
            compact
          />
          <FunctionDrivers key={year} target={target} peers={peers} year={year} fn={fn} />
        </>
      ) : waiting ? (
        <p role={error ? "alert" : "status"}>
          {error || "Henter sammenligningskommunen…"}
          {error && (
            <button onClick={() => setRetry((v) => v + 1)}>Prøv igjen</button>
          )}
        </p>
      ) : accounts ? (
        <AccountingDrill target={target} peers={peers} year={year} method={method} functionCode={fn} other={other} />
      ) : artsPending || artsError ? (
        <p role={artsError ? "alert" : "status"}>
          {artsError ? "Kunne ikke hente artsfordelingen fra SSB. " : "Henter artsfordelingen fra SSB…"}
          {artsError && <button type="button" onClick={retryArts}>Prøv igjen</button>}
        </p>
      ) : (
        <>
          <CostChart
            rows={rows}
            paired={view === "history"}
            vertical={view === "peers"}
            history={view === "history"}
            mode={mode}
            secondary={view === "history" ? secondary : "none"}
            title={name}
            chartKey={key}
            onInspect={(r) => setInspected(r.code)}
          />
          <div className="cmp-inspect-selector">
            <label className="cmp-inline-label">
              Tall for
              <select
                aria-label={
                  view === "history"
                    ? "Vis tall for år"
                    : "Vis tall for kommune"
                }
                value={row?.code || ""}
                onChange={(e) => setInspected(e.target.value)}
              >
                {rows.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <span>Klikk på en Y-akse for å tilpasse skalaen.</span>
          </div>
          <CostTable
            row={row}
            history={view === "history"}
            context={name}
            compact
          />
        </>
      )}
      <p className="cmp-footnote">
        Løpende kroner · ikke behovskorrigert. Folketall er beregnet fra
        inntekter totalt og per innbygger. Manglende data vises som «–».
        Tidsserier kan ha brudd ved kommunesammenslåinger.
      </p>
    </dialog>,
    document.body,
  );
}
