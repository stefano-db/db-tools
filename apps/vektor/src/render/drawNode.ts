import { Document, NodeId, RectNode, getNode } from '../core/model';

/**
 * Zeichnet den Szenenbaum in einen beliebigen 2D-Kontext.
 * Wird vom Bildschirm-Renderer und vom PNG-Export gemeinsam genutzt.
 */
export function drawDocumentContent(ctx: CanvasRenderingContext2D, doc: Document): void {
  ctx.fillStyle = doc.background;
  ctx.fillRect(0, 0, doc.width, doc.height);
  for (const id of doc.rootChildren) drawNode(ctx, doc, id);
}

function drawNode(ctx: CanvasRenderingContext2D, doc: Document, id: NodeId): void {
  const node = getNode(doc, id);
  if (!node.visible || node.opacity === 0) return;

  ctx.save();
  ctx.transform(...node.transform.toCanvasArgs());
  ctx.globalAlpha *= node.opacity;
  ctx.globalCompositeOperation = node.blendMode;

  if (node.type === 'rect') {
    drawRect(ctx, node);
  } else {
    for (const childId of node.children) drawNode(ctx, doc, childId);
  }

  ctx.restore();
}

function drawRect(ctx: CanvasRenderingContext2D, node: RectNode): void {
  const radius = Math.max(0, Math.min(node.cornerRadius, node.width / 2, node.height / 2));
  ctx.beginPath();
  if (radius > 0) {
    ctx.roundRect(0, 0, node.width, node.height, radius);
  } else {
    ctx.rect(0, 0, node.width, node.height);
  }
  if (node.fill) {
    ctx.fillStyle = node.fill.color;
    ctx.fill();
  }
  if (node.stroke && node.stroke.width > 0) {
    ctx.strokeStyle = node.stroke.color;
    ctx.lineWidth = node.stroke.width;
    ctx.stroke();
  }
}
