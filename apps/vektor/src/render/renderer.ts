import { Rect, inflateRect, rectUnion, transformRect } from '../core/geometry';
import { Document } from '../core/model';
import { Viewport } from './viewport';
import { drawDocumentContent } from './drawNode';

export type OverlayPainter = (ctx: CanvasRenderingContext2D) => void;

/**
 * Zwei-Schichten-Renderer:
 *  - Dokument-Canvas mit Dirty-Rect-Rendering
 *  - Overlay-Canvas (Handles, Tool-Previews), pro Frame komplett neu gezeichnet
 * Alles läuft gedrosselt über requestAnimationFrame.
 */
export class CanvasRenderer {
  private docCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private overlayPainters = new Set<OverlayPainter>();

  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  /** Dirty-Region in Dokumentkoordinaten; null+flag = kompletter Frame. */
  private dirtyDocRect: Rect | null = null;
  private fullRepaint = true;
  private overlayDirty = true;
  private frameHandle: number | null = null;
  private disposed = false;

  constructor(
    private docCanvas: HTMLCanvasElement,
    private overlayCanvas: HTMLCanvasElement,
    private doc: Document,
    private viewport: Viewport,
  ) {
    const docCtx = docCanvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');
    if (!docCtx || !overlayCtx) throw new Error('Canvas 2D-Kontext nicht verfügbar');
    this.docCtx = docCtx;
    this.overlayCtx = overlayCtx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    for (const canvas of [this.docCanvas, this.overlayCanvas]) {
      canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
    this.invalidateAll();
  }

  get viewSize(): { width: number; height: number } {
    return { width: this.cssWidth, height: this.cssHeight };
  }

  invalidateAll(): void {
    this.fullRepaint = true;
    this.overlayDirty = true;
    this.schedule();
  }

  invalidateDocRect(rect: Rect | null): void {
    if (rect === null) {
      this.fullRepaint = true;
    } else if (!this.fullRepaint) {
      this.dirtyDocRect = rectUnion(this.dirtyDocRect, rect);
    }
    this.overlayDirty = true;
    this.schedule();
  }

  invalidateOverlay(): void {
    this.overlayDirty = true;
    this.schedule();
  }

  addOverlayPainter(painter: OverlayPainter): () => void {
    this.overlayPainters.add(painter);
    this.invalidateOverlay();
    return () => {
      this.overlayPainters.delete(painter);
      this.invalidateOverlay();
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
  }

  private schedule(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = null;
      this.flush();
    });
  }

  private flush(): void {
    if (this.disposed) return;
    if (this.fullRepaint || this.dirtyDocRect) this.paintDocument();
    if (this.overlayDirty) this.paintOverlay();
  }

  private paintDocument(): void {
    const ctx = this.docCtx;
    const viewMatrix = this.viewport.docToScreenMatrix();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    let clip: Rect | null = null;
    if (!this.fullRepaint && this.dirtyDocRect) {
      clip = inflateRect(transformRect(viewMatrix, this.dirtyDocRect), 1);
    }
    this.fullRepaint = false;
    this.dirtyDocRect = null;

    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.width, clip.height);
      ctx.clip();
    }

    // Arbeitsfläche
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    // Artboard-Schatten
    const artboard = transformRect(viewMatrix, { x: 0, y: 0, width: this.doc.width, height: this.doc.height });
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = this.doc.background;
    ctx.fillRect(artboard.x, artboard.y, artboard.width, artboard.height);
    ctx.restore();

    // Dokumentinhalt, auf das Artboard beschnitten
    ctx.save();
    ctx.beginPath();
    ctx.rect(artboard.x, artboard.y, artboard.width, artboard.height);
    ctx.clip();
    ctx.transform(...viewMatrix.toCanvasArgs());
    drawDocumentContent(ctx, this.doc);
    ctx.restore();

    ctx.restore();
  }

  private paintOverlay(): void {
    this.overlayDirty = false;
    const ctx = this.overlayCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    for (const painter of this.overlayPainters) {
      ctx.save();
      painter(ctx);
      ctx.restore();
    }
  }
}
