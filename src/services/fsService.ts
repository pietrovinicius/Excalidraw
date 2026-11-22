import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { FileNode } from "../types/diagram";

const EXCALIDRAW_EXTENSION = ".excalidraw";

/**
 * Validates that a file path targets a non-empty `.excalidraw` file
 * (case-insensitive) and whose basename is not literally `.excalidraw`.
 */
export function assertExcalidrawPath(filePath: string): void {
  if (filePath.trim().length === 0) {
    throw new Error("Diagram file path cannot be empty.");
  }

  if (!filePath.toLowerCase().endsWith(EXCALIDRAW_EXTENSION)) {
    throw new Error(
      `Invalid diagram file path "${filePath}": expected "${EXCALIDRAW_EXTENSION}" extension.`
    );
  }

  const normalized = filePath.replace(/\\/g, "/");
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (basename.toLowerCase() === EXCALIDRAW_EXTENSION) {
    throw new Error(
      `Invalid diagram file path "${filePath}": filename cannot be literally "${EXCALIDRAW_EXTENSION}".`
    );
  }
}

/**
 * Opens a native folder picker dialog and returns the selected workspace path,
 * or `null` if the user cancels.
 */
export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
  });

  return typeof selected === "string" ? selected : null;
}

/**
 * Lists directories and `.excalidraw` files inside the active workspace.
 */
export async function listWorkspaceFiles(
  workspacePath: string
): Promise<FileNode[]> {
  return invoke<FileNode[]>("list_workspace_files", { workspacePath });
}

/**
 * Reads the UTF-8 contents of a `.excalidraw` diagram inside the workspace.
 */
export async function readDiagramFile(
  workspacePath: string,
  filePath: string
): Promise<string> {
  assertExcalidrawPath(filePath);
  return invoke<string>("read_diagram_file", { workspacePath, filePath });
}

/**
 * Atomically writes diagram contents to a `.excalidraw` file inside the workspace.
 */
export async function writeDiagramFile(
  workspacePath: string,
  filePath: string,
  content: string
): Promise<void> {
  assertExcalidrawPath(filePath);
  return invoke<void>("write_diagram_file", {
    workspacePath,
    filePath,
    content,
  });
}

/**
 * Creates a new `.excalidraw` file at `relativePath` inside the workspace
 * and returns its canonical path.
 */
export async function createDiagramFile(
  workspacePath: string,
  relativePath: string
): Promise<string> {
  assertExcalidrawPath(relativePath);
  return invoke<string>("create_diagram_file", {
    workspacePath,
    relativePath,
  });
}
