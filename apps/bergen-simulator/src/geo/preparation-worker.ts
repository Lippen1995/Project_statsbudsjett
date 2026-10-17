import { prepareCity, transferBuffers } from "./preparation";
self.onmessage = ({ data }: MessageEvent<unknown>) => {
  try {
    if (
      !data ||
      typeof data !== "object" ||
      !("version" in data) ||
      data.version !== 1 ||
      !("requestId" in data) ||
      typeof data.requestId !== "number" ||
      !("geography" in data)
    )
      throw new Error("Invalid preparation request.");
    const reply = prepareCity(data.geography, data.requestId);
    self.postMessage(reply, { transfer: transferBuffers(reply) });
  } catch {
    self.postMessage({
      version: 1,
      type: "error",
      message: "The verified geographic geometry could not be prepared.",
    });
  }
  self.close();
};
