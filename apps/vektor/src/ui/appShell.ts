import { create } from 'zustand';
import { Editor } from '../core/editor';
import { createDocument, createRectNode } from '../core/model';
import { Matrix } from '../core/geometry';
import { Viewport } from '../render/viewport';
import { ToolManager } from '../tools/toolManager';
import { ToolContext } from '../tools/types';
import { MoveTool } from '../tools/moveTool';
import { RectTool } from '../tools/rectTool';

/**
 * Verdrahtet Editor, Viewport und Werkzeuge außerhalb des React-Renderzyklus.
 * Der CanvasHost hängt sich zur Laufzeit über `renderHooks` ein.
 */
class AppShell {
  readonly editor: Editor;
  readonly viewport = new Viewport();
  readonly toolManager: ToolManager;
  readonly moveTool = new MoveTool();
  readonly rectTool = new RectTool();

  renderHooks = {
    requestRender: (): void => {},
    requestOverlayRender: (): void => {},
    setCursor: (_cursor: string): void => {},
    getViewSize: (): { width: number; height: number } => ({ width: 0, height: 0 }),
  };

  constructor() {
    this.editor = new Editor(this.seedDocument());
    const toolCtx: ToolContext = {
      editor: this.editor,
      viewport: this.viewport,
      requestRender: () => this.renderHooks.requestRender(),
      requestOverlayRender: () => this.renderHooks.requestOverlayRender(),
      setCursor: (cursor) => this.renderHooks.setCursor(cursor),
    };
    this.toolManager = new ToolManager(toolCtx);
    this.toolManager.register(this.moveTool);
    this.toolManager.register(this.rectTool);
  }

  private seedDocument() {
    const doc = createDocument(800, 600);
    const rect = createRectNode({
      name: 'Willkommen',
      width: 240,
      height: 160,
      cornerRadius: 12,
      fill: { type: 'solid', color: '#4a90d9' },
      transform: Matrix.translation(80, 80),
    });
    doc.nodes[rect.id] = rect;
    doc.rootChildren.push(rect.id);
    return doc;
  }
}

export const app = new AppShell();

interface UiState {
  spacePan: boolean;
  exportScale: 1 | 2 | 3;
  setSpacePan(active: boolean): void;
  setExportScale(scale: 1 | 2 | 3): void;
}

export const useUiStore = create<UiState>((set) => ({
  spacePan: false,
  exportScale: 2,
  setSpacePan: (spacePan) => set({ spacePan }),
  setExportScale: (exportScale) => set({ exportScale }),
}));
