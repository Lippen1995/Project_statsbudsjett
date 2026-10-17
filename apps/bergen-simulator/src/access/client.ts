import type { ConnectedCommand, ConnectedReply } from "./worker";
interface WorkerPort {
  onmessage: ((e: MessageEvent<ConnectedReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage: (data: ConnectedCommand) => void;
  terminate: () => void;
}
export function startConnected(
  command: ConnectedCommand,
  onReady: (r: Extract<ConnectedReply, { type: "ready" }>) => void,
  onError: (message: string) => void,
  factory: () => WorkerPort = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  let active = true;
  let worker: WorkerPort;
  try {
    worker = factory();
  } catch {
    onError("Connected worker unavailable. Your plan is preserved.");
    return () => {};
  }
  const stop = () => {
    if (!active) return;
    active = false;
    clearTimeout(deadline);
    worker.terminate();
  };
  const fail = (message: string) => {
    if (!active) return;
    stop();
    onError(message);
  };
  const deadline = setTimeout(
    () => fail("Connected simulation exceeded its 15-second limit."),
    15000,
  );
  worker.onerror = () =>
    fail("Connected worker unavailable. The plan is preserved.");
  worker.onmessage = ({ data }) => {
    if (!active) return;
    try {
      if (!data || data.generation !== command.generation) return;
      if (data.version !== 1)
        throw new Error("Invalid connected response contract.");
      if (data.type === "error")
        throw new Error(String(data.message).slice(0, 300));
      if (
        data.type !== "ready" ||
        !Number.isFinite(data.computeMs) ||
        data.computeMs < 0
      )
        throw new Error("Invalid connected result.");
      for (const result of [
        data.result,
        ...(data.reference ? [data.reference] : []),
      ]) {
        const l = result.ledger;
        if (
          result.version !== 1 ||
          result.combined.tick !== 60 ||
          l.month !== command.input.mobility.month ||
          l.generated !== l.requested + l.capped ||
          l.requested !== l.routed + l.unrouted ||
          l.assigned + l.blocked !== l.requested ||
          l.routed !== result.additional.served ||
          l.unrouted !== l.blocked + result.additional.unrouted
        )
          throw new Error("Invalid connected accounting.");
        if (
          [
            l.generated,
            l.requested,
            l.capped,
            l.routed,
            l.unrouted,
            l.assigned,
            l.blocked,
          ].some((n) => !Number.isSafeInteger(n) || n < 0) ||
          l.requested > 240 ||
          l.sites.length > 8
        )
          throw new Error("Unbounded connected output.");
        for (const traffic of [
          result.baseline,
          result.streetOnly,
          result.combined,
          result.additional,
        ]) {
          if (
            traffic.edgeVehicles.length !==
              command.input.context.network.edges.length ||
            traffic.edgeVc.length !== traffic.edgeVehicles.length ||
            traffic.requested !== traffic.served + traffic.unrouted ||
            [
              traffic.vehicleMinutes,
              traffic.vehicleKm,
              ...traffic.edgeVc,
              ...traffic.edgeVehicles,
            ].some((n) => !Number.isFinite(n) || n < 0)
          )
            throw new Error("Invalid road-network output.");
        }
      }
      if (!!data.reference !== !!command.reference)
        throw new Error("Mismatched saved comparison.");
      stop();
      onReady(data);
    } catch (e) {
      fail(
        e instanceof Error ? e.message : "Invalid connected worker message.",
      );
    }
  };
  try {
    worker.postMessage(command);
  } catch {
    fail("Could not start connected simulation.");
  }
  return stop;
}
