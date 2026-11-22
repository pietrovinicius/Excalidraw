import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
} from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { ExcalidrawSceneData } from "../types/diagram";

type SafeAppStateKey =
  | "viewBackgroundColor"
  | "gridSize"
  | "gridStep"
  | "gridModeEnabled"
  | "scrollX"
  | "scrollY"
  | "zoom";

type SafeSceneAppState = Pick<AppState, SafeAppStateKey>;

const DEFAULT_SCENE_APP_STATE: SafeSceneAppState = {
  viewBackgroundColor: "#ffffff",
  gridSize: 20,
  gridStep: 5,
  gridModeEnabled: false,
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 as NormalizedZoomValue },
};

function sanitizeAppState(
  appState?: Partial<AppState> | null
): Partial<SafeSceneAppState> {
  if (!appState || typeof appState !== "object") {
    return {};
  }

  const sanitized: Partial<SafeSceneAppState> = {};

  if (
    typeof appState.viewBackgroundColor === "string" &&
    appState.viewBackgroundColor.trim().length > 0
  ) {
    sanitized.viewBackgroundColor = appState.viewBackgroundColor;
  }

  if (
    typeof appState.gridSize === "number" &&
    Number.isFinite(appState.gridSize) &&
    appState.gridSize > 0
  ) {
    sanitized.gridSize = appState.gridSize;
  }

  if (
    typeof appState.gridStep === "number" &&
    Number.isFinite(appState.gridStep) &&
    appState.gridStep > 0
  ) {
    sanitized.gridStep = appState.gridStep;
  }

  if (typeof appState.gridModeEnabled === "boolean") {
    sanitized.gridModeEnabled = appState.gridModeEnabled;
  }

  if (
    typeof appState.scrollX === "number" &&
    Number.isFinite(appState.scrollX)
  ) {
    sanitized.scrollX = appState.scrollX;
  }

  if (
    typeof appState.scrollY === "number" &&
    Number.isFinite(appState.scrollY)
  ) {
    sanitized.scrollY = appState.scrollY;
  }

  if (
    appState.zoom &&
    typeof appState.zoom === "object" &&
    typeof appState.zoom.value === "number" &&
    Number.isFinite(appState.zoom.value) &&
    appState.zoom.value > 0
  ) {
    sanitized.zoom = {
      value: appState.zoom.value as NormalizedZoomValue,
    };
  }

  return sanitized;
}

function buildLoadAppState(
  appState?: Partial<AppState> | null
): SafeSceneAppState {
  return {
    ...DEFAULT_SCENE_APP_STATE,
    ...sanitizeAppState(appState),
  };
}

function extractTabFiles(
  elements: readonly OrderedExcalidrawElement[],
  files: BinaryFiles
): BinaryFiles {
  const tabFiles: BinaryFiles = {};
  for (const element of elements) {
    if (element.type === "image" && element.fileId) {
      const fileData = files[element.fileId];
      if (fileData) {
        tabFiles[element.fileId] = fileData;
      }
    }
  }
  return tabFiles;
}

export function DiagramEditor() {
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const hasActiveTab = useWorkspaceStore(
    (state) =>
      state.activeTabId !== null &&
      state.tabs.some((tab) => tab.id === state.activeTabId)
  );
  const workspacePath = useWorkspaceStore((state) => state.workspacePath);
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace);
  const createNewFile = useWorkspaceStore((state) => state.createNewFile);

  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [isSubmittingFile, setIsSubmittingFile] = useState(false);

  const isSyncingSceneRef = useRef(false);
  const loadedTabIdRef = useRef<string | null>(null);
  const lastSyncedVersionRef = useRef<number | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI((prev) => (prev === api ? prev : api));
  }, []);

  const getInitialData = useCallback((): ExcalidrawInitialDataState | null => {
    const state = useWorkspaceStore.getState();
    if (!state.activeTabId) {
      return null;
    }
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab) {
      return null;
    }

    return {
      elements: [...activeTab.sceneData.elements],
      appState: buildLoadAppState(activeTab.sceneData.appState),
      files: activeTab.sceneData.files
        ? { ...activeTab.sceneData.files }
        : undefined,
    };
  }, []);

  useEffect(() => {
    if (isCreatingFile && !hasActiveTab) {
      newFileInputRef.current?.focus();
    }
  }, [isCreatingFile, hasActiveTab]);

  useEffect(() => {
    if (hasActiveTab && isCreatingFile) {
      setIsCreatingFile(false);
      setNewFileName("");
    }
  }, [hasActiveTab, isCreatingFile]);

  useEffect(() => {
    if (!hasActiveTab || !activeTabId) {
      loadedTabIdRef.current = null;
      lastSyncedVersionRef.current = null;
      isSyncingSceneRef.current = false;
      if (excalidrawAPI !== null) {
        setExcalidrawAPI(null);
      }
      return;
    }

    if (!excalidrawAPI) {
      loadedTabIdRef.current = null;
      lastSyncedVersionRef.current = null;
      return;
    }

    const activeTab = useWorkspaceStore
      .getState()
      .tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab) {
      loadedTabIdRef.current = null;
      lastSyncedVersionRef.current = null;
      return;
    }

    isSyncingSceneRef.current = true;
    loadedTabIdRef.current = null;

    if (activeTab.sceneData.files) {
      const binaryFiles = Object.values(activeTab.sceneData.files);
      if (binaryFiles.length > 0) {
        excalidrawAPI.addFiles(binaryFiles);
      }
    }

    excalidrawAPI.updateScene({
      elements: [...activeTab.sceneData.elements],
      appState: buildLoadAppState(activeTab.sceneData.appState),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    excalidrawAPI.history.clear();

    loadedTabIdRef.current = activeTab.id;
    lastSyncedVersionRef.current = getSceneVersion(
      excalidrawAPI.getSceneElementsIncludingDeleted()
    );

    const rafId = window.requestAnimationFrame(() => {
      if (loadedTabIdRef.current === activeTab.id) {
        lastSyncedVersionRef.current = getSceneVersion(
          excalidrawAPI.getSceneElementsIncludingDeleted()
        );
      }
      isSyncingSceneRef.current = false;
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [activeTabId, hasActiveTab, excalidrawAPI]);

  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (isSyncingSceneRef.current) {
        return;
      }

      const state = useWorkspaceStore.getState();
      if (!state.activeTabId || loadedTabIdRef.current !== state.activeTabId) {
        return;
      }

      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!activeTab) {
        return;
      }

      const nextVersion = getSceneVersion(elements);
      if (
        nextVersion === activeTab.currentVersion ||
        nextVersion === lastSyncedVersionRef.current
      ) {
        return;
      }

      const nextSceneData: ExcalidrawSceneData = {
        type: "excalidraw",
        version: activeTab.sceneData.version,
        source: activeTab.sceneData.source,
        elements: [...elements],
        appState: sanitizeAppState(appState),
        files: extractTabFiles(elements, files),
      };

      lastSyncedVersionRef.current = nextVersion;
      state.updateTabScene(activeTab.id, nextSceneData, nextVersion);
    },
    []
  );

  const handleOpenWorkspace = () => {
    setIsCreatingFile(false);
    setNewFileName("");
    void openWorkspace();
  };

  const handleStartNewDiagram = async () => {
    if (!workspacePath) {
      await openWorkspace();
      if (!useWorkspaceStore.getState().workspacePath) {
        return;
      }
    }

    if (isCreatingFile) {
      newFileInputRef.current?.focus();
      return;
    }

    setIsCreatingFile(true);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed || isSubmittingFile) {
      return;
    }

    setIsSubmittingFile(true);
    try {
      await createNewFile(trimmed);
      if (useWorkspaceStore.getState().error === null) {
        setNewFileName("");
        setIsCreatingFile(false);
      }
    } finally {
      setIsSubmittingFile(false);
    }
  };

  const handleNewFileKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setNewFileName("");
      setIsCreatingFile(false);
    }
  };

  return (
    <section className="editor-container">
      {hasActiveTab ? (
        <div className="editor-canvas">
          <Excalidraw
            theme="dark"
            initialData={getInitialData}
            excalidrawAPI={handleExcalidrawAPI}
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="editor-empty">
          <h2 className="editor-empty-title">Nenhum diagrama aberto</h2>
          <p className="editor-empty-subtitle">
            {workspacePath
              ? "Selecione um arquivo na barra lateral ou crie um novo diagrama."
              : "Abra uma pasta para visualizar ou criar diagramas .excalidraw."}
          </p>
          <div className="editor-empty-actions">
            <button
              type="button"
              className="editor-btn editor-btn--secondary"
              onClick={handleOpenWorkspace}
            >
              Abrir Pasta
            </button>
            <button
              type="button"
              className="editor-btn editor-btn--primary"
              onClick={() => {
                void handleStartNewDiagram();
              }}
            >
              Novo Diagrama
            </button>
          </div>
          {isCreatingFile && (
            <form className="editor-empty-form" onSubmit={handleCreateSubmit}>
              <input
                ref={newFileInputRef}
                type="text"
                className="editor-empty-input"
                value={newFileName}
                onChange={(event) => setNewFileName(event.target.value)}
                onKeyDown={handleNewFileKeyDown}
                placeholder="novo-diagrama.excalidraw"
                aria-label="Nome do novo diagrama"
                disabled={isSubmittingFile}
              />
            </form>
          )}
        </div>
      )}
    </section>
  );
}
