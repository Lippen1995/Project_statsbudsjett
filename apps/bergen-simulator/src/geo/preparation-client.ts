import type { CityData } from "./types";
import {
  unpackCity,
  disposePrepared,
  type PreparedCity,
  type PreparedReply,
} from "./preparation";
import { preparation, recordPreparation } from "./diagnostics";
export type PreparationWorker = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror"
>;
/** One job/worker; cancellation owns and disposes the resulting geometry once. */
export function startCityPreparation(
  data: CityData,
  onReady: (city: PreparedCity) => void,
  onError: (message: string) => void,
  factory: () => PreparationWorker = () =>
    new Worker(new URL("./preparation-worker.ts", import.meta.url), {
      type: "module",
    }),
) {
  let active = true,
    done = false,
    city: PreparedCity | undefined,
    worker: PreparationWorker | undefined,
    timeout: ReturnType<typeof setTimeout> | undefined;
  const start = performance.now();
  const reject = () => {
    if (!active || done) return;
    done = true;
    clearTimeout(timeout);
    worker?.terminate();
    if (city) {
      disposePrepared(city);
      city = undefined;
    }
    onError(
      "The verified geographic geometry could not be prepared. Reload to retry; no substitute city was loaded.",
    );
  };
  try {
    worker = factory();
    worker.onmessage = ({ data: reply }: MessageEvent<PreparedReply>) => {
      if (!active || done) return;
      if (reply?.requestId !== undefined && reply.requestId !== 1) return;
      try {
        city = preparation("geometry.hydrate-main", () =>
          unpackCity(reply, data, 1),
        );
        clearTimeout(timeout);
        worker?.terminate();
        recordPreparation(
          "geometry.worker-roundtrip",
          performance.now() - start,
        );
        for (const s of reply.stages)
          recordPreparation("worker." + s.name, s.durationMs);
        onReady(city);
        done = true;
      } catch {
        reject();
      }
    };
    worker.onerror = reject;
    timeout = setTimeout(reject, 30000);
    worker.postMessage({ version: 2, requestId: 1, geography: data });
  } catch {
    reject();
  }
  return () => {
    if (!active) return;
    active = false;
    clearTimeout(timeout);
    worker?.terminate();
    if (city) disposePrepared(city);
  };
}
