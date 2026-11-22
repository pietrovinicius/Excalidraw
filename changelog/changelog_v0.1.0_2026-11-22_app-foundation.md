## [0.1.0] - 2026-11-22

### Adicionado

- `AGENTS.md`: diretrizes de arquitetura, filosofia Simple is More, fronteiras rígidas de camadas e regras de segurança do projeto desktop.
- `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts` e `index.html`: configuração base com Vite, React 18, TypeScript estrito, Zustand e dependências do Tauri v2 e `@excalidraw/excalidraw`.
- `src/App.tsx`, `src/App.css`, `src/main.tsx` e `src/vite-env.d.ts`: fundação do frontend renderizando `<Excalidraw theme="dark" />` em tela cheia (`100vw x 100vh`) com estilos base sem margens.
- `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs` e `src-tauri/src/main.rs`: esqueleto nativo Tauri v2 configurado para `http://localhost:1420` em desenvolvimento e `../dist` em produção.
