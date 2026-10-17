import { useDistrict } from "./district";
import { create } from "zustand";
import { useScenario } from "./scenario";
import { emptyAccess } from "../access/model";
import { defaultLiving } from "../district/model";
import { defaultManagement } from "../management/model";
import { startConnected } from "../access/client";
import type { ConnectedInput, ConnectedResult } from "../access/run";
interface ConnectedState {
  busy: boolean;
  result: ConnectedResult | null;
  reference: ConnectedResult | null;
  computeMs: number;
  error: string;
  challenge: boolean;
  run: () => void;
  cancel: () => void;
  setChallenge: (b: boolean) => void;
}
let cancel: (() => void) | undefined,
  generation = 0;
let unsubscribeDistrict: (() => void) | undefined,
  preparationDeadline: ReturnType<typeof setTimeout> | undefined;
const stop = () => {
  unsubscribeDistrict?.();
  unsubscribeDistrict = undefined;
  clearTimeout(preparationDeadline);
  cancel?.();
  cancel = undefined;
  generation++;
};
const blank = {
  busy: false,
  result: null,
  reference: null,
  computeMs: 0,
  error: "",
};
export const useConnected = create<ConnectedState>((set) => ({
  ...blank,
  challenge: false,
  run: () => {
    stop();
    const s = useScenario.getState();
    if (!s.context || !s.development || !s.physical || !s.access || !s.plan)
      return;
    const input: ConnectedInput = {
      version: 1,
      context: s.context,
      development: s.development,
      physical: s.physical,
      living: s.living,
      management: s.management,
      access: s.access,
      mobility: s.mobility,
      plan: s.plan,
    };
    const r = s.library.find((r) => r.id === s.referenceId)?.scenario;
    const reference = r
      ? {
          ...input,
          development: r.development ?? { ...s.development, proposals: [] },
          physical: r.physical ?? { ...s.physical, proposals: [] },
          living: r.living ?? defaultLiving(),
          management:
            r.management ??
            defaultManagement(r.development?.proposals ?? [], true),
          access: r.access ?? emptyAccess(s.context),
          plan: r.plan,
        }
      : null;
    const current = generation;
    set({ ...blank, busy: true });
    // Keep the visible construction/activity month coherent with the source month.
    // The connected worker still recomputes its own validated stocks independently.
    const fail = (error: string) => {
      if (current !== generation) return;
      stop();
      set({ busy: false, error });
    };
    const ready = () => {
      if (current !== generation) return;
      const d = useDistrict.getState();
      if (d.error) return fail(d.error);
      if (d.busy || !d.current.length) return;
      if (!d.current[input.mobility.month]) {
        d.advance(input.mobility.month - d.month);
        return;
      }
      unsubscribeDistrict?.();
      unsubscribeDistrict = undefined;
      clearTimeout(preparationDeadline);
      d.inspect(input.mobility.month);
      cancel = startConnected(
        { version: 1, generation: current, input, reference },
        (r) => {
          if (generation === current)
            set({
              busy: false,
              result: r.result,
              reference: r.reference,
              computeMs: r.computeMs,
            });
        },
        (error) => {
          if (generation === current) set({ busy: false, error });
        },
      );
    };
    if (!useDistrict.getState().active) useDistrict.getState().open();
    useDistrict.getState().pause();
    unsubscribeDistrict = useDistrict.subscribe(ready);
    preparationDeadline = setTimeout(
      () =>
        fail(
          "District preparation exceeded 15 seconds; your plan is preserved.",
        ),
      15000,
    );
    ready();
  },
  cancel: () => {
    stop();
    set(blank);
  },
  setChallenge: (challenge) => set({ challenge }),
}));
const key = () => {
  const s = useScenario.getState();
  return JSON.stringify([
    s.context?.id,
    s.access,
    s.mobility,
    s.development,
    s.physical,
    s.living,
    s.management,
    s.plan,
    s.referenceId,
    s.library.find((r) => r.id === s.referenceId)?.scenario,
  ]);
};
let last = key();
let lastPhase = useScenario.getState().phase;
useScenario.subscribe(() => {
  const next = key(),
    phase = useScenario.getState().phase,
    legacyRunStarted = phase === "running" && lastPhase !== "running";
  lastPhase = phase;
  if (next !== last || legacyRunStarted) {
    last = next;
    useConnected.getState().cancel();
  }
});
