import { defaultManagement } from "../management/model";
import { create } from "zustand";
import { useScenario } from "./scenario";
import { usePhysical } from "./physical";
import {
  defaultLiving,
  districtInput,
  HORIZON,
  validateHistory,
  type DistrictInput,
  type DistrictMonth,
} from "../district/model";
import type { DistrictCommand, DistrictReply } from "../district/protocol";
interface DistrictState {
  active: boolean;
  playing: boolean;
  busy: boolean;
  month: number;
  current: DistrictMonth[];
  reference: DistrictMonth[] | null;
  computeMs: number;
  error: string;
  notice: string;
  tint: boolean;
  challenge: boolean;
  open: () => void;
  close: () => void;
  reset: () => void;
  advance: (months: number) => void;
  inspect: (month: number) => void;
  playPause: () => void;
  pause: () => void;
  toggleTint: () => void;
  setChallenge: (enabled: boolean) => void;
}
let worker: Worker | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0,
  key = "",
  requestedMonth = 0;
const blank = {
  active: false,
  playing: false,
  busy: false,
  month: 0,
  current: [] as DistrictMonth[],
  reference: null as DistrictMonth[] | null,
  computeMs: 0,
  error: "",
  notice: "",
  tint: true,
  challenge: false,
};
function stop() {
  clearTimeout(timer);
  timer = undefined;
  worker?.terminate();
  worker = undefined;
  generation++;
}
function schedule() {
  clearTimeout(timer);
  const d = useDistrict.getState();
  if (d.playing && !d.busy && d.month < HORIZON)
    timer = setTimeout(() => useDistrict.getState().advance(1), 1000);
}
function currentKey() {
  const s = useScenario.getState(),
    r = s.library.find((r) => r.id === s.referenceId)?.scenario;
  return JSON.stringify([
    s.phase === "closed",
    s.districtEpoch,
    s.development,
    s.living,
    s.management,
    s.referenceId,
    r?.development,
    r?.living,
    r?.management,
  ]);
}
function configure(notice: string) {
  stop();
  const s = useScenario.getState();
  key = currentKey();
  if (s.phase === "closed" || !s.development) {
    useDistrict.setState({
      ...blank,
      error: "A validated proposal layer is required for Living City.",
    });
    return;
  }
  let input: DistrictInput,
    referenceInput: DistrictInput | null = null;
  try {
    input = districtInput(s.living, s.development.proposals, s.management);
    if (s.referenceId) {
      const r = s.library.find((r) => r.id === s.referenceId);
      if (!r) throw new Error("Saved comparison is unavailable.");
      referenceInput = districtInput(
        r.scenario.living ?? defaultLiving(),
        r.scenario.development?.proposals ?? [],
        r.scenario.management ??
          defaultManagement(r.scenario.development?.proposals ?? [], true),
      );
    }
    const current = new Worker(
      new URL("../district/worker.ts", import.meta.url),
      { type: "module" },
    );
    worker = current;
    const expectedGeneration = generation;
    requestedMonth = 0;
    useDistrict.setState({
      active: true,
      playing: false,
      busy: true,
      month: 0,
      current: [],
      reference: null,
      computeMs: 0,
      error: "",
      notice,
    });
    current.onmessage = ({ data }: MessageEvent<DistrictReply>) => {
      if (
        current !== worker ||
        !data ||
        data.generation !== generation ||
        data.generation !== expectedGeneration
      )
        return;
      try {
        if (data.type === "error") throw new Error(data.message.slice(0, 300));
        if (
          data.type !== "history" ||
          !Number.isFinite(data.computeMs) ||
          data.computeMs < 0
        )
          throw new Error("Invalid district worker response.");
        const history = validateHistory(data.current, input),
          reference = referenceInput
            ? validateHistory(data.reference, referenceInput)
            : null;
        if (
          history.length - 1 !== requestedMonth ||
          (reference && reference.length !== history.length) ||
          (!referenceInput && data.reference !== null)
        )
          throw new Error(
            "District worker returned a mismatched month or comparison.",
          );
        useDistrict.setState({
          current: history,
          reference,
          month: requestedMonth,
          busy: false,
          computeMs: data.computeMs,
          ...(requestedMonth === HORIZON ? { playing: false } : {}),
        });
        schedule();
      } catch (e) {
        stop();
        useDistrict.setState({
          busy: false,
          playing: false,
          current: [],
          reference: null,
          error: e instanceof Error ? e.message : "District worker failed.",
        });
      }
    };
    current.onerror = () => {
      if (current !== worker) return;
      stop();
      useDistrict.setState({
        busy: false,
        playing: false,
        current: [],
        reference: null,
        error:
          "The district worker could not run. Your plan is preserved; reopen Living City to retry.",
      });
    };
    current.postMessage({
      type: "configure",
      generation: expectedGeneration,
      input,
      reference: referenceInput,
    } satisfies DistrictCommand);
  } catch (e) {
    stop();
    useDistrict.setState({
      active: true,
      busy: false,
      playing: false,
      current: [],
      reference: null,
      error:
        e instanceof Error ? e.message : "Could not initialize Living City.",
    });
  }
}
export const useDistrict = create<DistrictState>((set, get) => ({
  ...blank,
  open: () => {
    if (get().active && get().current.length) return;
    configure(
      "Month zero: no occupants or jobs. Scheduled projects provide capacity only after commissioning; legacy plans retain immediate capacity.",
    );
  },
  close: () => {
    stop();
    set(blank);
  },
  reset: () =>
    configure(
      "District reset to the same empty month-zero initial conditions. The design is retained.",
    ),
  advance: (months) => {
    const d = get();
    if (
      !d.active ||
      d.busy ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > HORIZON
    )
      return;
    const target = Math.min(HORIZON, d.month + months);
    if (target === d.month) {
      get().pause();
      return;
    }
    if (d.current[target]) {
      set({ month: target, ...(target === HORIZON ? { playing: false } : {}) });
      schedule();
      return;
    }
    if (!worker) return;
    requestedMonth = target;
    set({ busy: true, error: "" });
    worker.postMessage({
      type: "advance",
      generation,
      month: target,
    } satisfies DistrictCommand);
  },
  inspect: (month) => {
    if (!Number.isInteger(month) || month < 0 || !get().current[month]) return;
    clearTimeout(timer);
    set({ month, playing: false });
  },
  playPause: () => {
    if (get().playing) {
      get().pause();
      return;
    }
    if (get().busy || get().month >= HORIZON || !get().current.length) return;
    set({ playing: true });
    schedule();
  },
  pause: () => {
    clearTimeout(timer);
    timer = undefined;
    set({ playing: false });
  },
  toggleTint: () => set((s) => ({ tint: !s.tint })),
  setChallenge: (challenge) => set({ challenge }),
}));
// A new plan/input generation invalidates all derived district history. Traffic is independent.
useScenario.subscribe(() => {
  const next = currentKey();
  if (next === key) return;
  key = next;
  if (useScenario.getState().phase === "closed") {
    useDistrict.getState().close();
    return;
  }
  if (useDistrict.getState().active)
    configure(
      "Plan or comparison changed. District time restarted at month zero; advance again from identical initial stocks.",
    );
});
usePhysical.subscribe((s, p) => {
  if (s.mode !== p.mode && s.mode !== "living") useDistrict.getState().pause();
});
