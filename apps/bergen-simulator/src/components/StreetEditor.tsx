import { useMemo } from "react";
import { useCity } from "../state/store";
import { useScenario } from "../state/scenario";
import {
  CAPACITY_FACTORS,
  segmentId,
  segments,
  type AccessRule,
} from "../simulation/interventions";
import type { CityData } from "../geo/types";
export default function StreetEditor({ data }: { data: CityData }) {
  const { network, plan, phase, edit } = useScenario();
  const selected = useCity((s) => s.selected),
    selectedId = useCity((s) => s.selectedSegmentId);
  const sections = useMemo(() => (network ? segments(network) : []), [network]);
  const section = sections.find((e) => segmentId(e) === selectedId);
  const proposal = plan?.interventions.find((e) => e.segmentId === selectedId);
  const busy = phase === "running" || phase === "paused";
  const access = proposal?.access ?? "all",
    capacity = proposal?.capacityFactor ?? 1;
  return (
    <section
      id="street-editor"
      className="street-editor"
      aria-label="Street editing tools"
      tabIndex={-1}
    >
      <h3>Design on the street</h3>
      <p className="data-note">
        Select a teal outlined section in the city. Dashed colour marks your
        proposal.
      </p>
      <label className="planning-field">
        Select modelled section
        <select
          aria-label="Select modelled section"
          value={section ? segmentId(section) : ""}
          onChange={(event) => {
            const e = sections.find((e) => segmentId(e) === event.target.value);
            if (!e) return;
            const road = data.roads.find((r) => r.id === e.wayId);
            if (road) {
              useCity.getState().select(road, segmentId(e));
              const p = e.points[Math.floor(e.points.length / 2)];
              useCity.getState().focus(p);
            }
          }}
        >
          <option value="">Click a section in the city…</option>
          {sections.map((e, i) => (
            <option key={segmentId(e)} value={segmentId(e)}>
              {e.name} · section {i + 1} · {Math.round(e.lengthM)} m
            </option>
          ))}
        </select>
      </label>
      {section && selected?.id === section.wayId ? (
        <>
          <div className="street-identity">
            <strong>{section.name}</strong>
            <span>{section.wayId}</span>
            <small>
              OSM nodes {section.from} → {section.to}
            </small>
          </div>
          <p className="data-note">
            Mapped direction:{" "}
            {network!.edges.filter((e) => segmentId(e) === selectedId)
              .length === 1
              ? "one-way"
              : "two-way"}
            . Baseline model permits through, local and servicing trips. Actual
            current restrictions are not certified.
          </p>
          <label className="planning-field">
            Proposed access
            <select
              aria-label="Proposed access"
              disabled={busy}
              value={access}
              onChange={(event) =>
                edit({
                  segmentId: selectedId!,
                  access: event.target.value as AccessRule,
                  capacityFactor:
                    event.target.value === "closed" ? 1 : capacity,
                })
              }
            >
              <option value="all">All model categories</option>
              <option value="local">Restrict through-cars</option>
              <option value="service">
                Pedestrian priority · servicing only
              </option>
              <option value="closed">Close to all model vehicles</option>
            </select>
          </label>
          <label className="planning-field">
            Assumed capacity
            <select
              aria-label="Assumed capacity"
              disabled={busy || access === "closed"}
              value={capacity}
              onChange={(event) =>
                edit({
                  segmentId: selectedId!,
                  access,
                  capacityFactor: +event.target.value,
                })
              }
            >
              {CAPACITY_FACTORS.map((n) => (
                <option key={n} value={n}>
                  {n * 100}% · {section.capacityVph * n} veh/h per mapped
                  direction
                </option>
              ))}
            </select>
          </label>
          <p className="data-note">
            Hypothetical model settings. No construction or geographical
            changes. Capacity ranges from 25–200% of the assumed{" "}
            {section.capacityVph} veh/h baseline.
          </p>
          <button
            className="reset-scenario"
            disabled={!proposal || busy}
            onClick={() => edit({ segmentId: selectedId! })}
          >
            Restore this section
          </button>
        </>
      ) : selected?.kind === "road" ? (
        <p className="outside-model">
          <strong>{selected.name}</strong>
          <span>{selected.id}</span>Outside the verified transport model ·
          inspect only. Choose an outlined section to edit.
        </p>
      ) : (
        <p className="data-note">
          {selected
            ? "Buildings and other geography remain inspectable."
            : "31 verified sections are available. Unoutlined streets are inspectable, outside this model."}
        </p>
      )}
    </section>
  );
}
