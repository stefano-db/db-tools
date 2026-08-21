import { Editor } from '../core/editor';
import { Matrix } from '../core/geometry';
import { NodeId } from '../core/model';
import { TransformNodesCommand, snapshotTransforms } from '../core/commands';
import { Viewport } from '../render/viewport';
import { ToolManager } from '../tools/toolManager';
import { registerShortcut, registerHold } from './registry';

export interface BindingDeps {
  editor: Editor;
  viewport: Viewport;
  toolManager: ToolManager;
  getViewSize(): { width: number; height: number };
  setSpacePan(active: boolean): void;
  exportPng(): void;
}

/** Sämtliche Shortcuts der App — einzige Registrierungsstelle (Rule 3). */
export function registerDefaultBindings(deps: BindingDeps): () => void {
  const { editor, viewport, toolManager } = deps;
  const disposers: (() => void)[] = [];
  const add = (combo: string, label: string, handler: (evt: KeyboardEvent) => void, allowRepeat = false): void => {
    disposers.push(registerShortcut({ combo, label, handler, allowRepeat }));
  };

  // Werkzeuge
  add('v', 'Verschieben-Werkzeug', () => toolManager.activate('move'));
  add('u', 'Rechteck-Werkzeug', () => toolManager.activate('rect'));

  // Bearbeiten
  add('mod+z', 'Rückgängig', () => editor.undo(), true);
  add('mod+shift+z', 'Wiederherstellen', () => editor.redo(), true);
  add('mod+d', 'Auswahl aufheben', () => editor.deselect());
  add('mod+a', 'Alles auswählen', () => editor.selectAll());
  add('mod+j', 'Duplizieren', () => editor.duplicateSelection());
  add('delete', 'Löschen', () => editor.deleteSelection());
  add('backspace', 'Löschen', () => editor.deleteSelection());
  add('mod+g', 'Gruppieren', () => editor.groupSelection());
  add('mod+shift+g', 'Gruppierung aufheben', () => editor.ungroupSelection());

  // Z-Order
  add('mod+]', 'Nach vorne', () => editor.reorderSelection(1));
  add('mod+[', 'Nach hinten', () => editor.reorderSelection(-1));
  add('mod+shift+]', 'In den Vordergrund', () => editor.reorderSelection(1, true));
  add('mod+shift+[', 'In den Hintergrund', () => editor.reorderSelection(-1, true));

  // Zoom
  const center = (): { x: number; y: number } => {
    const size = deps.getViewSize();
    return { x: size.width / 2, y: size.height / 2 };
  };
  add('mod+0', 'Einpassen', () => {
    const size = deps.getViewSize();
    viewport.fit(editor.doc.width, editor.doc.height, size.width, size.height);
  });
  add('mod+1', '100 %', () => {
    const size = deps.getViewSize();
    viewport.actualSize(editor.doc.width, editor.doc.height, size.width, size.height);
  });
  add('mod+=', 'Vergrößern', () => viewport.zoomAt(center(), 1.25), true);
  add('mod++', 'Vergrößern', () => viewport.zoomAt(center(), 1.25), true);
  add('mod+-', 'Verkleinern', () => viewport.zoomAt(center(), 0.8), true);

  // Pfeiltasten: Auswahl verschieben (1px, Shift = 10px), coalesced pro Richtung+Schrittweite
  const nudge = (dx: number, dy: number, evt: KeyboardEvent): void => {
    if (editor.selection.length === 0) return;
    const step = evt.shiftKey ? 10 : 1;
    const before = snapshotTransforms(editor.doc, [...editor.selection]);
    const after = new Map<NodeId, Matrix>();
    for (const [id, m] of before) after.set(id, Matrix.translation(dx * step, dy * step).multiply(m));
    editor.execute(
      new TransformNodesCommand('Verschieben', before, after, `nudge-${editor.selection.join(',')}`),
    );
  };
  add('arrowleft', 'Nach links', (evt) => nudge(-1, 0, evt), true);
  add('arrowright', 'Nach rechts', (evt) => nudge(1, 0, evt), true);
  add('arrowup', 'Nach oben', (evt) => nudge(0, -1, evt), true);
  add('arrowdown', 'Nach unten', (evt) => nudge(0, 1, evt), true);
  add('shift+arrowleft', 'Nach links (10px)', (evt) => nudge(-1, 0, evt), true);
  add('shift+arrowright', 'Nach rechts (10px)', (evt) => nudge(1, 0, evt), true);
  add('shift+arrowup', 'Nach oben (10px)', (evt) => nudge(0, -1, evt), true);
  add('shift+arrowdown', 'Nach unten (10px)', (evt) => nudge(0, 1, evt), true);

  // Abbrechen & Export
  add('escape', 'Aktion abbrechen', () => toolManager.cancel());
  add('mod+e', 'PNG exportieren', () => deps.exportPng());

  // Space-Pan (gedrückt halten)
  disposers.push(
    registerHold(
      'space',
      () => deps.setSpacePan(true),
      () => deps.setSpacePan(false),
    ),
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
