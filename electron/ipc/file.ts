import { BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { IPC_CHANNELS, type SavePngRequest, type SavePngResult } from "../../shared/ipc";

const maxPngBufferBytes = 128 * 1024 * 1024;

export function registerFileIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.savePng,
    async (_event, request: unknown): Promise<SavePngResult> => {
      const saveRequest = parseSavePngRequest(request);
      const ownerWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const dialogOptions = {
        title: "Save AO PNG",
        defaultPath: saveRequest.defaultFileName,
        filters: [{ name: "PNG image", extensions: ["png"] }],
      };

      const result = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      const filePath = result.filePath.toLowerCase().endsWith(".png")
        ? result.filePath
        : `${result.filePath}.png`;

      await writeFile(filePath, Buffer.from(saveRequest.buffer));

      return {
        canceled: false,
        filePath,
      };
    },
  );
}

function parseSavePngRequest(value: unknown): SavePngRequest {
  if (!isRecord(value)) {
    throw new Error("Invalid save request.");
  }

  const { buffer, defaultFileName } = value;
  if (typeof defaultFileName !== "string" || defaultFileName.trim().length === 0) {
    throw new Error("Invalid PNG file name.");
  }

  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error("Invalid PNG buffer.");
  }

  if (buffer.byteLength === 0 || buffer.byteLength > maxPngBufferBytes) {
    throw new Error("PNG buffer size is invalid.");
  }

  return {
    defaultFileName,
    buffer,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
