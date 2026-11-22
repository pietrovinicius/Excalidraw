import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface ExcalidrawSceneData {
  type: "excalidraw";
  version: number;
  source?: string;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files?: BinaryFiles;
}

export interface OpenTab {
  path: string;
  name: string;
  isDirty: boolean;
  sceneData: ExcalidrawSceneData | null;
}
