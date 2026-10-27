'use client';

/**
 * Native PDF rendering that works in EVERY browser — including Android Chrome,
 * which cannot show PDFs inside <iframe>/<embed> (it draws an "Open" placeholder
 * instead). Pages are decoded with Mozilla PDF.js (pdfjs-dist) and drawn onto a
 * <canvas>, fully inline: page navigation, fit-width, zoom, swipe on mobile.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  }>;
  destroy: () => Promise<void>;
};

export function PdfCanvasViewer({
  url,
  heightClass = 'h-[540px]',
  initialPage = 1,
}: {
  url: string;
  heightClass?: string;
  initialPage?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1); // multiplier over fit-width
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Load the document once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const task = pdfjs.getDocument({ url, withCredentials: false });
        const doc = (await task.promise) as unknown as PdfDoc;
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPage(p => Math.min(Math.max(1, initialPage), doc.numPages));
      } catch (e) {
        if (!cancelled) {
          console.error('PDF.js load failed', e);
          setError('Could not load the PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      docRef.current?.destroy();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Render the current page onto the canvas (fit width * zoom, hi-dpi aware)
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!doc || !canvas || !wrap) return;
    try {
      setRendering(true);
      renderTaskRef.current?.cancel();
      const pdfPage = await doc.getPage(page);
      const cssWidth = wrap.clientWidth || 320;
      const base = pdfPage.getViewport({ scale: 1 });
      const fitScale = (cssWidth - 8) / base.width; // small padding
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: fitScale * zoom * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = pdfPage.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task as unknown as { cancel: () => void; promise: Promise<void> };
      await task.promise;
    } catch (e) {
      const name = (e as Error)?.name;
      if (name !== 'RenderingCancelledException') console.error('PDF.js render failed', e);
    } finally {
      setRendering(false);
    }
  }, [page, zoom]);

  useEffect(() => {
    if (!loading && docRef.current) renderPage();
  }, [loading, renderPage]);

  // Re-render on container resize (debounced)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => renderPage(), 200);
    });
    ro.observe(wrap);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [renderPage]);

  const go = useCallback((delta: number) => {
    setPage(p => Math.min(Math.max(1, p + delta), numPages || 1));
  }, [numPages]);

  // Keyboard arrows (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <div className={`mt-2 rounded-lg border border-black/10 bg-muted/40 overflow-hidden flex flex-col ${heightClass}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white border-b border-black/10 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page <= 1 || loading} onClick={() => go(-1)} aria-label="Previous page">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums min-w-[64px] text-center">
            {loading ? '…' : `${page} / ${numPages}`}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={!!numPages && page >= numPages || loading} onClick={() => go(1)} aria-label="Next page">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={zoom <= 0.6 || loading} onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums w-9 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={zoom >= 3 || loading} onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)))} aria-label="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas area (swipe left/right = page turn) */}
      <div
        ref={wrapRef}
        className="flex-1 overflow-auto bg-[#525659] flex justify-center items-start p-1"
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
          touchStartX.current = null;
        }}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 text-white/80 py-16">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-xs">Loading PDF…</span>
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/90 px-4 text-center">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">{error}</p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> Open in a new tab
            </a>
          </div>
        )}
        {!loading && !error && (
          <div className="relative">
            <canvas ref={canvasRef} className="block bg-white shadow-md" />
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-6 h-6 animate-spin text-white/80" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-2 py-1 bg-white border-t border-black/10 shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Swipe or use arrows to turn pages</span>
        <button
          onClick={() => { setPage(1); setZoom(1); renderPage(); }}
          className="text-[10px] text-muted-foreground hover:text-foreground underline flex items-center gap-1"
        >
          <RotateCw className="w-3 h-3" /> Reset
        </button>
      </div>
    </div>
  );
}
