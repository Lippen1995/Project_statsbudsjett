# Bergen Reimagined — product specification

## Purpose

A browser-based city-building and governance simulation grounded in Norway's real
geography. Bergen is the first municipality. The long-term ambition combines city
management with a nationwide simulation where players govern municipalities or
Norway as national politicians. Future integration into fellestall.no must be
explicit, versioned and independently deployable.

## Milestone 1: a recognizable central Bergen

Explore real mapped buildings, streets, coastline and terrain in 3D. Orbit, pan,
zoom, reset the overview, find named places, select geometry and inspect its source.
The UI distinguishes mapped observations from estimated presentation geometry.
The prototype remains usable at desktop and mobile sizes, with reduced rendering
resolution for slower hardware and an explicit WebGL failure state.

Coverage: 60.382–60.408 N / 5.298–5.349 E. The harbour, Bryggen, Nordnes, Bergenhus,
city centre, Lille Lungegårdsvannet and western Fløyen slopes anchor recognition.
The extent is a rendering crop, not an administrative boundary.

## Acceptance criteria

- Separate Vite application builds and tests without installing or invoking Fellestall.
- Terrain follows a real DEM at metre scale, with no vertical exaggeration.
- Footprints, road centrelines and coastline come from a traceable OSM snapshot.
- Inspectable objects retain stable OSM IDs and source links.
- OSM height tags and storey-derived estimates are distinct; unknown heights remain
  null and render as flat footprints.
- No fabricated geography substitutes for missing data; failed data loading is visible.
- Rendering runs on demand, caps device pixel ratio and batches city geometry.
- No production database, environment variables, services or deployment configuration
  are accessed or changed. Original tracked Fellestall files remain unchanged.
- Public deployment requires explicit approval and a separate hosting project.

## Outside this milestone

No zoning, construction, population, taxation, transport demand, agents, budgets,
saving, accounts, multiplayer or policy outcomes. UI controls do not pretend those
systems exist. Geometry is a geographically grounded prototype, not survey-grade.

## Future Fellestall relationship

Fellestall can eventually provide separately published, versioned municipal facts
with source attribution and a defined API/schema. Historical observed facts and
simulated outcomes must remain distinct. Simulator state, authentication and storage
must have independent ownership and operational lifecycles. Bergen remains the
only supported geography until its data and simulation contracts are proven.

## Active milestone 3A — first playable city planning

The historical exclusions and setup notes above describe earlier milestones.
The protected Bergen deployment is now operational. The current vertical slice
adds traffic planning around Bryggen/Vågen: enter a scenario, choose baseline,
restricted through-traffic or pedestrian priority, run/pause, compare map and
outcomes, reset and experiment. The map remains dominant and source inspection
continues to expose the unchanged geography.

The game uses synthetic travel demand and explicit model assumptions. A decision
changes permitted routes in one common deterministic worker engine. Detours,
congestion, travel time, emissions proxy and unrouted trips are calculated rather
than drawn from outcome tables. No traffic forecast, real car counts or validated
CO₂ reductions are claimed. Gameplay remains entirely local and ephemeral.
Budgets, population, politics, construction, accounts and persistence remain outside
this milestone. See [3A acceptance, evidence and limitations](milestone-3a.md).

## Active milestone 3B — player-designed street plans

Planning Mode replaces the three predefined traffic buttons with direct selection
of real modelled street sections. A player changes access rules and assumed capacity,
edits connected sections, undoes/redoes, runs a deterministic trial, compares to the
initial baseline or a saved configuration, and restores the city. Unsupported streets
are explicitly inspect-only. Teal outlines identify editable sections; dashed colours
identify proposals rather than completed construction or observed access rules.

Named plans save locally, reopen after reload, duplicate, and export/import validated
JSON. Results are recalculated, never trusted from a file. The self-contained
**Rethinking Bryggen** challenge asks for fewer modelled through-trips without lost
access or excessive detours/congestion. Its thresholds are verified against a valid
five-edit configuration. Scoring is a synthetic game rule, kept separate from raw
transport metrics; any lost trip penalizes the score below every fully routed plan.

Physical construction, land-use edits, parcel ownership, costs, population, political
simulation, cloud saves and accounts remain outside this milestone. Geography and
all existing traffic assumptions stay traceable and explicitly uncalibrated.

## Active milestone 4A — physical public-space authoring

Planning Mode now has two tools: street operations and physical public spaces.
Players place a bounded footprint on real terrain near Bryggen, reshape corners,
choose artistic pedestrian paving or landscaped treatment, inspect road conflicts,
and explicitly decide whether to change modelled access. An eligible shape becomes
a visible terrain-following proposed surface. It can be selected, removed, undone,
redone, compared to the observed city or a saved design, and saved with traffic edits.

Passing placement checks establishes geometric eligibility in this prototype only.
It says nothing about ownership, heritage restrictions, utilities, structural
capacity, construction permission or technical feasibility. Area is a measurable
horizontal design footprint. Traffic outcomes remain synthetic. Construction costs,
legal feasibility, pedestrian activity and economic benefits are unmodelled.

The optional **Transforming the Bryggen Waterfront** challenge uses a modest area
band, supported proximity to real modelled roads, explicit treatment of road
conflicts, complete synthetic access and bounded detours/congestion. A tested plan
proves the objectives achievable; closing roads and losing demand cannot win.
There is no reward for maximizing polygon size.

Local save/export version 2 supports combined designs; valid 3B version-1 plans
remain usable. No database, account, new geographic snapshot or deployment project
is introduced. Building placement, demolition, zoning and terrain modification are
future milestones, with separate safeguards and source requirements.

## Milestone 4B — building placement

The Buildings tool adds residential, commercial and civic conceptual massing on a
separate hypothetical layer. Place, move, rotate, resize, change storeys/assumed floor
height and choose flat/gabled roofs. Shared history, local saves, JSON and comparisons
include construction and public space. Derived floor area and use breakdowns are
geometric game quantities; no population, employment, fiscal or demand effects are
inferred. Scenario version 3 safely reads 3B/4A plans. The optional A New Urban Quarter
challenge has an automatically verified multi-building/public-space solution.
See [4B acceptance and remaining limits](milestone-4b.md).
