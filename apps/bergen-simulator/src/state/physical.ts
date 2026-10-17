import { create } from "zustand";
import type { Point } from "../geo/types";
import type { PublicSpace } from "../physical/model";
import { useScenario } from "./scenario";
interface PhysicalTool {
  mode: "streets" | "spaces" | "buildings" | "living";
  action: "navigate" | "draw" | "reshape";
  draft: PublicSpace | null;
  past: Point[][];
  future: Point[][];
  undoDraft: () => void;
  redoDraft: () => void;
  selectedId: string | null;
  vertex: number;
  hint: string;
  challenge: boolean;
  setMode: (mode: "streets" | "spaces" | "buildings" | "living") => void;
  start: () => void;
  select: (id: string) => void;
  reshape: () => void;
  setAction: (action: "navigate" | "draw" | "reshape") => void;
  add: (point: Point) => void;
  move: (index: number, point: Point) => void;
  removeVertex: () => void;
  setVertex: (index: number) => void;
  patch: (patch: Partial<Pick<PublicSpace, "name" | "kind">>) => void;
  confirm: () => void;
  cancel: () => void;
  clear: () => void;
  feedback: (hint: string) => void;
  setChallenge: (challenge: boolean) => void;
}
const blank = {
  mode: "streets" as const,
  action: "navigate" as const,
  draft: null,
  past: [] as Point[][],
  future: [] as Point[][],
  selectedId: null,
  vertex: 0,
  hint: "",
  challenge: false,
};
export const usePhysical = create<PhysicalTool>((set, get) => ({
  ...blank,
  setMode: (mode) =>
    set({
      mode,
      action: "navigate",
      draft: null,
      past: [],
      future: [],
      hint: "",
    }),
  start: () =>
    set({
      mode: "spaces",
      action: "draw",
      past: [],
      future: [],
      selectedId: null,
      vertex: 0,
      hint: "Tap the land to place 3–8 corners. Camera navigation is paused while drawing.",
      draft: {
        id: crypto.randomUUID(),
        name: "Waterfront proposal",
        kind: "pedestrian",
        vertices: [],
      },
    }),
  select: (selectedId) =>
    set({
      mode: "spaces",
      selectedId,
      draft: null,
      past: [],
      future: [],
      action: "navigate",
      hint: "",
    }),
  reshape: () => {
    const space = useScenario
      .getState()
      .physical?.proposals.find((p) => p.id === get().selectedId);
    if (space)
      set({
        past: [],
        future: [],
        draft: structuredClone(space),
        vertex: 0,
        action: "reshape",
        hint: "Drag a corner, or use the coordinate controls. Apply to keep the new shape.",
      });
  },
  setAction: (action) => set({ action }),
  add: (point) => {
    const d = get().draft;
    if (!d) return;
    if (d.vertices.length >= 8) {
      set({ hint: "Eight-corner limit. Move or remove a corner instead." });
      return;
    }
    set({
      past: [...get().past, d.vertices].slice(-51),
      future: [],
      draft: { ...d, vertices: [...d.vertices, [...point]] },
      vertex: d.vertices.length,
      hint: "",
    });
  },
  move: (index, point) => {
    const d = get().draft;
    if (
      !d ||
      !d.vertices[index] ||
      (d.vertices[index][0] === point[0] && d.vertices[index][1] === point[1])
    )
      return;
    set({
      past: [...get().past, d.vertices].slice(-51),
      future: [],
      draft: {
        ...d,
        vertices: d.vertices.map((p, i) => (i === index ? [...point] : p)),
      },
      vertex: index,
      hint: "",
    });
  },
  removeVertex: () => {
    const d = get().draft;
    if (d)
      set({
        past: [...get().past, d.vertices].slice(-51),
        future: [],
        draft: {
          ...d,
          vertices: d.vertices.filter((_, i) => i !== get().vertex),
        },
        vertex: 0,
      });
  },
  undoDraft: () => {
    const { draft, past, future } = get();
    if (!draft || !past.length) return;
    const vertices = past[past.length - 1];
    set({
      draft: { ...draft, vertices },
      past: past.slice(0, -1),
      future: [draft.vertices, ...future].slice(0, 51),
      vertex: Math.max(0, Math.min(get().vertex, vertices.length - 1)),
    });
  },
  redoDraft: () => {
    const { draft, past, future } = get();
    if (!draft || !future.length) return;
    set({
      draft: { ...draft, vertices: future[0] },
      past: [...past, draft.vertices].slice(-51),
      future: future.slice(1),
      vertex: 0,
    });
  },
  setVertex: (vertex) => set({ vertex }),
  patch: (patch) => {
    const d = get().draft;
    if (d) set({ draft: { ...d, ...patch } });
  },
  confirm: () => {
    const d = get().draft;
    if (d && useScenario.getState().putSpace(d))
      set({
        selectedId: d.id,
        draft: null,
        past: [],
        future: [],
        action: "navigate",
        hint: "Surface applied. This is a hypothetical design, not construction permission.",
      });
  },
  cancel: () => {
    if (!get().draft) return;
    set({
      draft: null,
      past: [],
      future: [],
      action: "navigate",
      hint: "Unapplied shape discarded.",
    });
  },
  clear: () => set(blank),
  feedback: (hint) => set({ hint }),
  setChallenge: (challenge) => set({ challenge }),
}));
