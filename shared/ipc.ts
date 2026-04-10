export const IPC_CHANNELS = {
  openFbxFile: "dialog:open-fbx-file",
  savePng: "file:save-png",
} as const;

export interface OpenFbxFileResult {
  canceled: boolean;
  fileName?: string;
  buffer?: ArrayBuffer;
  error?: string;
}

export interface SavePngRequest {
  defaultFileName: string;
  buffer: ArrayBuffer;
}

export interface SavePngResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}
