import { Matrix, Rect, rectUnion, transformRect } from './geometry';

export type NodeId = string;

export type Fill = { type: 'solid'; color: string };

export interface Stroke {
  color: string;
  width: number;
}

export interface BaseNode {
  id: NodeId;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  transform: Matrix;
}

export interface RectNode extends BaseNode {
  type: 'rect';
  width: number;
  height: number;
  cornerRadius: number;
  fill: Fill | null;
  stroke: Stroke | null;
}

export interface GroupNode extends BaseNode {
  type: 'group';
  children: NodeId[];
}

export type SceneNode = RectNode | GroupNode;

export interface Document {
  width: number;
  height: number;
  background: string;
  nodes: Record<NodeId, SceneNode>;
  rootChildren: NodeId[];
}

let idCounter = 0;
export function createNodeId(): NodeId {
  idCounter += 1;
  return `n${Date.now().toString(36)}-${idCounter}`;
}

export function createDocument(width = 800, height = 600): Document {
  return { width, height, background: '#ffffff', nodes: {}, rootChildren: [] };
}

export function createRectNode(init: Partial<RectNode> = {}): RectNode {
  return {
    id: createNodeId(),
    type: 'rect',
    name: 'Rechteck',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'source-over',
    transform: Matrix.identity(),
    width: 100,
    height: 100,
    cornerRadius: 0,
    fill: { type: 'solid', color: '#4a90d9' },
    stroke: null,
    ...init,
  };
}

export function createGroupNode(children: NodeId[], init: Partial<GroupNode> = {}): GroupNode {
  return {
    id: createNodeId(),
    type: 'group',
    name: 'Gruppe',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'source-over',
    transform: Matrix.identity(),
    children,
    ...init,
  };
}

export function getNode(doc: Document, id: NodeId): SceneNode {
  const node = doc.nodes[id];
  if (!node) throw new Error(`Unbekannte Node-ID: ${id}`);
  return node;
}

/** Kind-Liste des Containers; null = Dokumentwurzel. */
export function getContainer(doc: Document, parentId: NodeId | null): NodeId[] {
  if (parentId === null) return doc.rootChildren;
  const parent = getNode(doc, parentId);
  if (parent.type !== 'group') throw new Error(`Node ${parentId} ist kein Container`);
  return parent.children;
}

export function buildParentMap(doc: Document): Map<NodeId, NodeId | null> {
  const map = new Map<NodeId, NodeId | null>();
  const visit = (ids: NodeId[], parent: NodeId | null): void => {
    for (const id of ids) {
      map.set(id, parent);
      const node = doc.nodes[id];
      if (node && node.type === 'group') visit(node.children, id);
    }
  };
  visit(doc.rootChildren, null);
  return map;
}

export function getWorldMatrix(doc: Document, id: NodeId, parentMap?: Map<NodeId, NodeId | null>): Matrix {
  const parents = parentMap ?? buildParentMap(doc);
  let m = getNode(doc, id).transform.clone();
  let current = parents.get(id) ?? null;
  while (current !== null) {
    m = getNode(doc, current).transform.multiply(m);
    current = parents.get(current) ?? null;
  }
  return m;
}

/** Umschließungsrechteck in lokalen Koordinaten des Nodes (ohne eigene Transform). */
export function getLocalBounds(doc: Document, id: NodeId): Rect | null {
  const node = getNode(doc, id);
  if (node.type === 'rect') {
    const strokePad = node.stroke ? node.stroke.width / 2 : 0;
    return {
      x: -strokePad,
      y: -strokePad,
      width: node.width + strokePad * 2,
      height: node.height + strokePad * 2,
    };
  }
  let bounds: Rect | null = null;
  for (const childId of node.children) {
    const childBounds = getLocalBounds(doc, childId);
    if (childBounds) {
      bounds = rectUnion(bounds, transformRect(getNode(doc, childId).transform, childBounds));
    }
  }
  return bounds;
}

export function getWorldBounds(
  doc: Document,
  id: NodeId,
  parentMap?: Map<NodeId, NodeId | null>,
): Rect | null {
  const local = getLocalBounds(doc, id);
  if (!local) return null;
  return transformRect(getWorldMatrix(doc, id, parentMap), local);
}

/** Alle IDs im Teilbaum inklusive der Wurzel. */
export function collectSubtree(doc: Document, id: NodeId): NodeId[] {
  const node = getNode(doc, id);
  if (node.type === 'rect') return [id];
  return [id, ...node.children.flatMap((c) => collectSubtree(doc, c))];
}

export function cloneSubtree(
  doc: Document,
  id: NodeId,
): { rootId: NodeId; nodes: Record<NodeId, SceneNode> } {
  const nodes: Record<NodeId, SceneNode> = {};
  const cloneOne = (sourceId: NodeId): NodeId => {
    const source = getNode(doc, sourceId);
    const newId = createNodeId();
    if (source.type === 'group') {
      nodes[newId] = { ...source, id: newId, transform: source.transform.clone(), children: source.children.map(cloneOne) };
    } else {
      nodes[newId] = {
        ...source,
        id: newId,
        transform: source.transform.clone(),
        fill: source.fill ? { ...source.fill } : null,
        stroke: source.stroke ? { ...source.stroke } : null,
      };
    }
    return newId;
  };
  return { rootId: cloneOne(id), nodes };
}
