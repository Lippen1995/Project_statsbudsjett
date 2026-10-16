import { create } from "zustand";
import type { Feature } from "../geo/types";

export type Layer = "buildings" | "roads" | "water";
interface CityState {
  layers: Record<Layer, boolean>;
  selected: Feature | null;
  quality: "balanced" | "low";
  camera: { revision: number; point: [number, number] | null };
  select: (feature: Feature | null) => void;
  toggleLayer: (layer: Layer) => void;
  setQuality: (quality: "balanced" | "low") => void;
  focus: (point: [number, number] | null) => void;
}

export const useCity = create<CityState>((set) => ({
  layers: { buildings: true, roads: true, water: true },
  selected: null,
  quality: "balanced",
  camera: { revision: 0, point: null },
  select: (selected) => set({ selected }),
  toggleLayer: (layer) =>
    set((s) => ({
      layers: { ...s.layers, [layer]: !s.layers[layer] },
      selected: s.selected?.kind === layer.slice(0, -1) ? null : s.selected,
    })),
  setQuality: (quality) => set({ quality }),
  focus: (point) =>
    set((s) => ({ camera: { revision: s.camera.revision + 1, point } })),
}));
