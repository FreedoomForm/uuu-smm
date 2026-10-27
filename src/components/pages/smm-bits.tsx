'use client';

// Small shared bits of the SMM screens: platform meta, avatar fallback,
// money formatting, media URL resolution and the Google-Maps embed URL.

import React, { useEffect, useRef, useState } from 'react';
import { Instagram, Music2, Send, Youtube } from 'lucide-react';

export function eventPlatformIcon(platform: string, cls = 'w-4 h-4') {
  switch (platform) {
    case 'instagram': return <Instagram className={`${cls} text-pink-600`} />;
    case 'telegram': return <Send className={`${cls} text-sky-500`} />;
    case 'youtube': return <Youtube className={`${cls} text-red-600`} />;
    case 'tiktok': return <Music2 className={`${cls} text-black`} />;
    default: return <Instagram className={`${cls} text-pink-600`} />;
  }
}

export function eventPlatformLabel(platform: string, t: (k: string) => string) {
  switch (platform) {
    case 'instagram': return 'Instagram';
    case 'telegram': return 'Telegram';
    case 'youtube': return 'YouTube';
    case 'tiktok': return 'TikTok';
    default: return 'Online';
  }
}

export const SMM_PLATFORMS = ['instagram', 'telegram', 'youtube', 'tiktok'] as const;

export function fmtMoney(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return '—';
  const s = n % 1 === 0 ? String(n) : n.toFixed(2);
  return s;
}

// tg:<file_id> streams through /api/tgimg, data:/http(s) render directly
export function mediaSrc(u?: string | null): string {
  if (!u) return '';
  if (u.startsWith('data:')) return u;
  if (u.startsWith('tg:')) return `/api/tgimg/${encodeURIComponent(u.slice(3))}`;
  return u;
}

export function mapEmbedUrl(location: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=14&output=embed`;
}

// Round initial avatar with the same fallback rules as CreatorStrip
export function AvatarFallbackName({ name, image, creatorId, big }: {
  name: string; image?: string | null; creatorId?: string | null; big?: boolean;
}) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase() || '?';
  const src = image
    ? (image.startsWith('tg:') && creatorId
        ? `/api/users/${creatorId}/avatar`
        : (image.startsWith('data:') || image.startsWith('http') ? image : null))
    : null;
  return (
    <span className={`rounded-full overflow-hidden bg-cta text-white flex items-center justify-center font-extrabold ring-2 ring-white shadow-md shrink-0 ${big ? 'w-11 h-11 text-base' : 'w-9 h-9 text-sm'}`} title={name}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : initial}
    </span>
  );
}

// Lightweight toast for the 'smm-toast' event. Lives HERE (shared bits) so
// every surface can mount it: the smm dashboard AND the standalone editor
// pages (apply / invite / post / event) — before this, toasts fired on the
// apply page were invisible (the host only existed inside the dashboard),
// which left API errors AND the «заявка отправлена» confirmation unseen.
export function SmmToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      setMsg((e as CustomEvent).detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener('smm-toast', on);
    return () => window.removeEventListener('smm-toast', on);
  }, []);
  if (!msg) return null;
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[80] rounded-full bg-black/85 text-white text-sm px-4 py-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 max-w-[90vw] truncate">
      {msg}
    </div>
  );
}
