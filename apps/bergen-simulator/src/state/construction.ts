import { create } from "zustand";
import type { BuildingProposal, Purpose } from "../physical/buildings";
import { useScenario } from "./scenario";
type Action = "navigate" | "place" | "move" | "rotate" | "resize";
interface ConstructionTool {
  draft: BuildingProposal | null;
  selectedId: string | null;
  located: boolean;
  action: Action;
  hint: string;
  challenge: boolean;
  past: BuildingProposal[];
  future: BuildingProposal[];
  start: (purpose: Purpose) => void;
  select: (id: string) => void;
  edit: () => void;
  patch: (patch: Partial<BuildingProposal>) => void;
  locate: (center: BuildingProposal["center"]) => void;
  setAction: (action: Action) => void;
  confirm: () => void;
  cancel: () => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  feedback: (hint: string) => void;
  setChallenge: (value: boolean) => void;
}
const blank = {
  draft: null,
  selectedId: null,
  located: false,
  action: "navigate" as Action,
  hint: "",
  challenge: false,
  past: [] as BuildingProposal[],
  future: [] as BuildingProposal[],
};
export const useConstruction = create<ConstructionTool>((set, get) => ({
  ...blank,
  start: (purpose) =>
    set({
      ...blank,
      challenge: get().challenge,
      action: "place",
      hint: "Tap mapped land to locate the preview. No construction has been applied.",
      draft: {
        id: crypto.randomUUID(),
        name: `${purpose[0].toUpperCase() + purpose.slice(1)} proposal`,
        purpose,
        center: [0, 0],
        width: 12,
        depth: 16,
        rotation: 0,
        storeys: 2,
        storeyHeight: 3.2,
        roof: "flat",
      },
    }),
  select: (selectedId) =>
    set({
      selectedId,
      draft: null,
      located: false,
      action: "navigate",
      past: [],
      future: [],
      hint: "",
    }),
  edit: () => {
    const b = useScenario
      .getState()
      .development?.proposals.find((b) => b.id === get().selectedId);
    if (b)
      set({
        draft: structuredClone(b),
        located: true,
        action: "move",
        past: [],
        future: [],
        hint: "Drag the preview to move, or choose rotate / resize. Apply to keep changes.",
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
  locate: (center) => {
    get().patch({ center });
    set({ located: true });
  },
  setAction: (action) => set({ action }),
  confirm: () => {
    const d = get().draft;
    if (d && get().located && useScenario.getState().putBuilding(d))
      set({
        selectedId: d.id,
        draft: null,
        located: false,
        action: "navigate",
        past: [],
        future: [],
        hint: "Concept applied to the hypothetical layer. No real-world permission is implied.",
      });
  },
  cancel: () =>
    set({
      draft: null,
      located: false,
      action: "navigate",
      past: [],
      future: [],
      hint: "",
    }),
  clear: () => set(blank),
  undo: () => {
    const { draft, past, future } = get();
    if (!draft || !past.length) return;
    set({
      draft: past[past.length - 1],
      past: past.slice(0, -1),
      future: [draft, ...future].slice(0, 51),
    });
  },
  redo: () => {
    const { draft, past, future } = get();
    if (!draft || !future.length) return;
    set({
      draft: future[0],
      past: [...past, draft].slice(-51),
      future: future.slice(1),
    });
  },
  feedback: (hint) => set({ hint }),
  setChallenge: (challenge) => set({ challenge }),
}));
