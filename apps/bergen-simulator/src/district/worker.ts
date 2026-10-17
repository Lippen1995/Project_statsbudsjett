import { DistrictRunner, type DistrictReply } from "./protocol";
const runner = new DistrictRunner();
let computeMs = 0;
self.onmessage = ({ data }: MessageEvent<unknown>) => {
  try {
    const start = performance.now();
    const result = runner.handle(data);
    if (result) {
      computeMs =
        (data &&
        typeof data === "object" &&
        "type" in data &&
        data.type === "configure"
          ? 0
          : computeMs) +
        performance.now() -
        start;
      self.postMessage({ ...result, computeMs } satisfies DistrictReply);
    }
  } catch (e) {
    const generation =
      data &&
      typeof data === "object" &&
      "generation" in data &&
      typeof data.generation === "number"
        ? data.generation
        : 0;
    self.postMessage({
      type: "error",
      generation,
      message: e instanceof Error ? e.message : "District calculation failed.",
    } satisfies DistrictReply);
  }
};
