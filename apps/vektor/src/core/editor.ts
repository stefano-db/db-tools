import { Command, DeleteNodesCommand, DuplicateNodesCommand, GroupNodesCommand, ReorderNodeCommand, UngroupNodeCommand } from './commands';
import { Rect, inflateRect, rectUnion } from './geometry';
import { Document, NodeId, buildParentMap, createDocument, getWorldBounds } from './model';
import { History } from './history';

export interface EditorChange {
  /** Zu erneuernde Dokumentregion; null = alles neu zeichnen. */
  dirtyRect: Rect | null;
}

type Listener = (change: EditorChange) => void;

/**
 * Zentraler Zustand: Dokument, Verlauf, Selektion.
 * Reines Modell ohne UI-Abhängigkeiten; UI und Renderer abonnieren Änderungen.
 */
export class Editor {
  readonly doc: Document;
  readonly history = new History();
  private selected: NodeId[] = [];
  private listeners = new Set<Listener>();

  constructor(doc?: Document) {
    this.doc = doc ?? createDocument();
    this.history.subscribe(() => {
      // Sprünge im Verlauf (jumpTo/Panel) laufen an execute() vorbei → konservativ alles zeichnen.
      this.pruneSelection();
    });
  }

  get selection(): readonly NodeId[] {
    return this.selected;
  }

  execute(command: Command): void {
    const before = this.boundsOf(command.affectedIds());
    this.history.execute(this.doc, command);
    const after = this.boundsOf(command.affectedIds());
    this.pruneSelection();
    this.emit(rectUnion(before, after));
  }

  undo(): void {
    if (this.history.undo(this.doc)) {
      this.pruneSelection();
      this.emit(null);
    }
  }

  redo(): void {
    if (this.history.redo(this.doc)) {
      this.pruneSelection();
      this.emit(null);
    }
  }

  jumpTo(index: number): void {
    this.history.jumpTo(this.doc, index);
    this.pruneSelection();
    this.emit(null);
  }

  setSelection(ids: NodeId[]): void {
    const next = ids.filter((id) => this.doc.nodes[id]);
    if (next.length === this.selected.length && next.every((id, i) => this.selected[i] === id)) return;
    this.selected = next;
    this.emitSelectionOnly();
  }

  toggleSelected(id: NodeId): void {
    this.setSelection(
      this.selected.includes(id) ? this.selected.filter((s) => s !== id) : [...this.selected, id],
    );
  }

  selectAll(): void {
    this.setSelection([...this.doc.rootChildren]);
  }

  deselect(): void {
    this.setSelection([]);
  }

  deleteSelection(): void {
    if (this.selected.length === 0) return;
    this.execute(new DeleteNodesCommand([...this.selected]));
  }

  duplicateSelection(): void {
    if (this.selected.length === 0) return;
    const command = new DuplicateNodesCommand([...this.selected]);
    this.execute(command);
    this.setSelection(command.newIds);
  }

  groupSelection(): void {
    const rootLevel = this.doc.rootChildren.filter((id) => this.selected.includes(id));
    if (rootLevel.length < 2) return;
    const command = new GroupNodesCommand(rootLevel);
    this.execute(command);
    this.setSelection([command.groupId]);
  }

  ungroupSelection(): void {
    const groups = this.selected.filter((id) => this.doc.nodes[id]?.type === 'group');
    if (groups.length === 0) return;
    const freed: NodeId[] = [];
    for (const id of groups) {
      const command = new UngroupNodeCommand(id);
      this.execute(command);
      freed.push(...command.childIds);
    }
    this.setSelection(freed);
  }

  /** delta > 0 = nach vorne. toEnd = ganz nach vorne/hinten. */
  reorderSelection(delta: 1 | -1, toEnd = false): void {
    const parents = buildParentMap(this.doc);
    const ids = this.selected.filter((id) => parents.get(id) === null);
    const ordered = this.doc.rootChildren.filter((id) => ids.includes(id));
    if (delta > 0) ordered.reverse();
    for (const id of ordered) {
      const from = this.doc.rootChildren.indexOf(id);
      const to = toEnd ? (delta > 0 ? this.doc.rootChildren.length - 1 : 0) : from + delta;
      if (to === from || to < 0 || to >= this.doc.rootChildren.length) continue;
      this.execute(
        new ReorderNodeCommand(delta > 0 ? 'Nach vorne' : 'Nach hinten', id, null, to),
      );
    }
  }

  selectionBounds(): Rect | null {
    const parents = buildParentMap(this.doc);
    let bounds: Rect | null = null;
    for (const id of this.selected) {
      bounds = rectUnion(bounds, getWorldBounds(this.doc, id, parents));
    }
    return bounds;
  }

  boundsOf(ids: NodeId[]): Rect | null {
    const parents = buildParentMap(this.doc);
    let bounds: Rect | null = null;
    for (const id of ids) {
      if (!this.doc.nodes[id]) continue;
      bounds = rectUnion(bounds, getWorldBounds(this.doc, id, parents));
    }
    // Puffer für Selektions-Handles und Antialiasing-Ränder.
    return bounds ? inflateRect(bounds, 8) : null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Repaint anstoßen, ohne dass sich das Modell geändert hat (z. B. Selektion, Overlay). */
  emitSelectionOnly(): void {
    for (const listener of this.listeners) listener({ dirtyRect: this.selectionBounds() });
  }

  private emit(dirtyRect: Rect | null): void {
    for (const listener of this.listeners) listener({ dirtyRect });
  }

  private pruneSelection(): void {
    const next = this.selected.filter((id) => this.doc.nodes[id]);
    if (next.length !== this.selected.length) this.selected = next;
  }
}
