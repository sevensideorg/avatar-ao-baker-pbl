import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS, type OpenFbxFileResult } from "../../shared/ipc";

export function registerDialogIpc(): void {
  ipcMain.handle(IPC_CHANNELS.openFbxFile, async (): Promise<OpenFbxFileResult> => {
    const ownerWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const dialogOptions: OpenDialogOptions = {
      title: "Open FBX",
      properties: ["openFile"],
      filters: [{ name: "FBX files", extensions: ["fbx"] }],
    };

    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const fileBuffer = await readFile(filePath);
    const buffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    ) as ArrayBuffer;

    return {
      canceled: false,
      fileName: path.basename(filePath),
      buffer,
    };
  });
}
