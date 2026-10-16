import type { Result } from "./engine";
import type { TransportSource } from "./network";
import type { Plan } from "./interventions";
export type Command =
  | {
      type: "start";
      source: TransportSource;
      plan: Plan;
      reference: Plan | null;
    }
  | { type: "pause" | "resume" };
export type Reply =
  | {
      type: "progress";
      baseline: Result;
      intervention: Result;
      reference: Result | null;
      computeMs: number;
      paused: boolean;
    }
  | { type: "error"; message: string };
