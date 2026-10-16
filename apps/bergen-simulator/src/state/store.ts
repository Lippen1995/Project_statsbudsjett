import { create } from "zustand";
import type { Feature } from "../geo/types";

export type Layer = "buildings" | "roads" | "water";
interface CityState {
  layers: Record<Layer, boolean>;
  selected: Feature | null;
  selectedSegmentId: string | null;
  quality: "balanced" | "low";
  camera: { revision: number; point: [number, number] | null; close?: boolean };
  select: (feature: Feature | null, segmentId?: string | null) => void;
  toggleLayer: (layer: Layer) => void;
  setQuality: (quality: "balanced" | "low") => void;
  focus: (point: [number, number] | null, close?: boolean) => void;
}

export const useCity = create<CityState>((set) => ({
  layers: { buildings: true, roads: true, water: true },
  selected: null,
  selectedSegmentId: null,
  quality: "balanced",
  camera: { revision: 0, point: null },
  select: (selected, selectedSegmentId = null) =>
    set({ selected, selectedSegmentId }),
  toggleLayer: (layer) =>
    set((s) => ({
      layers: { ...s.layers, [layer]: !s.layers[layer] },
      selected: s.selected?.kind === layer.slice(0, -1) ? null : s.selected,
      selectedSegmentId:
        s.selected?.kind === layer.slice(0, -1) ? null : s.selectedSegmentId,
    })),
  setQuality: (quality) => set({ quality }),
  focus: (point, close = false) =>
    set((s) => ({
      camera: {
        revision: s.camera.revision + 1,
        point,
        ...(close ? { close: true } : {}),
      },
    })),
}));
