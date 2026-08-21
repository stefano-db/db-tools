import { useCallback, useReducer } from 'react';
import { app, useUiStore } from './appShell';
import { useRerenderOn } from './hooks';
import { exportPng } from '../io/exportPng';
import { OptionsBarControl } from '../tools/types';

function ControlField({ control, onChanged }: { control: OptionsBarControl; onChanged: () => void }): JSX.Element {
  const value = control.get();
  return (
    <label className="options-field">
      {control.label}
      {control.kind === 'color' && (
        <input
          type="color"
          value={String(value)}
          onChange={(e) => {
            control.set(e.target.value);
            onChanged();
          }}
        />
      )}
      {control.kind === 'number' && (
        <input
          type="number"
          style={{ width: 64 }}
          value={Number(value)}
          min={control.min}
          max={control.max}
          step={control.step}
          onChange={(e) => {
            control.set(Number(e.target.value));
            onChanged();
          }}
        />
      )}
      {control.kind === 'checkbox' && (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => {
            control.set(e.target.checked);
            onChanged();
          }}
        />
      )}
    </label>
  );
}

export function OptionsBar(): JSX.Element {
  const subscribe = useCallback((l: () => void) => app.toolManager.subscribe(l), []);
  useRerenderOn(subscribe);
  const [, force] = useReducer((c: number) => c + 1, 0);
  const exportScale = useUiStore((s) => s.exportScale);
  const setExportScale = useUiStore((s) => s.setExportScale);

  const tool = app.toolManager.active;
  const controls = tool?.getOptionsBar?.() ?? [];

  return (
    <div className="options-bar">
      <span className="tool-name">{tool ? `${tool.label} (${tool.shortcut})` : ''}</span>
      {controls.map((control) => (
        <ControlField key={control.id} control={control} onChanged={() => force()} />
      ))}
      <span className="spacer" />
      <label className="options-field">
        Export
        <select
          style={{ width: 60 }}
          value={exportScale}
          onChange={(e) => setExportScale(Number(e.target.value) as 1 | 2 | 3)}
        >
          <option value={1}>@1x</option>
          <option value={2}>@2x</option>
          <option value={3}>@3x</option>
        </select>
      </label>
      <button className="button" onClick={() => void exportPng(app.editor.doc, exportScale)}>
        PNG …
      </button>
    </div>
  );
}
