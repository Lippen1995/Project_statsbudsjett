import { create } from "zustand";
// Ephemeral renderer status only; never serialized into player scenarios.
export const useArchitecture = create<{
  status: "schematic" | "loading" | "ready" | "unavailable";
}>(() => ({ status: "schematic" }));
