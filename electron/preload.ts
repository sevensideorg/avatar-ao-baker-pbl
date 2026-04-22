import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type OpenFbxFileResult,
  type SavePngRequest,
  type SavePngResult,
} from "../shared/ipc";

contextBridge.exposeInMainWorld("avatarAo", {
  openFbxFile: (): Promise<OpenFbxFileResult> => ipcRenderer.invoke(IPC_CHANNELS.openFbxFile),
  savePng: (request: SavePngRequest): Promise<SavePngResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.savePng, request),
});
