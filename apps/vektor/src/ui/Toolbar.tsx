import { useCallback } from 'react';
import { app } from './appShell';
import { useRerenderOn } from './hooks';

const ICONS: Record<string, JSX.Element> = {
  move: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 1l8 7-3.5.5L10.5 13l-2 1-2-4.5L4 12V1z" />
    </svg>
  ),
  rect: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="3.5" width="11" height="9" />
    </svg>
  ),
};

export function Toolbar(): JSX.Element {
  const subscribe = useCallback((l: () => void) => app.toolManager.subscribe(l), []);
  useRerenderOn(subscribe);
  const activeId = app.toolManager.active?.id;

  return (
    <div className="toolbar">
      {app.toolManager.list().map((tool) => (
        <button
          key={tool.id}
          className={`tool-button${tool.id === activeId ? ' active' : ''}`}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => app.toolManager.activate(tool.id)}
        >
          {ICONS[tool.id] ?? tool.label[0]}
        </button>
      ))}
    </div>
  );
}
