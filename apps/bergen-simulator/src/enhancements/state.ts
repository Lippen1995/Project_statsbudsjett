import { create } from "zustand";

// Display comparison only. Never serialized into a plan, simulation or geography.
export const useEnhancements = create<{
  enabled: boolean;
  status: "off" | "loading" | "ready" | "unavailable" | "paused";
  setEnabled: (enabled: boolean) => void;
}>((set) => ({
  enabled: false,
  status: "off",
  setEnabled: (enabled) => set({ enabled }),
}));
