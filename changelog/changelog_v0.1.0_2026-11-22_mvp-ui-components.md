## [0.1.0] - 2026-11-22

### Adicionado

- `src/components/Sidebar.tsx`: barra lateral recolhivel de 240px integrada ao `useWorkspaceStore`, com selecao/troca de workspace, criacao inline de arquivos `.excalidraw`, arvore recursiva de diretorios/arquivos e destaque da aba ativa.
- `src/components/TabBar.tsx`: barra horizontal de abas com alternancia, fechamento por botao ou clique do meio, indicador visual de alteracoes nao salvas, reabertura da barra lateral e status discreto de salvamento (`Salvando...`, `Não salvo`, `Salvo`).
- `src/components/DiagramEditor.tsx`: integracao persistente com `@excalidraw/excalidraw` via `excalidrawAPI` e `updateScene`, sanitizacao segura de `appState`, isolamento de arquivos e historico entre abas, controle de `isDirty` por `getSceneVersion` e estado vazio com acoes rapidas.

### Alterado

- `src/App.tsx`: composicao do layout horizontal (`.app-shell`) unindo `Sidebar`, `TabBar`, faixa condicional de erro e `DiagramEditor`, com restauracao automatica da arvore de arquivos no mount quando ha `workspacePath` salvo.
- `src/App.css`: tema escuro minimalista estilo macOS com tokens dedicados, estilizacao completa dos componentes do workspace e dimensionamento 100% do canvas `.excalidraw` sem overflow da viewport.
