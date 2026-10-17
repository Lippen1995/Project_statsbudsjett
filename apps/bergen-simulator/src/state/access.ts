import { create } from "zustand";
import type { Point } from "../geo/types";
import {
  accessPlacement,
  attachmentPoints,
  nearestPortal,
  type AccessConnection,
} from "../access/model";
import { useScenario } from "./scenario";
interface AccessTool {
  buildingId: string;
  selectedId: string | null;
  draft: AccessConnection | null;
  past: AccessConnection[];
  future: AccessConnection[];
  undo: () => void;
  redo: () => void;
  vertex: number;
  drawing: boolean;
  hint: string;
  selectBuilding: (id: string) => void;
  start: () => void;
  chooseNode: (id: string) => void;
  edit: (id: string) => void;
  patch: (patch: Partial<AccessConnection>) => void;
  move: (index: number, point: Point) => void;
  addBend: (p?: Point) => void;
  removeBend: () => void;
  setVertex: (i: number) => void;
  setDrawing: (b: boolean) => void;
  confirm: () => void;
  cancel: () => void;
  clear: () => void;
}
const blank = {
  past: [] as AccessConnection[],
  future: [] as AccessConnection[],
  buildingId: "",
  selectedId: null,
  draft: null,
  vertex: 0,
  drawing: false,
  hint: "",
};
export const useAccess = create<AccessTool>((set, get) => ({
  ...blank,
  selectBuilding: (buildingId) => set({ ...blank, buildingId }),
  start: () => {
    const s = useScenario.getState(),
      b = s.development?.proposals.find((b) => b.id === get().buildingId);
    if (!b || !s.network) return;
    const node = attachmentPoints(s.network).sort(
      (a, c) =>
        Math.hypot(a.point[0] - b.center[0], a.point[1] - b.center[1]) -
        Math.hypot(c.point[0] - b.center[0], c.point[1] - b.center[1]),
    )[0];
    set({
      past: [],
      future: [],
      draft: {
        id: crypto.randomUUID(),
        buildingId: b.id,
        mode: "vehicle",
        nodeId: node.id,
        points: [nearestPortal(b, node.point), node.point],
      },
      vertex: 0,
      selectedId: null,
      hint: "Choose a source node on the map or by ID. Adjust the proposed portal and bends; nothing is applied yet.",
    });
  },
  chooseNode: (nodeId) => {
    const s = useScenario.getState(),
      d = get().draft,
      target =
        s.network && attachmentPoints(s.network).find((n) => n.id === nodeId);
    if (!target || !d) return;
    get().patch({ nodeId, points: [...d.points.slice(0, -1), target.point] });
  },
  edit: (selectedId) => {
    const d = useScenario
      .getState()
      .access?.connections.find((a) => a.id === selectedId);
    if (d)
      set({
        past: [],
        future: [],
        draft: structuredClone(d),
        buildingId: d.buildingId,
        selectedId,
        vertex: 0,
        drawing: false,
        hint: "",
      });
  },
  patch: (patch) => {
    const d = get().draft;
    if (!d) return;
    const next = { ...d, ...patch };
    if (JSON.stringify(next) === JSON.stringify(d)) return;
    set({
      draft: next,
      past: [...get().past, d].slice(-51),
      future: [],
      hint: "",
    });
  },
  undo: () => {
    const { draft, past, future } = get();
    if (!draft || !past.length) return;
    set({
      draft: past.at(-1)!,
      past: past.slice(0, -1),
      future: [draft, ...future].slice(0, 51),
      vertex: 0,
    });
  },
  redo: () => {
    const { draft, past, future } = get();
    if (!draft || !future.length) return;
    set({
      draft: future[0],
      past: [...past, draft].slice(-51),
      future: future.slice(1),
      vertex: 0,
    });
  },
  move: (index, point) => {
    const d = get().draft;
    if (!d || index < 0 || index >= d.points.length - 1) return;
    get().patch({ points: d.points.map((p, i) => (i === index ? point : p)) });
    set({ vertex: index });
  },
  addBend: (point) => {
    const d = get().draft;
    if (!d || d.points.length >= 5) return;
    const a = d.points.at(-2)!,
      b = d.points.at(-1)!;
    get().patch({
      points: [
        ...d.points.slice(0, -1),
        point ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        b,
      ],
    });
    set({ vertex: d.points.length - 1 });
  },
  removeBend: () => {
    const d = get().draft,
      i = get().vertex;
    if (d && i > 0 && i < d.points.length - 1) {
      get().patch({ points: d.points.filter((_, j) => i !== j) });
      set({ vertex: 0 });
    }
  },
  setVertex: (vertex) => set({ vertex }),
  setDrawing: (drawing) => set({ drawing }),
  confirm: () => {
    const s = useScenario.getState(),
      d = get().draft;
    if (!d || !s.context || !s.development) return;
    const check = accessPlacement(
      d,
      s.context,
      s.development,
      s.physical,
      s.access?.connections,
    );
    if (!check.valid) {
      set({ hint: check.errors.join(" ") });
      return;
    }
    if (
      s.editAccess({
        ...s.access,
        connections: [...s.access!.connections.filter((a) => a.id !== d.id), d],
      })
    )
      set({
        past: [],
        future: [],
        draft: null,
        selectedId: d.id,
        drawing: false,
        hint: "Hypothetical access applied. This grants no real-world access right.",
      });
  },
  cancel: () =>
    set({ draft: null, drawing: false, past: [], future: [], hint: "" }),
  clear: () => set(blank),
}));
