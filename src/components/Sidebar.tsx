import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { extractFileName, useWorkspaceStore } from "../store/workspaceStore";
import type { FileNode } from "../types/diagram";

function getWorkspaceName(workspacePath: string): string {
  const trimmed = workspacePath.replace(/[\\/]+$/, "");
  if (trimmed.length === 0) {
    return workspacePath;
  }
  return extractFileName(trimmed) || workspacePath;
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.4 1.5h4.8A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

function CollapseSidebarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.8" />
      <path d="M6 2.5v11" />
    </svg>
  );
}

interface TreeNodeItemProps {
  node: FileNode;
  depth: number;
  activeFilePath: string | null;
  collapsedDirs: ReadonlySet<string>;
  onToggleDir: (dirPath: string) => void;
  onOpenFile: (filePath: string) => void;
}

function TreeNodeItem({
  node,
  depth,
  activeFilePath,
  collapsedDirs,
  onToggleDir,
  onOpenFile,
}: TreeNodeItemProps) {
  const indentStyle = { paddingLeft: `${10 + depth * 14}px` };

  if (node.isDir) {
    const isExpanded = !collapsedDirs.has(node.path);
    return (
      <>
        <button
          type="button"
          className="sidebar-node-btn sidebar-node-btn--dir"
          style={indentStyle}
          title={node.path}
          aria-expanded={isExpanded}
          onClick={() => onToggleDir(node.path)}
        >
          <span className="sidebar-chevron" aria-hidden="true">
            {isExpanded ? "▾" : "▸"}
          </span>
          <span className="sidebar-node-label">{node.name}</span>
        </button>
        {isExpanded &&
          node.children?.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              collapsedDirs={collapsedDirs}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
      </>
    );
  }

  const isActive = activeFilePath === node.path;
  const fileBtnClass = isActive
    ? "sidebar-node-btn sidebar-node-btn--file sidebar-node-btn--active"
    : "sidebar-node-btn sidebar-node-btn--file";

  return (
    <button
      type="button"
      className={fileBtnClass}
      style={indentStyle}
      title={node.path}
      aria-current={isActive ? "page" : undefined}
      onClick={() => onOpenFile(node.path)}
    >
      <span className="sidebar-node-label">{node.name}</span>
    </button>
  );
}

export function Sidebar() {
  const workspacePath = useWorkspaceStore((state) => state.workspacePath);
  const fileTree = useWorkspaceStore((state) => state.fileTree);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const sidebarOpen = useWorkspaceStore((state) => state.sidebarOpen);
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const createNewFile = useWorkspaceStore((state) => state.createNewFile);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);

  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsCreatingFile(false);
    setNewFileName("");
    setCollapsedDirs(new Set());
  }, [workspacePath]);

  useEffect(() => {
    if (isCreatingFile && sidebarOpen) {
      newFileInputRef.current?.focus();
    }
  }, [isCreatingFile, sidebarOpen]);

  const activeFilePath =
    tabs.find((tab) => tab.id === activeTabId)?.filePath ?? activeTabId;

  function handleToggleNewFile(): void {
    if (isCreatingFile) {
      setIsCreatingFile(false);
      setNewFileName("");
    } else {
      setIsCreatingFile(true);
    }
  }

  async function handleCreateFileSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmedName = newFileName.trim();
    if (trimmedName.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createNewFile(trimmedName);
      setNewFileName("");
      setIsCreatingFile(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNewFileKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      setNewFileName("");
      setIsCreatingFile(false);
    }
  }

  function handleToggleDir(dirPath: string): void {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }

  function handleOpenFile(filePath: string): void {
    void openFile(filePath);
  }

  return (
    <aside
      className={sidebarOpen ? "sidebar" : "sidebar sidebar--collapsed"}
      aria-label="Explorador de arquivos"
      aria-hidden={!sidebarOpen}
    >
      <header className="sidebar-header">
        {workspacePath === null ? (
          <>
            <button
              type="button"
              className="sidebar-open-btn"
              onClick={() => void openWorkspace()}
            >
              Abrir Pasta
            </button>
            <button
              type="button"
              className="sidebar-icon-btn"
              title="Recolher barra lateral"
              aria-label="Recolher barra lateral"
              onClick={toggleSidebar}
            >
              <CollapseSidebarIcon />
            </button>
          </>
        ) : (
          <>
            <span className="sidebar-workspace-name" title={workspacePath}>
              {getWorkspaceName(workspacePath)}
            </span>
            <div className="sidebar-actions">
              <button
                type="button"
                className="sidebar-icon-btn"
                title="Trocar Pasta"
                aria-label="Trocar Pasta"
                onClick={() => void openWorkspace()}
              >
                <FolderIcon />
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                title="Novo arquivo .excalidraw"
                aria-label="Novo arquivo"
                aria-expanded={isCreatingFile}
                onClick={handleToggleNewFile}
              >
                <PlusIcon />
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                title="Recolher barra lateral"
                aria-label="Recolher barra lateral"
                onClick={toggleSidebar}
              >
                <CollapseSidebarIcon />
              </button>
            </div>
          </>
        )}
      </header>

      {workspacePath !== null && isCreatingFile && (
        <form
          className="sidebar-new-file-form"
          onSubmit={(event) => {
            void handleCreateFileSubmit(event);
          }}
        >
          <input
            ref={newFileInputRef}
            type="text"
            className="sidebar-new-file-input"
            placeholder="novo-diagrama.excalidraw"
            aria-label="Nome do novo arquivo .excalidraw"
            value={newFileName}
            disabled={isSubmitting}
            onChange={(event) => setNewFileName(event.target.value)}
            onKeyDown={handleNewFileKeyDown}
          />
        </form>
      )}

      <nav className="sidebar-tree" aria-label="Arquivos do workspace">
        {workspacePath === null ? (
          <div className="sidebar-empty">Nenhuma pasta aberta</div>
        ) : fileTree.length === 0 ? (
          <div className="sidebar-empty">Nenhum arquivo .excalidraw</div>
        ) : (
          fileTree.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              activeFilePath={activeFilePath}
              collapsedDirs={collapsedDirs}
              onToggleDir={handleToggleDir}
              onOpenFile={handleOpenFile}
            />
          ))
        )}
      </nav>
    </aside>
  );
}
