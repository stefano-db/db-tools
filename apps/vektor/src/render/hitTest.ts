import { Matrix, Point, Rect, rectsIntersect } from '../core/geometry';
import { Document, NodeId, getNode, getWorldBounds, buildParentMap } from '../core/model';

/**
 * Oberster getroffener Root-Level-Node (top-down durch die Z-Order).
 * Gruppen werden als Ganzes getroffen; gesperrte/unsichtbare Nodes ignoriert.
 */
export function hitTestPoint(doc: Document, pt: Point): NodeId | null {
  for (let i = doc.rootChildren.length - 1; i >= 0; i -= 1) {
    const id = doc.rootChildren[i];
    if (id !== undefined && hitNode(doc, id, Matrix.identity(), pt)) return id;
  }
  return null;
}

function hitNode(doc: Document, id: NodeId, parentWorld: Matrix, pt: Point): boolean {
  const node = getNode(doc, id);
  if (!node.visible || node.locked) return false;
  const world = parentWorld.multiply(node.transform);
  if (node.type === 'rect') {
    const local = world.invert().apply(pt);
    const pad = node.stroke ? node.stroke.width / 2 : 0;
    return (
      local.x >= -pad && local.x <= node.width + pad && local.y >= -pad && local.y <= node.height + pad
    );
  }
  for (let i = node.children.length - 1; i >= 0; i -= 1) {
    const childId = node.children[i];
    if (childId !== undefined && hitNode(doc, childId, world, pt)) return true;
  }
  return false;
}

/** Root-Level-Nodes, deren Welt-Bounds das Rechteck schneiden (Rubber-Band). */
export function hitTestRect(doc: Document, rect: Rect): NodeId[] {
  const parents = buildParentMap(doc);
  const hits: NodeId[] = [];
  for (const id of doc.rootChildren) {
    const node = getNode(doc, id);
    if (!node.visible || node.locked) continue;
    const bounds = getWorldBounds(doc, id, parents);
    if (bounds && rectsIntersect(bounds, rect)) hits.push(id);
  }
  return hits;
}
