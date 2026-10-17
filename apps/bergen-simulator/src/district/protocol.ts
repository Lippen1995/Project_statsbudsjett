import { exactKeys, object } from "../simulation/interventions";
import { DistrictSimulation } from "./engine";
import { HORIZON, type DistrictInput, type DistrictMonth } from "./model";
export type DistrictCommand =
  | {
      type: "configure";
      generation: number;
      input: DistrictInput;
      reference: DistrictInput | null;
    }
  | { type: "advance"; generation: number; month: number };
export type DistrictReply =
  | {
      type: "history";
      generation: number;
      current: DistrictMonth[];
      reference: DistrictMonth[] | null;
      computeMs: number;
    }
  | { type: "error"; generation: number; message: string };
/** Stateful worker protocol is testable without a browser or real clock. */
export class DistrictRunner {
  private generation = 0;
  private current: DistrictSimulation | null = null;
  private reference: DistrictSimulation | null = null;
  handle(value: unknown) {
    const c = object(value);
    if (!Number.isSafeInteger(c.generation) || (c.generation as number) < 1)
      throw new Error("Invalid district generation.");
    if (c.type === "configure") {
      exactKeys(c, ["type", "generation", "input", "reference"]);
      if ((c.generation as number) < this.generation) return null;
      const current = new DistrictSimulation(c.input),
        reference =
          c.reference === null ? null : new DistrictSimulation(c.reference);
      this.current = current;
      this.reference = reference;
      this.generation = c.generation as number;
    } else if (c.type === "advance") {
      exactKeys(c, ["type", "generation", "month"]);
      if (c.generation !== this.generation) return null;
      if (
        typeof c.month !== "number" ||
        !Number.isInteger(c.month) ||
        c.month < 0 ||
        c.month > HORIZON ||
        !this.current
      )
        throw new Error("Invalid district target month.");
      this.current.advanceTo(c.month);
      this.reference?.advanceTo(c.month);
    } else throw new Error("Unknown district command.");
    if (!this.current) throw new Error("District not configured.");
    return {
      type: "history" as const,
      generation: this.generation,
      current: this.current.history(),
      reference: this.reference?.history() ?? null,
    };
  }
}
