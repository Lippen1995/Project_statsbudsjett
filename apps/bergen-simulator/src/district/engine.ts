import {
  capacities,
  HORIZON,
  share,
  validateDistrictInput,
  validateMonth,
  type Constraint,
  type DistrictInput,
  type DistrictMonth,
} from "./model";
const EPS = 1e-8;
function frozen(r: DistrictMonth): DistrictMonth {
  r.buildings.forEach(Object.freeze);
  Object.freeze(r.buildings);
  return Object.freeze(r);
}
/** Proposed district only. Monthly stock-flow recurrence; no observed population. */
export class DistrictSimulation {
  readonly input: DistrictInput;
  private months: DistrictMonth[] = [];
  constructor(value: unknown) {
    this.input = validateDistrictInput(value);
    for (const b of this.input.buildings) {
      Object.freeze(b.center);
      Object.freeze(b);
    }
    Object.freeze(this.input.buildings);
    Object.freeze(this.input.living);
    Object.freeze(this.input);
    this.reset();
  }
  reset() {
    this.months = [this.result(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1)];
    return this.snapshot();
  }
  snapshot() {
    return this.months[this.months.length - 1];
  }
  history() {
    return [...this.months];
  }
  private result(
    month: number,
    h: number,
    j: number,
    waitingH: number,
    waitingJ: number,
    departed: number,
    admitted: number,
    exited: number,
    hired: number,
    vacated: number,
    labour: number,
    employmentSupport: number,
    serviceAdmissionCover: number,
  ): DistrictMonth {
    const caps = capacities(this.input),
      sum = (p: string) =>
        caps.filter((b) => b.purpose === p).reduce((n, b) => n + b.capacity, 0),
      hc = sum("residential"),
      jc = sum("commercial"),
      sc = sum("civic"),
      residents = h * this.input.living.householdSize,
      used = Math.min(sc, residents),
      a = this.input.living;
    let constraint: Constraint = "uptake";
    if (month === 0) constraint = "uptake";
    else if (hc === 0) constraint = "housing-capacity";
    else if (a.householdArrivals === 0 || (waitingH < EPS && h < hc - EPS))
      constraint = "household-demand";
    else if (residents - used > EPS || serviceAdmissionCover < 1 - EPS)
      constraint = "services";
    else if (waitingJ > EPS && j < jc - EPS && labour - j < EPS)
      constraint = "workforce";
    else if (waitingJ > EPS && jc - j < EPS) constraint = "employment-capacity";
    else if (hc - h < Math.max(0.25, hc * 0.1)) constraint = "housing-capacity";
    else if (employmentSupport < 1 - EPS) constraint = "employment-support";
    const hUse = share(h, hc),
      jUse = share(j, jc),
      cover = residents > 0 ? share(used, residents) : 1;
    return frozen(
      validateMonth(
        {
          month,
          householdCapacity: hc,
          occupiedHouseholds: h,
          residents,
          employmentCapacity: jc,
          filledJobs: j,
          serviceCapacity: sc,
          serviceDemand: residents,
          usedService: used,
          unmetService: residents - used,
          waitingHouseholds: waitingH,
          waitingJobs: waitingJ,
          departedHouseholds: departed,
          admittedHouseholds: admitted,
          exitedHouseholds: exited,
          hiredJobs: hired,
          vacatedJobs: vacated,
          recruitmentLabour: labour,
          employmentSupport,
          serviceAdmissionCover,
          householdUtilization: hUse,
          jobUtilization: jUse,
          serviceUtilization: share(used, sc),
          serviceCoverage: cover,
          balance: Math.min(hUse, jUse, cover),
          constraint,
          buildings: caps.map((b) => ({
            ...b,
            used:
              b.capacity *
              (b.purpose === "residential"
                ? hUse
                : b.purpose === "commercial"
                  ? jUse
                  : share(used, sc)),
            utilization:
              b.purpose === "residential"
                ? hUse
                : b.purpose === "commercial"
                  ? jUse
                  : share(used, sc),
          })),
        },
        this.input,
      ),
    );
  }
  step() {
    const p = this.snapshot();
    if (p.month >= HORIZON)
      throw new Error("The 24-month simulation horizon has been reached.");
    const a = this.input.living;
    // 1. Exits and separations. Positions losing workers return to business demand.
    const exited = p.occupiedHouseholds * a.householdTurnover,
      h = p.occupiedHouseholds - exited,
      labour = h * a.workersPerHousehold + a.externalWorkforce;
    const survivingJobs = Math.min(
        p.filledJobs * (1 - a.jobSeparation),
        labour,
      ),
      vacated = p.filledJobs - survivingJobs;
    // 2. Exogenous demand enters bounded queues. No demand silently disappears.
    const waitingH = p.waitingHouseholds + a.householdArrivals,
      waitingJ = p.waitingJobs + a.jobDemandArrivals + vacated;
    // 3. Fill jobs using this month's surviving resident workforce and outside allowance.
    const hired = Math.max(
        0,
        Math.min(
          waitingJ,
          (p.employmentCapacity - survivingJobs) * a.jobFillRate,
          labour - survivingJobs,
        ),
      ),
      jobs = survivingJobs + hired;
    // 4. Admit households. A first-pass uptake target tests employment/service support.
    const tentative = Math.max(
        0,
        Math.min(waitingH, (p.householdCapacity - h) * a.householdMoveInRate),
      ),
      prospectiveH = h + tentative;
    const employmentSupport =
        prospectiveH > 0
          ? Math.min(
              1,
              (jobs + a.externalJobOpportunities) /
                (prospectiveH * a.workersPerHousehold),
            )
          : 1,
      serviceCover =
        prospectiveH > 0
          ? Math.min(1, p.serviceCapacity / (prospectiveH * a.householdSize))
          : 1;
    const admitted =
      tentative *
      employmentSupport *
      (a.minimumServiceAttraction +
        (1 - a.minimumServiceAttraction) * serviceCover);
    // 5. Reconcile stocks, service demand, shares and proportional building allocations.
    const next = this.result(
      p.month + 1,
      h + admitted,
      jobs,
      Math.max(0, waitingH - admitted),
      Math.max(0, waitingJ - hired),
      p.departedHouseholds + exited,
      admitted,
      exited,
      hired,
      vacated,
      labour,
      employmentSupport,
      serviceCover,
    );
    this.months.push(next);
    return next;
  }
  advanceTo(month: number) {
    if (!Number.isInteger(month) || month < 0 || month > HORIZON)
      throw new Error("Choose an integer month from 0 to 24.");
    while (this.snapshot().month < month) this.step();
    return this.history();
  }
}
export function runDistrict(input: unknown, month = HORIZON) {
  return new DistrictSimulation(input).advanceTo(month);
}
