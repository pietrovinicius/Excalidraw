## [0.1.0] - 2026-11-22

### Adicionado

- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/capabilities/default.json` e `package.json`: plugin `tauri-plugin-dialog` / `@tauri-apps/plugin-dialog` e permissao `dialog:default`.
- `src-tauri/icons/icon.png`: icone RGBA minimo necessario para `tauri::generate_context!()` compilar no macOS.
- `src-tauri/src/fs_commands.rs` e `src-tauri/src/lib.rs`: comandos Tauri v2 seguros (`list_workspace_files`, `read_diagram_file`, `write_diagram_file` com escrita atomica e `create_diagram_file`) com canonicalizacao de workspace, bloqueio de path traversal/symlinks e validacao `.excalidraw`, alem de testes unitarios.
- `src/types/diagram.ts` e `src/services/fsService.ts`: contratos TypeScript (`FileNode`, `ExcalidrawSceneData`, `OpenTab`) e camada de servico tipada para dialogo e comandos de filesystem.
