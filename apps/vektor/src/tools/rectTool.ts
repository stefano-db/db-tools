import { Matrix, Point, Rect } from '../core/geometry';
import { AddNodeCommand } from '../core/commands';
import { createRectNode } from '../core/model';
import { Tool, ToolContext, OptionsBarSchema } from './types';
import { ACCENT } from './selectionOverlay';

interface DrawState {
  start: Point;
  current: Point;
  square: boolean;
  fromCenter: boolean;
}

export class RectTool implements Tool {
  id = 'rect';
  label = 'Rechteck';
  shortcut = 'U';
  cursor = 'crosshair';

  private fillColor = '#4a90d9';
  private cornerRadius = 0;
  private state: DrawState | null = null;
  private optionsChanged: (() => void) | null = null;

  onPointerDown(pt: Point, evt: PointerEvent, ctx: ToolContext): void {
    this.state = { start: pt, current: pt, square: evt.shiftKey, fromCenter: evt.altKey };
    ctx.requestOverlayRender();
  }

  onPointerMove(pt: Point, evt: PointerEvent, ctx: ToolContext): void {
    if (!this.state) return;
    this.state.current = pt;
    this.state.square = evt.shiftKey;
    this.state.fromCenter = evt.altKey;
    ctx.requestOverlayRender();
  }

  onPointerUp(pt: Point, evt: PointerEvent, ctx: ToolContext): void {
    if (!this.state) return;
    this.state.current = pt;
    this.state.square = evt.shiftKey;
    this.state.fromCenter = evt.altKey;
    const rect = this.currentRect();
    this.state = null;
    ctx.requestOverlayRender();
    if (!rect || rect.width < 1 || rect.height < 1) return;

    const node = createRectNode({
      width: rect.width,
      height: rect.height,
      cornerRadius: this.cornerRadius,
      fill: { type: 'solid', color: this.fillColor },
      transform: Matrix.translation(rect.x, rect.y),
    });
    ctx.editor.execute(new AddNodeCommand({ [node.id]: node }, node.id));
    ctx.editor.setSelection([node.id]);
  }

  onCancel(ctx: ToolContext): void {
    this.state = null;
    ctx.requestOverlayRender();
  }

  onDeactivate(ctx: ToolContext): void {
    this.state = null;
    ctx.requestOverlayRender();
  }

  renderOverlay(c: CanvasRenderingContext2D, ctx: ToolContext): void {
    const rect = this.currentRect();
    if (!rect) return;
    const topLeft = ctx.viewport.docToScreen({ x: rect.x, y: rect.y });
    const w = rect.width * ctx.viewport.scale;
    const h = rect.height * ctx.viewport.scale;
    c.fillStyle = 'rgba(74, 144, 217, 0.35)';
    c.strokeStyle = ACCENT;
    c.lineWidth = 1;
    c.fillRect(topLeft.x, topLeft.y, w, h);
    c.strokeRect(Math.round(topLeft.x) + 0.5, Math.round(topLeft.y) + 0.5, w, h);
  }

  getOptionsBar(): OptionsBarSchema {
    return [
      {
        kind: 'color',
        id: 'fill',
        label: 'Fläche',
        get: () => this.fillColor,
        set: (value) => {
          this.fillColor = String(value);
          this.optionsChanged?.();
        },
      },
      {
        kind: 'number',
        id: 'cornerRadius',
        label: 'Ecken',
        min: 0,
        max: 500,
        step: 1,
        get: () => this.cornerRadius,
        set: (value) => {
          this.cornerRadius = Math.max(0, Number(value) || 0);
          this.optionsChanged?.();
        },
      },
    ];
  }

  /** UI meldet sich an, um bei Optionsänderungen neu zu rendern. */
  setOptionsChangedListener(listener: (() => void) | null): void {
    this.optionsChanged = listener;
  }

  private currentRect(): Rect | null {
    if (!this.state) return null;
    const { start, current, square, fromCenter } = this.state;
    let dx = current.x - start.x;
    let dy = current.y - start.y;
    if (square) {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      dx = side * (Math.sign(dx) || 1);
      dy = side * (Math.sign(dy) || 1);
    }
    if (fromCenter) {
      return { x: start.x - Math.abs(dx), y: start.y - Math.abs(dy), width: Math.abs(dx) * 2, height: Math.abs(dy) * 2 };
    }
    return {
      x: Math.min(start.x, start.x + dx),
      y: Math.min(start.y, start.y + dy),
      width: Math.abs(dx),
      height: Math.abs(dy),
    };
  }
}
