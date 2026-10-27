'use client';

import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useExitMount } from '@/components/motion';

/** One selectable window in the bottom-sheet switcher dropdown. */
export interface SheetSwitchOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}

/** Passed to every bottom sheet so windows can be switched without closing. */
export interface SheetSwitcher {
  options: SheetSwitchOption[];
  onSelect: (key: string) => void;
}

/**
 * Bottom-sheet header: the down-arrow is merged with the window title.
 * Tapping it opens a dropdown listing all windows (Attached Files / AI Tutor /
 * Test Chat); picking one switches to that window. The X button still closes.
 */
export function SheetHeaderSwitcher({
  icon,
  title,
  subtitle,
  options,
  onSelect,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  options: SheetSwitchOption[];
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropMounted = useExitMount(open, 160);

  return (
    <div className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Switch window"
        className="flex items-center gap-2 min-w-0 w-full text-left rounded-xl active:scale-[0.98] transition-transform"
      >
        <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        <span className="w-8 h-8 bg-cta rounded-lg flex items-center justify-center shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm leading-tight truncate">{title}</span>
          {subtitle ? <span className="block text-xs text-muted-foreground leading-tight truncate">{subtitle}</span> : null}
        </span>
      </button>

      {/* Dropdown: stays mounted ~150ms after close so the fade-out can play */}
      {dropMounted && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-full mt-2 z-20 w-64 max-w-[calc(100vw-4rem)] rounded-2xl border border-black/10 bg-white shadow-2xl py-1.5 overflow-hidden ${open ? 'animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150' : 'animate-out fade-out zoom-out-95 duration-150'}`}>
            {options.map(o => (
              <button
                key={o.key}
                onClick={() => { setOpen(false); if (!o.active) onSelect(o.key); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors text-left ${
                  o.active ? 'bg-[#FFF0D9] font-semibold' : 'hover:bg-muted'
                }`}
              >
                <span className="w-7 h-7 rounded-lg bg-cta text-white flex items-center justify-center shrink-0">
                  {o.icon}
                </span>
                <span className="truncate">{o.label}</span>
                {o.active && <Check className="w-4 h-4 ml-auto shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
