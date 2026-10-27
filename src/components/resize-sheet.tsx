'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useExitMount } from '@/components/motion';

/**
 * Resizable bottom sheets.
 *
 * Every bottom window (attached files, AI chat, test chat, edit sheet) gets a
 * drag bar: pull it UP to grow the sheet — all the way to the very top of the
 * screen — or pull it DOWN to shrink and finally close it. Previously the
 * sheets had a fixed height and could only be dropped closed.
 */

export interface ResizableSheetOptions {
  /** Initial height as a fraction of the viewport height (default 0.78). */
  initialVh?: number;
  /** Minimum usable height fraction; dragging below ~60% of it closes the sheet. */
  minVh?: number;
  /** Called when the user flings/drags the sheet down to close it. */
  onClose?: () => void;
}

export interface ResizableSheet {
  /** Current height in px (driven during drag). */
  height: number | null;
  style: React.CSSProperties;
  /** true while the user is actively dragging. */
  dragging: boolean;
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  reset: () => void;
}

export function useResizableSheet({ initialVh = 0.78, minVh = 0.35, onClose }: ResizableSheetOptions = {}): ResizableSheet {
  const [height, setHeight] = useState<number | null>(null); // null → use initialVh
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number; lastY: number; lastT: number; vel: number } | null>(null);

  const vh = () => (typeof window !== 'undefined' ? window.innerHeight : 800);
  const h = () => (height !== null ? height : vh() * initialVh);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: h(), lastY: e.clientY, lastT: Date.now(), vel: 0 };
    setDragging(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, initialVh]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const now = Date.now();
    const dt = Math.max(1, now - d.lastT);
    d.vel = (e.clientY - d.lastY) / dt; // px per ms, positive = downward
    d.lastY = e.clientY;
    d.lastT = now;
    const next = Math.max(120, Math.min(vh(), d.startH + (d.startY - e.clientY)));
    setHeight(next);
  }, []);

  const finish = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    const cur = h();
    const minPx = vh() * minVh;
    const openPx = vh() * initialVh;
    // Fling down → close; drag well below the minimum → close
    if (d.vel > 0.9 || cur < minPx * 0.6) {
      setHeight(null);
      onClose?.();
      return;
    }
    // Fling up / dragged near the top → snap full height
    if (d.vel < -0.9 || cur > vh() * 0.92) {
      setHeight(vh());
      return;
    }
    // Otherwise snap back to at least the minimum usable height
    setHeight(Math.max(minPx, Math.min(vh(), cur)) || openPx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minVh, initialVh, onClose, height]);

  return {
    height,
    dragging,
    style: height !== null ? { height: `${height}px`, maxHeight: '100dvh' } : { height: `${initialVh * 100}vh` },
    handleProps: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
    reset: () => setHeight(null),
  };
}

/** The visible grab bar. Put it as the FIRST child inside the sheet panel. */
export function DragHandle({ handleProps, dragging }: { handleProps: ResizableSheet['handleProps']; dragging?: boolean }) {
  return (
    <div
      {...handleProps}
      aria-hidden="true"
      className="drag-handle shrink-0 flex items-center justify-center pt-2 pb-1 cursor-row-resize select-none"
      style={{ touchAction: 'none' }}
    >
      <div
        className={`h-1.5 w-14 rounded-full transition-colors ${
          dragging ? 'bg-primary/70' : 'bg-black/20'
        }`}
      />
    </div>
  );
}

/**
 * Full chrome for a resizable bottom sheet (backdrop + panel + drag bar).
 * `header` / `body` / `footer` are the sheet's own content.
 */
export function ResizableSheetFrame({
  onClose,
  open,
  initialVh = 0.85,
  minVh = 0.4,
  maxW = '',
  header,
  body,
  footer,
}: {
  onClose: () => void;
  /** Controlled visibility. Provided → the frame stays mounted while the
      slide-down exit animation plays (nothing disappears into nowhere).
      Omitted → always shown (legacy usage). */
  open?: boolean;
  initialVh?: number;
  minVh?: number;
  /** extra width classes for the panel, e.g. 'max-w-3xl' */
  maxW?: string;
  header: React.ReactNode;
  body: React.ReactNode;
  /** optional — the profile / agent sheets run without a footer action bar */
  footer?: React.ReactNode;
}) {
  const sheet = useResizableSheet({ initialVh, minVh, onClose });
  const mounted = useExitMount(open !== false, 200);
  if (!mounted) return null;
  const exiting = open === false;
  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/50 ${exiting ? 'animate-out fade-out pointer-events-none duration-200' : 'animate-in fade-in duration-200'}`} onClick={onClose} />
      <div
        className={`desktop-dialog-panel absolute inset-x-0 bottom-0 mx-auto ${maxW} bg-white rounded-t-3xl shadow-2xl border-t border-black/10 flex flex-col ${exiting ? 'animate-out slide-out-to-bottom fade-out pointer-events-none duration-200' : 'animate-in slide-in-from-bottom duration-200'}`}
        style={{ ...sheet.style, maxHeight: '100dvh' }}
      >
        <DragHandle handleProps={sheet.handleProps} dragging={sheet.dragging} />
        {header}
        <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
        {footer}
      </div>
    </div>
  );
}
