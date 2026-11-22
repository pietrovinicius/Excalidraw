import { useEffect } from "react";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { DiagramEditor } from "./components/DiagramEditor";
import { useWorkspaceStore } from "./store/workspaceStore";

export default function App() {
  const error = useWorkspaceStore((state) => state.error);

  useEffect(() => {
    const state = useWorkspaceStore.getState();
    if (state.workspacePath) {
      void state.refreshFileTree();
    }
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TabBar />
        {error !== null && (
          <div className="app-error-banner" role="alert">
            {error}
          </div>
        )}
        <main className="app-editor-area">
          <DiagramEditor />
        </main>
      </div>
    </div>
  );
}
