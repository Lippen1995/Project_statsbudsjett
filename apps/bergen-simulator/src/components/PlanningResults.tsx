import { useScenario } from "../state/scenario";
import { evaluateChallenge } from "../simulation/challenge";
export const number = (n: number, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-GB", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
const diff = (a: number, b: number) =>
  b > 0 && Number.isFinite(a) && Number.isFinite(b)
    ? `${a >= b ? "+" : ""}${number((a / b - 1) * 100, 1)}%`
    : "—";
export default function PlanningResults() {
  const s = useScenario(),
    r = s.intervention,
    baseline = s.baseline;
  if (!r || !baseline || r.tick === 0) return null;
  const ref = s.library.find((p) => p.id === s.referenceId);
  const b = s.mapView === "reference" && s.reference ? s.reference : baseline;
  const label =
    b === baseline ? "Baseline" : (ref?.scenario.name ?? "Saved reference");
  const distance = (v: typeof r) =>
    v.throughServed ? v.throughMetres / v.throughServed : NaN;
  const rows = [
    [
      "Bryggen passages",
      `${b.corridorTrips} veh`,
      `${r.corridorTrips} veh`,
      diff(r.corridorTrips, b.corridorTrips),
    ],
    [
      "Through on Bryggen",
      `${b.corridorThroughTrips} veh`,
      `${r.corridorThroughTrips} veh`,
      diff(r.corridorThroughTrips, b.corridorThroughTrips),
    ],
    [
      "Vehicle travel time",
      `${number(b.vehicleMinutes)} veh·min`,
      `${number(r.vehicleMinutes)} veh·min`,
      diff(r.vehicleMinutes, b.vehicleMinutes),
    ],
    [
      "Through-trip distance",
      `${number(distance(b))} m/trip`,
      `${number(distance(r))} m/trip`,
      diff(distance(r), distance(b)),
    ],
    [
      "Highest road V/C¹",
      number(Math.max(...b.edgeVc), 2),
      number(Math.max(...r.edgeVc), 2),
      "ratio",
    ],
    [
      "Emissions proxy²",
      `${number((b.emissionBurden / Math.max(0.001, baseline.emissionBurden)) * 100)} index`,
      `${number((r.emissionBurden / Math.max(0.001, baseline.emissionBurden)) * 100)} index`,
      diff(r.emissionBurden, b.emissionBurden),
    ],
    [
      "Unrouted trips",
      `${b.unrouted} / ${b.requested}`,
      `${r.unrouted} / ${r.requested}`,
      "synthetic trips",
    ],
  ];
  return (
    <section aria-label="Plan consequences">
      {r.unrouted > 0 ? (
        <div className="accessibility-loss" role="alert">
          <strong>
            ACCESSIBILITY LOSS · {r.unrouted} / {r.requested} trips
          </strong>
          <p>
            No permitted route inside this model. Routed-only reductions are not
            efficiency gains. Any lost trip penalizes the game score below every
            fully routed plan.
          </p>
        </div>
      ) : (
        <p className="decision-outcome">
          All {r.served} requested trips found a permitted model route. Compare
          detours and congestion before judging this plan.
        </p>
      )}
      <div className="comparison-tabs" aria-label="Map comparison">
        <button
          aria-pressed={s.mapView === "plan"}
          onClick={() => s.setMapView("plan")}
        >
          Your plan
        </button>
        <button
          aria-pressed={s.mapView === "baseline"}
          onClick={() => s.setMapView("baseline")}
        >
          Initial baseline
        </button>
        {s.reference && (
          <button
            aria-pressed={s.mapView === "reference"}
            onClick={() => s.setMapView("reference")}
          >
            Saved reference
          </button>
        )}
      </div>
      <table
        className="scenario-results"
        aria-label="Baseline versus current plan"
      >
        <thead>
          <tr>
            <th scope="col">Model outcome</th>
            <th scope="col">{label}</th>
            <th scope="col">Your plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([title, before, after, delta]) => (
            <tr key={title}>
              <th scope="row">{title}</th>
              <td>{before}</td>
              <td>
                {after}
                <small>{delta}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="data-note">
        Elapsed model time, routed trips only. ¹Highest period-average
        directional volume / assumed capacity. ²Arbitrary distance/congestion
        proxy, initial baseline = 100. Not a CO₂ forecast.
      </p>
    </section>
  );
}
export function ChallengeReadout() {
  const s = useScenario();
  if (!s.challenge) return null;
  const result =
    s.baseline && s.intervention
      ? evaluateChallenge(s.baseline, s.intervention)
      : null;
  const labels = [
    "Reduce Bryggen through-trips by at least 25%",
    "Keep every requested trip routable",
    "Mean through-trip distance ≤ 2× baseline",
    "Highest period-average road V/C ≤ 2.5",
  ];
  return (
    <section
      className="planning-challenge"
      aria-label="Rethinking Bryggen challenge"
    >
      <div className="section-heading">
        <h3>Rethinking Bryggen</h3>
        <button
          className="icon-button"
          aria-label="Leave challenge"
          onClick={() => s.setChallenge(false)}
        >
          ×
        </button>
      </div>
      <p>
        Your brief: ease through-traffic while preserving access. Design the
        plan yourself.
      </p>
      <ul>
        {labels.map((label, i) => (
          <li
            key={label}
            className={
              result?.complete && result.checks[i] ? "objective-met" : ""
            }
          >
            <span aria-hidden="true">
              {result?.complete && result.checks[i] ? "✓" : "·"}
            </span>
            {label}
          </li>
        ))}
      </ul>
      <p className="challenge-verdict">
        {result?.complete
          ? result.passed
            ? "Challenge achieved"
            : "Keep experimenting"
          : "Run a complete 30-minute trial to evaluate"}
      </p>
      {result?.complete && (
        <p className="game-score">
          Synthetic game score: <strong>{result.score}</strong>
        </p>
      )}
      <details>
        <summary>Scoring rules</summary>
        <p>
          Any lost trip: −1000 minus unrouted trips. Otherwise: 100 ×
          through-trip reduction fraction, minus 20 × detour ratio above 1,
          minus 10 × highest V/C above 2, rounded and bounded below at −999.
          Scores are game rules, separate from raw metrics and real Bergen
          policy standards.
        </p>
      </details>
    </section>
  );
}
