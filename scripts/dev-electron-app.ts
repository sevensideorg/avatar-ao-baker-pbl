import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";

const nodeRequire = createRequire(__filename);
const electronPath = nodeRequire("electron") as string;

const rendererHost = "127.0.0.1";
const rendererPort = 5173;
const rendererUrl = `http://${rendererHost}:${rendererPort}`;
const mainFile = "dist-electron/electron/main.js";
const timeoutMs = 60_000;
const intervalMs = 250;

async function main(): Promise<void> {
  await Promise.all([
    waitForTcp(rendererHost, rendererPort, timeoutMs),
    waitForFile(mainFile, timeoutMs),
  ]);

  const child = spawn(electronPath, [mainFile, `--renderer-url=${rendererUrl}`], {
    stdio: "inherit",
    windowsHide: false,
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

async function waitForFile(filePath: string, timeout: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    try {
      await access(filePath);
      return;
    } catch {
      await delay(intervalMs);
    }
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForTcp(host: string, port: number, timeout: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    if (await canConnect(host, port)) {
      return;
    }

    await delay(intervalMs);
  }

  throw new Error(`Timed out waiting for tcp:${host}:${port}`);
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1_000);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

void main();
