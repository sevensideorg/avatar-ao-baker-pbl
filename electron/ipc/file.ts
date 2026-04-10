import { BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { IPC_CHANNELS, type SavePngRequest, type SavePngResult } from "../../shared/ipc";

export function registerFileIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.savePng,
    async (_event, request: SavePngRequest): Promise<SavePngResult> => {
      const ownerWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const dialogOptions = {
        title: "Save AO PNG",
        defaultPath: request.defaultFileName,
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

      await writeFile(filePath, Buffer.from(request.buffer));

      return {
        canceled: false,
        filePath,
      };
    },
  );
}
