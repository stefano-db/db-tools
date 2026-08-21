import { Point } from '../core/geometry';
import { Tool, ToolContext } from './types';
import { drawSelectionBox, selectionScreenBounds } from './selectionOverlay';

/**
 * Verwaltet die registrierten Werkzeuge, das aktive Werkzeug und leitet
 * Pointer-Events (bereits in Dokumentkoordinaten) an das aktive Werkzeug weiter.
 */
export class ToolManager {
  private tools = new Map<string, Tool>();
  private activeId: string | null = null;
  private listeners = new Set<() => void>();

  constructor(private ctx: ToolContext) {}

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
    if (!this.activeId) this.activeId = tool.id;
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  get active(): Tool | null {
    return this.activeId ? (this.tools.get(this.activeId) ?? null) : null;
  }

  activate(id: string): void {
    if (id === this.activeId || !this.tools.has(id)) return;
    this.active?.onDeactivate?.(this.ctx);
    this.activeId = id;
    this.ctx.setCursor(this.active?.cursor ?? 'default');
    this.ctx.requestOverlayRender();
    this.notify();
  }

  cancel(): void {
    this.active?.onCancel?.(this.ctx);
    this.ctx.requestOverlayRender();
  }

  handlePointerDown(screenPt: Point, evt: PointerEvent): void {
    this.active?.onPointerDown(this.ctx.viewport.screenToDoc(screenPt), evt, this.ctx);
  }

  handlePointerMove(screenPt: Point, evt: PointerEvent): void {
    this.active?.onPointerMove(this.ctx.viewport.screenToDoc(screenPt), evt, this.ctx);
  }

  handlePointerUp(screenPt: Point, evt: PointerEvent): void {
    this.active?.onPointerUp(this.ctx.viewport.screenToDoc(screenPt), evt, this.ctx);
  }

  handleKeyDown(evt: KeyboardEvent): void {
    this.active?.onKeyDown?.(evt, this.ctx);
  }

  /** Gemeinsamer Overlay-Painter: Selektionsrahmen + werkzeugspezifisches Overlay. */
  paintOverlay(c: CanvasRenderingContext2D): void {
    const bounds = selectionScreenBounds(this.ctx.editor, this.ctx.viewport);
    if (bounds) drawSelectionBox(c, bounds, this.activeId === 'move');
    this.active?.renderOverlay?.(c, this.ctx);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
