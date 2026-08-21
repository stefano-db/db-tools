import { Rect } from '../core/geometry';
import { Viewport } from '../render/viewport';
import { Editor } from '../core/editor';

export const HANDLE_SIZE = 8;
export const ACCENT = '#38a0ff';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface Handle {
  id: HandleId;
  /** Mittelpunkt in Screen-Koordinaten. */
  x: number;
  y: number;
  cursor: string;
}

/** 8 Transform-Handles auf der Screen-Bounding-Box. Rotations-Slots folgen in M1. */
export function getHandles(screenBounds: Rect): Handle[] {
  const { x, y, width: w, height: h } = screenBounds;
  return [
    { id: 'nw', x, y, cursor: 'nwse-resize' },
    { id: 'n', x: x + w / 2, y, cursor: 'ns-resize' },
    { id: 'ne', x: x + w, y, cursor: 'nesw-resize' },
    { id: 'e', x: x + w, y: y + h / 2, cursor: 'ew-resize' },
    { id: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
    { id: 's', x: x + w / 2, y: y + h, cursor: 'ns-resize' },
    { id: 'sw', x, y: y + h, cursor: 'nesw-resize' },
    { id: 'w', x, y: y + h / 2, cursor: 'ew-resize' },
  ];
}

export function handleAt(screenBounds: Rect, screenPt: { x: number; y: number }): Handle | null {
  const half = HANDLE_SIZE / 2 + 2;
  for (const handle of getHandles(screenBounds)) {
    if (Math.abs(screenPt.x - handle.x) <= half && Math.abs(screenPt.y - handle.y) <= half) {
      return handle;
    }
  }
  return null;
}

export function selectionScreenBounds(editor: Editor, viewport: Viewport): Rect | null {
  const bounds = editor.selectionBounds();
  if (!bounds) return null;
  const topLeft = viewport.docToScreen({ x: bounds.x, y: bounds.y });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bounds.width * viewport.scale,
    height: bounds.height * viewport.scale,
  };
}

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  screenBounds: Rect,
  withHandles: boolean,
): void {
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1;
  const { x, y, width, height } = screenBounds;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(width), Math.round(height));

  if (!withHandles) return;
  for (const handle of getHandles(screenBounds)) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = ACCENT;
    ctx.fillRect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(
      handle.x - HANDLE_SIZE / 2 + 0.5,
      handle.y - HANDLE_SIZE / 2 + 0.5,
      HANDLE_SIZE - 1,
      HANDLE_SIZE - 1,
    );
  }
}
