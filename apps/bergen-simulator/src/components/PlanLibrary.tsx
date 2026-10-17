import { useConstruction } from "../state/construction";
import { usePhysical } from "../state/physical";
import { useState } from "react";
import { useScenario } from "../state/scenario";
import { scenarioFile } from "../planning/scenarios";
export default function PlanLibrary() {
  const physicalDraft = usePhysical((p) => p.draft);
  const buildingDraft = useConstruction((c) => c.draft);
  const draft = physicalDraft || buildingDraft;
  const s = useScenario(),
    [selectedId, setSelectedId] = useState(""),
    [importing, setImporting] = useState(false);
  function save(duplicate = false) {
    try {
      s.save(window.localStorage, duplicate);
    } catch {
      s.report(
        "Browser storage is unavailable. Export your plan to retain it.",
      );
    }
  }
  function exportFile() {
    if (!s.network || !s.plan) return;
    try {
      const file = scenarioFile(
        s.name,
        s.plan,
        s.network,
        s.context,
        s.physical,
        s.development,
        s.living,
        s.management,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2) + "\n"], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "bergen-plan.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      s.report(e instanceof Error ? e.message : "Export failed.");
    }
  }
  return (
    <details className="plan-library">
      <summary>
        Save, open & compare plans <span>{s.library.length} local</span>
      </summary>
      <label className="planning-field">
        Plan name
        <input
          aria-label="Plan name"
          value={s.name}
          maxLength={60}
          onChange={(e) => s.setName(e.target.value)}
        />
      </label>
      <div className="planning-actions">
        <button onClick={() => save()} disabled={s.storageBlocked || !!draft}>
          Save plan
        </button>
        <button
          onClick={() => save(true)}
          disabled={s.storageBlocked || !!draft}
        >
          Duplicate plan
        </button>
      </div>
      <label className="planning-field">
        Saved plans
        <select
          aria-label="Saved plans"
          value={s.library.some((p) => p.id === selectedId) ? selectedId : ""}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Choose a saved plan…</option>
          {s.library.map((p) => (
            <option key={p.id} value={p.id}>
              {p.scenario.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="compare-button"
        disabled={!!draft || !s.library.some((p) => p.id === selectedId)}
        onClick={() => {
          usePhysical.getState().cancel();
          useConstruction.getState().cancel();
          s.reopen(selectedId);
        }}
      >
        Open saved plan
      </button>
      <label className="planning-field">
        Compare with saved plan
        <select
          aria-label="Compare with saved plan"
          value={s.referenceId ?? ""}
          onChange={(e) => s.setReference(e.target.value || null)}
        >
          <option value="">Initial baseline only</option>
          {s.library.map((p) => (
            <option key={p.id} value={p.id}>
              {p.scenario.name}
            </option>
          ))}
        </select>
      </label>
      <p className="data-note">
        Select a saved reference to compare geometry immediately. Run to compare
        traffic. Both plans and the initial baseline are recalculated from
        identical synthetic demand.
      </p>
      <div className="planning-actions">
        <button onClick={exportFile} disabled={!!draft}>
          Export JSON
        </button>
        <label className="import-plan">
          {importing ? "Validating…" : "Import JSON"}
          <input
            aria-label="Import scenario JSON"
            type="file"
            accept=".json,application/json"
            aria-busy={importing}
            disabled={importing || !!draft}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || importing || draft) return;
              if (file.size > 131072) {
                s.report(
                  "Import rejected: file exceeds 128 KiB. Your plan was preserved.",
                );
                return;
              }
              setImporting(true);
              try {
                if (s.importPlan(await file.text())) {
                  usePhysical.getState().cancel();
                  useConstruction.getState().cancel();
                }
              } catch {
                s.report(
                  "The selected file could not be read. Your plan was preserved.",
                );
              } finally {
                setImporting(false);
              }
            }}
          />
        </label>
      </div>
      <p className="data-note">
        Local to this browser and origin. No cloud sync. Export before clearing
        browser storage. Imports validate the schema and exact model
        compatibility; results are never imported.
      </p>
    </details>
  );
}
