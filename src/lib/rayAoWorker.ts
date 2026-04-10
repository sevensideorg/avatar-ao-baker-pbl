import { executeRayAoBake, type RayAoBakeRequest } from "./rayAoCore";
import type { BakeProgress } from "./types";

type LocalWorkerScope = typeof self & {
  onmessage: ((event: MessageEvent<WorkerRequestMessage>) => void | Promise<void>) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as LocalWorkerScope;

type WorkerRequestMessage = {
  type: "run";
  payload: RayAoBakeRequest;
};

type WorkerProgressMessage = {
  type: "progress";
  payload: BakeProgress;
};

type WorkerResultMessage = {
  type: "result";
  payload: Awaited<ReturnType<typeof executeRayAoBake>>;
};

type WorkerErrorMessage = {
  type: "error";
  payload: string;
};

workerScope.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  if (event.data.type !== "run") {
    return;
  }

  try {
    const result = await executeRayAoBake(event.data.payload, (progress) => {
      const message: WorkerProgressMessage = {
        type: "progress",
        payload: progress,
      };
      workerScope.postMessage(message);
    });

    const message: WorkerResultMessage = {
      type: "result",
      payload: result,
    };
    workerScope.postMessage(message, [result.pixels.buffer as ArrayBuffer]);
  } catch (error) {
    const message: WorkerErrorMessage = {
      type: "error",
      payload: error instanceof Error ? error.message : "Ray AO worker failed.",
    };
    workerScope.postMessage(message);
  }
};
