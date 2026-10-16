import { TrafficSimulation, TOTAL_TICKS } from "./engine";
import { buildNetwork } from "./network";
import type { Command, Reply } from "./protocol";
let baseline: TrafficSimulation | undefined,
  intervention: TrafficSimulation | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let paused = true,
  computeMs = 0;
const send = () => {
  if (baseline && intervention)
    self.postMessage({
      type: "progress",
      baseline: baseline.snapshot(),
      intervention: intervention.snapshot(),
      computeMs,
      paused,
    } satisfies Reply);
};
function tick() {
  if (paused || !baseline || !intervention) return;
  const start = performance.now();
  baseline.step();
  const r = intervention.step();
  computeMs += performance.now() - start;
  if (r.tick >= TOTAL_TICKS) paused = true;
  if (r.tick % 5 === 0 || paused) send();
  if (!paused) timer = setTimeout(tick, 100);
}
self.onmessage = ({ data }: MessageEvent<Command>) => {
  try {
    clearTimeout(timer);
    if (data.type === "start") {
      const network = buildNetwork(data.source);
      baseline = new TrafficSimulation(network, "baseline");
      intervention = new TrafficSimulation(network, data.policy);
      computeMs = 0;
      paused = false;
      send();
      tick();
    } else if (data.type === "pause") {
      paused = true;
      send();
    } else if (baseline && baseline.snapshot().tick < TOTAL_TICKS) {
      paused = false;
      tick();
    }
  } catch (error) {
    paused = true;
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Simulation failed.",
    } satisfies Reply);
  }
};
