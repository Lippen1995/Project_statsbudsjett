import { useMemo, useState } from "react";
import { useScenario } from "../state/scenario";
import { usePhysical } from "../state/physical";
import { useCity } from "../state/store";
import { placement } from "../physical/model";
import { waterfrontChallenge } from "../physical/challenge";
import { number } from "./PlanningResults";

export function PlacementFeedback() {
  const s = useScenario(),
    p = usePhysical();
  const check = useMemo(
    () =>
      p.draft && s.context
        ? placement(p.draft, s.context, s.physical?.proposals)
        : null,
    [p.draft, s.context, s.physical],
  );
  if (!p.draft) return null;
  return (
    <div
      className={
        "placement-feedback " +
        (check?.valid ? "placement-valid" : "placement-invalid")
      }
      aria-live="polite"
      data-placement-valid={check?.valid ?? false}
    >
      <strong>
        {p.draft.vertices.length < 3
          ? `${p.draft.vertices.length} / 3 corners · keep drawing`
          : check?.valid
            ? "Geometrically eligible"
            : "Placement rejected"}
      </strong>
      <span>
        {number(check?.areaM2 ?? 0, 1)} m² ·{" "}
        {number((check?.maxGrade ?? 0) * 100, 1)}% maximum display grade
      </span>
      {p.draft.vertices.length >= 3 &&
        check?.errors.map((e) => <p key={e}>{e}</p>)}
    </div>
  );
}
export function PhysicalMapTools() {
  const s = useScenario(),
    p = usePhysical();
  if (s.phase === "closed" || p.mode !== "spaces") return null;
  return (
    <div
      className="physical-map-tools"
      aria-label="Physical planning map tools"
    >
      <strong>
        {p.draft
          ? "PROPOSED SPACE / LIVE PREVIEW"
          : s.mapView === "baseline"
            ? "OBSERVED CITY / INITIAL MODEL"
            : s.mapView === "reference"
              ? "SAVED PROPOSAL / COMPARISON"
              : "PUBLIC SPACE / HYPOTHETICAL"}
      </strong>
      {p.draft ? (
        <>
          <PlacementFeedback />
          <div className="planning-actions">
            <button
              onClick={() =>
                p.setAction(
                  p.action === "navigate"
                    ? p.draft!.vertices.length < 3
                      ? "draw"
                      : "reshape"
                    : "navigate",
                )
              }
            >
              {p.action === "navigate" ? "Resume shaping" : "Navigate camera"}
            </button>
            <button
              onClick={p.confirm}
              disabled={
                !s.context ||
                !placement(p.draft, s.context, s.physical?.proposals).valid
              }
            >
              Apply surface
            </button>
            {p.draft.vertices.length >= 3 && (
              <button
                onClick={() =>
                  p.setAction(p.action === "draw" ? "reshape" : "draw")
                }
              >
                {p.action === "draw" ? "Move corners" : "Add corners"}
              </button>
            )}
            <button
              onClick={p.undoDraft}
              disabled={!p.past.length}
              aria-label="Undo draft corner"
            >
              ↶
            </button>
            <button
              onClick={p.redoDraft}
              disabled={!p.future.length}
              aria-label="Redo draft corner"
            >
              ↷
            </button>
            <button onClick={p.cancel}>Cancel shape</button>
          </div>
        </>
      ) : (
        <div className="planning-actions">
          <button
            onClick={() => {
              s.setMapView("plan");
              p.start();
            }}
            disabled={(s.physical?.proposals.length ?? 0) >= 4}
          >
            + Draw public space
          </button>
          <button
            onClick={() =>
              s.setMapView(s.mapView === "baseline" ? "plan" : "baseline")
            }
          >
            {s.mapView === "baseline"
              ? "Show proposed city"
              : "Show observed city"}
          </button>
        </div>
      )}
      <span>
        {p.hint ||
          (p.action === "draw"
            ? "Tap land to add a corner · 8 maximum"
            : p.action === "reshape"
              ? "Drag a corner · scroll to zoom in Navigate"
              : "Select a proposed surface to inspect it")}
      </span>
    </div>
  );
}
export default function PublicSpaceEditor() {
  const s = useScenario(),
    p = usePhysical(),
    [x, setX] = useState(-51),
    [z, setZ] = useState(-257);
  const selected = s.physical?.proposals.find((v) => v.id === p.selectedId),
    space = p.draft ?? selected;
  const check = useMemo(
    () =>
      space && s.context
        ? placement(space, s.context, s.physical?.proposals)
        : null,
    [space, s.context, s.physical],
  );
  const draft = p.draft,
    vertex = draft?.vertices[p.vertex];
  if (!s.context)
    return <p>Matching terrain is required for physical editing.</p>;
  return (
    <section
      className="public-space-editor"
      aria-label="Public-space design tools"
    >
      <div className="section-heading">
        <h3>Shape the waterfront</h3>
        <span>{s.physical?.proposals.length ?? 0} / 4 spaces</span>
      </div>
      <PhysicalReadout />
      <p className="data-note">
        Draw a small, hypothetical surface on mapped land. Choose a treatment,
        then place corners on the city. Nothing is demolished or excavated.
      </p>
      <button
        className="compare-button"
        onClick={() => {
          p.start();
          s.setMapView("plan");
          useCity.getState().select(null);
          useCity.getState().focus([-40, -240], true);
        }}
        disabled={(s.physical?.proposals.length ?? 0) >= 4}
      >
        New public-space footprint
      </button>
      <p className="data-note">
        3–8 corners · 25–2,500 m² · maximum 100 m span. Terrain grade ≤ 15% in
        the display mesh.
      </p>
      <label className="planning-field">
        Proposed spaces
        <select
          aria-label="Proposed spaces"
          value={selected?.id ?? ""}
          onChange={(e) => p.select(e.target.value)}
        >
          <option value="">Select on map or choose…</option>
          {s.physical?.proposals.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {space && (
        <>
          <strong>{draft ? "Unapplied design" : space.name}</strong>
          {draft ? (
            <>
              <label className="planning-field">
                Space name
                <input
                  aria-label="Space name"
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => p.patch({ name: e.target.value })}
                />
              </label>
              <label className="planning-field">
                Surface treatment
                <select
                  aria-label="Surface treatment"
                  value={draft.kind}
                  onChange={(e) =>
                    p.patch({
                      kind: e.target.value as "pedestrian" | "landscaped",
                    })
                  }
                >
                  <option value="pedestrian">
                    Pedestrian space · warm paving
                  </option>
                  <option value="landscaped">
                    Landscaped space · muted green
                  </option>
                </select>
              </label>
              <PlacementFeedback />
              <div className="planning-actions">
                <button onClick={p.confirm} disabled={!check?.valid}>
                  Confirm public space
                </button>
                <button onClick={p.cancel}>Discard shape</button>
              </div>
              <details className="precision-tools">
                <summary>Precise & keyboard editing</summary>
                <p>
                  Local map metres: east X, south Z from 5.3235° E / 60.395° N.
                  These are proposed coordinates. Use Tab and arrow keys; touch
                  can use these controls instead of dragging.
                </p>
                <div className="coordinate-pair">
                  <label>
                    New X
                    <input
                      aria-label="New vertex east metres"
                      type="number"
                      value={x}
                      onChange={(e) => setX(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    New Z
                    <input
                      aria-label="New vertex south metres"
                      type="number"
                      value={z}
                      onChange={(e) => setZ(Number(e.target.value))}
                    />
                  </label>
                </div>
                <button
                  onClick={() => p.add([x, z])}
                  disabled={draft.vertices.length >= 8}
                >
                  Add coordinate vertex
                </button>
                <label className="planning-field">
                  Active corner
                  <select
                    aria-label="Active corner"
                    value={p.vertex}
                    onChange={(e) => p.setVertex(Number(e.target.value))}
                  >
                    {draft.vertices.map((_, i) => (
                      <option key={i} value={i}>
                        Corner {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                {vertex && (
                  <>
                    <div className="coordinate-pair">
                      <label>
                        East X
                        <input
                          aria-label="Corner east metres"
                          type="number"
                          step="0.5"
                          value={+vertex[0].toFixed(2)}
                          onChange={(e) =>
                            p.move(p.vertex, [
                              Number(e.target.value),
                              vertex[1],
                            ])
                          }
                        />
                      </label>
                      <label>
                        South Z
                        <input
                          aria-label="Corner south metres"
                          type="number"
                          step="0.5"
                          value={+vertex[1].toFixed(2)}
                          onChange={(e) =>
                            p.move(p.vertex, [
                              vertex[0],
                              Number(e.target.value),
                            ])
                          }
                        />
                      </label>
                    </div>
                    <div className="planning-actions">
                      {[
                        ["←", -1, 0],
                        ["↑", 0, -1],
                        ["↓", 0, 1],
                        ["→", 1, 0],
                      ].map(([label, dx, dz]) => (
                        <button
                          key={label}
                          aria-label={`Move corner ${label} one metre`}
                          onClick={() =>
                            p.move(p.vertex, [
                              vertex[0] + Number(dx),
                              vertex[1] + Number(dz),
                            ])
                          }
                        >
                          {label} 1 m
                        </button>
                      ))}
                      <button onClick={p.removeVertex}>Remove corner</button>
                    </div>
                  </>
                )}
              </details>
            </>
          ) : (
            <>
              <p className="surface-readout">
                {number(check?.areaM2 ?? 0, 1)} m² proposed {space.kind} space
              </p>
              <div className="planning-actions">
                <button
                  onClick={() => {
                    p.reshape();
                    s.setMapView("plan");
                  }}
                >
                  Edit shape
                </button>
                <button
                  onClick={() => {
                    s.removeSpace(space.id);
                    p.select("");
                  }}
                >
                  Remove public space
                </button>
              </div>
            </>
          )}
          {check && check.conflicts.length > 0 && (
            <div className="road-conflicts">
              <h4>Potential road-access conflict</h4>
              <p>
                Within a 4 m assumed centreline band. Actual carriageway widths
                are unknown. A surface alone changes no traffic rules.
              </p>
              {check.conflicts.map((e) => {
                const edit = s.plan?.interventions.find(
                  (i) => i.segmentId === e.segmentId,
                );
                return (
                  <div key={e.segmentId}>
                    <strong>{e.name}</strong>
                    <small>
                      {e.wayId} · {e.segmentId}
                    </small>
                    <span>Model access: {edit?.access ?? "all"} (assumed)</span>
                    <button
                      disabled={!!draft}
                      onClick={() =>
                        s.edit({
                          segmentId: e.segmentId,
                          access: "local",
                          capacityFactor: edit?.capacityFactor ?? 1,
                        })
                      }
                    >
                      Apply local + servicing access
                    </button>
                    <p>
                      Explicit game rule: restrict through-cars on this entire
                      verified section, in its mapped directions. Not a real
                      access designation.
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {check && !check.conflicts.length && (
            <p className="data-note">
              No modelled road within the 4 m conflict band. Unmodelled paths
              and access may still be affected.
            </p>
          )}
        </>
      )}
      {p.hint && (
        <p className="planning-notice" role="note">
          {p.hint}
        </p>
      )}
      <p className="eligibility-caveat">
        Geometric eligibility only. Ownership, heritage rules, utilities,
        structural capacity, permission, construction costs and pedestrian
        activity are unknown and unmodelled. Green and paving are artistic
        proposal colours.
      </p>
      {!p.challenge ? (
        <button className="compare-button" onClick={() => p.setChallenge(true)}>
          Challenge · Transforming the Bryggen Waterfront
        </button>
      ) : (
        <WaterfrontChallenge />
      )}
    </section>
  );
}
function WaterfrontChallenge() {
  const s = useScenario(),
    p = usePhysical();
  if (!s.physical || !s.plan || !s.context) return null;
  const r = waterfrontChallenge(
    s.physical,
    s.plan,
    s.context,
    s.baseline,
    s.intervention,
  );
  return (
    <section
      className="planning-challenge"
      aria-label="Transforming the Bryggen Waterfront challenge"
    >
      <div className="section-heading">
        <h3>Transforming the Bryggen Waterfront</h3>
        <button
          aria-label="Leave waterfront challenge"
          onClick={() => p.setChallenge(false)}
        >
          ×
        </button>
      </div>
      <p>
        A modest space, with access protected. These are transparent game
        objectives, not municipal standards.
      </p>
      <ul>
        {[
          "100–800 m² of valid proposed space (combined)",
          "Within 8 m of modelled roads; conflicts have explicit access edits",
          "Every synthetic trip remains routable, including local and servicing",
          "Mean through detour ≤ 3×; highest average V/C ≤ 3",
        ].map((label, i) => (
          <li key={label} className={r.checks[i] ? "objective-met" : ""}>
            {r.checks[i] ? "✓" : "·"} {label}
          </li>
        ))}
      </ul>
      <p className="challenge-verdict">
        {r.passed
          ? "Waterfront challenge achieved"
          : r.complete
            ? "Keep experimenting"
            : "Run a complete trial to evaluate"}
      </p>
    </section>
  );
}

function PhysicalReadout() {
  const s = useScenario();
  const { context, physical, library, referenceId } = s;
  const areas = useMemo(() => {
    if (!context) return [0, 0];
    const sum = (spaces: typeof physical) =>
      spaces?.proposals.reduce(
        (n, p) => n + placement(p, context!).areaM2,
        0,
      ) ?? 0;
    return [
      sum(physical),
      sum(library.find((v) => v.id === referenceId)?.scenario.physical ?? null),
    ];
  }, [context, physical, library, referenceId]);
  return (
    <div className="physical-readout" aria-label="Geometric plan comparison">
      <strong>GEOMETRY · PROPOSED HORIZONTAL AREA</strong>
      <span>
        Initial city: 0 m² added · Your plan: {number(areas[0], 1)} m²
      </span>
      {referenceId && (
        <span>
          Saved design: {number(areas[1], 1)} m²{" "}
          <button
            onClick={() =>
              s.setMapView(s.mapView === "reference" ? "plan" : "reference")
            }
          >
            {s.mapView === "reference"
              ? "Show current design"
              : "Show saved design"}
          </button>
        </span>
      )}
      <span>
        Traffic effects are calculated separately below. No pedestrian or
        economic benefits are modelled.
      </span>
    </div>
  );
}
