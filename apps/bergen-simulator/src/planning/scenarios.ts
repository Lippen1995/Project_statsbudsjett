import { validateManagement, type ManagementInputs } from "../management/model";
import { validateLiving, type LivingInputs } from "../district/model";
import {
  validateDevelopment,
  emptyDevelopment,
  type DevelopmentPlan,
} from "../physical/buildings";
import {
  validatePhysical,
  emptyPhysical,
  type PhysicalPlan,
  type PlacementContext,
} from "../physical/model";
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
  version: 1 | 2 | 3 | 4 | 5;
  management?: ManagementInputs;
  living?: LivingInputs;
  physical?: PhysicalPlan;
  development?: DevelopmentPlan;
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
  context?: PlacementContext | null,
): ScenarioFile {
  const s = object(value);
  const fields = [
    "kind",
    "version",
    "name",
    "plan",
    ...(s.version === 2 || s.version === 3 || s.version === 4 || s.version === 5
      ? ["physical"]
      : []),
    ...(s.version === 3 || s.version === 4 || s.version === 5
      ? ["development"]
      : []),
    ...(s.version === 4 || s.version === 5 ? ["living"] : []),
    ...(s.version === 5 ? ["management"] : []),
  ];
  exactKeys(s, fields);
  if (
    s.kind !== "bergen-reimagined-plan" ||
    ![1, 2, 3, 4, 5].includes(s.version as number)
  )
    throw new Error(
      "Unsupported scenario version. No automatic migration is available for this format.",
    );
  if (s.version !== 1 && !context)
    throw new Error(
      "Physical plans require the matching geographic snapshot before import.",
    );
  const physical =
    s.version !== 1 ? validatePhysical(s.physical, context!) : null;
  const development =
    s.version === 3 || s.version === 4 || s.version === 5
      ? validateDevelopment(s.development, context!, physical)
      : undefined;
  return {
    kind: "bergen-reimagined-plan",
    version: s.version as 1 | 2 | 3 | 4 | 5,
    name: planName(s.name),
    plan: validatePlan(s.plan, network),
    ...(physical ? { physical } : {}),
    ...(development ? { development } : {}),
    ...(s.version === 4 || s.version === 5
      ? { living: validateLiving(s.living) }
      : {}),
    ...(s.version === 5
      ? { management: validateManagement(s.management, development!.proposals) }
      : {}),
  };
}
export function parseScenario(
  text: string,
  network: Network,
  context?: PlacementContext | null,
): ScenarioFile {
  if (text.length > 32768)
    throw new Error("Scenario exceeds the 32,768-character limit.");
  return validateScenario(JSON.parse(text), network, context);
}
export function scenarioFile(
  name: string,
  plan: Plan,
  network: Network,
  context?: PlacementContext | null,
  physical?: PhysicalPlan | null,
  development?: DevelopmentPlan | null,
  living?: LivingInputs | null,
  management?: ManagementInputs | null,
): ScenarioFile {
  return validateScenario(
    {
      kind: "bergen-reimagined-plan",
      version: context
        ? development
          ? living
            ? management
              ? 5
              : 4
            : 3
          : 2
        : 1,
      name,
      plan,
      ...(context && development && living ? { living } : {}),
      ...(context && development && living && management ? { management } : {}),
      ...(context ? { physical: physical ?? emptyPhysical(context) } : {}),
      ...(context && development
        ? { development: development ?? emptyDevelopment(context) }
        : {}),
    },
    network,
    context,
  );
}
export function validateLibrary(
  input: unknown,
  network: Network,
  context?: PlacementContext | null,
): Library {
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
      scenario: validateScenario(p.scenario, network, context),
    };
  });
  return { version: 1, plans };
}
export function readLibrary(
  storage: PlanStorage,
  network: Network,
  context?: PlacementContext | null,
): Library {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return { version: 1, plans: [] };
  if (raw.length > 200000)
    throw new Error(
      "Local plan library is too large. Existing storage was preserved.",
    );
  return validateLibrary(JSON.parse(raw), network, context);
}
export function writeLibrary(
  storage: PlanStorage,
  input: Library,
  network: Network,
  context?: PlacementContext | null,
): Library {
  const library = validateLibrary(input, network, context),
    raw = JSON.stringify(library);
  if (raw.length > 200000)
    throw new Error("Local plan library exceeds its size limit.");
  // One atomic key replacement, only after complete validation. Never clear storage.
  storage.setItem(STORAGE_KEY, raw);
  return library;
}
