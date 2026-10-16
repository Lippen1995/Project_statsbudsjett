import { beforeEach, expect, it } from "vitest";
import { useCity } from "../src/state/store";
import type { Feature } from "../src/geo/types";

const building: Feature = {
  id: "way/1",
  kind: "building",
  name: "Selection test fixture",
  center: [0, 0],
  location: [0, 0],
  elevation: 0,
  tags: {},
};
beforeEach(() =>
  useCity.setState({
    selected: null,
    selectedSegmentId: null,
    layers: { buildings: true, roads: true, water: true },
    camera: { revision: 0, point: null },
    quality: "balanced",
  }),
);

it("clears a selection when its layer is hidden and preserves other layer selections", () => {
  useCity.getState().select(building);
  useCity.getState().toggleLayer("roads");
  expect(useCity.getState().selected).toBe(building);
  useCity.getState().toggleLayer("buildings");
  expect(useCity.getState().selected).toBeNull();
  expect(useCity.getState().layers).toEqual({
    buildings: false,
    roads: false,
    water: true,
  });
});

it("can repeat focus commands and reset the city overview", () => {
  useCity.getState().focus([12, 34]);
  useCity.getState().focus([12, 34]);
  expect(useCity.getState().camera).toEqual({ revision: 2, point: [12, 34] });
  useCity.getState().focus(null);
  expect(useCity.getState().camera).toEqual({ revision: 3, point: null });
});

it("clears a planned street section when its geographic road selection is hidden", () => {
  const road: Feature = { ...building, id: "way/9649862", kind: "road" };
  useCity.getState().select(road, "source-section");
  useCity.getState().toggleLayer("roads");
  expect(useCity.getState().selected).toBeNull();
  expect(useCity.getState().selectedSegmentId).toBeNull();
});
