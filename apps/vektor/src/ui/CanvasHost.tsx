import { useEffect, useRef } from 'react';
import { app, useUiStore } from './appShell';
import { CanvasRenderer } from '../render/renderer';

const RULER_SIZE = 20;

function niceStep(scale: number): number {
  const minPx = 60;
  const raw = minPx / scale;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    if (power * m >= raw) return power * m;
  }
  return power * 10;
}

function drawRuler(
  canvas: HTMLCanvasElement,
  horizontal: boolean,
  lengthCss: number,
  dpr: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = Math.max(1, Math.round((horizontal ? lengthCss : RULER_SIZE) * dpr));
  canvas.height = Math.max(1, Math.round((horizontal ? RULER_SIZE : lengthCss) * dpr));
  canvas.style.width = `${horizontal ? lengthCss : RULER_SIZE}px`;
  canvas.style.height = `${horizontal ? RULER_SIZE : lengthCss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, horizontal ? lengthCss : RULER_SIZE, horizontal ? RULER_SIZE : lengthCss);

  const { viewport } = app;
  const step = niceStep(viewport.scale);
  const origin = horizontal ? viewport.docToScreen({ x: 0, y: 0 }).x : viewport.docToScreen({ x: 0, y: 0 }).y;
  const firstDocTick = Math.floor(-origin / viewport.scale / step) * step;

  ctx.strokeStyle = '#555555';
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '9px sans-serif';
  ctx.beginPath();
  for (let value = firstDocTick; ; value += step) {
    const pos = origin + value * viewport.scale;
    if (pos > lengthCss) break;
    if (pos < 0) continue;
    if (horizontal) {
      ctx.moveTo(pos + 0.5, RULER_SIZE);
      ctx.lineTo(pos + 0.5, RULER_SIZE - 7);
      ctx.fillText(String(value), pos + 3, 10);
    } else {
      ctx.moveTo(RULER_SIZE, pos + 0.5);
      ctx.lineTo(RULER_SIZE - 7, pos + 0.5);
      ctx.save();
      ctx.translate(10, pos + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.fillText(String(value), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();
}

export function CanvasHost(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const docCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const topRulerRef = useRef<HTMLCanvasElement>(null);
  const leftRulerRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const spacePan = useUiStore((s) => s.spacePan);

  useEffect(() => {
    const host = hostRef.current;
    const docCanvas = docCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const topRuler = topRulerRef.current;
    const leftRuler = leftRulerRef.current;
    if (!host || !docCanvas || !overlayCanvas || !topRuler || !leftRuler) return;

    const renderer = new CanvasRenderer(docCanvas, overlayCanvas, app.editor.doc, app.viewport);
    const removePainter = renderer.addOverlayPainter((c) => app.toolManager.paintOverlay(c));

    const redrawRulers = (): void => {
      const dpr = window.devicePixelRatio || 1;
      drawRuler(topRuler, true, host.clientWidth, dpr);
      drawRuler(leftRuler, false, host.clientHeight, dpr);
    };

    app.renderHooks = {
      requestRender: () => renderer.invalidateAll(),
      requestOverlayRender: () => renderer.invalidateOverlay(),
      setCursor: (cursor) => {
        host.style.cursor = cursor;
      },
      getViewSize: () => renderer.viewSize,
    };

    let didFit = false;
    const resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      renderer.resize(host.clientWidth, host.clientHeight, dpr);
      if (!didFit && host.clientWidth > 0) {
        didFit = true;
        app.viewport.fit(app.editor.doc.width, app.editor.doc.height, host.clientWidth, host.clientHeight);
      }
      redrawRulers();
    });
    resizeObserver.observe(host);

    const unsubscribeEditor = app.editor.subscribe((change) => {
      renderer.invalidateDocRect(change.dirtyRect);
    });
    const unsubscribeViewport = app.viewport.subscribe(() => {
      renderer.invalidateAll();
      redrawRulers();
    });

    const onWheel = (evt: WheelEvent): void => {
      evt.preventDefault();
      const rect = host.getBoundingClientRect();
      const local = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
      if (evt.metaKey || evt.ctrlKey) {
        app.viewport.zoomAt(local, Math.exp(-evt.deltaY * 0.0015));
      } else {
        app.viewport.panBy(-evt.deltaX, -evt.deltaY);
      }
    };
    host.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      host.removeEventListener('wheel', onWheel);
      unsubscribeEditor();
      unsubscribeViewport();
      resizeObserver.disconnect();
      removePainter();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (spacePan) {
      host.style.cursor = 'grab';
    } else {
      host.style.cursor = app.toolManager.active?.cursor ?? 'default';
    }
  }, [spacePan]);

  const localPoint = (evt: React.PointerEvent): { x: number; y: number } => {
    const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const onPointerDown = (evt: React.PointerEvent): void => {
    const host = hostRef.current;
    if (!host) return;
    host.setPointerCapture(evt.pointerId);
    const wantsPan = useUiStore.getState().spacePan || evt.button === 1;
    if (wantsPan) {
      panRef.current = { pointerId: evt.pointerId, lastX: evt.clientX, lastY: evt.clientY };
      host.style.cursor = 'grabbing';
      return;
    }
    if (evt.button !== 0) return;
    app.toolManager.handlePointerDown(localPoint(evt), evt.nativeEvent);
  };

  const onPointerMove = (evt: React.PointerEvent): void => {
    const pan = panRef.current;
    if (pan && pan.pointerId === evt.pointerId) {
      app.viewport.panBy(evt.clientX - pan.lastX, evt.clientY - pan.lastY);
      pan.lastX = evt.clientX;
      pan.lastY = evt.clientY;
      return;
    }
    app.toolManager.handlePointerMove(localPoint(evt), evt.nativeEvent);
  };

  const onPointerUp = (evt: React.PointerEvent): void => {
    const host = hostRef.current;
    if (host?.hasPointerCapture(evt.pointerId)) host.releasePointerCapture(evt.pointerId);
    if (panRef.current?.pointerId === evt.pointerId) {
      panRef.current = null;
      host?.style.setProperty('cursor', useUiStore.getState().spacePan ? 'grab' : (app.toolManager.active?.cursor ?? 'default'));
      return;
    }
    app.toolManager.handlePointerUp(localPoint(evt), evt.nativeEvent);
  };

  return (
    <>
      <div className="ruler-corner" />
      <canvas ref={topRulerRef} className="ruler top" />
      <canvas ref={leftRulerRef} className="ruler left" />
      <div
        ref={hostRef}
        className="canvas-host"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={docCanvasRef} />
        <canvas ref={overlayCanvasRef} />
      </div>
    </>
  );
}
