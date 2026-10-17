import { ProjectControls } from "./ManagementPanel";
import { DistrictBuildingInfo } from "./DistrictPanel";
import { useMemo } from "react";
import { useConstruction } from "../state/construction";
import { useScenario } from "../state/scenario";
import { useCity } from "../state/store";
import {
  buildingHeight,
  buildingPlacement,
  developmentMetrics,
  quarterChallenge,
  type Purpose,
} from "../physical/buildings";
import { number } from "./PlanningResults";
const USES = ["residential", "commercial", "civic"] as const;
function focusConstruction(point: [number, number]) {
  useCity.getState().focus(point, true);
  if (window.matchMedia("(max-width: 700px)").matches)
    document.querySelector("canvas")?.scrollIntoView({ block: "center" });
}
export function ConstructionFeedback() {
  const c = useConstruction(),
    s = useScenario();
  const check = useMemo(
    () =>
      c.draft && s.context
        ? buildingPlacement(
            c.draft,
            s.context,
            s.physical,
            s.development?.proposals,
          )
        : null,
    [c.draft, s.context, s.physical, s.development],
  );
  if (!c.draft) return null;
  return (
    <div
      className={
        "placement-feedback " +
        (check?.valid && c.located ? "placement-valid" : "placement-invalid")
      }
      aria-live="polite"
      data-building-valid={!!check?.valid && c.located}
    >
      <strong>
        {!c.located
          ? "Choose a location on mapped land"
          : check?.valid
            ? "Geometrically eligible concept"
            : "Construction rejected"}
      </strong>
      <span>
        {number(c.draft.width * c.draft.depth, 1)} m² footprint ·{" "}
        {number(c.draft.width * c.draft.depth * c.draft.storeys, 1)} m² assumed
        gross floor area · {number(buildingHeight(c.draft), 1)} m high
      </span>
      {c.located && check?.errors.map((e) => <p key={e}>{e}</p>)}
    </div>
  );
}
export function BuildingMapTools() {
  const s = useScenario(),
    c = useConstruction();
  const check = useMemo(
    () =>
      c.draft && s.context
        ? buildingPlacement(
            c.draft,
            s.context,
            s.physical,
            s.development?.proposals,
          )
        : null,
    [c.draft, s.context, s.physical, s.development],
  );
  return (
    <div
      className="physical-map-tools building-map-tools"
      aria-label="Construction map tools"
    >
      <strong>
        {s.mapView === "baseline"
          ? "OBSERVED BERGEN"
          : s.mapView === "reference"
            ? "SAVED DEVELOPMENT / COMPARISON"
            : c.draft
              ? "CONCEPTUAL BUILDING / PREVIEW"
              : "YOUR HYPOTHETICAL CITY"}
      </strong>
      {c.draft ? (
        <>
          <ConstructionFeedback />
          <div className="planning-actions">
            {(["place", "move", "rotate", "resize", "navigate"] as const).map(
              (action) => (
                <button
                  key={action}
                  className="construction-gesture-button"
                  aria-pressed={c.action === action}
                  onClick={() => c.setAction(action)}
                >
                  {action === "navigate"
                    ? "Navigate camera"
                    : action[0].toUpperCase() + action.slice(1)}
                </button>
              ),
            )}
            <select
              className="construction-gesture-select"
              aria-label="Construction gesture"
              value={c.action}
              onChange={(e) => c.setAction(e.target.value as typeof c.action)}
            >
              {(["place", "move", "rotate", "resize", "navigate"] as const).map(
                (action) => (
                  <option key={action} value={action}>
                    {action === "navigate"
                      ? "Navigate camera"
                      : action[0].toUpperCase() + action.slice(1)}
                  </option>
                ),
              )}
            </select>
            <button onClick={c.confirm} disabled={!c.located || !check?.valid}>
              Apply building
            </button>
            <button onClick={c.cancel}>Cancel building</button>
          </div>
        </>
      ) : (
        <div className="planning-actions">
          <button
            onClick={() => {
              s.setMapView("plan");
              if (!s.showBuildings) s.toggleBuildings();
              c.start("residential");
            }}
            disabled={(s.development?.proposals.length ?? 0) >= 8}
          >
            + Place building
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
        {c.hint ||
          (c.draft
            ? "Centre handle moves · forward handle rotates · corner resizes. Numeric controls are available in the sidebar."
            : "Select a proposed building to inspect it. Colours indicate intended use, not surveyed materials.")}
      </span>
    </div>
  );
}
export default function BuildingEditor() {
  const s = useScenario(),
    c = useConstruction();
  const selected = s.development?.proposals.find((b) => b.id === c.selectedId),
    b = c.draft ?? selected;
  function start(purpose: Purpose) {
    s.setMapView("plan");
    if (!s.showBuildings) s.toggleBuildings();
    c.start(purpose);
    useCity.getState().select(null);
    focusConstruction([-35, -255]);
  }
  return (
    <section className="building-editor" aria-label="Building design tools">
      <div className="section-heading">
        <h3>Build an alternative Bergen</h3>
        <span>{s.development?.proposals.length ?? 0} / 8 concepts</span>
      </div>
      <p className="data-note">
        Choose an intended use, then tap land to preview a reversible building.
        No existing structure is demolished. Empty mapped ground is not proof of
        available land.
      </p>
      <div className="building-palette">
        {USES.map((purpose) => (
          <button
            key={purpose}
            className={"purpose-" + purpose}
            onClick={() => start(purpose)}
            disabled={(s.development?.proposals.length ?? 0) >= 8}
          >
            {purpose[0].toUpperCase() + purpose.slice(1)}
          </button>
        ))}
      </div>
      <details className="scenario-assumptions">
        <summary>Find a geometric study site</summary>
        <p>
          Three tested 12 × 16 m rectangles fit the pinned map. These are
          design-study locations only; ownership, heritage and permission are
          unknown. Focus a site, then tap its ground to place a preview.
        </p>
        <div className="planning-actions">
          {(
            [
              [-95, -317],
              [-23, -237],
              [9, -213],
            ] as [number, number][]
          ).map((point, i) => (
            <button key={i} onClick={() => focusConstruction(point)}>
              Focus study site {i + 1}
            </button>
          ))}
        </div>
        <a href="/plans/urban-quarter-example.json" download>
          Download combined example JSON
        </a>
      </details>
      <label className="planning-field">
        Proposed buildings
        <select
          aria-label="Proposed buildings"
          value={selected?.id ?? ""}
          onChange={(e) => c.select(e.target.value)}
        >
          <option value="">Select on map or choose…</option>
          {s.development?.proposals.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {b && (
        <>
          {c.draft ? (
            <>
              <label className="planning-field">
                Building name
                <input
                  aria-label="Building name"
                  value={b.name}
                  maxLength={60}
                  onChange={(e) => c.patch({ name: e.target.value })}
                />
              </label>
              <label className="planning-field">
                Intended use
                <select
                  aria-label="Building purpose"
                  value={b.purpose}
                  onChange={(e) =>
                    c.patch({ purpose: e.target.value as Purpose })
                  }
                >
                  {USES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <div className="building-dimensions">
                {(
                  [
                    ["Width metres", "width", 6, 30, 0.5],
                    ["Depth metres", "depth", 8, 30, 0.5],
                    ["Rotation degrees", "rotation", 0, 359.99, 5],
                    ["Storeys", "storeys", 1, 6, 1],
                    [
                      "Assumed storey height metres",
                      "storeyHeight",
                      2.8,
                      4,
                      0.1,
                    ],
                  ] as const
                ).map(([label, key, min, max, step]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={label}
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      value={Number.isFinite(b[key]) ? b[key] : ""}
                      onChange={(e) =>
                        c.patch({ [key]: e.target.valueAsNumber })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="planning-field">
                Conceptual roof
                <select
                  aria-label="Conceptual roof"
                  value={b.roof}
                  onChange={(e) =>
                    c.patch({ roof: e.target.value as "flat" | "gabled" })
                  }
                >
                  <option value="flat">Flat roof</option>
                  <option value="gabled">Gabled roof · assumed 2 m rise</option>
                </select>
              </label>
              <details className="precision-tools">
                <summary>Precise location & keyboard controls</summary>
                <p>
                  Local metres from 5.3235° E / 60.395° N. East X, south Z.
                  Enter both coordinates, then locate. Arrow keys in number
                  fields support touch and keyboard placement.
                </p>
                <div className="coordinate-pair">
                  {[0, 1].map((i) => (
                    <label key={i}>
                      {i ? "South Z" : "East X"}
                      <input
                        aria-label={
                          i ? "Building south metres" : "Building east metres"
                        }
                        type="number"
                        step=".5"
                        value={Number.isFinite(b.center[i]) ? b.center[i] : ""}
                        onChange={(e) =>
                          c.patch({
                            center: i
                              ? [b.center[0], e.target.valueAsNumber]
                              : [e.target.valueAsNumber, b.center[1]],
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <button onClick={() => c.locate([...b.center])}>
                  Locate at coordinates
                </button>
                <button
                  onClick={() => c.patch({ rotation: (b.rotation + 15) % 360 })}
                >
                  Rotate +15°
                </button>
              </details>
              <ConstructionFeedback />
              <div className="planning-actions">
                <button
                  onClick={() => {
                    c.confirm();
                    if (!useConstruction.getState().draft)
                      focusConstruction(b.center);
                  }}
                  disabled={
                    !c.located ||
                    !s.context ||
                    !buildingPlacement(
                      b,
                      s.context,
                      s.physical,
                      s.development?.proposals,
                    ).valid
                  }
                >
                  Confirm building
                </button>
                <button onClick={c.cancel}>Discard building draft</button>
              </div>
            </>
          ) : (
            <>
              <p className="surface-readout">
                {b.name} · {b.purpose}
                <br />
                {number(b.width * b.depth)} m² footprint · {b.storeys} storeys ·{" "}
                {number(b.width * b.depth * b.storeys)} m² assumed floor area ·{" "}
                {number(buildingHeight(b), 1)} m height
              </p>
              <DistrictBuildingInfo id={b.id} />
              <ProjectControls id={b.id} />
              <div className="planning-actions">
                <button
                  onClick={() => {
                    s.setMapView("plan");
                    if (!s.showBuildings) s.toggleBuildings();
                    c.edit();
                  }}
                >
                  Edit building
                </button>
                <button
                  onClick={() => {
                    s.removeBuilding(b.id);
                    c.select("");
                  }}
                >
                  Remove building
                </button>
                <button onClick={() => focusConstruction(b.center)}>
                  Focus building
                </button>
              </div>
            </>
          )}
        </>
      )}
      <DevelopmentSummary />
      <label className="traffic-toggle">
        <input
          type="checkbox"
          checked={s.showBuildings}
          onChange={s.toggleBuildings}
          disabled={!!c.draft}
        />
        Show proposed buildings
      </label>
      <button
        className="compare-button"
        onClick={() => {
          s.clearBuildings();
          c.cancel();
          c.select("");
        }}
        disabled={!!c.draft || !s.development?.proposals.length}
      >
        Remove all proposed buildings
      </button>
      {c.hint && (
        <p role="note" className="planning-notice">
          {c.hint}
        </p>
      )}
      <p className="eligibility-caveat">
        Concepts only. Geometric eligibility is not planning permission,
        ownership, heritage clearance or engineering feasibility. Storey height
        and roof rise are player assumptions. The flat floor and terrain-contact
        skirt are schematic; no excavation is modelled. Construction changes no
        traffic demand, capacity or access.
      </p>
      <details className="scenario-assumptions">
        <summary>Construction bounds & geometric clearance</summary>
        <p>
          6–30 m width, 8–30 m depth; 48–600 m² footprint. 1–6 storeys, 2.8–4 m
          per storey, at most 26 m total height. Maximum eight concepts, terrain
          grade 10%, relief 1.5 m. Keep 6 m from modelled road centrelines, 1 m
          from other proposed buildings and 0.25 m from observed footprints,
          water and proposed spaces. These are hypothetical game rules, not
          Norwegian planning standards. All placement stays inside the existing
          Bryggen authoring window. Roads outside the audited transport network,
          parcels and utilities are not fully assessed.
        </p>
      </details>
      <button
        className="compare-button"
        onClick={() => c.setChallenge(!c.challenge)}
      >
        {c.challenge
          ? "Leave urban quarter challenge"
          : "Challenge · A New Urban Quarter"}
      </button>
      {c.challenge && <QuarterChallenge />}
    </section>
  );
}
function DevelopmentSummary() {
  const s = useScenario(),
    m = developmentMetrics(s.development, s.physical),
    ref = s.library.find((p) => p.id === s.referenceId),
    r = developmentMetrics(
      ref?.scenario.development ?? null,
      ref?.scenario.physical ?? null,
    );
  return (
    <div
      className="physical-readout development-summary"
      aria-label="Development summary"
      data-building-count={m.count}
      data-floor-area={m.grossFloorM2}
    >
      <strong>DEVELOPMENT · GEOMETRY & ASSUMPTIONS</strong>
      <span>Initial city: 0 proposed buildings · 0 m² added</span>
      <span>
        {m.count} buildings · {number(m.footprintM2)} m² footprint ·{" "}
        {number(m.grossFloorM2)} m² assumed gross floor area
      </span>
      <span>
        Storeys:{" "}
        {Object.entries(m.storeys)
          .map(([n, count]) => `${count} × ${n}`)
          .join(" · ") || "none"}{" "}
        · maximum height {number(m.maxHeightM, 1)} m
      </span>
      <span>
        {USES.map((u) => `${u}: ${number(m.uses[u])} m² GFA`).join(" · ")}
      </span>
      <span>
        {number(m.publicSpaceM2, 1)} m² public space retained · no overlap
        permitted
      </span>
      <span>
        Applied buildings pass the bounded geometry checks; access proximity is
        not a verified entrance or legal connection.
      </span>
      {ref && (
        <>
          <strong>Saved: {ref.scenario.name}</strong>
          <span>
            {r.count} buildings · {number(r.grossFloorM2)} m² GFA ·{" "}
            {number(r.publicSpaceM2, 1)} m² public space
          </span>
          <span>
            Current − saved: {number(m.grossFloorM2 - r.grossFloorM2)} m²
            assumed floor area
          </span>
          <button
            onClick={() =>
              s.setMapView(s.mapView === "reference" ? "plan" : "reference")
            }
          >
            {s.mapView === "reference"
              ? "Show current development"
              : "Show saved development"}
          </button>
        </>
      )}
      <span>
        No residents, jobs, rents, construction costs or induced trips are
        estimated. Transport outcomes remain separate.
      </span>
    </div>
  );
}
function QuarterChallenge() {
  const s = useScenario();
  if (!s.development || !s.physical || !s.context) return null;
  const r = quarterChallenge(s.development, s.physical, s.context);
  return (
    <section
      className="planning-challenge"
      aria-label="A New Urban Quarter challenge"
    >
      <h3>A New Urban Quarter</h3>
      <p>
        A compact mixed-use concept with space left for the public. Transparent
        game objectives; no claim of real development approval.
      </p>
      <ul>
        {[
          "3–6 compatible concepts; combined footprint ≤700 m²",
          "1,000–1,800 m² assumed gross floor area",
          "At least two intended uses",
          "120–350 m² retained proposed public space",
          "Height ≤18 m; every valid building within 25 m of a modelled road",
        ].map((label, i) => (
          <li key={label} className={r.checks[i] ? "objective-met" : ""}>
            {r.checks[i] ? "✓" : "·"} {label}
          </li>
        ))}
      </ul>
      <p className="challenge-verdict">
        {r.passed
          ? "Urban quarter challenge achieved"
          : "Keep shaping your quarter"}
      </p>
    </section>
  );
}
