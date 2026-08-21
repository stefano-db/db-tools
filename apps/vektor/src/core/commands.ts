import { Matrix } from './geometry';
import {
  Document,
  GroupNode,
  NodeId,
  SceneNode,
  buildParentMap,
  cloneSubtree,
  collectSubtree,
  createGroupNode,
  getContainer,
  getNode,
  getWorldMatrix,
} from './model';

export interface Command {
  label: string;
  do(doc: Document): void;
  undo(doc: Document): void;
  /** Nodes, deren Region vor/nach der Ausführung neu gezeichnet werden muss. */
  affectedIds(): NodeId[];
  /** Gleicher Key bei aufeinanderfolgenden Commands → History fasst sie zu einem Schritt zusammen. */
  coalesceKey?: string;
  /** Übernimmt den Endzustand eines Folge-Commands mit gleichem coalesceKey. */
  merge?(next: Command): void;
}

export class AddNodeCommand implements Command {
  label: string;

  constructor(
    private nodes: Record<NodeId, SceneNode>,
    private rootId: NodeId,
    private parentId: NodeId | null = null,
    private index: number | null = null,
  ) {
    this.label = `${nodes[rootId]?.name ?? 'Node'} hinzufügen`;
  }

  do(doc: Document): void {
    for (const [id, node] of Object.entries(this.nodes)) doc.nodes[id] = node;
    const container = getContainer(doc, this.parentId);
    container.splice(this.index ?? container.length, 0, this.rootId);
  }

  undo(doc: Document): void {
    const container = getContainer(doc, this.parentId);
    container.splice(container.indexOf(this.rootId), 1);
    for (const id of Object.keys(this.nodes)) delete doc.nodes[id];
  }

  affectedIds(): NodeId[] {
    return [this.rootId];
  }
}

interface DeletedEntry {
  rootId: NodeId;
  parentId: NodeId | null;
  index: number;
  nodes: Record<NodeId, SceneNode>;
}

export class DeleteNodesCommand implements Command {
  label: string;
  private entries: DeletedEntry[] = [];

  constructor(private ids: NodeId[]) {
    this.label = ids.length === 1 ? 'Node löschen' : `${ids.length} Nodes löschen`;
  }

  do(doc: Document): void {
    const parents = buildParentMap(doc);
    this.entries = [];
    for (const id of this.ids) {
      if (!doc.nodes[id]) continue;
      const parentId = parents.get(id) ?? null;
      const container = getContainer(doc, parentId);
      const nodes: Record<NodeId, SceneNode> = {};
      for (const subId of collectSubtree(doc, id)) nodes[subId] = getNode(doc, subId);
      this.entries.push({ rootId: id, parentId, index: container.indexOf(id), nodes });
      container.splice(container.indexOf(id), 1);
      for (const subId of Object.keys(nodes)) delete doc.nodes[subId];
    }
  }

  undo(doc: Document): void {
    for (const entry of [...this.entries].reverse()) {
      for (const [id, node] of Object.entries(entry.nodes)) doc.nodes[id] = node;
      getContainer(doc, entry.parentId).splice(entry.index, 0, entry.rootId);
    }
  }

  affectedIds(): NodeId[] {
    return this.ids;
  }
}

export class TransformNodesCommand implements Command {
  constructor(
    public label: string,
    private before: Map<NodeId, Matrix>,
    private after: Map<NodeId, Matrix>,
    public coalesceKey?: string,
  ) {}

  do(doc: Document): void {
    for (const [id, m] of this.after) {
      const node = doc.nodes[id];
      if (node) node.transform = m.clone();
    }
  }

  undo(doc: Document): void {
    for (const [id, m] of this.before) {
      const node = doc.nodes[id];
      if (node) node.transform = m.clone();
    }
  }

  affectedIds(): NodeId[] {
    return [...this.after.keys()];
  }

  merge(next: Command): void {
    if (next instanceof TransformNodesCommand) this.after = next.after;
  }
}

type Mutable = SceneNode & Record<string, unknown>;

export class SetPropertyCommand implements Command {
  private before = new Map<NodeId, unknown>();

  constructor(
    public label: string,
    private ids: NodeId[],
    private key: string,
    private value: unknown,
    public coalesceKey?: string,
  ) {}

  do(doc: Document): void {
    for (const id of this.ids) {
      const node = doc.nodes[id] as Mutable | undefined;
      if (!node || !(this.key in node)) continue;
      if (!this.before.has(id)) this.before.set(id, node[this.key]);
      node[this.key] = this.value;
    }
  }

  undo(doc: Document): void {
    for (const [id, value] of this.before) {
      const node = doc.nodes[id] as Mutable | undefined;
      if (node) node[this.key] = value;
    }
  }

  affectedIds(): NodeId[] {
    return this.ids;
  }

  merge(next: Command): void {
    if (next instanceof SetPropertyCommand) this.value = next.value;
  }
}

export class ReorderNodeCommand implements Command {
  private fromIndex = 0;

  constructor(
    public label: string,
    private id: NodeId,
    private parentId: NodeId | null,
    private toIndex: number,
  ) {}

  do(doc: Document): void {
    const container = getContainer(doc, this.parentId);
    this.fromIndex = container.indexOf(this.id);
    if (this.fromIndex < 0) return;
    container.splice(this.fromIndex, 1);
    container.splice(Math.max(0, Math.min(this.toIndex, container.length)), 0, this.id);
  }

  undo(doc: Document): void {
    const container = getContainer(doc, this.parentId);
    const current = container.indexOf(this.id);
    if (current < 0) return;
    container.splice(current, 1);
    container.splice(this.fromIndex, 0, this.id);
  }

  affectedIds(): NodeId[] {
    return [this.id];
  }
}

/** Fasst Root-Level-Nodes zu einer Gruppe zusammen; Welt-Transformationen bleiben erhalten. */
export class GroupNodesCommand implements Command {
  label = 'Gruppieren';
  groupId: NodeId;
  private group: GroupNode;
  private previousIndices = new Map<NodeId, number>();

  constructor(private ids: NodeId[]) {
    this.group = createGroupNode([...ids]);
    this.groupId = this.group.id;
  }

  do(doc: Document): void {
    this.previousIndices.clear();
    const ordered = doc.rootChildren.filter((id) => this.ids.includes(id));
    for (const id of ordered) this.previousIndices.set(id, doc.rootChildren.indexOf(id));
    const insertAt = Math.max(...ordered.map((id) => doc.rootChildren.indexOf(id)));
    doc.rootChildren = doc.rootChildren.filter((id) => !this.ids.includes(id));
    this.group.children = ordered;
    doc.nodes[this.groupId] = this.group;
    doc.rootChildren.splice(Math.min(insertAt - ordered.length + 1, doc.rootChildren.length), 0, this.groupId);
  }

  undo(doc: Document): void {
    doc.rootChildren = doc.rootChildren.filter((id) => id !== this.groupId);
    delete doc.nodes[this.groupId];
    const entries = [...this.previousIndices.entries()].sort((a, b) => a[1] - b[1]);
    for (const [id, index] of entries) doc.rootChildren.splice(index, 0, id);
  }

  affectedIds(): NodeId[] {
    return this.ids;
  }
}

export class UngroupNodeCommand implements Command {
  label = 'Gruppierung aufheben';
  childIds: NodeId[] = [];
  private group: GroupNode | null = null;
  private groupIndex = 0;

  constructor(private groupId: NodeId) {}

  do(doc: Document): void {
    const node = getNode(doc, this.groupId);
    if (node.type !== 'group') return;
    this.group = node;
    this.childIds = [...node.children];
    this.groupIndex = doc.rootChildren.indexOf(this.groupId);
    // Kinder bekommen die Gruppen-Transform einmultipliziert, damit sie an Ort und Stelle bleiben.
    for (const childId of node.children) {
      const child = getNode(doc, childId);
      child.transform = node.transform.multiply(child.transform);
    }
    doc.rootChildren.splice(this.groupIndex, 1, ...node.children);
    delete doc.nodes[this.groupId];
  }

  undo(doc: Document): void {
    if (!this.group) return;
    const inverse = this.group.transform.invert();
    for (const childId of this.childIds) {
      const child = getNode(doc, childId);
      child.transform = inverse.multiply(child.transform);
    }
    doc.rootChildren = doc.rootChildren.filter((id) => !this.childIds.includes(id));
    doc.nodes[this.groupId] = this.group;
    doc.rootChildren.splice(this.groupIndex, 0, this.groupId);
  }

  affectedIds(): NodeId[] {
    return [this.groupId, ...this.childIds];
  }
}

export class DuplicateNodesCommand implements Command {
  label = 'Duplizieren';
  newIds: NodeId[] = [];
  private added: { nodes: Record<NodeId, SceneNode>; rootId: NodeId }[] = [];
  private prepared = false;

  constructor(
    private ids: NodeId[],
    private offset = 10,
  ) {}

  do(doc: Document): void {
    if (!this.prepared) {
      const parents = buildParentMap(doc);
      for (const id of this.ids) {
        if (!doc.nodes[id] || parents.get(id) !== null) continue;
        const clone = cloneSubtree(doc, id);
        const root = clone.nodes[clone.rootId];
        if (root) {
          root.transform = Matrix.translation(this.offset, this.offset).multiply(root.transform);
          root.name = `${root.name} Kopie`;
        }
        this.added.push(clone);
        this.newIds.push(clone.rootId);
      }
      this.prepared = true;
    }
    for (const { nodes, rootId } of this.added) {
      for (const [id, node] of Object.entries(nodes)) doc.nodes[id] = node;
      doc.rootChildren.push(rootId);
    }
  }

  undo(doc: Document): void {
    for (const { nodes, rootId } of this.added) {
      doc.rootChildren = doc.rootChildren.filter((id) => id !== rootId);
      for (const id of Object.keys(nodes)) delete doc.nodes[id];
    }
  }

  affectedIds(): NodeId[] {
    return this.newIds;
  }
}

/** Hilfsfunktion für Move/Scale: aktuelle Transformationen einer Auswahl einsammeln. */
export function snapshotTransforms(doc: Document, ids: NodeId[]): Map<NodeId, Matrix> {
  const map = new Map<NodeId, Matrix>();
  for (const id of ids) {
    const node = doc.nodes[id];
    if (node) map.set(id, node.transform.clone());
  }
  return map;
}

export { getWorldMatrix };
