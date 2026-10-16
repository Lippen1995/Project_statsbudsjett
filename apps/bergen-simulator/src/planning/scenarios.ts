import {
  exactKeys,
  object,
  validatePlan,
  type Plan,
} from "../simulation/interventions";
import type { Network } from "../simulation/network";
export const STORAGE_KEY = "bergen.reimagined.plans.v1";
export interface ScenarioFile {
  kind: "bergen-reimagined-plan";
  version: 1;
  name: string;
  plan: Plan;
}
export interface SavedPlan {
  id: string;
  savedAt: string;
  scenario: ScenarioFile;
}
export interface Library {
  version: 1;
  plans: SavedPlan[];
}
export type PlanStorage = Pick<Storage, "getItem" | "setItem">;
export function planName(input: unknown): string {
  if (
    typeof input !== "string" ||
    !input.trim() ||
    input.trim().length > 60 ||
    [...input].some((c) => c.charCodeAt(0) < 32)
  )
    throw new Error(
      "Use a plan name of 1–60 characters, without control characters.",
    );
  return input.trim();
}
export function validateScenario(
  value: unknown,
  network: Network,
): ScenarioFile {
  const s = object(value);
  exactKeys(s, ["kind", "version", "name", "plan"]);
  if (s.kind !== "bergen-reimagined-plan" || s.version !== 1)
    throw new Error(
      "Unsupported scenario version. No automatic migration is available for this format.",
    );
  return {
    kind: "bergen-reimagined-plan",
    version: 1,
    name: planName(s.name),
    plan: validatePlan(s.plan, network),
  };
}
export function parseScenario(text: string, network: Network): ScenarioFile {
  if (text.length > 32768)
    throw new Error("Scenario exceeds the 32,768-character limit.");
  return validateScenario(JSON.parse(text), network);
}
export function scenarioFile(
  name: string,
  plan: Plan,
  network: Network,
): ScenarioFile {
  return validateScenario(
    { kind: "bergen-reimagined-plan", version: 1, name, plan },
    network,
  );
}
export function validateLibrary(input: unknown, network: Network): Library {
  const l = object(input);
  exactKeys(l, ["version", "plans"]);
  if (l.version !== 1 || !Array.isArray(l.plans) || l.plans.length > 20)
    throw new Error("Incompatible or oversized local plan library.");
  const ids = new Set<string>();
  const plans = l.plans.map((value) => {
    const p = object(value);
    exactKeys(p, ["id", "savedAt", "scenario"]);
    if (
      typeof p.id !== "string" ||
      !/^[\w-]{1,64}$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.savedAt !== "string" ||
      !Number.isFinite(Date.parse(p.savedAt))
    )
      throw new Error("Invalid or duplicate local plan record.");
    ids.add(p.id);
    return {
      id: p.id,
      savedAt: p.savedAt,
      scenario: validateScenario(p.scenario, network),
    };
  });
  return { version: 1, plans };
}
export function readLibrary(storage: PlanStorage, network: Network): Library {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return { version: 1, plans: [] };
  if (raw.length > 200000)
    throw new Error(
      "Local plan library is too large. Existing storage was preserved.",
    );
  return validateLibrary(JSON.parse(raw), network);
}
export function writeLibrary(
  storage: PlanStorage,
  input: Library,
  network: Network,
): Library {
  const library = validateLibrary(input, network),
    raw = JSON.stringify(library);
  if (raw.length > 200000)
    throw new Error("Local plan library exceeds its size limit.");
  // One atomic key replacement, only after complete validation. Never clear storage.
  storage.setItem(STORAGE_KEY, raw);
  return library;
}
