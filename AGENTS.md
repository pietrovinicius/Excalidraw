# Excalidraw Desktop (AGENTS.md)

App desktop local-first para diagramas `.excalidraw` construído com Tauri v2, React e TypeScript.

## Filosofia: Simple is More

Antes de decidir arquitetura, criar módulos ou introduzir abstrações, ler a seção `Filosofia global: Simple is More` em `/Users/pietrodapenhadelima/.agents/policies/pietro-law.md`.

Aplicação neste projeto Tauri v2 + React + TypeScript:
- Começar pela solução mais simples que preserve legibilidade, manutenção, previsibilidade e testabilidade.
- Organizar módulos com alta coesão e baixo acoplamento, dando a cada camada uma responsabilidade clara.
- Evoluir a estrutura progressivamente conforme necessidade concreta, sem abstrações prematuras, wrappers triviais ou camadas especulativas.
- Preservar a stack, os contratos públicos de tipos e as restrições de segurança.

## Stack

- **Desktop/Backend:** Tauri v2 (Rust)
- **Frontend:** React, TypeScript, Vite
- **Estado global:** Zustand
- **Canvas:** `@excalidraw/excalidraw`

## Fronteiras rígidas de pastas

Respeitar o isolamento estrito entre camadas:
- `src-tauri/src/`: apenas comandos Tauri de filesystem e configuração nativa.
- `src/types/`: contratos de tipos compartilhados entre camadas.
- `src/services/`: única camada autorizada a chamar `invoke()` e plugins do Tauri.
- `src/store/`: estado global em Zustand (sem chamadas diretas de UI).
- `src/components/`: componentes React puros ligados à store (sem chamadas diretas a `invoke()` ou plugins Tauri).

## Segurança

- Validar explicitamente a extensão `.excalidraw` em toda operação de arquivo.
- Impedir path traversal fora do workspace ativo em qualquer leitura, escrita ou navegação de caminho, com validação obrigatória nos comandos Rust em `src-tauri/src/`.

## Entrega e escopo

- Alterar apenas os arquivos estritamente necessários à tarefa atual; não refatorar arquivos fora do escopo.
- Manter contratos em `src/types/` sincronizados com `src-tauri/src/` e `src/services/` a cada mudança de interface.
