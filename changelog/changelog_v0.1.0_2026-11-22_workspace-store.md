## [0.1.0] - 2026-11-22

### Adicionado

- `src/store/workspaceStore.ts`: store global Zustand (`useWorkspaceStore`, interfaces tipadas e `WORKSPACE_PATH_STORAGE_KEY`) para gestao de workspace, arvore de arquivos, multiplas abas, rastreamento de versao/dirty state, salvamento concorrente e persistencia segura em `localStorage` via `fsService`.

### Alterado

- `src/types/diagram.ts`: interface `OpenTab` atualizada com `id`, `title`, `filePath`, `sceneData`, `lastSavedVersion`, `currentVersion`, `isDirty` e `lastSavedAt`.
