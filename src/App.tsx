import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./App.css";

export default function App() {
  return (
    <main className="app-viewport">
      <Excalidraw theme="dark" />
    </main>
  );
}
