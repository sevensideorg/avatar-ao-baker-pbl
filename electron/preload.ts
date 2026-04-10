import { contextBridge, ipcRenderer } from "electron";
import type { OpenFbxFileResult, SavePngRequest, SavePngResult } from "../shared/ipc";

const IPC_CHANNELS = {
  openFbxFile: "dialog:open-fbx-file",
  savePng: "file:save-png",
} as const;

contextBridge.exposeInMainWorld("avatarAo", {
  openFbxFile: (): Promise<OpenFbxFileResult> => ipcRenderer.invoke(IPC_CHANNELS.openFbxFile),
  savePng: (request: SavePngRequest): Promise<SavePngResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.savePng, request),
});
