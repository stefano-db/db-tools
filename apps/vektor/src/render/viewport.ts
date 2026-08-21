import { Matrix, Point } from '../core/geometry';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;

/** Pan/Zoom-Zustand: screen = doc * scale + offset. */
export class Viewport {
  private scaleValue = 1;
  private offsetX = 0;
  private offsetY = 0;
  private listeners = new Set<() => void>();

  get scale(): number {
    return this.scaleValue;
  }

  docToScreenMatrix(): Matrix {
    return new Matrix(this.scaleValue, 0, 0, this.scaleValue, this.offsetX, this.offsetY);
  }

  docToScreen(p: Point): Point {
    return { x: p.x * this.scaleValue + this.offsetX, y: p.y * this.scaleValue + this.offsetY };
  }

  screenToDoc(p: Point): Point {
    return { x: (p.x - this.offsetX) / this.scaleValue, y: (p.y - this.offsetY) / this.scaleValue };
  }

  panBy(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
    this.notify();
  }

  /** Zoomt so, dass der Dokumentpunkt unter `screenAnchor` an Ort und Stelle bleibt. */
  zoomAt(screenAnchor: Point, factor: number): void {
    this.setZoom(this.scaleValue * factor, screenAnchor);
  }

  setZoom(scale: number, screenAnchor?: Point): void {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    if (screenAnchor) {
      const anchor = this.screenToDoc(screenAnchor);
      this.offsetX = screenAnchor.x - anchor.x * next;
      this.offsetY = screenAnchor.y - anchor.y * next;
    }
    this.scaleValue = next;
    this.notify();
  }

  /** Dokument zentriert einpassen (Cmd+0). */
  fit(docWidth: number, docHeight: number, viewWidth: number, viewHeight: number, padding = 48): void {
    const available = { w: Math.max(1, viewWidth - padding * 2), h: Math.max(1, viewHeight - padding * 2) };
    const scale = Math.min(available.w / docWidth, available.h / docHeight, MAX_ZOOM);
    this.scaleValue = Math.max(MIN_ZOOM, scale);
    this.centerOn(docWidth, docHeight, viewWidth, viewHeight);
  }

  /** 100 % zentriert (Cmd+1). */
  actualSize(docWidth: number, docHeight: number, viewWidth: number, viewHeight: number): void {
    this.scaleValue = 1;
    this.centerOn(docWidth, docHeight, viewWidth, viewHeight);
  }

  private centerOn(docWidth: number, docHeight: number, viewWidth: number, viewHeight: number): void {
    this.offsetX = (viewWidth - docWidth * this.scaleValue) / 2;
    this.offsetY = (viewHeight - docHeight * this.scaleValue) / 2;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
