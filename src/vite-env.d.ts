/// <reference types="vite/client" />

import type { OpenFbxFileResult, SavePngRequest, SavePngResult } from "../shared/ipc";

declare global {
  interface Window {
    avatarAo?: {
      openFbxFile: () => Promise<OpenFbxFileResult>;
      savePng: (request: SavePngRequest) => Promise<SavePngResult>;
    };
  }
}

export {};
