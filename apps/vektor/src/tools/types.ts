import { Editor } from '../core/editor';
import { Point } from '../core/geometry';
import { Viewport } from '../render/viewport';

export interface ToolContext {
  editor: Editor;
  viewport: Viewport;
  /** Dokument-Canvas (Region) neu zeichnen lassen. */
  requestRender(): void;
  /** Nur das Overlay neu zeichnen lassen (Previews, Handles). */
  requestOverlayRender(): void;
  setCursor(cursor: string): void;
}

export interface OptionsBarControl {
  kind: 'color' | 'number' | 'checkbox';
  id: string;
  label: string;
  get(): string | number | boolean;
  set(value: string | number | boolean): void;
  min?: number;
  max?: number;
  step?: number;
}

export type OptionsBarSchema = OptionsBarControl[];

export interface Tool {
  id: string;
  label: string;
  shortcut: string;
  cursor: string;

  onPointerDown(pt: Point, evt: PointerEvent, ctx: ToolContext): void;
  onPointerMove(pt: Point, evt: PointerEvent, ctx: ToolContext): void;
  onPointerUp(pt: Point, evt: PointerEvent, ctx: ToolContext): void;
  onKeyDown?(evt: KeyboardEvent, ctx: ToolContext): void;
  onCancel?(ctx: ToolContext): void;
  onDeactivate?(ctx: ToolContext): void;

  renderOverlay?(c: CanvasRenderingContext2D, ctx: ToolContext): void;
  getOptionsBar?(): OptionsBarSchema;
}
