import { useCallback } from 'react';
import { app } from './appShell';
import { useRerenderOn } from './hooks';
import { Toolbar } from './Toolbar';
import { OptionsBar } from './OptionsBar';
import { CanvasHost } from './CanvasHost';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { HistoryPanel } from './panels/HistoryPanel';

function StatusBar(): JSX.Element {
  const subscribeViewport = useCallback((l: () => void) => app.viewport.subscribe(l), []);
  useRerenderOn(subscribeViewport);
  const { doc } = app.editor;
  return (
    <div className="status-bar">
      <span>{Math.round(app.viewport.scale * 100)} %</span>
      <span>
        {doc.width} × {doc.height} px
      </span>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <div className="app">
      <OptionsBar />
      <Toolbar />
      <div className="canvas-area">
        <CanvasHost />
      </div>
      <div className="panels">
        <PropertiesPanel />
        <LayersPanel />
        <HistoryPanel />
      </div>
      <StatusBar />
    </div>
  );
}
