import { useMemo, useState } from "react";
import { useScenario } from "../state/scenario";
import { useDistrict } from "../state/district";
import { useConstruction } from "../state/construction";
import { useCity } from "../state/store";
import {
  BUDGET_RULES,
  MONEY,
  defaultManagement,
  civicCost,
  type BudgetInputs,
  type BudgetKey,
  type ProjectSchedule,
  type ProjectPhase,
} from "../management/model";
import { sustainableQuarter } from "../management/challenge";
import type { BuildingProposal } from "../physical/buildings";
import { number } from "./PlanningResults";
export const phaseName: Record<ProjectPhase, string> = {
  planned: "Planned",
  "under-construction": "Under construction",
  operational: "Operational",
  cancelled: "Cancelled",
};
const pmu = (cents: number) => number(cents / MONEY, 2) + " PMU";
export default function ManagementPanel() {
  const s = useScenario(),
    d = useDistrict(),
    c = useConstruction(),
    [challenge, setChallenge] = useState(false),
    r = d.current[d.month],
    m = r?.management;
  const buildings = s.development?.proposals ?? [],
    selected = buildings.find((b) => b.id === c.selectedId) ?? buildings[0];
  return (
    <details
      className="city-management"
      open={s.management.mode === "scheduled"}
    >
      <summary>City Management · construction & services</summary>
      <p className="synthetic-label">
        FICTIONAL PLANNING MONETARY UNITS / PMU · NOT BERGEN FINANCES
      </p>
      {s.management.mode === "legacy-immediate" ? (
        <>
          <p
            className="data-note"
            aria-label="Legacy commissioning compatibility"
          >
            Legacy immediate commissioning: all proposed buildings are
            operational from month zero with the original 5A service capacity.
            Public finance is unmodelled in this compatibility mode. Your design
            and historical outcomes are preserved.
          </p>
          <button
            className="compare-button"
            onClick={() => s.editManagement(defaultManagement(buildings))}
          >
            Schedule this development
          </button>
          <p className="data-note">
            This explicit conversion adds construction and budget constraints
            and restarts time. Undo restores immediate commissioning.
          </p>
        </>
      ) : (
        <>
          <p className="data-note">
            Fund civic investments, sequence construction, then advance time.
            Capacity starts at commissioning. PMU is a fictional game resource;
            private development is not charged to this public budget.
          </p>
          {m && (
            <div
              className="management-accounts"
              aria-label="City Management accounts"
              data-month={r.month}
              data-capital={m.capitalBalanceCents}
              data-capital-spent={m.totalCapitalSpentCents}
              data-operating={m.operatingBalanceCents}
              data-shortfall={m.operatingShortfallCents}
              data-potential={m.potentialServiceCapacity}
              data-funded={m.fundedServiceCapacity}
              data-projects={JSON.stringify(
                m.projects.map((p) => ({
                  id: p.id,
                  phase: p.phase,
                  deferred: p.deferred,
                  actualStart: p.actualStart,
                  commissionMonth: p.commissionMonth,
                })),
              )}
            >
              <dl>
                <div>
                  <dt>Capital · free / reserved</dt>
                  <dd>
                    {pmu(m.capitalFreeCents)}{" "}
                    <small>/ {pmu(m.capitalReservedCents)}</small>
                  </dd>
                  <span>
                    Cash {pmu(m.capitalBalanceCents)} · spent to date{" "}
                    {pmu(m.totalCapitalSpentCents)}
                  </span>
                </div>
                <div>
                  <dt>Operating · required / available this month</dt>
                  <dd>
                    {pmu(m.operatingRequiredCents)}{" "}
                    <small>/ {pmu(m.operatingAvailableCents)}</small>
                  </dd>
                  <span>
                    Spent {pmu(m.operatingSpentCents)} · balance{" "}
                    {pmu(m.operatingBalanceCents)}
                  </span>
                </div>
                <div>
                  <dt>Civic services · physical / funded capacity</dt>
                  <dd>
                    {number(m.potentialServiceCapacity, 1)}{" "}
                    <small>
                      / {number(m.fundedServiceCapacity, 1)} units/month
                    </small>
                  </dd>
                  <span>
                    Used {number(r.usedService, 1)} · demand{" "}
                    {number(r.serviceDemand, 1)} · unmet{" "}
                    {number(r.unmetService, 1)}
                  </span>
                </div>
              </dl>
              {m.capitalFundingGapCents > 0 && (
                <p
                  className="management-shortfall"
                  aria-label="Capital deferral"
                >
                  Civic work deferred: {pmu(m.capitalFundingGapCents)}{" "}
                  additional free capital is needed to reserve all eligible
                  waiting projects. No debt or automatic completion.
                </p>
              )}
              {m.operatingShortfallCents > 0 && (
                <p
                  className="management-shortfall"
                  aria-label="Operating shortfall"
                >
                  Service operation underfunded by{" "}
                  {pmu(m.operatingShortfallCents)} this month. Commissioned
                  buildings remain present; effective service capacity is
                  reduced.
                </p>
              )}
              <details className="scenario-assumptions">
                <summary>Account for this month</summary>
                <p>
                  Capital funding {pmu(m.capitalIncomeCents)} · new commitments{" "}
                  {pmu(m.capitalCommittedCents)} · construction spending{" "}
                  {pmu(m.capitalSpentCents)} · released unspent commitments{" "}
                  {pmu(m.capitalReleasedCents)}. Unfunded eligible requests:{" "}
                  {pmu(m.unfundedRequestsCents)}.
                </p>
                <p>
                  Operating funding {pmu(m.operatingIncomeCents)} · cumulative
                  expenditure {pmu(m.totalOperatingSpentCents)}. These accounts
                  are separate: capital cannot pay for service operation.
                </p>
              </details>
            </div>
          )}
          <div className="project-roster" aria-label="Construction projects">
            {buildings.map((b) => {
              const p = m?.projects.find((p) => p.id === b.id),
                schedule = s.management.projects.find((p) => p.id === b.id)!;
              return (
                <button
                  key={b.id}
                  aria-pressed={selected?.id === b.id}
                  data-phase={p?.phase ?? "planned"}
                  onClick={() => {
                    c.select(b.id);
                    useCity.getState().focus(b.center, true);
                  }}
                >
                  <span>{b.name}</span>
                  <small>
                    {p ? phaseName[p.phase] : "Planned"}
                    {p?.deferred ? " · funding deferred" : ""} ·{" "}
                    {p?.phase === "cancelled"
                      ? "cancelled in month " + schedule.cancelMonth
                      : "commission M" +
                        (p?.commissionMonth ??
                          schedule.startMonth + schedule.durationMonths)}
                  </small>
                </button>
              );
            })}
          </div>
          {!buildings.length && (
            <p className="data-note">
              Place a residential, commercial or civic concept with Buildings.
              New projects receive bounded schedules.
            </p>
          )}
          {selected && <ProjectControls key={selected.id} id={selected.id} />}
          <BudgetControls key={JSON.stringify(s.management.budget)} />
          <button
            className="compare-button"
            onClick={() => setChallenge((v) => !v)}
          >
            {challenge
              ? "Leave management challenge"
              : "Challenge · Building a Sustainable Quarter"}
          </button>
          {challenge && <ManagementChallenge />}
        </>
      )}
      <details className="scenario-assumptions">
        <summary>What the management model knows</summary>
        <p>
          Observed geography is unchanged. Schedules, cost coefficients, funding
          and monthly service requirements are game assumptions. Ownership,
          approvals, procurement, inflation, taxes, grants, borrowing and actual
          municipal finances are unmodelled. Changing inputs replays from month
          zero; it is not a refund or an in-place amendment of past spending.
        </p>
      </details>
    </details>
  );
}
export function ProjectControls({ id }: { id: string }) {
  const s = useScenario(),
    b = s.development?.proposals.find((b) => b.id === id),
    p = s.management.projects.find((p) => p.id === id);
  if (!b || !p) return null;
  if (s.management.mode === "legacy-immediate")
    return (
      <p className="data-note">
        Legacy immediate project · operational M0. Open Living City → City
        Management to explicitly schedule this development.
      </p>
    );
  return <ProjectForm key={JSON.stringify(p)} building={b} schedule={p} />;
}
function ProjectForm({
  building: b,
  schedule,
}: {
  building: BuildingProposal;
  schedule: ProjectSchedule;
}) {
  const s = useScenario(),
    d = useDistrict(),
    [draft, setDraft] = useState({ ...schedule }),
    r = d.current[d.month]?.management?.projects.find((p) => p.id === b.id);
  return (
    <section
      className="project-context"
      aria-label="Selected construction project"
    >
      <strong>
        {b.name} / {r ? phaseName[r.phase] : "Planned"}
      </strong>
      <span>
        Planned commissioning M{draft.startMonth + draft.durationMonths}
        {draft.startMonth + draft.durationMonths > 24
          ? " · outside this run"
          : ""}
        .{" "}
        {r?.actualStart !== null && r?.actualStart !== undefined
          ? `Actual start M${r.actualStart}; ${r.phase === "cancelled" ? "cancelled" : `commissioning M${r.commissionMonth}`}.`
          : ""}
      </span>
      <div className="building-dimensions">
        <label>
          Start month
          <input
            aria-label="Construction start month"
            type="number"
            min="1"
            max="24"
            step="1"
            value={Number.isFinite(draft.startMonth) ? draft.startMonth : ""}
            onChange={(e) =>
              setDraft((v) => ({ ...v, startMonth: e.target.valueAsNumber }))
            }
          />
        </label>
        <label>
          Duration · months
          <input
            aria-label="Construction duration"
            type="number"
            min="1"
            max="12"
            step="1"
            value={
              Number.isFinite(draft.durationMonths) ? draft.durationMonths : ""
            }
            onChange={(e) =>
              setDraft((v) => ({
                ...v,
                durationMonths: e.target.valueAsNumber,
              }))
            }
          />
        </label>
        {b.purpose === "civic" && (
          <label>
            Civic priority · 1 first
            <input
              aria-label="Civic investment priority"
              type="number"
              min="1"
              max="8"
              step="1"
              value={Number.isFinite(draft.priority) ? draft.priority : ""}
              onChange={(e) =>
                setDraft((v) => ({ ...v, priority: e.target.valueAsNumber }))
              }
            />
          </label>
        )}
        <label>
          Cancel in month · blank to retain
          <input
            aria-label="Cancel project month"
            type="number"
            min="1"
            max="24"
            step="1"
            value={
              draft.cancelMonth === null
                ? ""
                : Number.isFinite(draft.cancelMonth)
                  ? draft.cancelMonth
                  : ""
            }
            onChange={(e) =>
              setDraft((v) => ({
                ...v,
                cancelMonth:
                  e.target.value === "" ? null : e.target.valueAsNumber,
              }))
            }
          />
        </label>
      </div>
      <button
        className="compare-button"
        onClick={() =>
          s.editManagement({
            ...s.management,
            projects: s.management.projects.map((p) =>
              p.id === b.id ? draft : p,
            ),
          })
        }
      >
        Apply construction schedule
      </button>
      <span>
        {b.purpose === "civic"
          ? `Civic capital commitment: ${pmu(civicCost(b, s.management.budget))}. Full cost must be reserved before work begins.`
          : "Private financing is unmodelled. No public construction charge."}
      </span>
      <p className="data-note">
        Start and duration determine commissioning; funding deferral shifts the
        actual date. Cancellation must precede earliest commissioning. Spent
        civic capital is retained as expenditure, with only unspent reservations
        released. Applying edits restarts district time.
      </p>
    </section>
  );
}
function BudgetControls() {
  const s = useScenario(),
    [draft, setDraft] = useState<BudgetInputs>({ ...s.management.budget });
  return (
    <details className="scenario-assumptions public-funding">
      <summary>Public funding & cost assumptions</summary>
      <p>
        Whole fictional PMU. Separate allocations carry forward; there are no
        taxes, transfers, borrowing or negative cash balances. Civic operating
        costs fund commissioned capacity, including unused capacity.
      </p>
      <div className="building-dimensions">
        {(
          Object.entries(BUDGET_RULES) as [
            BudgetKey,
            (typeof BUDGET_RULES)[BudgetKey],
          ][]
        ).map(([k, r]) => (
          <label key={k}>
            {r.label}
            <small>{r.unit}</small>
            <input
              aria-label={r.label}
              type="number"
              min={r.min}
              max={r.max}
              step="1"
              value={Number.isFinite(draft[k]) ? draft[k] : ""}
              onChange={(e) =>
                setDraft((v) => ({ ...v, [k]: e.target.valueAsNumber }))
              }
            />
          </label>
        ))}
      </div>
      <button
        className="compare-button"
        onClick={() => s.editManagement({ ...s.management, budget: draft })}
      >
        Apply public funding
      </button>
    </details>
  );
}
function ManagementChallenge() {
  const s = useScenario(),
    d = useDistrict(),
    history = d.current,
    month = d.month;
  const verdict = useMemo(
    () =>
      s.context && s.development && s.physical
        ? sustainableQuarter(
            s.development,
            s.physical,
            s.context,
            s.living,
            s.management,
            history.slice(0, month + 1),
          )
        : null,
    [
      s.context,
      s.development,
      s.physical,
      s.living,
      s.management,
      history,
      month,
    ],
  );
  if (!verdict) return null;
  return (
    <section
      className="planning-challenge"
      aria-label="Building a Sustainable Quarter challenge"
    >
      <h3>Building a Sustainable Quarter</h3>
      <p>
        24 months · transparent game objectives, not municipal policy. Standard
        5A demand/conversion and default cost coefficients; funding and
        schedules are your decisions.
      </p>
      <ul>
        {[
          "Valid geometry, all three uses, every project operational by M24; standard model coefficients",
          "5–8 occupied households, ≥60% housing use, ≥90 household-equivalent months delivered",
          "7–14 filled jobs, ≥35% job capacity use",
          "≥95% service coverage in M8–24, ≥25% civic use at M24, no operating funding gaps",
          "Capital allocation ≤1,200 PMU; operating allocation ≤1,000 PMU over 24 months; funded expenditure",
          "120–350 m² retained valid public space, near a modelled road",
        ].map((text, i) => (
          <li key={text} className={verdict.checks[i] ? "objective-met" : ""}>
            {verdict.checks[i] ? "✓" : "·"} {text}
          </li>
        ))}
      </ul>
      <span>
        {number(verdict.householdMonths, 1)} household-equivalent months
        delivered.
      </span>
      <p className="challenge-verdict">
        {verdict.passed
          ? "Sustainable Quarter achieved"
          : verdict.complete
            ? "Revise sequencing, funding or balance and replay"
            : "Advance to month 24 to evaluate"}
      </p>
    </section>
  );
}
