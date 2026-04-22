import { access } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const rendererHost = "127.0.0.1";
const rendererPort = 5173;
const rendererUrl = `http://${rendererHost}:${rendererPort}`;
const mainFile = "dist-electron/electron/main.js";
const timeoutMs = 60_000;
const intervalMs = 250;

await Promise.all([
  waitForTcp(rendererHost, rendererPort, timeoutMs),
  waitForFile(mainFile, timeoutMs),
]);

const child = spawn(
  electronPath,
  [mainFile, `--renderer-url=${rendererUrl}`],
  {
    stdio: "inherit",
    windowsHide: false,
  },
);

const forwardSignal = (signal) => {
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

async function waitForFile(filePath, timeout) {
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

async function waitForTcp(host, port, timeout) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    if (await canConnect(host, port)) {
      return;
    }

    await delay(intervalMs);
  }

  throw new Error(`Timed out waiting for tcp:${host}:${port}`);
}

function canConnect(host, port) {
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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
