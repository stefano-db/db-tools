import { createRoot } from 'react-dom/client';
import { App } from './App';
import { app, useUiStore } from './appShell';
import { installKeymap } from '../keymap/registry';
import { registerDefaultBindings } from '../keymap/bindings';
import { exportPng } from '../io/exportPng';
import './theme.css';

installKeymap(window);
registerDefaultBindings({
  editor: app.editor,
  viewport: app.viewport,
  toolManager: app.toolManager,
  getViewSize: () => app.renderHooks.getViewSize(),
  setSpacePan: (active) => useUiStore.getState().setSpacePan(active),
  exportPng: () => {
    void exportPng(app.editor.doc, useUiStore.getState().exportScale);
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('#root fehlt');
createRoot(container).render(<App />);
