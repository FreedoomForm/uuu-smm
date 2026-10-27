'use client';

import React, { useEffect, useState } from 'react';

// ----- HEX <-> HSV helpers -----
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return { h: 0, s: 0, v: 1 };
  const n = m[1];
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number] = [0, 0, 0];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`.toUpperCase();
}

// ----- Photoshop-style picker: SV square + hue strip + hex input -----
export function PhotoshopColorPicker({
  value,
  onChange,
}: {
  value: string; // hex like "#AABBCC", always a valid 6-digit color
  onChange: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const svRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  // Re-sync when the value changes externally (e.g. Auto reset)
  useEffect(() => {
    if (value && value.toUpperCase() !== hsvToHex(hsv.h, hsv.s, hsv.v)) {
      setHsv(hexToHsv(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const applySv = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const next = { ...hsv, s, v };
    setHsv(next);
    onChange(hsvToHex(next.h, next.s, next.v));
  };

  return (
    <div className="space-y-3">
      {/* Saturation / Value square */}
      <div
        ref={svRef}
        onPointerDown={e => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          applySv(e.clientX, e.clientY);
        }}
        onPointerMove={e => {
          if (draggingRef.current) applySv(e.clientX, e.clientY);
        }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        className="relative h-44 w-full rounded-xl cursor-crosshair touch-none select-none border border-black/10 overflow-hidden"
        style={{ backgroundColor: hsvToHex(hsv.h, 1, 1) }}
      >
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #FFFFFF, transparent)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000000, transparent)' }} />
        {/* Cursor */}
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v),
          }}
        />
      </div>

      {/* Hue strip */}
      <input
        type="range"
        min={0}
        max={360}
        value={hsv.h}
        onChange={e => {
          const next = { ...hsv, h: Number(e.target.value) };
          setHsv(next);
          onChange(hsvToHex(next.h, next.s, next.v));
        }}
        aria-label="Hue"
        className="w-full h-3 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black/30 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black/30"
        style={{ background: 'linear-gradient(to right, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)' }}
      />

      {/* Preview + hex input */}
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-lg border border-black/10 shrink-0"
          style={{ backgroundColor: value }}
          aria-hidden
        />
        <input
          type="text"
          value={value}
          onChange={e => {
            const v = e.target.value.trim().toUpperCase();
            if (/^#?[0-9A-F]{0,6}$/.test(v)) {
              const norm = v.startsWith('#') ? v : `#${v}`;
              if (/^#[0-9A-F]{6}$/.test(norm)) onChange(norm);
            }
          }}
          placeholder="#E3EEFF"
          maxLength={7}
          className="w-28 text-sm px-2 py-1.5 rounded-md border border-input bg-transparent outline-none focus:border-cta"
        />
      </div>
    </div>
  );
}
