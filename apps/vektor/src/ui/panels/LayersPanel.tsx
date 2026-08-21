import { useCallback, useState } from 'react';
import { app } from '../appShell';
import { useRerenderOn } from '../hooks';
import { ReorderNodeCommand, SetPropertyCommand } from '../../core/commands';
import { NodeId, getNode } from '../../core/model';

const BLEND_MODES: { value: GlobalCompositeOperation; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiplizieren' },
  { value: 'screen', label: 'Negativ multiplizieren' },
  { value: 'overlay', label: 'Ineinanderkopieren' },
  { value: 'darken', label: 'Abdunkeln' },
  { value: 'lighten', label: 'Aufhellen' },
  { value: 'difference', label: 'Differenz' },
];

export function LayersPanel(): JSX.Element {
  const subscribe = useCallback((l: () => void) => app.editor.subscribe(() => l()), []);
  useRerenderOn(subscribe);
  const [renamingId, setRenamingId] = useState<NodeId | null>(null);
  const [dragId, setDragId] = useState<NodeId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: NodeId; above: boolean } | null>(null);

  const { editor } = app;
  const { doc } = editor;
  const visualOrder = [...doc.rootChildren].reverse();
  const selectedNode = editor.selection[0] ? doc.nodes[editor.selection[0]] : undefined;

  const commitRename = (id: NodeId, name: string): void => {
    setRenamingId(null);
    const trimmed = name.trim();
    if (trimmed && trimmed !== getNode(doc, id).name) {
      editor.execute(new SetPropertyCommand('Umbenennen', [id], 'name', trimmed));
    }
  };

  const handleDrop = (): void => {
    if (dragId && dropTarget && dragId !== dropTarget.id) {
      const remaining = visualOrder.filter((id) => id !== dragId);
      let visualIndex = remaining.indexOf(dropTarget.id);
      if (!dropTarget.above) visualIndex += 1;
      const docIndex = remaining.length - visualIndex;
      editor.execute(new ReorderNodeCommand('Ebene verschieben', dragId, null, docIndex));
    }
    setDragId(null);
    setDropTarget(null);
  };

  return (
    <div className="panel grow">
      <div className="panel-header">Ebenen</div>
      <div className="layer-controls">
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          Deckkr.
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((selectedNode?.opacity ?? 1) * 100)}
            disabled={!selectedNode}
            onChange={(e) =>
              editor.execute(
                new SetPropertyCommand(
                  'Deckkraft',
                  [...editor.selection],
                  'opacity',
                  Number(e.target.value) / 100,
                  `opacity-${editor.selection.join(',')}`,
                ),
              )
            }
          />
        </label>
        <select
          style={{ width: 110 }}
          value={selectedNode?.blendMode ?? 'source-over'}
          disabled={!selectedNode}
          onChange={(e) =>
            editor.execute(
              new SetPropertyCommand('Füllmethode', [...editor.selection], 'blendMode', e.target.value),
            )
          }
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-body">
        {visualOrder.map((id) => {
          const node = getNode(doc, id);
          const selected = editor.selection.includes(id);
          const dropClass =
            dropTarget?.id === id ? (dropTarget.above ? ' drop-above' : ' drop-below') : '';
          return (
            <div
              key={id}
              className={`layer-row${selected ? ' selected' : ''}${dropClass}`}
              draggable={renamingId !== id}
              onDragStart={() => setDragId(id)}
              onDragOver={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                setDropTarget({ id, above: e.clientY < rect.top + rect.height / 2 });
              }}
              onDrop={handleDrop}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
              onClick={(e) => (e.shiftKey ? editor.toggleSelected(id) : editor.setSelection([id]))}
            >
              <button
                className={`layer-eye${node.visible ? '' : ' hidden-node'}`}
                title={node.visible ? 'Ausblenden' : 'Einblenden'}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.execute(new SetPropertyCommand('Sichtbarkeit', [id], 'visible', !node.visible));
                }}
              >
                {node.visible ? '👁' : '—'}
              </button>
              <span className="layer-name" onDoubleClick={() => setRenamingId(id)}>
                {renamingId === id ? (
                  <input
                    type="text"
                    autoFocus
                    defaultValue={node.name}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => commitRename(id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(id, (e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                ) : (
                  <>
                    {node.type === 'group' ? '📁 ' : ''}
                    {node.name}
                  </>
                )}
              </span>
            </div>
          );
        })}
        {visualOrder.length === 0 && <div className="props-empty">Keine Ebenen</div>}
      </div>
    </div>
  );
}
