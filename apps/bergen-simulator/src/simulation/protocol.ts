import type { Policy, Result } from "./engine";
import type { TransportSource } from "./network";
export type Command =
  | { type: "start"; source: TransportSource; policy: Policy }
  | { type: "pause" | "resume" };
export type Reply =
  | {
      type: "progress";
      baseline: Result;
      intervention: Result;
      computeMs: number;
      paused: boolean;
    }
  | { type: "error"; message: string };
