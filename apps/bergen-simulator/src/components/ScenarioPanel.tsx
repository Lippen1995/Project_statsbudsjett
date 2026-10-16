import { useEffect, useRef, useState } from "react";
import { useScenario } from "../state/scenario";
import { useCity } from "../state/store";
import { TICK_SECONDS, TOTAL_TICKS, type Policy } from "../simulation/engine";
import type { CityData } from "../geo/types";
import type { TransportSource } from "../simulation/network";
export const POLICY_NAMES: Record<Policy, string> = {
  baseline: "Baseline",
  restricted: "Restricted through-traffic",
  pedestrian: "Pedestrian-priority corridor",
};
const description: Record<Policy, string> = {
  baseline:
    "Mapped road directions. All three synthetic trip categories may use Bryggen.",
  restricted:
    "Through-trips must detour. Local access and servicing may use Bryggen.",
  pedestrian:
    "Only modelled servicing may use Bryggen. Other cars must find a mapped detour.",
};
const number = (n: number, digits = 0) =>
  n.toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
const difference = (a: number, b: number) =>
  b > 0 ? `${a >= b ? "+" : ""}${number((a / b - 1) * 100, 1)}%` : "—";

export default function ScenarioPanel({ data }: { data: CityData }) {
  const s = useScenario();
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      useScenario.getState().close();
    },
    [],
  );
  async function enter() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/data/bryggen-transport.json", {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Transport snapshot unavailable (${response.status}).`);
      const source = (await response.json()) as TransportSource;
      const ids = new Set(
        data.roads
          .filter((r) => !r.renderStatus || r.renderStatus === "surface")
          .map((r) => r.id),
      );
      if (!source.ways.every((w) => ids.has(w.id)))
        throw new Error("Transport ways do not match the geographic snapshot.");
      if (controller.signal.aborted) return;
      s.open(source);
      useCity.getState().select(null);
      useCity.getState().focus([20, -220]);
    } catch (e) {
      if (!controller.signal.aborted)
        setLoadError(
          e instanceof Error ? e.message : "Transport data could not load.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  if (s.phase === "closed")
    return (
      <section className="scenario-entry" aria-label="Planning scenario">
        <span className="eyebrow">FIRST PLAYABLE SCENARIO</span>
        <h2>Whose streets, whose city?</h2>
        <p>
          Plan traffic around Bryggen & Vågen. Choose a policy, test the
          trade-offs, then try again.
        </p>
        <button className="plan-button" onClick={enter} disabled={loading}>
          {loading ? "Checking mapped network…" : "Plan Bryggen traffic →"}
        </button>
        {loadError && (
          <p role="alert">{loadError} No substitute network was loaded.</p>
        )}
      </section>
    );
  const r = s.intervention,
    b = s.baseline;
  const rows =
    r && b && r.tick > 0
      ? [
          [
            "Vehicle travel time",
            `${number(b.vehicleMinutes)} veh·min`,
            `${number(r.vehicleMinutes)} veh·min`,
            difference(r.vehicleMinutes, b.vehicleMinutes),
          ],
          [
            "Through-trip distance",
            `${number(b.throughMetres / Math.max(1, b.throughServed))} m/trip`,
            `${number(r.throughMetres / Math.max(1, r.throughServed))} m/trip`,
            difference(
              r.throughMetres / Math.max(1, r.throughServed),
              b.throughMetres / Math.max(1, b.throughServed),
            ),
          ],
          [
            "Emissions proxy",
            "100 index",
            `${number((r.emissionBurden / Math.max(0.001, b.emissionBurden)) * 100)} index`,
            difference(r.emissionBurden, b.emissionBurden),
          ],
          [
            "Bryggen trips",
            `${number(b.corridorTrips)} veh`,
            `${number(r.corridorTrips)} veh`,
            difference(r.corridorTrips, b.corridorTrips),
          ],
          [
            "Highest road V/C¹",
            number(Math.max(...b.edgeVc), 2),
            number(Math.max(...r.edgeVc), 2),
            "ratio",
          ],
          [
            "Unrouted in model",
            `${b.unrouted} / ${b.requested}`,
            `${r.unrouted} / ${r.requested}`,
            "trips",
          ],
        ]
      : [];
  return (
    <section className="scenario-panel" aria-label="Bryggen planning scenario">
      <div className="section-heading">
        <span className="eyebrow">PLANNING DESK / 01</span>
        <button
          className="icon-button"
          onClick={s.close}
          aria-label="Leave scenario"
        >
          ×
        </button>
      </div>
      <h2>Bryggen & Vågen</h2>
      <p className="scenario-question">
        Reclaim the waterfront. Where does the traffic go?
      </p>
      <p className="synthetic-label">
        SYNTHETIC DEMONSTRATION · NOT A FORECAST
      </p>
      <fieldset disabled={s.phase === "running" || s.phase === "paused"}>
        <legend>Choose a traffic policy</legend>
        {(Object.keys(POLICY_NAMES) as Policy[]).map((policy) => (
          <label key={policy} className="policy-option">
            <input
              type="radio"
              name="policy"
              value={policy}
              checked={s.policy === policy}
              onChange={() => s.choose(policy)}
            />
            <span>{POLICY_NAMES[policy]}</span>
          </label>
        ))}
      </fieldset>
      <p className="policy-description">
        {description[s.policy]} These are scenario access rules, not verified
        existing restrictions.
      </p>
      <div className="simulation-controls">
        {s.phase === "running" || s.phase === "paused" ? (
          <button className="plan-button" onClick={s.pauseResume}>
            {s.phase === "running" ? "Pause simulation" : "Resume simulation"}
          </button>
        ) : (
          <button className="plan-button" onClick={s.run}>
            ▶ Run simulation
          </button>
        )}
        <button className="reset-scenario" onClick={s.reset}>
          Reset
        </button>
      </div>
      <div className="simulation-progress" data-compute-ms={s.computeMs}>
        <progress
          aria-label="Simulation progress"
          value={r?.tick ?? 0}
          max={TOTAL_TICKS}
        />
        <span role="status">
          {s.phase === "complete"
            ? "Simulation complete"
            : s.phase === "paused"
              ? "Simulation paused"
              : s.phase === "running"
                ? "Simulating"
                : "Ready to plan"}{" "}
          · {number(((r?.tick ?? 0) * TICK_SECONDS) / 60, 1)} / 30 min
        </span>
      </div>
      {s.error && <p role="alert">{s.error}</p>}
      {!!rows.length && (
        <>
          {s.phase === "complete" && r && b && (
            <p className="decision-outcome">
              {s.policy === "baseline"
                ? "Your reference run is ready. Test a restriction to see where the traffic goes."
                : `${number((1 - r.corridorTrips / Math.max(1, b.corridorTrips)) * 100)}% fewer modelled trips used Bryggen. ${r.unrouted ? `${r.unrouted} trips found no permitted route in this model.` : "All trips found a route."} Through-trip distance changed ${difference(r.throughMetres / Math.max(1, r.throughServed), b.throughMetres / Math.max(1, b.throughServed))}.`}
            </p>
          )}
          <table
            className="scenario-results"
            aria-label="Baseline versus selected policy"
          >
            <thead>
              <tr>
                <th scope="col">Model outcome</th>
                <th scope="col">Baseline</th>
                <th scope="col">Policy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([title, baseline, policy, delta]) => (
                <tr key={title}>
                  <th scope="row">{title}</th>
                  <td>{baseline}</td>
                  <td>
                    {policy}
                    <small>{delta}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="data-note">
            Cumulative over elapsed model time. ¹Highest period-average
            directional volume / assumed capacity. Travel time and emissions
            proxy cover routed trips only; fewer routed trips is not an
            efficiency gain.
          </p>
          <button
            className="compare-button"
            aria-pressed={s.compare}
            onClick={s.toggleCompare}
          >
            {s.compare
              ? "Showing baseline · show policy"
              : "Compare on map · show baseline"}
          </button>
        </>
      )}
      <label className="traffic-toggle">
        <input type="checkbox" checked={s.heatmap} onChange={s.toggleHeatmap} />
        Traffic intensity on map
      </label>
      <details className="scenario-assumptions">
        <summary>Model assumptions & mapped sources</summary>
        <p>
          27 OSM ways, shared original node IDs and mapped one-way directions.
          No invented junctions, bridges or tunnels. This is a bounded network,
          not all Bergen routes. No turn restrictions involving these ways were
          present in the pinned snapshot; missing mapping and traffic signs are
          not ruled out.
        </p>
        <p>
          30-second ticks, 30-minute period. 12 synthetic vehicles/tick, doubled
          during minutes 10–20: 960 trips. Through (two directions): 8; local
          access: 2; servicing: 2. Servicing is an assumed permitted category,
          not observed vehicle activity. No randomness.
        </p>
        <p>
          Assumed speed 20 km/h; directional capacity 600/420/300/250
          vehicles/hour for primary/secondary/tertiary/other roads. Incremental
          shortest-path assignment with a bounded BPR congestion curve, not
          moving vehicles or a queue model. Omitted signals, parking, transit,
          pedestrians and behavioural response.
        </p>
        <p>
          Emissions proxy = vehicle-km × [1 + 0.2 × max(0, V/C − 0.6)²], indexed
          to baseline 100. No CO₂ or validated environmental benefit is claimed.
          Unrouted means no permitted path inside this limited model, not
          real-world inaccessibility.
        </p>
        <p>
          © OpenStreetMap contributors · ODbL.{" "}
          <a
            href="/data/bryggen-transport.json"
            target="_blank"
            rel="noreferrer"
          >
            Node IDs, source tags & pinned hashes ↗
          </a>
        </p>
      </details>
    </section>
  );
}

export function ScenarioLegend() {
  const s = useScenario();
  if (s.phase === "closed") return null;
  return (
    <div
      className="scenario-legend"
      aria-label="Traffic map legend"
      data-map-state={s.compare ? "baseline" : s.policy}
    >
      <strong>
        {s.compare
          ? "BASELINE COMPARISON"
          : POLICY_NAMES[s.policy].toUpperCase()}
      </strong>
      <span>
        Synthetic traffic ·{" "}
        {s.intervention
          ? `${s.intervention.tick / 2} model min`
          : "corridor preview"}
      </span>
      <div className="traffic-key">
        <i />
        Bryggen corridor
      </div>
      {s.heatmap && s.intervention && s.intervention.tick > 0 && (
        <>
          <div className="traffic-scale" />
          <span>Road V/C: 0 · 0.5 · 1 · 1.5+</span>
        </>
      )}
      {s.intervention && s.intervention.tick > 0 && (
        <button onClick={s.toggleCompare} aria-pressed={s.compare}>
          {s.compare ? "Show policy" : "Show baseline"}
        </button>
      )}
      {(s.phase === "running" || s.phase === "paused") && (
        <button onClick={s.pauseResume}>
          {s.phase === "running" ? "Pause" : "Resume"}
        </button>
      )}
    </div>
  );
}
