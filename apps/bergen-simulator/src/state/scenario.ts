import {
  defaultLiving,
  validateLiving,
  type LivingInputs,
} from "../district/model";
import {
  emptyDevelopment,
  validateDevelopment,
  type DevelopmentPlan,
  type BuildingProposal,
} from "../physical/buildings";
import type { CityData } from "../geo/types";
import {
  placementContext,
  emptyPhysical,
  validatePhysical,
  type PhysicalPlan,
  type PlacementContext,
  type PublicSpace,
} from "../physical/model";
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
  "closed" | "ready" | "running" | "paused" | "complete" | "error";
export type MapView = "plan" | "baseline" | "reference";
interface Draft {
  living: LivingInputs;
  plan: Plan;
  physical: PhysicalPlan | null;
  development: DevelopmentPlan | null;
}
interface ScenarioState {
  living: LivingInputs;
  districtEpoch: number;
  editLiving: (inputs: unknown) => boolean;
  context: PlacementContext | null;
  physical: PhysicalPlan | null;
  development: DevelopmentPlan | null;
  putSpace: (space: PublicSpace) => boolean;
  putBuilding: (building: BuildingProposal) => boolean;
  removeBuilding: (id: string) => void;
  clearBuildings: () => void;
  showBuildings: boolean;

  toggleBuildings: () => void;
  removeSpace: (id: string) => void;
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
  history: Draft[];
  cursor: number;
  name: string;
  currentId: string | null;
  library: SavedPlan[];
  storageBlocked: boolean;
  referenceId: string | null;
  challenge: boolean;
  open: (source: TransportSource, data?: CityData) => void;
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
  history: [] as Draft[],
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
  living: defaultLiving(),
  districtEpoch: 0,
  context: null,
  physical: null,
  development: null,
  showBuildings: true,
  source: null,
  network: null,
  plan: null,
  phase: "closed",
  library: [],
  storageBlocked: false,
  open: (source, data) => {
    const owned = structuredClone(source),
      network = buildNetwork(owned),
      plan = emptyPlan(network),
      context = data ? placementContext(data, network) : null,
      physical = context ? emptyPhysical(context) : null,
      development = context ? emptyDevelopment(context) : null,
      living = defaultLiving();
    stop();
    set({
      ...clean,
      living,
      districtEpoch: get().districtEpoch + 1,
      context,
      physical,
      development,
      showBuildings: true,
      source: owned,
      network,
      plan,
      history: [{ plan, physical, development, living }],
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
      const updated = [
        ...history.slice(0, cursor + 1),
        {
          living: get().living,
          plan: next,
          physical: get().physical,
          development: get().development,
        },
      ].slice(-51);
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
  putSpace: (space) => {
    const s = get();
    if (!s.context || !s.physical || !s.plan) return false;
    try {
      const physical = validatePhysical(
        {
          ...s.physical,
          proposals: [
            ...s.physical.proposals.filter((p) => p.id !== space.id),
            space,
          ],
        },
        s.context,
      );
      if (s.development)
        validateDevelopment(s.development, s.context, physical);
      if (JSON.stringify(physical) === JSON.stringify(s.physical)) return true;
      const history = [
        ...s.history.slice(0, s.cursor + 1),
        {
          plan: s.plan,
          physical,
          development: s.development,
          living: s.living,
        },
      ].slice(-51);
      stop();
      set({
        ...resultReset,
        physical,
        history,
        cursor: history.length - 1,
        phase: "ready",
        notice:
          "Hypothetical surface applied. Traffic rules are unchanged until you explicitly edit them.",
      });
      return true;
    } catch (e) {
      set({ error: message(e) });
      return false;
    }
  },
  removeSpace: (id) => {
    const s = get();
    if (
      !s.physical ||
      !s.plan ||
      !s.physical.proposals.some((p) => p.id === id)
    )
      return;
    const physical = {
      ...s.physical,
      proposals: s.physical.proposals.filter((p) => p.id !== id),
    };
    const history = [
      ...s.history.slice(0, s.cursor + 1),
      { plan: s.plan, physical, development: s.development, living: s.living },
    ].slice(-51);
    stop();
    set({
      ...resultReset,
      physical,
      history,
      cursor: history.length - 1,
      phase: "ready",
      notice:
        "Surface removed. Explicit street edits remain in your plan; undo or restore them separately.",
    });
  },
  putBuilding: (building) => {
    const s = get();
    if (!s.context || !s.development || !s.plan) return false;
    try {
      const development = validateDevelopment(
        {
          ...s.development,
          proposals: [
            ...s.development.proposals.filter((b) => b.id !== building.id),
            building,
          ],
        },
        s.context,
        s.physical,
      );
      if (JSON.stringify(development) === JSON.stringify(s.development))
        return true;
      const history = [
        ...s.history.slice(0, s.cursor + 1),
        { plan: s.plan, physical: s.physical, development, living: s.living },
      ].slice(-51);
      // Geometry-only construction preserves all traffic results and the running worker.
      set({
        development,
        history,
        cursor: history.length - 1,
        showBuildings: true,
        mapView: "plan",
        error: "",
        notice:
          "Conceptual building placed. Geometry changed; traffic demand and results are unchanged.",
      });
      return true;
    } catch (e) {
      set({ error: message(e) });
      return false;
    }
  },
  removeBuilding: (id) => {
    const s = get();
    if (!s.development || !s.plan) return;
    const development = {
      ...s.development,
      proposals: s.development.proposals.filter((b) => b.id !== id),
    };
    if (development.proposals.length === s.development.proposals.length) return;
    const history = [
      ...s.history.slice(0, s.cursor + 1),
      { plan: s.plan, physical: s.physical, development, living: s.living },
    ].slice(-51);
    set({
      development,
      history,
      cursor: history.length - 1,
      error: "",
      notice:
        "Conceptual building removed. Observed city and traffic plan retained.",
    });
  },
  clearBuildings: () => {
    const s = get();
    if (!s.development?.proposals.length || !s.plan) return;
    const development = { ...s.development, proposals: [] };
    const history = [
      ...s.history.slice(0, s.cursor + 1),
      { plan: s.plan, physical: s.physical, development, living: s.living },
    ].slice(-51);
    set({
      development,
      history,
      cursor: history.length - 1,
      notice: "All proposed buildings removed. Existing geography retained.",
    });
  },
  editLiving: (inputs) => {
    const s = get();
    if (!s.plan) return false;
    try {
      const living = validateLiving(inputs);
      if (JSON.stringify(living) === JSON.stringify(s.living)) return true;
      const history = [
        ...s.history.slice(0, s.cursor + 1),
        {
          plan: s.plan,
          physical: s.physical,
          development: s.development,
          living,
        },
      ].slice(-51);
      set({
        living,
        history,
        cursor: history.length - 1,
        error: "",
        notice:
          "District assumptions changed. Living City restarts at month zero; traffic is unchanged.",
      });
      return true;
    } catch (e) {
      set({ error: message(e) });
      return false;
    }
  },
  toggleBuildings: () => set((s) => ({ showBuildings: !s.showBuildings })),
  undo: () => {
    const s = get();
    if (s.cursor < 1) return;
    const target = s.history[s.cursor - 1];
    if (
      JSON.stringify(target.plan) === JSON.stringify(s.plan) &&
      JSON.stringify(target.physical) === JSON.stringify(s.physical)
    ) {
      set({
        ...structuredClone(target),
        cursor: s.cursor - 1,
        notice:
          "Design or district-input edit undone. Traffic results retained.",
      });
      return;
    }
    stop();
    set({
      ...resultReset,
      cursor: s.cursor - 1,
      ...structuredClone(s.history[s.cursor - 1]),
      phase: "ready",
      notice: "Plan edit undone. Results cleared.",
    });
  },
  redo: () => {
    const s = get();
    if (s.cursor >= s.history.length - 1) return;
    const target = s.history[s.cursor + 1];
    if (
      JSON.stringify(target.plan) === JSON.stringify(s.plan) &&
      JSON.stringify(target.physical) === JSON.stringify(s.physical)
    ) {
      set({
        ...structuredClone(target),
        cursor: s.cursor + 1,
        notice:
          "Design or district-input edit restored. Traffic results retained.",
      });
      return;
    }
    stop();
    set({
      ...resultReset,
      cursor: s.cursor + 1,
      ...structuredClone(s.history[s.cursor + 1]),
      phase: "ready",
      notice: "Plan edit restored. Results cleared.",
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
      if (get().physical && get().context)
        validatePhysical(get().physical, get().context!);
      if (get().development && get().context)
        validateDevelopment(get().development, get().context!, get().physical);
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
    const plan = network ? emptyPlan(network) : null,
      physical = get().context ? emptyPhysical(get().context!) : null,
      development = get().context ? emptyDevelopment(get().context!) : null,
      living = defaultLiving();
    set({
      ...clean,
      living,
      districtEpoch: get().districtEpoch + 1,
      plan,
      physical,
      development,
      showBuildings: true,
      history: plan ? [{ plan, physical, development, living }] : [],
      phase: network ? "ready" : "closed",
      notice: "City restored to the original model. Saved plans are retained.",
    });
  },
  close: () => {
    stop();
    set({
      ...clean,
      living: defaultLiving(),
      districtEpoch: get().districtEpoch + 1,
      context: null,
      physical: null,
      development: null,
      showBuildings: true,
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
    if (
      mapView === "reference" &&
      !s.library.some((p) => p.id === s.referenceId)
    )
      return;
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
        library: readLibrary(storage, n, get().context).plans,
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
      const scenario = scenarioFile(
        name,
        s.plan,
        s.network,
        s.context,
        s.physical,
        s.development,
        s.living,
      );
      const id = duplicate || !s.currentId ? crypto.randomUUID() : s.currentId;
      const record = { id, savedAt: new Date().toISOString(), scenario };
      const latest = readLibrary(storage, s.network, s.context);
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
        s.context,
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
      const plan = validatePlan(record.scenario.plan, s.network),
        physical = record.scenario.physical
          ? validatePhysical(record.scenario.physical, s.context!)
          : s.context
            ? emptyPhysical(s.context)
            : null,
        development = record.scenario.development
          ? validateDevelopment(
              record.scenario.development,
              s.context!,
              physical,
            )
          : s.context
            ? emptyDevelopment(s.context)
            : null;
      stop();
      set({
        ...resultReset,
        name: record.scenario.name,
        currentId: id,
        plan,
        physical,
        development,
        showBuildings: true,
        history: [
          {
            plan,
            physical,
            development,
            living: record.scenario.living
              ? validateLiving(record.scenario.living)
              : defaultLiving(),
          },
        ],
        cursor: 0,
        referenceId: null,
        living: record.scenario.living
          ? validateLiving(record.scenario.living)
          : defaultLiving(),
        districtEpoch: get().districtEpoch + 1,
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
      const file = parseScenario(text, n, get().context);
      const physical =
        file.physical ?? (get().context ? emptyPhysical(get().context!) : null);
      const development =
        file.development ??
        (get().context ? emptyDevelopment(get().context!) : null);
      stop();
      set({
        ...resultReset,
        physical,
        development,
        living: file.living ?? defaultLiving(),
        districtEpoch: get().districtEpoch + 1,
        showBuildings: true,
        plan: file.plan,
        name: file.name,
        currentId: null,
        referenceId: null,
        history: [
          {
            plan: file.plan,
            physical,
            development,
            living: file.living ?? defaultLiving(),
          },
        ],
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
