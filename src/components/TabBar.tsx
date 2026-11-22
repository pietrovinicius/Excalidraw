import type { KeyboardEvent } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";

export function TabBar() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const sidebarOpen = useWorkspaceStore((state) => state.sidebarOpen);
  const isSaving = useWorkspaceStore((state) => state.isSaving);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);

  const activeTab =
    activeTabId === null
      ? undefined
      : tabs.find((tab) => tab.id === activeTabId);

  let statusText = "";
  let statusModifier = "";
  if (isSaving) {
    statusText = "Salvando...";
    statusModifier = "tabbar-status--saving";
  } else if (activeTab) {
    if (activeTab.isDirty) {
      statusText = "Não salvo";
      statusModifier = "tabbar-status--dirty";
    } else {
      statusText = "Salvo";
      statusModifier = "tabbar-status--saved";
    }
  }

  const statusClassName = statusModifier
    ? `tabbar-status ${statusModifier}`
    : "tabbar-status";

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    tabId: string
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveTab(tabId);
    }
  }

  return (
    <div className="tabbar">
      {!sidebarOpen && (
        <button
          type="button"
          className="tabbar-sidebar-toggle"
          title="Mostrar barra lateral"
          aria-label="Mostrar barra lateral"
          onClick={toggleSidebar}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" />
          </svg>
        </button>
      )}

      <div className="tabbar-list" role="tablist" aria-label="Abas abertas">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const tabClassName = isActive
            ? "tabbar-tab tabbar-tab--active"
            : "tabbar-tab";

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              className={tabClassName}
              onClick={() => setActiveTab(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  closeTab(tab.id);
                }
              }}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              <span className="tabbar-tab-title" title={tab.filePath}>
                {tab.title}
              </span>
              {tab.isDirty && (
                <span
                  className="tabbar-dirty-dot"
                  aria-label="Alterações não salvas"
                />
              )}
              <button
                type="button"
                className="tabbar-tab-close"
                aria-label={`Fechar ${tab.title}`}
                title={`Fechar ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className={statusClassName} role="status" aria-live="polite">
        {statusText}
      </div>
    </div>
  );
}
