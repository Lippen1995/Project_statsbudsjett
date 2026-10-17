import { useState } from "react";
import { useScenario } from "../state/scenario";
import { usePhysical } from "../state/physical";
import { useAccess } from "../state/access";
import { useDistrict } from "../state/district";
import { useConnected } from "../state/connected";
import { useCity } from "../state/store";
import { accessPlacement, attachmentPoints } from "../access/model";
import { gateways, type MobilityInputs } from "../access/demand";
import { number } from "./PlanningResults";
export default function AccessEditor() {
  const s = useScenario(),
    a = useAccess(),
    d = useDistrict(),
    r = useConnected();
  const draft = a.draft,
    b = s.development?.proposals.find((b) => b.id === a.buildingId),
    check =
      draft && s.context && s.development
        ? accessPlacement(
            draft,
            s.context,
            s.development,
            s.physical,
            s.access?.connections,
          )
        : null;
  const links =
    s.access?.connections.filter((c) => c.buildingId === b?.id) ?? [];
  return (
    <section className="access-editor" aria-label="Access Planning">
      <h3>Planned access</h3>
      <p className="synthetic-label">
        PROPOSED INFRASTRUCTURE · NEVER OBSERVED ACCESS
      </p>
      <p className="planning-note">
        Select a proposed building, choose a numbered source node, then shape
        its access. Dashed gold: vehicles. Dashed teal: walking only.
      </p>
      <label className="planning-field">
        Proposed building
        <select
          aria-label="Access building"
          value={b?.id ?? ""}
          onChange={(e) => {
            a.selectBuilding(e.target.value);
            const b = s.development?.proposals.find(
              (b) => b.id === e.target.value,
            );
            if (b) useCity.getState().focus(b.center, true);
          }}
        >
          <option value="">Select a proposed building…</option>
          {s.development?.proposals.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} / {b.purpose}
            </option>
          ))}
        </select>
      </label>
      {b && (
        <>
          <p aria-label="Building access status">
            {links.length
              ? links.map((l) => `${l.mode} → OSM node ${l.nodeId}`).join(" · ")
              : "No proposed access. Proximity creates no connection."}
          </p>
          {!draft && (
            <button
              onClick={a.start}
              disabled={
                s.mapView !== "plan" || (s.access?.connections.length ?? 0) >= 8
              }
            >
              Design access connection
            </button>
          )}
        </>
      )}
      {!draft &&
        links.map((l) => (
          <div className="planning-actions" key={l.id}>
            <button onClick={() => a.edit(l.id)}>Edit {l.mode} access</button>
            <button
              onClick={() =>
                s.editAccess({
                  ...s.access,
                  connections: s.access!.connections.filter(
                    (c) => c.id !== l.id,
                  ),
                })
              }
            >
              Remove {l.mode} access
            </button>
          </div>
        ))}
      {draft && (
        <>
          <label className="planning-field">
            Conceptual mode
            <select
              aria-label="Access mode"
              value={draft.mode}
              onChange={(e) =>
                a.patch({ mode: e.target.value as "vehicle" | "pedestrian" })
              }
            >
              <option value="vehicle">Vehicle / synthetic local trips</option>
              <option value="pedestrian">Pedestrian / no vehicle trips</option>
            </select>
          </label>
          <label className="planning-field">
            Original attachment node
            <select
              aria-label="Access attachment node"
              value={draft.nodeId}
              onChange={(e) => a.chooseNode(e.target.value)}
            >
              {s.network &&
                attachmentPoints(s.network).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id} / {n.name}
                  </option>
                ))}
            </select>
          </label>
          <p className="data-note">
            Click a gold node marker in the city to choose the same original OSM
            endpoint. Terrain-picked portals snap to the selected hypothetical
            footprint within 2 m; numeric coordinates remain exact. Source-node
            positions are fixed. This is a hypothetical attachment, not an
            existing entrance or junction.
          </p>
          <label className="planning-field">
            Edit vertex
            <select
              aria-label="Access vertex"
              value={a.vertex}
              onChange={(e) => a.setVertex(Number(e.target.value))}
            >
              {draft.points.map((_, i) => (
                <option key={i} value={i}>
                  {i === 0
                    ? "Proposed building portal"
                    : i === draft.points.length - 1
                      ? "Fixed source node"
                      : `Bend ${i}`}
                </option>
              ))}
            </select>
          </label>
          <div className="building-dimensions">
            {[0, 1].map((axis) => (
              <label key={axis}>
                {axis === 0 ? "East" : "South"} / m
                <input
                  aria-label={`Access ${axis === 0 ? "east" : "south"}`}
                  type="number"
                  step=".1"
                  value={
                    Number.isFinite(draft.points[a.vertex]?.[axis])
                      ? draft.points[a.vertex][axis]
                      : ""
                  }
                  disabled={a.vertex === draft.points.length - 1}
                  onChange={(e) => {
                    const p = [...draft.points[a.vertex]] as [number, number];
                    p[axis] = e.target.valueAsNumber;
                    a.move(a.vertex, p);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="planning-actions">
            <button
              onClick={() => a.addBend()}
              disabled={draft.points.length >= 5}
            >
              Add access bend
            </button>
            <button
              onClick={a.removeBend}
              disabled={a.vertex === 0 || a.vertex === draft.points.length - 1}
            >
              Remove bend
            </button>
            <button
              aria-pressed={a.drawing}
              onClick={() => a.setDrawing(!a.drawing)}
            >
              {a.drawing
                ? "Navigate camera"
                : "Place selected vertex on terrain"}
            </button>
          </div>
          <p
            className={check?.valid ? "planning-notice" : "planning-error"}
            aria-label="Access placement validity"
          >
            {check?.valid
              ? "Geometrically eligible proposal"
              : check?.errors.join(" ")}{" "}
            · {number(check?.lengthM ?? 0, 1)} m ·{" "}
            {number((check?.maxGrade ?? 0) * 100, 1)}% maximum display-terrain
            grade
          </p>
          {check?.warnings.map((w) => (
            <p className="data-note" key={w}>
              {w}
            </p>
          ))}
          <div className="planning-actions">
            <button
              className="plan-button"
              onClick={a.confirm}
              disabled={!check?.valid || s.mapView !== "plan"}
            >
              Confirm proposed access
            </button>
            <button onClick={a.cancel}>Discard access preview</button>
          </div>
        </>
      )}
      {a.hint && <p role="status">{a.hint}</p>}
      <p className="data-note">
        2–80 m, up to five vertices, at most eight links. Width: 3 m vehicle /
        1.5 m pedestrian; terrain grade ≤10% / 12%. Eligibility is geometric
        only. Ownership, heritage, permissions, safe crossings and engineered
        gradients remain unmodelled.
      </p>
      <details className="scenario-assumptions">
        <summary>Try a connected quarter</summary>
        <p>
          Download this input-only example and import it through the plan
          library. It contains scheduled hypothetical housing, employment, civic
          services, public space and two explicitly proposed vehicle
          connections.
        </p>
        <a href="/plans/connected-quarter-example.json" download>
          Download connected quarter JSON
        </a>
      </details>
      <h3>Activity → road demand</h3>
      <p className="planning-note">
        Uses calculated occupancy and jobs in one selected month. Trip rates
        describe a single synthetic 30-minute period. No monthly traffic
        conversion or real commuting claim.
      </p>
      <MobilityControls key={JSON.stringify(s.mobility)} />
      <button
        className="compare-button"
        onClick={() => {
          usePhysical.getState().setMode("living");
          d.open();
        }}
      >
        Open Living City timeline
      </button>
      {d.current.length > 0 && (
        <button
          className="compare-button"
          onClick={() => s.editMobility({ ...s.mobility, month: d.month })}
        >
          Use inspected Living City month {d.month}
        </button>
      )}
      <button
        className="plan-button"
        disabled={!s.mobility.enabled || r.busy || !!draft}
        onClick={r.run}
      >
        {r.busy
          ? "Calculating district + transport…"
          : "Run connected transport"}
      </button>
      {r.error && <p role="alert">{r.error}</p>}
      {r.result && (
        <>
          <ConnectedReadout />
          <label className="traffic-toggle">
            <input
              type="checkbox"
              checked={s.heatmap}
              onChange={s.toggleHeatmap}
            />
            Synthetic road intensity on map
          </label>
        </>
      )}
      <button
        className="compare-button"
        onClick={() => r.setChallenge(!r.challenge)}
      >
        {r.challenge
          ? "Leave connected challenge"
          : "Challenge · Connect the New Quarter"}
      </button>
      {r.challenge && (
        <section
          className="planning-challenge"
          aria-label="Connect the New Quarter challenge"
        >
          <h3>Connect the New Quarter</h3>
          <p>
            Optional game objectives, not transport or development-policy
            standards.
          </p>
          <ul>
            {[
              "Month ≥12; ≥3 occupied households and ≥3 filled jobs",
              "Every proposed home/work building has explicit vehicle access",
              "≥4 generated trips; none capped, blocked or unrouted",
              "No unrouted base trips; maximum period V/C ≤2.5",
              "Additional-trip distance ≤1.5× the same trips without street edits",
              "Retain valid public space and ≥90% synthetic service coverage",
              "Challenge benchmark: household/job trip rates 1 / 0.6; gateway 645601",
            ].map((label, i) => (
              <li
                key={label}
                className={r.result?.challenge.checks[i] ? "objective-met" : ""}
              >
                {r.result?.challenge.checks[i] ? "✓" : "·"} {label}
              </li>
            ))}
          </ul>
          <strong>
            {r.result?.challenge.passed
              ? "Connected quarter achieved"
              : "Run and revise your connected quarter"}
          </strong>
        </section>
      )}
    </section>
  );
}
function MobilityControls() {
  const s = useScenario(),
    [m, set] = useState<MobilityInputs>(() => ({ ...s.mobility }));
  return (
    <div className="mobility-controls">
      <label className="traffic-toggle">
        <input
          type="checkbox"
          checked={m.enabled}
          onChange={(e) => set({ ...m, enabled: e.target.checked })}
        />
        Enable synthetic activity demand
      </label>
      <div className="building-dimensions">
        {(
          [
            ["month", "Activity month", 0, 24, 1],
            ["householdTripEnds", "Household trip ends / 30 min", 0, 4, 0.1],
            ["jobTripEnds", "Job trip ends / 30 min", 0, 4, 0.1],
            ["cap", "Additional trip cap", 1, 240, 1],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input
              aria-label={label}
              type="number"
              value={Number.isFinite(m[key]) ? m[key] : ""}
              min={min}
              max={max}
              step={step}
              onChange={(e) => set({ ...m, [key]: e.target.valueAsNumber })}
            />
          </label>
        ))}
      </div>
      <label className="planning-field">
        Synthetic external-boundary gateway
        <select
          aria-label="Synthetic gateway"
          value={m.gatewayId}
          onChange={(e) => set({ ...m, gatewayId: e.target.value })}
        >
          {s.network &&
            gateways(s.network).map((id) => (
              <option key={id} value={id}>
                OSM node {id} / synthetic destination
              </option>
            ))}
        </select>
      </label>
      <button className="compare-button" onClick={() => s.editMobility(m)}>
        Apply mobility assumptions
      </button>
    </div>
  );
}
function ConnectedReadout() {
  const r = useConnected(),
    s = useScenario(),
    v = r.result!;
  const l = v.ledger;
  return (
    <div
      className="physical-readout connected-readout"
      aria-label="Connected transport outcomes"
      data-generated={l.generated}
      data-requested={l.requested}
      data-routed={l.routed}
      data-unrouted={l.unrouted}
      data-capped={l.capped}
      data-compute-ms={r.computeMs}
    >
      <strong>MONTH {l.month} → ONE SYNTHETIC 30-MINUTE PERIOD</strong>
      <span>
        {number(v.occupiedHouseholds, 2)} occupied households ·{" "}
        {number(v.filledJobs, 2)} filled jobs
      </span>
      <span>
        {l.generated} generated = {l.requested} requested + {l.capped}{" "}
        explicitly capped
      </span>
      <strong className={l.unrouted || l.capped ? "planning-error" : ""}>
        {l.routed} routed + {l.unrouted} unrouted = {l.requested} requested
      </strong>
      <span>
        {l.blocked} missing vehicle access / unusable gateway pairing · rounding{" "}
        {number(l.roundingAdjustment, 2)} trip ends
      </span>
      <span>
        Road-network vehicle time: {number(v.streetOnly.vehicleMinutes, 1)} →{" "}
        {number(v.combined.vehicleMinutes, 1)} vehicle-min / period
      </span>
      <span>
        Road-network distance: {number(v.streetOnly.vehicleKm, 2)} →{" "}
        {number(v.combined.vehicleKm, 2)} vehicle-km; maximum V/C{" "}
        {number(Math.max(...v.combined.edgeVc), 2)}
      </span>
      <span>
        Additional-only route distance {number(v.additional.vehicleKm, 2)} km;
        same trips without street edits {number(v.unrestrictedAdditionalKm, 2)}{" "}
        km. Separate attribution run.
      </span>
      {l.sites.map((b) => (
        <span key={b.id}>
          {s.development?.proposals.find((p) => p.id === b.id)?.name}:{" "}
          {number(b.used, 2)} used equivalents → {b.generated} trips;{" "}
          {b.blocked} blocked
        </span>
      ))}
      {r.reference && (
        <span aria-label="Connected strategy comparison">
          Saved strategy / same month and rates: {r.reference.ledger.generated}{" "}
          generated, {r.reference.ledger.routed} routed,{" "}
          {r.reference.ledger.unrouted} unrouted, {r.reference.ledger.capped}{" "}
          capped; {number(r.reference.combined.vehicleMinutes, 1)} vehicle-min.
        </span>
      )}
      <div className="planning-actions">
        <button
          onClick={() =>
            s.setMapView(s.mapView === "baseline" ? "plan" : "baseline")
          }
        >
          {s.mapView === "baseline"
            ? "Show connected plan"
            : "Show original traffic baseline"}
        </button>
        {r.reference && (
          <button
            onClick={() =>
              s.setMapView(s.mapView === "reference" ? "plan" : "reference")
            }
          >
            {s.mapView === "reference"
              ? "Show current connected plan"
              : "Show saved connected plan"}
          </button>
        )}
      </div>
      <p className="data-note">
        Road legs begin at explicitly proposed attachment nodes. Private-link
        travel time/capacity, turning design, walking flows and congestion
        feedback to district growth are not simulated. All missing vehicle
        access remains visible as unrouted demand. Original baseline: 960
        synthetic trips; street-only uses the same base demand. Original roads
        never change.
      </p>
    </div>
  );
}
export function AccessMapTools() {
  const s = useScenario(),
    a = useAccess(),
    r = useConnected();
  return (
    <div className="physical-map-tools" aria-label="Access map tools">
      <strong>
        {s.mapView === "baseline"
          ? "OBSERVED CITY / BASE TRAFFIC MODEL"
          : s.mapView === "reference"
            ? "SAVED PROPOSALS / SYNTHETIC TRAFFIC"
            : "PLANNED ACCESS / HYPOTHETICAL"}
      </strong>
      <span>Gold dashed: vehicle · teal dashed: pedestrian</span>
      {r.result && s.heatmap && (
        <>
          <div className="traffic-scale" />
          <span>Source-road V/C: 0 · 0.5 · 1 · 1.5+ / synthetic</span>
        </>
      )}
      <span>
        {a.drawing
          ? "Tap terrain to move the selected portal/bend."
          : "Select a proposed building, then an original node marker."}
      </span>
      {r.result && (
        <span>
          {r.result.ledger.routed} added routed · {r.result.ledger.unrouted}{" "}
          unrouted · synthetic M{r.result.ledger.month}
        </span>
      )}
      <button
        onClick={() =>
          s.setMapView(s.mapView === "baseline" ? "plan" : "baseline")
        }
      >
        {s.mapView === "baseline"
          ? "Show proposed access"
          : "Show observed Bergen"}
      </button>
    </div>
  );
}
