import { runConnected, type ConnectedInput } from "./run";
export interface ConnectedCommand {
  version: 1;
  generation: number;
  input: ConnectedInput;
  reference: ConnectedInput | null;
}
export type ConnectedReply =
  | {
      version: 1;
      generation: number;
      type: "ready";
      result: ReturnType<typeof runConnected>;
      reference: ReturnType<typeof runConnected> | null;
      computeMs: number;
    }
  | { version: 1; generation: number; type: "error"; message: string };
self.onmessage = ({ data }: MessageEvent<ConnectedCommand>) => {
  const start = performance.now();
  try {
    if (data.version !== 1 || !Number.isInteger(data.generation))
      throw new Error("Invalid connected worker request.");
    self.postMessage({
      version: 1,
      generation: data.generation,
      type: "ready",
      result: runConnected(data.input),
      reference: data.reference ? runConnected(data.reference) : null,
      computeMs: performance.now() - start,
    } satisfies ConnectedReply);
  } catch (e) {
    self.postMessage({
      version: 1,
      generation: data.generation,
      type: "error",
      message: e instanceof Error ? e.message : "Connected model failed.",
    } satisfies ConnectedReply);
  }
  self.close();
};
