import { Document } from '../core/model';
import { drawDocumentContent } from '../render/drawNode';

declare global {
  interface Window {
    vektor: {
      savePng(data: ArrayBuffer, suggestedName: string): Promise<{ saved: boolean; filePath?: string }>;
    };
  }
}

/**
 * Rendert das Dokument in voller Auflösung in ein Offscreen-Canvas
 * (unabhängig vom sichtbaren Viewport) und speichert es über den Main-Prozess.
 */
export async function exportPng(doc: Document, scale: 1 | 2 | 3): Promise<{ saved: boolean; filePath?: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(doc.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar');
  ctx.scale(scale, scale);
  drawDocumentContent(ctx, doc);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG-Kodierung fehlgeschlagen'))), 'image/png');
  });
  const buffer = await blob.arrayBuffer();
  const suffix = scale === 1 ? '' : `@${scale}x`;
  return window.vektor.savePng(buffer, `export${suffix}.png`);
}
