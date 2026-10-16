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
