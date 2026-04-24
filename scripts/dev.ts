import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const nodeRequire = createRequire(__filename);
const electronPath = nodeRequire("electron") as string;

const rendererHost = "127.0.0.1";
const rendererPort = 5173;
const rendererUrl = `http://${rendererHost}:${rendererPort}`;
const mainFile = "dist-electron/electron/main.js";
const timeoutMs = 60_000;
const intervalMs = 250;
const lockName = "avatar-ao-baker-dev";
const lockPath =
  process.platform === "win32"
    ? `\\\\.\\pipe\\${lockName}`
    : path.join(os.tmpdir(), `${lockName}.sock`);

type ManagedChild = {
  name: string;
  process: ChildProcess;
};

async function main(): Promise<void> {
  const lockServer = await acquireDevLock();
  const children: ManagedChild[] = [];
  let shuttingDown = false;

  const shutdown = (exitCode: number): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const child of children) {
      if (!child.process.killed) {
        child.process.kill();
      }
    }

    lockServer.close(() => {
      process.exit(exitCode);
    });
  };

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  children.push(
    startManagedProcess("renderer", pnpmCommand(), ["run", "dev:renderer"], shutdown),
    startManagedProcess("electron-ts", pnpmCommand(), ["run", "dev:electron:ts"], shutdown),
  );

  try {
    await Promise.all([
      waitForTcp(rendererHost, rendererPort, timeoutMs),
      waitForFile(mainFile, timeoutMs),
    ]);

    children.push(
      startManagedProcess(
        "electron-app",
        electronPath,
        [mainFile, `--renderer-url=${rendererUrl}`],
        shutdown,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    shutdown(1);
  }
}

function acquireDevLock(): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error("Avatar AO Baker dev server is already running."));
        return;
      }

      reject(error);
    });

    server.listen(lockPath, () => {
      resolve(server);
    });
  });
}

function startManagedProcess(
  name: string,
  command: string,
  args: string[],
  shutdown: (exitCode: number) => void,
): ManagedChild {
  const child = spawn(command, args, {
    stdio: "inherit",
    windowsHide: false,
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      console.error(`${name} exited with ${signal}.`);
      shutdown(1);
      return;
    }

    const exitCode = code ?? 0;
    if (exitCode !== 0) {
      console.error(`${name} exited with code ${exitCode}.`);
    }
    shutdown(exitCode);
  });

  child.once("error", (error) => {
    console.error(`${name} failed to start.`);
    console.error(error);
    shutdown(1);
  });

  return { name, process: child };
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

function pnpmCommand(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
