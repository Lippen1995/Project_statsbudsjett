import { usePhysical } from "../state/physical";
import PublicSpaceEditor, { PhysicalMapTools } from "./PublicSpaceEditor";
import { useEffect, useRef, useState } from "react";
import { useScenario } from "../state/scenario";
import { useCity } from "../state/store";
import { TICK_SECONDS, TOTAL_TICKS } from "../simulation/engine";
import type { TransportSource } from "../simulation/network";
import type { CityData } from "../geo/types";
import StreetEditor from "./StreetEditor";
import PlanLibrary from "./PlanLibrary";
import PlanningResults, { ChallengeReadout, number } from "./PlanningResults";
export default function ScenarioPanel({ data }: { data: CityData }) {
  const p = usePhysical();
  const s = useScenario(),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      useScenario.getState().close();
      usePhysical.getState().clear();
    },
    [],
  );
  useEffect(() => {
    if (
      s.phase === "complete" &&
      window.matchMedia("(min-width: 701px)").matches
    ) {
      document
        .querySelector('[aria-label="Plan consequences"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [s.phase]);
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
      p.clear();
      s.open(source, data);
      useCity.getState().select(null);
      useCity.getState().focus([20, -220]);
      try {
        s.loadLibrary(window.localStorage);
      } catch {
        s.report(
          "Local browser storage is unavailable. Planning and JSON export remain available.",
        );
      }
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
        <span className="eyebrow">URBAN PLANNING SANDBOX</span>
        <h2>Your streets. Your proposal.</h2>
        <p>
          Redesign how real streets around Bryggen operate. The city stays real;
          your interventions are hypothetical.
        </p>
        <button className="plan-button" onClick={enter} disabled={loading}>
          {loading ? "Checking mapped network…" : "Enter Planning Mode →"}
        </button>
        {loadError && (
          <p role="alert">{loadError} No substitute network was loaded.</p>
        )}
      </section>
    );
  return (
    <section
      className="scenario-panel planning-mode"
      aria-label="Urban planning sandbox"
    >
      <div className="section-heading">
        <span className="eyebrow">PLANNING MODE / BRYGGEN</span>
        <button
          className="icon-button"
          aria-label="Leave Planning Mode"
          onClick={() => {
            p.clear();
            s.close();
            useCity.getState().select(null);
          }}
        >
          ×
        </button>
      </div>
      <h2>Draw a different future.</h2>
      <p className="synthetic-label">
        HYPOTHETICAL PLAN · SYNTHETIC TRAFFIC · NOT A FORECAST
      </p>
      <div className="plan-heading">
        <strong>{s.name}</strong>
        <span>
          {s.plan?.interventions.length ?? 0} proposed section edits ·{" "}
          {s.physical?.proposals.length ?? 0} proposed spaces
        </span>
      </div>
      <div className="planning-actions history-controls">
        <button
          disabled={p.draft ? p.past.length === 0 : s.cursor < 1}
          onClick={() => {
            if (p.draft) p.undoDraft();
            else s.undo();
          }}
        >
          ↶ Undo
        </button>
        <button
          disabled={
            p.draft ? p.future.length === 0 : s.cursor >= s.history.length - 1
          }
          onClick={() => {
            if (p.draft) p.redoDraft();
            else s.redo();
          }}
        >
          ↷ Redo
        </button>
        <button
          onClick={() => {
            p.clear();
            s.reset();
            useCity.getState().select(null);
            useCity.getState().focus(null);
          }}
        >
          Reset city
        </button>
      </div>
      <div className="planning-mode-tabs" aria-label="Planning tools">
        <button
          aria-pressed={p.mode === "streets"}
          onClick={() => p.setMode("streets")}
        >
          Street operations
        </button>
        <button
          aria-pressed={p.mode === "spaces"}
          onClick={() => p.setMode("spaces")}
        >
          Physical public spaces
        </button>
      </div>
      {p.mode === "spaces" ? (
        <PublicSpaceEditor />
      ) : (
        <StreetEditor data={data} />
      )}
      {p.draft && (
        <p className="data-note">
          Apply or discard your shape before running or saving the combined
          plan.
        </p>
      )}
      <div className="simulation-controls">
        {s.phase === "running" || s.phase === "paused" ? (
          <button className="plan-button" onClick={s.pauseResume}>
            {s.phase === "running" ? "Pause simulation" : "Resume simulation"}
          </button>
        ) : (
          <button className="plan-button" onClick={s.run} disabled={!!p.draft}>
            ▶ Run plan
          </button>
        )}
      </div>
      <div className="simulation-progress" data-compute-ms={s.computeMs}>
        <progress
          aria-label="Simulation progress"
          value={s.intervention?.tick ?? 0}
          max={TOTAL_TICKS}
        />
        <span role="status">
          {s.phase === "complete"
            ? "Simulation complete"
            : s.phase === "paused"
              ? "Simulation paused"
              : s.phase === "running"
                ? "Simulating"
                : "Ready to test your plan"}{" "}
          · {number(((s.intervention?.tick ?? 0) * TICK_SECONDS) / 60, 1)} / 30
          min
        </span>
      </div>
      {s.error && (
        <p className="planning-error" role="alert">
          {s.error}
        </p>
      )}
      {s.notice && (
        <p className="planning-notice" role="note">
          {s.notice}
        </p>
      )}
      <PlanningResults />
      <label className="traffic-toggle">
        <input type="checkbox" checked={s.heatmap} onChange={s.toggleHeatmap} />
        Traffic intensity on map
      </label>
      {!s.challenge && (
        <button className="compare-button" onClick={() => s.setChallenge(true)}>
          Take the challenge · Rethinking Bryggen
        </button>
      )}
      <ChallengeReadout />
      <PlanLibrary />
      <details className="scenario-assumptions">
        <summary>Observed geography & model assumptions</summary>
        <p>
          27 OSM ways, 31 editable sections and shared original node IDs. Mapped
          directions are retained. No invented connections, bridge decks or
          tunnels. No relevant restriction relations were present in the pinned
          cache; this does not certify real-world access rules.
        </p>
        <p>
          30-second ticks, 30 minutes, 960 synthetic trips. Through: 8
          vehicles/tick, local: 2, servicing: 2; demand doubles in minutes
          10–20. No randomness. Speed 20 km/h; baseline directional capacities
          600/420/300/250 veh/h by primary/secondary/tertiary/other road class.
          All are assumptions.
        </p>
        <p>
          Incremental shortest-path assignment with bounded BPR-style costs. Not
          a vehicle movement, queue or equilibrium model. Emissions proxy =
          vehicle-km × [1 + 0.2 × max(0, V/C − 0.6)²], initial baseline = 100.
          It is not measured CO₂. Pedestrian flows, building works and real
          current restrictions are not simulated.
        </p>
        <p>
          Unrouted means no permitted route within this limited network, not
          proof of real-world inaccessibility. Lost access is penalized in the
          challenge regardless of lower routed-only totals.
        </p>
        <p>
          © OpenStreetMap contributors · ODbL.{" "}
          <a
            href="/data/bryggen-transport.json"
            target="_blank"
            rel="noreferrer"
          >
            Original source IDs, tags & pinned hashes ↗
          </a>
        </p>
      </details>
    </section>
  );
}
export function ScenarioLegend() {
  const p = usePhysical();
  const s = useScenario(),
    selectedId = useCity((v) => v.selectedSegmentId),
    selected = useCity((v) => v.selected);
  if (s.phase === "closed") return null;
  if (p.mode === "spaces") return <PhysicalMapTools />;
  const reference = s.library.find((p) => p.id === s.referenceId);
  const label =
    s.mapView === "baseline"
      ? "INITIAL BASELINE"
      : s.mapView === "reference"
        ? `SAVED: ${reference?.scenario.name}`
        : "YOUR PROPOSED PLAN";
  return (
    <div
      className="scenario-legend"
      aria-label="Traffic map legend"
      data-map-state={s.mapView}
    >
      <strong>{label}</strong>
      <span>
        Synthetic model ·{" "}
        {s.intervention ? `${s.intervention.tick / 2} min` : "edit preview"}
      </span>
      <span>Teal outline · editable model section</span>
      <div className="proposal-key">
        <i />
        Dashed colour · hypothetical edit
      </div>
      {s.heatmap && s.intervention && s.intervention.tick > 0 && (
        <>
          <div className="traffic-scale" />
          <span>Road V/C: 0 · 0.5 · 1 · 1.5+</span>
        </>
      )}
      {s.intervention && s.intervention.tick > 0 && (
        <button
          onClick={() =>
            s.setMapView(s.mapView === "baseline" ? "plan" : "baseline")
          }
        >
          {s.mapView === "baseline" ? "Show your plan" : "Show baseline"}
        </button>
      )}
      {selectedId && (
        <button
          onClick={() => {
            document
              .getElementById("street-editor")
              ?.scrollIntoView({ block: "center" });
            document
              .getElementById("street-editor")
              ?.focus({ preventScroll: true });
          }}
        >
          Edit {selected?.name ?? "selected section"} ↓
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
