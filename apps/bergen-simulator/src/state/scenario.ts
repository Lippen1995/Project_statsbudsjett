import { create } from "zustand";
import {
  buildNetwork,
  type Network,
  type TransportSource,
} from "../simulation/network";
import { TOTAL_TICKS, initialResult, type Result } from "../simulation/engine";
import {
  editPlan,
  emptyPlan,
  validatePlan,
  type Plan,
  type Intervention,
} from "../simulation/interventions";
import type { Reply } from "../simulation/protocol";
import {
  parseScenario,
  readLibrary,
  scenarioFile,
  writeLibrary,
  type PlanStorage,
  type SavedPlan,
} from "../planning/scenarios";
export type Phase =
  | "closed"
  | "ready"
  | "running"
  | "paused"
  | "complete"
  | "error";
export type MapView = "plan" | "baseline" | "reference";
interface ScenarioState {
  source: TransportSource | null;
  network: Network | null;
  plan: Plan | null;
  phase: Phase;
  baseline: Result | null;
  intervention: Result | null;
  reference: Result | null;
  mapView: MapView;
  heatmap: boolean;
  error: string;
  notice: string;
  computeMs: number;
  history: Plan[];
  cursor: number;
  name: string;
  currentId: string | null;
  library: SavedPlan[];
  storageBlocked: boolean;
  referenceId: string | null;
  challenge: boolean;
  open: (source: TransportSource) => void;
  edit: (edit: Intervention | { segmentId: string }) => void;
  undo: () => void;
  redo: () => void;
  run: () => void;
  pauseResume: () => void;
  reset: () => void;
  close: () => void;
  setMapView: (view: MapView) => void;
  toggleHeatmap: () => void;
  setName: (name: string) => void;
  setReference: (id: string | null) => void;
  setChallenge: (active: boolean) => void;
  loadLibrary: (storage: PlanStorage) => void;
  save: (storage: PlanStorage, duplicate?: boolean) => boolean;
  reopen: (id: string) => void;
  importPlan: (text: string) => boolean;
  report: (message: string) => void;
}
let worker: Worker | undefined;
function stop() {
  worker?.terminate();
  worker = undefined;
}
const resultReset = {
  baseline: null,
  intervention: null,
  reference: null,
  mapView: "plan" as MapView,
  error: "",
  computeMs: 0,
};
const clean = {
  ...resultReset,
  heatmap: true,
  history: [] as Plan[],
  cursor: 0,
  name: "Untitled Bergen plan",
  currentId: null,
  referenceId: null,
  challenge: false,
  notice: "",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "The plan could not be processed.";
export const useScenario = create<ScenarioState>((set, get) => ({
  ...clean,
  source: null,
  network: null,
  plan: null,
  phase: "closed",
  library: [],
  storageBlocked: false,
  open: (source) => {
    const owned = structuredClone(source),
      network = buildNetwork(owned),
      plan = emptyPlan(network);
    stop();
    set({
      ...clean,
      source: owned,
      network,
      plan,
      history: [plan],
      phase: "ready",
      library: [],
      storageBlocked: false,
    });
  },
  edit: (edit) => {
    const { plan, network, history, cursor } = get();
    if (!plan || !network) return;
    try {
      const next = editPlan(plan, edit, network);
      if (JSON.stringify(next) === JSON.stringify(plan)) return;
      const updated = [...history.slice(0, cursor + 1), next].slice(-51);
      stop();
      set({
        ...resultReset,
        plan: next,
        history: updated,
        cursor: updated.length - 1,
        phase: "ready",
        notice: "Draft changed. Run the model to evaluate this plan.",
      });
    } catch (e) {
      set({ error: message(e) });
    }
  },
  undo: () => {
    const s = get();
    if (s.cursor < 1) return;
    stop();
    set({
      ...resultReset,
      cursor: s.cursor - 1,
      plan: structuredClone(s.history[s.cursor - 1]),
      phase: "ready",
      notice: "Street edit undone. Results cleared.",
    });
  },
  redo: () => {
    const s = get();
    if (s.cursor >= s.history.length - 1) return;
    stop();
    set({
      ...resultReset,
      cursor: s.cursor + 1,
      plan: structuredClone(s.history[s.cursor + 1]),
      phase: "ready",
      notice: "Street edit restored. Results cleared.",
    });
  },
  run: () => {
    const { source, network, plan, referenceId, library } = get();
    if (!source || !network || !plan) return;
    stop();
    try {
      const referencePlan = referenceId
        ? library.find((p) => p.id === referenceId)?.scenario.plan
        : null;
      if (referenceId && !referencePlan)
        throw new Error("Saved reference is unavailable.");
      validatePlan(plan, network);
      if (referencePlan) validatePlan(referencePlan, network);
      const current = new Worker(
        new URL("../simulation/worker.ts", import.meta.url),
        { type: "module" },
      );
      worker = current;
      set({
        ...resultReset,
        baseline: initialResult(network),
        intervention: initialResult(network),
        reference: referencePlan ? initialResult(network) : null,
        phase: "running",
        notice: "",
      });
      current.onmessage = ({ data }: MessageEvent<Reply>) => {
        if (worker !== current) return;
        if (data.type === "error") {
          stop();
          set({ phase: "error", error: data.message });
        } else {
          set({
            baseline: data.baseline,
            intervention: data.intervention,
            reference: data.reference,
            computeMs: data.computeMs,
            phase:
              data.intervention.tick === TOTAL_TICKS
                ? "complete"
                : data.paused
                  ? "paused"
                  : "running",
          });
          if (data.intervention.tick === TOTAL_TICKS) stop();
        }
      };
      current.onerror = () => {
        if (worker === current) {
          stop();
          set({
            phase: "error",
            error:
              "The simulation worker could not run. Your draft is preserved.",
          });
        }
      };
      current.postMessage({
        type: "start",
        source,
        plan,
        reference: referencePlan ?? null,
      });
    } catch (e) {
      stop();
      set({ phase: "error", error: message(e) });
    }
  },
  pauseResume: () => {
    const { phase } = get();
    if (phase === "running" || phase === "paused")
      worker?.postMessage({ type: phase === "running" ? "pause" : "resume" });
  },
  reset: () => {
    const network = get().network;
    stop();
    const plan = network ? emptyPlan(network) : null;
    set({
      ...clean,
      plan,
      history: plan ? [plan] : [],
      phase: network ? "ready" : "closed",
      notice: "City restored to the original model. Saved plans are retained.",
    });
  },
  close: () => {
    stop();
    set({
      ...clean,
      source: null,
      network: null,
      plan: null,
      phase: "closed",
      library: [],
      storageBlocked: false,
    });
  },
  setMapView: (mapView) => {
    const s = get();
    if (mapView === "reference" && !s.reference) return;
    set({ mapView });
  },
  toggleHeatmap: () => set((s) => ({ heatmap: !s.heatmap })),
  setName: (name) => set({ name }),
  setReference: (referenceId) => {
    if (referenceId && !get().library.some((p) => p.id === referenceId)) {
      set({ error: "Unknown saved reference." });
      return;
    }
    stop();
    set({
      ...resultReset,
      referenceId,
      phase: get().network ? "ready" : "closed",
    });
  },
  setChallenge: (challenge) => set({ challenge }),
  loadLibrary: (storage) => {
    const n = get().network;
    if (!n) return;
    try {
      set({
        library: readLibrary(storage, n).plans,
        storageBlocked: false,
        error: "",
      });
    } catch (e) {
      set({
        storageBlocked: true,
        error: `Local library unavailable: ${message(e)} Existing data was not changed; export your draft instead.`,
      });
    }
  },
  save: (storage, duplicate = false) => {
    const s = get();
    if (!s.network || !s.plan) return false;
    try {
      if (s.storageBlocked)
        throw new Error(
          "The existing local library is incompatible. It will not be overwritten. Export your draft instead.",
        );
      const name = duplicate ? s.name.slice(0, 53) + " (copy)" : s.name;
      const scenario = scenarioFile(name, s.plan, s.network);
      const id = duplicate || !s.currentId ? crypto.randomUUID() : s.currentId;
      const record = { id, savedAt: new Date().toISOString(), scenario };
      const latest = readLibrary(storage, s.network);
      const known = s.library.find((p) => p.id === id),
        existing = latest.plans.find((p) => p.id === id);
      if (
        known &&
        existing &&
        JSON.stringify(known) !== JSON.stringify(existing)
      )
        throw new Error(
          "This saved plan changed in another tab. Reopen it or duplicate your draft.",
        );
      const plans = writeLibrary(
        storage,
        {
          version: 1,
          plans: [...latest.plans.filter((p) => p.id !== id), record],
        },
        s.network,
      ).plans;
      const replacedReference = id === s.referenceId;
      if (replacedReference) stop();
      set({
        ...(replacedReference
          ? { ...resultReset, phase: "ready" as Phase }
          : {}),
        library: plans,
        name: scenario.name,
        currentId: id,
        error: "",
        notice: duplicate
          ? "Plan duplicated locally. The original is unchanged."
          : "Plan saved in this browser.",
      });
      return true;
    } catch (e) {
      set({ error: `Save failed: ${message(e)} Your draft is unchanged.` });
      return false;
    }
  },
  reopen: (id) => {
    const s = get();
    const record = s.library.find((p) => p.id === id);
    if (!record || !s.network) {
      set({ error: "Saved plan is unavailable." });
      return;
    }
    try {
      const plan = validatePlan(record.scenario.plan, s.network);
      stop();
      set({
        ...resultReset,
        name: record.scenario.name,
        currentId: id,
        plan,
        history: [plan],
        cursor: 0,
        referenceId: null,
        phase: "ready",
        notice: "Saved plan restored. Run to recalculate its outcomes.",
      });
    } catch (e) {
      set({ error: message(e) });
    }
  },
  importPlan: (text) => {
    const n = get().network;
    if (!n) return false;
    try {
      const file = parseScenario(text, n);
      stop();
      set({
        ...resultReset,
        plan: file.plan,
        name: file.name,
        currentId: null,
        referenceId: null,
        history: [file.plan],
        cursor: 0,
        phase: "ready",
        notice:
          "Plan imported and validated. Save it to retain it in this browser.",
      });
      return true;
    } catch (e) {
      set({
        error: `Import rejected: ${message(e)} Your current plan was preserved.`,
      });
      return false;
    }
  },
  report: (error) => set({ error }),
}));
