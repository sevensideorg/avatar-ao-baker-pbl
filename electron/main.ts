import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerDialogIpc } from "./ipc/dialog";
import { registerFileIpc } from "./ipc/file";

let mainWindow: BrowserWindow | null = null;

function getRendererUrl(): string | null {
  const rendererArg = process.argv.find((value) => value.startsWith("--renderer-url="));
  if (!rendererArg) {
    return null;
  }

  return rendererArg.slice("--renderer-url=".length) || null;
}

function createMainWindow(): BrowserWindow {
  const rendererUrl = getRendererUrl();
  const contentSecurityPolicy = buildContentSecurityPolicy(rendererUrl);
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    title: "Avatar AO Baker",
    backgroundColor: "#11161f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [contentSecurityPolicy],
      },
    });
  });

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    const rendererPath = path.join(__dirname, "..", "..", "dist", "index.html");
    void window.loadURL(pathToFileURL(rendererPath).toString());
  }

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Renderer failed to load (${errorCode}): ${errorDescription} - ${validatedUrl}`);
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Preload failed: ${preloadPath}`);
    console.error(error);
  });
  window.webContents.on("console-message", (event) => {
    console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusMainWindow();
  });

  app.whenReady().then(() => {
    registerDialogIpc();
    registerFileIpc();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        return;
      }

      focusMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function buildContentSecurityPolicy(rendererUrl: string | null): string {
  if (rendererUrl) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:5173",
      "style-src 'self' 'unsafe-inline' http://127.0.0.1:5173",
      "img-src 'self' data: blob: file:",
      "font-src 'self' data:",
      "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173",
      "worker-src 'self' blob:",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
  ].join("; ");
}
