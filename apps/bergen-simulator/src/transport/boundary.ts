import { validateBuilding, type BuildingProposal } from "../physical/buildings";
import type { Network } from "../simulation/network";

export interface DistrictTransportBoundary {
  version: 1;
  status: "no-development" | "unverified-access";
  networkNodeCount: number;
  sites: {
    proposalId: string;
    name: string;
    verifiedEntranceNodeId: null;
    reason: string;
  }[];
  addedRequestedTrips: 0;
}
/** No source-supported entrances exist for the hypothetical sites in this snapshot.
 * A centreline, nearest-node distance or observed entrance to another building
 * cannot authorize an origin/destination. This is an assessment, not trip generation.
 */
export function districtTransportBoundary(
  buildings: BuildingProposal[],
  network: Network | null,
): DistrictTransportBoundary {
  if (buildings.length > 8)
    throw new Error(
      "District access assessment is limited to eight proposed buildings.",
    );
  const sites = buildings.map(validateBuilding).map(
    (b) =>
      ({
        proposalId: b.id,
        name: b.name,
        verifiedEntranceNodeId: null,
        reason: "No source-supported entrance and route to this proposed site.",
      }) as const,
  );
  return {
    version: 1,
    status: sites.length ? "unverified-access" : "no-development",
    networkNodeCount: network?.nodeIds.length ?? 0,
    sites,
    addedRequestedTrips: 0,
  };
}
