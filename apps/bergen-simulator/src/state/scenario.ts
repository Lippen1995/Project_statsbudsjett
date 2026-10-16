import { create } from "zustand";
import {
  buildNetwork,
  type Network,
  type TransportSource,
} from "../simulation/network";
import {
  TOTAL_TICKS,
  initialResult,
  type Policy,
  type Result,
} from "../simulation/engine";
import type { Reply } from "../simulation/protocol";
export type Phase =
  | "closed"
  | "ready"
  | "running"
  | "paused"
  | "complete"
  | "error";
interface ScenarioState {
  source: TransportSource | null;
  network: Network | null;
  phase: Phase;
  policy: Policy;
  baseline: Result | null;
  intervention: Result | null;
  compare: boolean;
  heatmap: boolean;
  error: string;
  computeMs: number;
  open: (source: TransportSource) => void;
  choose: (policy: Policy) => void;
  run: () => void;
  pauseResume: () => void;
  reset: () => void;
  close: () => void;
  toggleCompare: () => void;
  toggleHeatmap: () => void;
}
let worker: Worker | undefined;
function stop() {
  worker?.terminate();
  worker = undefined;
}
const clean = {
  policy: "baseline" as Policy,
  baseline: null,
  intervention: null,
  compare: false,
  heatmap: true,
  error: "",
  computeMs: 0,
};
export const useScenario = create<ScenarioState>((set, get) => ({
  ...clean,
  source: null,
  network: null,
  phase: "closed",
  open: (source) => {
    stop();
    const owned = structuredClone(source);
    set({
      ...clean,
      source: owned,
      network: buildNetwork(owned),
      phase: "ready",
    });
  },
  choose: (policy) => {
    stop();
    set({ ...clean, policy, phase: "ready" });
  },
  run: () => {
    const { source, network, policy } = get();
    if (!source || !network) return;
    stop();
    try {
      const current = new Worker(
        new URL("../simulation/worker.ts", import.meta.url),
        { type: "module" },
      );
      worker = current;
      set({
        baseline: initialResult(network),
        intervention: initialResult(network),
        compare: false,
        phase: "running",
        error: "",
        computeMs: 0,
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
            error: "The simulation worker could not run. Reset and try again.",
          });
        }
      };
      current.postMessage({ type: "start", source, policy });
    } catch {
      stop();
      set({
        phase: "error",
        error: "Web Workers are unavailable in this browser.",
      });
    }
  },
  pauseResume: () => {
    const { phase } = get();
    if (phase === "running" || phase === "paused")
      worker?.postMessage({ type: phase === "running" ? "pause" : "resume" });
  },
  reset: () => {
    stop();
    set({ ...clean, phase: get().source ? "ready" : "closed" });
  },
  close: () => {
    stop();
    set({ ...clean, source: null, network: null, phase: "closed" });
  },
  toggleCompare: () => set((s) => ({ compare: !s.compare })),
  toggleHeatmap: () => set((s) => ({ heatmap: !s.heatmap })),
}));
