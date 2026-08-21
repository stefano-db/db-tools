import { Matrix, Point, Rect, rectFromPoints } from '../core/geometry';
import { NodeId } from '../core/model';
import { TransformNodesCommand, snapshotTransforms } from '../core/commands';
import { hitTestPoint, hitTestRect } from '../render/hitTest';
import { Tool, ToolContext } from './types';
import { ACCENT, Handle, handleAt, selectionScreenBounds } from './selectionOverlay';

const DRAG_THRESHOLD_PX = 3;

type Gesture =
  | { kind: 'idle' }
  | {
      kind: 'move';
      start: Point;
      before: Map<NodeId, Matrix>;
      started: boolean;
      key: string;
      clickTarget: NodeId | null;
    }
  | {
      kind: 'scale';
      handle: Handle;
      startBounds: Rect;
      anchor: Point;
      before: Map<NodeId, Matrix>;
      started: boolean;
      key: string;
    }
  | { kind: 'rubber'; start: Point; current: Point };

let gestureCounter = 0;

export class MoveTool implements Tool {
  id = 'move';
  label = 'Verschieben';
  shortcut = 'V';
  cursor = 'default';

  private gesture: Gesture = { kind: 'idle' };

  onPointerDown(pt: Point, evt: PointerEvent, ctx: ToolContext): void {
    const { editor, viewport } = ctx;
    const screenPt = viewport.docToScreen(pt);
    const key = `gesture-${(gestureCounter += 1)}`;

    // 1. Transform-Handle unter dem Zeiger?
    const screenBounds = selectionScreenBounds(editor, viewport);
    if (screenBounds && editor.selection.length > 0) {
      const handle = handleAt(screenBounds, screenPt);
      if (handle) {
        const bounds = editor.selectionBounds();
        if (bounds) {
          this.gesture = {
            kind: 'scale',
            handle,
            startBounds: bounds,
            anchor: this.anchorFor(handle, bounds),
            before: snapshotTransforms(editor.doc, [...editor.selection]),
            started: false,
            key,
          };
          return;
        }
      }
    }

    // 2. Node unter dem Zeiger?
    const hit = hitTestPoint(editor.doc, pt);
    if (hit) {
      let clickTarget: NodeId | null = null;
      if (evt.shiftKey) {
        editor.toggleSelected(hit);
      } else if (!editor.selection.includes(hit)) {
        editor.setSelection([hit]);
      } else {
        // Klick ohne Drag reduziert die Mehrfachauswahl auf den getroffenen Node.
        clickTarget = hit;
      }
      if (editor.selection.length > 0) {
        this.gesture = {
          kind: 'move',
          start: pt,
          before: snapshotTransforms(editor.doc, [...editor.selection]),
          started: false,
          key,
          clickTarget,
        };
      }
      return;
    }

    // 3. Leere Fläche → Rubber-Band
    if (!evt.shiftKey) editor.deselect();
    this.gesture = { kind: 'rubber', start: pt, current: pt };
    ctx.requestOverlayRender();
  }

  onPointerMove(pt: Point, evt: PointerEvent, ctx: ToolContext): void {
    const { editor, viewport } = ctx;
    const gesture = this.gesture;

    if (gesture.kind === 'idle') {
      const screenBounds = selectionScreenBounds(editor, viewport);
      const handle = screenBounds ? handleAt(screenBounds, viewport.docToScreen(pt)) : null;
      ctx.setCursor(handle ? handle.cursor : this.cursor);
      return;
    }

    if (gesture.kind === 'rubber') {
      gesture.current = pt;
      ctx.requestOverlayRender();
      return;
    }

    if (gesture.kind === 'move') {
      const dx = pt.x - gesture.start.x;
      const dy = pt.y - gesture.start.y;
      if (!gesture.started) {
        const distPx = Math.hypot(dx, dy) * viewport.scale;
        if (distPx < DRAG_THRESHOLD_PX) return;
        gesture.started = true;
      }
      const after = new Map<NodeId, Matrix>();
      for (const [id, m] of gesture.before) {
        after.set(id, Matrix.translation(dx, dy).multiply(m));
      }
      editor.execute(new TransformNodesCommand('Verschieben', gesture.before, after, gesture.key));
      return;
    }

    // scale
    const { startBounds, anchor, handle } = gesture;
    let sx = 1;
    let sy = 1;
    const epsilon = 0.001;
    const scaleAlongX = handle.id !== 'n' && handle.id !== 's';
    const scaleAlongY = handle.id !== 'e' && handle.id !== 'w';
    if (scaleAlongX) {
      const startEdgeX = startBounds.x + (handle.id.includes('w') ? 0 : startBounds.width);
      sx = (pt.x - anchor.x) / (startEdgeX - anchor.x || epsilon);
    }
    if (scaleAlongY) {
      const startEdgeY = startBounds.y + (handle.id.includes('n') ? 0 : startBounds.height);
      sy = (pt.y - anchor.y) / (startEdgeY - anchor.y || epsilon);
    }
    if (evt.shiftKey && scaleAlongX && scaleAlongY) {
      const uniform = Math.max(Math.abs(sx), Math.abs(sy));
      sx = uniform * Math.sign(sx || 1);
      sy = uniform * Math.sign(sy || 1);
    }
    if (Math.abs(sx) < epsilon) sx = epsilon * Math.sign(sx || 1);
    if (Math.abs(sy) < epsilon) sy = epsilon * Math.sign(sy || 1);

    gesture.started = true;
    const scaleMatrix = Matrix.translation(anchor.x, anchor.y)
      .scale(sx, sy)
      .translate(-anchor.x, -anchor.y);
    const after = new Map<NodeId, Matrix>();
    for (const [id, m] of gesture.before) after.set(id, scaleMatrix.multiply(m));
    editor.execute(new TransformNodesCommand('Skalieren', gesture.before, after, gesture.key));
  }

  onPointerUp(pt: Point, evt: PointerEvent, ctx: ToolContext): void {
    const gesture = this.gesture;
    this.gesture = { kind: 'idle' };

    if (gesture.kind === 'rubber') {
      const rect = rectFromPoints(gesture.start, gesture.current);
      if (rect.width > 0.5 || rect.height > 0.5) {
        const hits = hitTestRect(ctx.editor.doc, rect);
        ctx.editor.setSelection(
          evt.shiftKey ? [...new Set([...ctx.editor.selection, ...hits])] : hits,
        );
      }
      ctx.requestOverlayRender();
      return;
    }

    if (gesture.kind === 'move' && !gesture.started && gesture.clickTarget) {
      ctx.editor.setSelection([gesture.clickTarget]);
    }
    void pt;
  }

  onKeyDown(): void {
    // Pfeiltasten laufen zentral über die Keymap (Rule 3).
  }

  onCancel(ctx: ToolContext): void {
    const gesture = this.gesture;
    this.gesture = { kind: 'idle' };
    if ((gesture.kind === 'move' || gesture.kind === 'scale') && gesture.started) {
      ctx.editor.undo();
    }
    ctx.requestOverlayRender();
  }

  onDeactivate(ctx: ToolContext): void {
    this.gesture = { kind: 'idle' };
    ctx.requestOverlayRender();
  }

  renderOverlay(c: CanvasRenderingContext2D, ctx: ToolContext): void {
    if (this.gesture.kind !== 'rubber') return;
    const rect = rectFromPoints(
      ctx.viewport.docToScreen(this.gesture.start),
      ctx.viewport.docToScreen(this.gesture.current),
    );
    c.fillStyle = 'rgba(56, 160, 255, 0.12)';
    c.strokeStyle = ACCENT;
    c.lineWidth = 1;
    c.fillRect(rect.x, rect.y, rect.width, rect.height);
    c.strokeRect(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5, rect.width, rect.height);
  }

  private anchorFor(handle: Handle, bounds: Rect): Point {
    const x = handle.id.includes('w')
      ? bounds.x + bounds.width
      : handle.id.includes('e')
        ? bounds.x
        : bounds.x + bounds.width / 2;
    const y = handle.id.includes('n')
      ? bounds.y + bounds.height
      : handle.id.includes('s')
        ? bounds.y
        : bounds.y + bounds.height / 2;
    return { x, y };
  }
}
