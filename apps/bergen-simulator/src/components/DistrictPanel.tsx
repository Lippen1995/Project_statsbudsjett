import { useConnected } from "../state/connected";
import { usePhysical } from "../state/physical";
import { districtTransportBoundary } from "../transport/boundary";
import ManagementPanel from "./ManagementPanel";
import { useState } from "react";
import { useDistrict } from "../state/district";
import { useScenario } from "../state/scenario";
import {
  ASSUMPTIONS,
  defaultLiving,
  HORIZON,
  type AssumptionKey,
  type Constraint,
  type DistrictMonth,
  type LivingInputs,
} from "../district/model";
import { balancedQuarter } from "../district/challenge";
import { number } from "./PlanningResults";
const labels: Record<Constraint, string> = {
  "housing-capacity": "Housing capacity",
  "household-demand": "Weak household demand",
  services: "Civic service shortfall",
  workforce: "Recruitment workforce",
  "employment-capacity": "Employment capacity",
  "employment-support": "Employment support",
  uptake: "Gradual uptake",
};
export function constraintExplanation(r: DistrictMonth, a: LivingInputs) {
  if (r.month === 0)
    return "Proposals start unoccupied; scheduled capacity waits for commissioning. External demand enters at month one; observed Bergen is outside this model.";
  switch (r.constraint) {
    case "housing-capacity":
      return `Accommodation capacity limits further uptake. ${number(r.waitingHouseholds, 1)} household equivalents remain in the synthetic demand queue.`;
    case "household-demand":
      return `Configured household demand is ${number(a.householdArrivals, 1)} per month. More floor area cannot create additional demand or automatic occupancy.`;
    case "services":
      return `${number(r.unmetService, 1)} resident-equivalent service units/month are unmet. Civic capacity also moderates household admissions; it is not a forecast of real service provision.`;
    case "workforce":
      return `Jobs recruit from surviving households × ${number(a.workersPerHousehold, 1)} worker equivalents, plus ${number(a.externalWorkforce, 1)} from outside. More commercial floor area alone cannot fill these vacancies. Housing can expand next month's recruitment pool.`;
    case "employment-capacity":
      return `${number(r.waitingJobs, 1)} fictional business position requests remain unfilled. Commercial capacity and monthly uptake both limit filled jobs.`;
    case "employment-support":
      return `Household uptake is moderated by filled local jobs + ${number(a.externalJobOpportunities, 1)} assumed outside opportunities, relative to the prospective resident workforce. Individual workers or commutes are not assigned.`;
    default:
      return "Monthly vacancy uptake and turnover are bounded. Capacity fills gradually, only when demand and support are present.";
  }
}
export function DistrictTimeline({ compact = false }: { compact?: boolean }) {
  const d = useDistrict(),
    ready = d.current.length > 0;
  return (
    <div
      className={compact ? "district-time compact-time" : "district-time"}
      aria-label={compact ? "Map district timeline" : "District timeline"}
    >
      <div className="district-date">
        <strong>MONTH {d.month.toString().padStart(2, "0")}</strong>
        <span>/ 24 · proposed district</span>
      </div>
      <div className="planning-actions">
        <button
          onClick={d.playPause}
          disabled={!ready || (!d.playing && d.busy) || d.month >= 24}
          aria-label={
            compact
              ? "Map " + (d.playing ? "pause district" : "play district")
              : d.playing
                ? "Pause district"
                : "Play district"
          }
        >
          {d.playing ? "Ⅱ Pause" : "▶ Play"}
        </button>
        <button
          onClick={() => d.advance(1)}
          disabled={!ready || d.busy || d.month >= 24}
          aria-label={compact ? "Map advance one month" : "Advance one month"}
        >
          +1 month
        </button>
        <button
          onClick={() => d.advance(6)}
          disabled={!ready || d.busy || d.month >= 24}
          aria-label={compact ? "Map advance six months" : "Advance six months"}
        >
          +6 months
        </button>
        {!compact && (
          <button
            onClick={() => d.advance(24)}
            disabled={!ready || d.busy || d.month >= 24}
          >
            Advance to month 24
          </button>
        )}
      </div>
      {!compact && (
        <>
          <label className="planning-field">
            Inspect a computed month
            <input
              aria-label="Inspect simulated month"
              type="range"
              min="0"
              max={Math.max(0, d.current.length - 1)}
              step="1"
              value={d.month}
              disabled={d.busy || d.current.length < 2}
              onChange={(e) => d.inspect(Number(e.target.value))}
            />
          </label>
          <button
            className="compare-button"
            onClick={d.reset}
            disabled={d.busy}
          >
            Reset district time
          </button>
        </>
      )}
      <span
        className="district-state"
        role="status"
        aria-label={compact ? "Map district status" : "District status"}
      >
        {d.busy
          ? "Computing district month…"
          : d.error
            ? "District calculation unavailable"
            : `District month ${d.month} ready`}
        {d.playing ? " · automatic monthly steps" : ""}
      </span>
    </div>
  );
}
export function DistrictMapTools() {
  const d = useDistrict(),
    s = useScenario(),
    r = (s.mapView === "reference" ? d.reference : d.current)?.[d.month];
  return (
    <div
      className="physical-map-tools district-map-tools"
      aria-label="Living City map tools"
    >
      <strong>
        {s.mapView === "baseline"
          ? "OBSERVED BERGEN / NO PROPOSED ACTIVITY"
          : s.mapView === "reference"
            ? "SAVED DISTRICT / SYNTHETIC ACTIVITY"
            : "LIVING CITY / SYNTHETIC DISTRICT"}
      </strong>
      <DistrictTimeline compact />
      {r && (
        <span>
          {number(r.occupiedHouseholds, 1)} households ·{" "}
          {number(r.filledJobs, 1)} filled jobs ·{" "}
          {number(r.serviceCoverage * 100)}% service cover
        </span>
      )}
      {r?.management && (
        <span aria-label="Map construction phases">
          {r.management.projects.filter((p) => p.phase === "planned").length}{" "}
          planned ·{" "}
          {
            r.management.projects.filter(
              (p) => p.phase === "under-construction",
            ).length
          }{" "}
          building ·{" "}
          {
            r.management.projects.filter((p) => p.phase === "operational")
              .length
          }{" "}
          operational. Outline → sand → activity tint.
        </span>
      )}
      <span>
        Dim → warm: assumed use of proposed capacity. No real occupancy is
        observed.
      </span>
      <button
        onClick={() =>
          s.setMapView(s.mapView === "baseline" ? "plan" : "baseline")
        }
      >
        {s.mapView === "baseline"
          ? "Show proposed district"
          : "Show observed Bergen"}
      </button>
    </div>
  );
}
export default function DistrictPanel() {
  const connected = useConnected((v) => v.result);
  const d = useDistrict(),
    s = useScenario(),
    r = d.current[d.month],
    previous = d.current[d.month - 1],
    ref = s.library.find((p) => p.id === s.referenceId),
    reference = d.reference?.[d.month];
  return (
    <section className="district-panel" aria-label="Living City simulation">
      <span className="eyebrow">A SMALL DISTRICT / A MONTH AT A TIME</span>
      <h3>The quarter comes to life.</h3>
      <p className="synthetic-label">
        SYNTHETIC HOUSEHOLDS, JOBS & SERVICES · NOT REAL BERGEN
      </p>
      <p className="data-note">
        Only your proposed buildings provide capacity. All start unoccupied at
        month zero; scheduled projects must commission first. Build, advance
        time, inspect the constraint, then revise the plan. Confirmed
        construction or assumption changes restart this model; traffic remains
        separate.
      </p>
      <DistrictTimeline />
      <ManagementPanel />
      {d.error && (
        <p className="planning-error" role="alert">
          {d.error}
        </p>
      )}
      {d.notice && <p className="planning-notice">{d.notice}</p>}
      {r && (
        <>
          <div
            className="district-readout"
            aria-label="District outcomes"
            data-worker-ms={d.computeMs}
            data-month={r.month}
            data-households={r.occupiedHouseholds}
            data-jobs={r.filledJobs}
            data-service-demand={r.serviceDemand}
            data-service-unmet={r.unmetService}
            data-balance={r.balance}
          >
            <dl>
              <div>
                <dt>Households · occupied / capacity</dt>
                <dd>
                  {number(r.occupiedHouseholds, 1)}{" "}
                  <small>
                    / {number(r.householdCapacity)} household equivalents
                  </small>
                </dd>
                {previous && (
                  <span>
                    Δ{" "}
                    {signed(r.occupiedHouseholds - previous.occupiedHouseholds)}{" "}
                    this month
                  </span>
                )}
              </div>
              <div>
                <dt>Employment · filled / capacity</dt>
                <dd>
                  {number(r.filledJobs, 1)}{" "}
                  <small>
                    / {number(r.employmentCapacity)} job equivalents
                  </small>
                </dd>
                {previous && (
                  <span>
                    Δ {signed(r.filledJobs - previous.filledJobs)} this month
                  </span>
                )}
              </div>
              <div>
                <dt>
                  Aggregate civic service · used /{" "}
                  {r.management ? "funded capacity" : "capacity"}
                </dt>
                <dd>
                  {number(r.usedService, 1)}{" "}
                  <small>/ {number(r.serviceCapacity)} units / month</small>
                </dd>
                <span>
                  Demand {number(r.serviceDemand, 1)} · unmet{" "}
                  {number(r.unmetService, 1)}
                </span>
              </div>
            </dl>
            <p>
              {number(r.residents, 1)} hypothetical resident equivalents ·
              household size {number(s.living.householdSize, 1)}
            </p>
            <div className="district-balance">
              <strong>Development balance · {number(r.balance * 100)}%</strong>
              <span>
                Weakest share: housing {number(r.householdUtilization * 100)}% ·
                jobs {number(r.jobUtilization * 100)}% · service cover{" "}
                {number(r.serviceCoverage * 100)}%. This is a minimum of these
                three shares, not an economic score.
              </span>
            </div>
            <Trend months={d.current} selected={d.month} />
            <div
              className="district-constraint"
              aria-label="District constraint"
            >
              <strong>
                {r.month === 0 ? "Initial conditions" : labels[r.constraint]}
              </strong>
              <p>{constraintExplanation(r, s.living)}</p>
            </div>
            <details className="scenario-assumptions">
              <summary>Explain this month</summary>
              <p>
                Households admitted: {number(r.admittedHouseholds, 2)}; exits:{" "}
                {number(r.exitedHouseholds, 2)}. Waiting demand:{" "}
                {number(r.waitingHouseholds, 2)}; cumulative exits:{" "}
                {number(r.departedHouseholds, 2)}.
              </p>
              <p>
                Jobs filled this month: {number(r.hiredJobs, 2)}; positions
                vacated: {number(r.vacatedJobs, 2)}. Unfilled business requests:{" "}
                {number(r.waitingJobs, 2)}. Recruitment allowance this tick:{" "}
                {number(r.recruitmentLabour, 2)} worker equivalents.
              </p>
              <p>
                First-pass household uptake is multiplied by{" "}
                {number(r.employmentSupport, 3)} employment support and{" "}
                {number(
                  s.living.minimumServiceAttraction +
                    (1 - s.living.minimumServiceAttraction) *
                      r.serviceAdmissionCover,
                  3,
                )}{" "}
                service attraction. Service admission cover is{" "}
                {number(r.serviceAdmissionCover * 100, 1)}%. These factors use
                this month's prospective household target, before moderated
                admissions.
              </p>
              <p>
                Household demand is conserved as occupied + waiting + cumulative
                exits = months × {s.living.householdArrivals}. Job requests are
                conserved as filled + waiting = months ×{" "}
                {s.living.jobDemandArrivals}; vacated positions return to the
                queue.
              </p>
            </details>
          </div>
          <label className="traffic-toggle">
            <input type="checkbox" checked={d.tint} onChange={d.toggleTint} />
            Building activity tint
          </label>
        </>
      )}
      <label className="planning-field">
        Compare a saved development
        <select
          aria-label="District comparison plan"
          value={s.referenceId ?? ""}
          onChange={(e) => s.setReference(e.target.value || null)}
        >
          <option value="">No saved comparison</option>
          {s.library.map((p) => (
            <option key={p.id} value={p.id}>
              {p.scenario.name}
            </option>
          ))}
        </select>
      </label>
      {ref && reference && r && (
        <div
          className="physical-readout"
          aria-label="District strategy comparison"
          data-reference-households={reference.occupiedHouseholds}
          data-reference-jobs={reference.filledJobs}
        >
          <strong>
            {ref.scenario.name} / SAME MONTH {d.month}
          </strong>
          <span>
            Saved: {number(reference.occupiedHouseholds, 1)} households ·{" "}
            {number(reference.filledJobs, 1)} jobs ·{" "}
            {number(reference.unmetService, 1)} unmet service units/month
          </span>
          <span>
            Current − saved:{" "}
            {signed(r.occupiedHouseholds - reference.occupiedHouseholds)}{" "}
            households · {signed(r.filledJobs - reference.filledJobs)} jobs
          </span>
          {r.management && reference.management ? (
            <span>
              Public spending · current − saved: capital{" "}
              {signed(
                (r.management.totalCapitalSpentCents -
                  reference.management.totalCapitalSpentCents) /
                  100,
              )}{" "}
              PMU; operating{" "}
              {signed(
                (r.management.totalOperatingSpentCents -
                  reference.management.totalOperatingSpentCents) /
                  100,
              )}{" "}
              PMU. Funded services{" "}
              {number(r.management.fundedServiceCapacity, 1)} /{" "}
              {number(reference.management.fundedServiceCapacity, 1)}{" "}
              units/month.
            </span>
          ) : r.management || reference.management ? (
            <span>
              One strategy uses legacy immediate commissioning, with public
              finance unmodelled. Its costs cannot be treated as zero-price
              managed delivery.
            </span>
          ) : null}
          {r.management && reference.management && (
            <span>
              Delivered through M{d.month}:{" "}
              {number(
                d.current
                  .slice(0, d.month + 1)
                  .reduce((n, r) => n + r.occupiedHouseholds, 0),
                1,
              )}{" "}
              /{" "}
              {number(
                d
                  .reference!.slice(0, d.month + 1)
                  .reduce((n, r) => n + r.occupiedHouseholds, 0),
                1,
              )}{" "}
              household-equivalent months (current / saved).
            </span>
          )}
          <span>
            {JSON.stringify(ref.scenario.living ?? defaultLiving()) ===
            JSON.stringify(s.living)
              ? "Identical living assumptions and empty initial stocks. Designs, construction schedules and public funding may differ; inspect both inputs."
              : "These plans use different declared assumptions. Both start empty; inspect inputs before attributing a difference to design alone."}
          </span>
          <button
            onClick={() =>
              s.setMapView(s.mapView === "reference" ? "plan" : "reference")
            }
          >
            {s.mapView === "reference"
              ? "Show current district"
              : "Show saved district"}
          </button>
        </div>
      )}
      <LivingAssumptions key={JSON.stringify(s.living)} />
      <p
        className="planning-note"
        aria-label="District transport connection"
        data-added-trips={connected?.ledger.assigned ?? 0}
      >
        {connected ? (
          <>
            <strong>
              {connected.ledger.routed} additional routed trips /{" "}
              {connected.ledger.unrouted} unrouted.
            </strong>{" "}
            Explicit hypothetical vehicle access and calculated month{" "}
            {connected.ledger.month}; one synthetic 30-minute period. No
            observed entrances are asserted.
          </>
        ) : (
          <>
            <strong>
              0 / {s.development?.proposals.length ?? 0} sites with verified
              transport access.
            </strong>{" "}
            The original traffic run adds no district traffic. Monthly activity
            is not a 30-minute trip table. Use Access Planning to design
            hypothetical access and opt in.
          </>
        )}
      </p>
      <button
        className="compare-button"
        onClick={() => usePhysical.getState().setMode("access")}
      >
        Plan hypothetical access & transport
      </button>
      <details className="scenario-assumptions">
        <summary>Why observed access remains unverified</summary>
        <p>
          The 27-way source graph has no verified entrance/connector from the
          conceptual sites to its routing nodes. A nearby centreline is not a
          mapped access connection. District activity adds no trips to that
          model. Outside labour and jobs are assumptions, with no implied
          journey route or congestion forecast. Use Access Planning to design a
          separate hypothetical connector and explicitly enable synthetic
          demand. It never certifies observed access. The complete pinned OSM
          cache was reviewed again for 5C; pedestrian paths and entrances to
          observed buildings do not establish vehicle access to a proposed site.
        </p>
        <ul>
          {districtTransportBoundary(
            s.development?.proposals ?? [],
            s.network,
          ).sites.map((site) => (
            <li key={site.proposalId}>
              {site.name}: {site.reason}
            </li>
          ))}
        </ul>
      </details>
      {s.management.mode === "legacy-immediate" && (
        <button
          className="compare-button"
          onClick={() => d.setChallenge(!d.challenge)}
        >
          {d.challenge
            ? "Leave living-city challenge"
            : "Challenge · A Balanced New Quarter"}
        </button>
      )}
      {d.challenge && s.management.mode === "legacy-immediate" && (
        <BalancedChallenge />
      )}
    </section>
  );
}
const signed = (v: number) => (v > 0 ? "+" : "") + number(v, 1);
function LivingAssumptions() {
  const s = useScenario(),
    [draft, setDraft] = useState<LivingInputs>(() => ({ ...s.living }));
  return (
    <details className="scenario-assumptions living-assumptions">
      <summary>Configure synthetic district assumptions</summary>
      <p>
        All coefficients are game assumptions, not observed Bergen statistics.
        Applying changes restarts district time from the same empty month-zero
        stocks. Legacy plans retain immediate capacity. Scheduled plans apply
        the separate construction and public funding inputs.
      </p>
      <div className="building-dimensions">
        {(
          Object.entries(ASSUMPTIONS) as [
            AssumptionKey,
            (typeof ASSUMPTIONS)[AssumptionKey],
          ][]
        ).map(([key, r]) => (
          <label key={key}>
            {r.label}
            <small>{r.unit}</small>
            <input
              aria-label={r.label}
              type="number"
              min={r.min}
              max={r.max}
              step={r.step}
              value={Number.isFinite(draft[key]) ? draft[key] : ""}
              onChange={(e) =>
                setDraft((v) => ({ ...v, [key]: e.target.valueAsNumber }))
              }
            />
          </label>
        ))}
      </div>
      <button className="compare-button" onClick={() => s.editLiving(draft)}>
        Apply district assumptions
      </button>
      <p>
        Update order: exits / job turnover → external demand → recruitment from
        surviving workforce → moderated household admissions → service use and
        balances. Households admitted now affect next month's recruitment.
      </p>
    </details>
  );
}
function Trend({
  months,
  selected,
}: {
  months: DistrictMonth[];
  selected: number;
}) {
  const points = (key: "householdUtilization" | "jobUtilization") =>
    months
      .map((r) => `${6 + (r.month / HORIZON) * 268},${38 - r[key] * 30}`)
      .join(" ");
  return (
    <svg
      className="district-trend"
      viewBox="0 0 280 48"
      role="img"
      aria-label="Computed household and job capacity utilization over 24 months"
    >
      <path d="M6 38H274" stroke="#a9bcab" />
      <polyline
        points={points("householdUtilization")}
        fill="none"
        stroke="#a36848"
        strokeWidth="2"
      />
      <polyline
        points={points("jobUtilization")}
        fill="none"
        stroke="#427f8b"
        strokeWidth="2"
      />
      <path
        d={`M${6 + (selected / HORIZON) * 268} 5V42`}
        stroke="#3f5e53"
        strokeDasharray="2 3"
      />
      <title>
        Terracotta: household use. Blue: job use. Vertical marker: inspected
        month.
      </title>
    </svg>
  );
}
function BalancedChallenge() {
  const s = useScenario(),
    d = useDistrict();
  if (!s.context || !s.physical || !s.development) return null;
  const r = balancedQuarter(
    s.development,
    s.physical,
    s.context,
    s.living,
    d.current[d.month],
  );
  return (
    <section
      className="planning-challenge"
      aria-label="A Balanced New Quarter challenge"
    >
      <h3>A Balanced New Quarter</h3>
      <p>
        Evaluate at month 24. Transparent prototype objectives, not Bergen
        development-policy standards.
      </p>
      <ul>
        {[
          "Valid geometry, at most eight buildings, all three intended uses",
          "At least 5 occupied households; housing use ≥60%",
          "At least 7 filled jobs; job use ≥35%",
          "Service cover ≥95%; civic capacity use ≥20%",
          "120–350 m² valid proposed public space, near a modelled road",
        ].map((label, i) => (
          <li key={label} className={r.checks[i] ? "objective-met" : ""}>
            {r.checks[i] ? "✓" : "·"} {label}
          </li>
        ))}
      </ul>
      <p className="challenge-verdict">
        {r.passed
          ? "Balanced New Quarter achieved"
          : r.complete
            ? "Revise the balance and run again"
            : "Advance to month 24 to evaluate"}
      </p>
    </section>
  );
}
export function DistrictBuildingInfo({ id }: { id: string }) {
  const active = useDistrict((d) => d.active),
    month = useDistrict((d) => d.month),
    r = useDistrict((d) => d.current[d.month]),
    b = r?.buildings.find((b) => b.id === id);
  if (!active || !b) return null;
  const unit =
    b.purpose === "residential"
      ? "household equivalents"
      : b.purpose === "commercial"
        ? "job equivalents"
        : "service units/month";
  return (
    <p
      className="district-building-info"
      aria-label="Selected building simulated activity"
    >
      MODEL MONTH {month} · {number(b.used, 1)} / {number(b.capacity)} {unit}{" "}
      used ({number(b.utilization * 100)}%). Synthetic proposed activity only.
    </p>
  );
}
