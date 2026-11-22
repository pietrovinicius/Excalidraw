import { create } from "zustand";
import {
  createDiagramFile,
  listWorkspaceFiles,
  pickWorkspaceFolder,
  readDiagramFile,
  writeDiagramFile,
} from "../services/fsService";
import type { ExcalidrawSceneData, FileNode, OpenTab } from "../types/diagram";

export const WORKSPACE_PATH_STORAGE_KEY = "excalidraw-desktop:workspacePath";

const DEFAULT_SOURCE = "excalidraw-desktop";
const DEFAULT_SCENE_VERSION = 2;
const EXCALIDRAW_EXTENSION = ".excalidraw";

let activeSaveCount = 0;

export interface WorkspaceState {
  workspacePath: string | null;
  fileTree: FileNode[];
  tabs: OpenTab[];
  activeTabId: string | null;
  sidebarOpen: boolean;
  isSaving: boolean;
  error: string | null;
}

export interface WorkspaceActions {
  openWorkspace: () => Promise<void>;
  refreshFileTree: () => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  createNewFile: (fileName: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  updateTabScene: (
    tabId: string,
    sceneData: ExcalidrawSceneData,
    sceneVersion: number
  ) => void;
  saveTab: (tabId: string) => Promise<void>;
  toggleSidebar: () => void;
}

export interface WorkspaceStore extends WorkspaceState, WorkspaceActions {}

function getSafeLocalStorage(): Storage | null {
  try {
    if (
      typeof globalThis !== "undefined" &&
      "localStorage" in globalThis &&
      globalThis.localStorage !== null
    ) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function readStoredWorkspacePath(): string | null {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    const stored = storage.getItem(WORKSPACE_PATH_STORAGE_KEY);
    return typeof stored === "string" && stored.trim().length > 0 ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredWorkspacePath(workspacePath: string): void {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(WORKSPACE_PATH_STORAGE_KEY, workspacePath);
  } catch {
    // Ignore storage persistence failures in restricted environments.
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function extractFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  return lastSlashIndex === -1
    ? normalized
    : normalized.slice(lastSlashIndex + 1);
}

export function createDefaultSceneData(): ExcalidrawSceneData {
  return {
    type: "excalidraw",
    version: DEFAULT_SCENE_VERSION,
    source: DEFAULT_SOURCE,
    elements: [],
    appState: {},
    files: {},
  };
}

export function parseSceneData(rawContent: string): ExcalidrawSceneData {
  if (rawContent.trim().length === 0) {
    return createDefaultSceneData();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return createDefaultSceneData();
  }

  if (!isPlainObject(parsed)) {
    return createDefaultSceneData();
  }

  const version =
    typeof parsed.version === "number" && Number.isFinite(parsed.version)
      ? parsed.version
      : DEFAULT_SCENE_VERSION;
  const source =
    typeof parsed.source === "string" ? parsed.source : DEFAULT_SOURCE;
  const elements = Array.isArray(parsed.elements)
    ? (parsed.elements as ExcalidrawSceneData["elements"])
    : [];
  const appState = isPlainObject(parsed.appState)
    ? (parsed.appState as ExcalidrawSceneData["appState"])
    : {};
  const files = isPlainObject(parsed.files)
    ? (parsed.files as NonNullable<ExcalidrawSceneData["files"]>)
    : {};

  return {
    type: "excalidraw",
    version,
    source,
    elements,
    appState,
    files,
  };
}

export function computeSceneVersion(
  elements: ExcalidrawSceneData["elements"]
): number {
  let version = 0;
  for (const element of elements) {
    if (
      typeof element === "object" &&
      element !== null &&
      typeof element.version === "number" &&
      Number.isFinite(element.version)
    ) {
      version += element.version;
    }
  }
  return version;
}

export function normalizeDiagramFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (
    trimmed.length === 0 ||
    trimmed.endsWith("/") ||
    trimmed.endsWith("\\") ||
    trimmed.toLowerCase().endsWith(EXCALIDRAW_EXTENSION)
  ) {
    return trimmed;
  }
  return `${trimmed}${EXCALIDRAW_EXTENSION}`;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || "An unexpected error occurred.";
  }
  if (typeof err === "string") {
    return err;
  }
  return "An unexpected error occurred.";
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspacePath: readStoredWorkspacePath(),
  fileTree: [],
  tabs: [],
  activeTabId: null,
  sidebarOpen: true,
  isSaving: false,
  error: null,

  openWorkspace: async () => {
    try {
      const selectedPath = await pickWorkspaceFolder();
      if (selectedPath === null) {
        return;
      }

      const fileTree = await listWorkspaceFiles(selectedPath);
      writeStoredWorkspacePath(selectedPath);

      set((state) => {
        const isSameWorkspace = state.workspacePath === selectedPath;
        return {
          workspacePath: selectedPath,
          fileTree,
          error: null,
          tabs: isSameWorkspace ? state.tabs : [],
          activeTabId: isSameWorkspace ? state.activeTabId : null,
        };
      });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  refreshFileTree: async () => {
    const workspacePath = get().workspacePath;
    if (!workspacePath) {
      return;
    }

    try {
      const fileTree = await listWorkspaceFiles(workspacePath);
      if (get().workspacePath !== workspacePath) {
        return;
      }
      set({ fileTree, error: null });
    } catch (err) {
      if (get().workspacePath === workspacePath) {
        set({ error: getErrorMessage(err) });
      }
    }
  },

  openFile: async (filePath: string) => {
    const { tabs, workspacePath } = get();
    const existingTab = tabs.find(
      (tab) => tab.id === filePath || tab.filePath === filePath
    );
    if (existingTab) {
      set({ activeTabId: existingTab.id, error: null });
      return;
    }

    if (!workspacePath) {
      set({ error: "No active workspace selected." });
      return;
    }

    try {
      const rawContent = await readDiagramFile(workspacePath, filePath);
      const sceneData = parseSceneData(rawContent);
      const initialVersion = computeSceneVersion(sceneData.elements);
      const newTab: OpenTab = {
        id: filePath,
        title: extractFileName(filePath),
        filePath,
        sceneData,
        lastSavedVersion: initialVersion,
        currentVersion: initialVersion,
        isDirty: false,
        lastSavedAt: null,
      };

      set((state) => {
        if (state.workspacePath !== workspacePath) {
          return state;
        }
        const concurrentExisting = state.tabs.find(
          (tab) => tab.id === filePath || tab.filePath === filePath
        );
        if (concurrentExisting) {
          return {
            activeTabId: concurrentExisting.id,
            error: null,
          };
        }
        return {
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
          error: null,
        };
      });
    } catch (err) {
      if (get().workspacePath === workspacePath) {
        set({ error: getErrorMessage(err) });
      }
    }
  },

  createNewFile: async (fileName: string) => {
    const workspacePath = get().workspacePath;
    if (!workspacePath) {
      set({ error: "No active workspace selected." });
      return;
    }

    try {
      const normalized = normalizeDiagramFileName(fileName);
      const createdPath = await createDiagramFile(workspacePath, normalized);
      const fileTree = await listWorkspaceFiles(workspacePath);
      if (get().workspacePath !== workspacePath) {
        return;
      }
      set({ fileTree, error: null });
      await get().openFile(createdPath);
    } catch (err) {
      if (get().workspacePath === workspacePath) {
        set({ error: getErrorMessage(err) });
      }
    }
  },

  setActiveTab: (tabId: string) => {
    set((state) => {
      const exists = state.tabs.some((tab) => tab.id === tabId);
      if (!exists) {
        return state;
      }
      return { activeTabId: tabId };
    });
  },

  closeTab: (tabId: string) => {
    set((state) => {
      const closedIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (closedIndex === -1) {
        return state;
      }

      const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
      let nextActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        nextActiveTabId =
          nextTabs.length > 0
            ? nextTabs[Math.min(closedIndex, nextTabs.length - 1)].id
            : null;
      }

      return {
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
      };
    });
  },

  updateTabScene: (
    tabId: string,
    sceneData: ExcalidrawSceneData,
    sceneVersion: number
  ) => {
    set((state) => {
      const exists = state.tabs.some((tab) => tab.id === tabId);
      if (!exists) {
        return state;
      }

      const nextTabs = state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              sceneData,
              currentVersion: sceneVersion,
              isDirty: sceneVersion !== tab.lastSavedVersion,
            }
          : tab
      );

      return { tabs: nextTabs };
    });
  },

  saveTab: async (tabId: string) => {
    const { workspacePath, tabs } = get();
    const targetTab = tabs.find((tab) => tab.id === tabId);
    if (!targetTab) {
      return;
    }
    if (!workspacePath) {
      set({ error: "No active workspace selected." });
      return;
    }

    const versionBeingSaved = targetTab.currentVersion;
    const filePath = targetTab.filePath;
    const sceneDataSnapshot = targetTab.sceneData;

    activeSaveCount += 1;
    try {
      set({ isSaving: true, error: null });
      const serialized = JSON.stringify(sceneDataSnapshot, null, 2) + "\n";
      await writeDiagramFile(workspacePath, filePath, serialized);

      const savedAt = Date.now();
      set((state) => {
        if (state.workspacePath !== workspacePath) {
          return state;
        }
        return {
          tabs: state.tabs.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  lastSavedVersion: versionBeingSaved,
                  isDirty: tab.currentVersion !== versionBeingSaved,
                  lastSavedAt: savedAt,
                }
              : tab
          ),
        };
      });
    } catch (err) {
      if (get().workspacePath === workspacePath) {
        set({ error: getErrorMessage(err) });
      }
    } finally {
      activeSaveCount = Math.max(0, activeSaveCount - 1);
      set({ isSaving: activeSaveCount > 0 });
    }
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },
}));
