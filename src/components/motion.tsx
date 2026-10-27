'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Motion primitives shared by every screen.
 *
 * Goal: NOTHING in the UI appears from nowhere or vanishes into nowhere —
 * every overlay gets an enter AND an exit animation, every collapsible
 * section grows/shrinks smoothly.
 */

/**
 * Delayed unmount for conditionally-shown overlays.
 *
 * Usage pattern (inside a component that receives an `open` prop):
 *   const mounted = useExitMount(open);
 *   if (!mounted) return null;
 *   ... root className: open ? 'animate-in ...' : 'animate-out ... pointer-events-none'
 *
 * While `open` is true the element renders immediately; when it flips to
 * false the element stays mounted for `durationMs` so the exit animation can
 * play, then really unmounts.
 */
export function useExitMount(open: boolean, durationMs = 220): boolean {
  const [mounted, setMounted] = useState(open);
  const mountedRef = useRef(open);
  mountedRef.current = mounted;
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    // Closing: keep rendering while the exit animation plays
    if (!mountedRef.current) return;
    const t = setTimeout(() => setMounted(false), durationMs);
    return () => { clearTimeout(t); };
  }, [open, durationMs]);
  return mounted;
}

/**
 * Accordion-style smooth expand/collapse (the CSS grid-rows 0fr -> 1fr
 * trick). Children stay MOUNTED while closed (inert + aria-hidden) so the
 * content never pops into existence — it grows out of the header.
 *
 * `keepMountedOnceShown` additionally delays the very first mount until the
 * first open — used for heavy sections (attachment editor) whose lazy chunks
 * should not load until actually needed; after that first open the section
 * keeps animating both ways without remounting.
 */
export function Collapse({
  open,
  className = '',
  keepMountedOnceShown = false,
  children,
}: {
  open: boolean;
  className?: string;
  keepMountedOnceShown?: boolean;
  children: React.ReactNode;
}) {
  // With keepMountedOnceShown the content is not rendered at all until the
  // first open; afterwards it stays mounted forever (inert when closed).
  const [everOpened, setEverOpened] = useState(!keepMountedOnceShown);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  if (keepMountedOnceShown && !everOpened) return null;

  return (
    <div
      className={`grid grid-rows-[0fr] collapse-motion ${open ? '!grid-rows-[1fr]' : ''} ${className}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="collapse-inner">{children}</div>
    </div>
  );
}
