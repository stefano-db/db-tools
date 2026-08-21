import { useCallback } from 'react';
import { app } from '../appShell';
import { useRerenderOn } from '../hooks';
import { Matrix } from '../../core/geometry';
import { SetPropertyCommand, TransformNodesCommand } from '../../core/commands';

function NumberField({
  label,
  value,
  onCommit,
  min,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
}): JSX.Element {
  return (
    <>
      <label>{label}</label>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onCommit(next);
        }}
      />
    </>
  );
}

export function PropertiesPanel(): JSX.Element {
  const subscribe = useCallback((l: () => void) => app.editor.subscribe(() => l()), []);
  useRerenderOn(subscribe);
  const { editor } = app;
  const id = editor.selection.length === 1 ? editor.selection[0] : undefined;
  const node = id ? editor.doc.nodes[id] : undefined;

  if (!id || !node) {
    return (
      <div className="panel">
        <div className="panel-header">Eigenschaften</div>
        <div className="props-empty">
          {editor.selection.length > 1 ? `${editor.selection.length} Objekte ausgewählt` : 'Keine Auswahl'}
        </div>
      </div>
    );
  }

  const setPosition = (x: number, y: number): void => {
    const before = new Map([[id, node.transform.clone()]]);
    const t = node.transform;
    const after = new Map([[id, new Matrix(t.a, t.b, t.c, t.d, x, y)]]);
    editor.execute(new TransformNodesCommand('Position ändern', before, after, `props-pos-${id}`));
  };

  return (
    <div className="panel">
      <div className="panel-header">Eigenschaften</div>
      <div className="props-grid">
        <NumberField label="X" value={node.transform.e} onCommit={(v) => setPosition(v, node.transform.f)} />
        <NumberField label="Y" value={node.transform.f} onCommit={(v) => setPosition(node.transform.e, v)} />
        {node.type === 'rect' && (
          <>
            <NumberField
              label="B"
              value={node.width}
              min={1}
              onCommit={(v) =>
                editor.execute(new SetPropertyCommand('Breite', [id], 'width', Math.max(1, v), `props-w-${id}`))
              }
            />
            <NumberField
              label="H"
              value={node.height}
              min={1}
              onCommit={(v) =>
                editor.execute(new SetPropertyCommand('Höhe', [id], 'height', Math.max(1, v), `props-h-${id}`))
              }
            />
            <NumberField
              label="Ecken"
              value={node.cornerRadius}
              min={0}
              onCommit={(v) =>
                editor.execute(
                  new SetPropertyCommand('Eckenradius', [id], 'cornerRadius', Math.max(0, v), `props-r-${id}`),
                )
              }
            />
            <label>Fläche</label>
            <input
              type="color"
              value={node.fill?.color ?? '#000000'}
              onChange={(e) =>
                editor.execute(
                  new SetPropertyCommand(
                    'Fläche',
                    [id],
                    'fill',
                    { type: 'solid', color: e.target.value },
                    `props-fill-${id}`,
                  ),
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
