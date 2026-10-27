'use client';

import React from 'react';
import { BookmarkCheck, BookmarkPlus, Loader2 } from 'lucide-react';
import { useExitMount } from '@/components/motion';

/**
 * Shared module-level UI bits and pure helpers extracted from
 * src/app/page.tsx so the page views (src/components/pages/*) and the shell
 * can use the same implementations without circular imports.
 */

// Card header for the DISCOVER mode — a bold, tall band across the top of the
// card: the author's photo pinned top-left in a white ring, the name centered
// on its own white pill, and a BIG bookmark toggle on the right. Shown ONLY in
// Discover (tests of other authors); the personal library keeps cards clean.
export function CreatorStrip({ name, creatorId, image, bookmarked, onToggleBookmark, addLabel, removeLabel, addShort, removeShort, onOpenProfile, openLabel, compact, title }: {
  name: string;
  creatorId?: string | null;
  image?: string | null;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  addLabel: string;
  removeLabel: string;
  addShort: string;
  removeShort: string;
  // Tapping the author's photo / name opens THAT user's library (dashboard
  // swaps to their public tests with a back arrow in the header)
  onOpenProfile?: () => void;
  openLabel?: string;
  // compact: for GRID cards (library/shelf) — a 40px band instead of 56-64px,
  // so a grid card with author + 6 action buttons still fits the fixed row
  // height (uniform card-size contract) while the TikTok feed keeps the big
  // full-size band.
  compact?: boolean;
  // Test title — rendered BETWEEN the author icon and the pin button (the
  // dashboard feed slide moved it up here from the old cover band). Optional:
  // strips without it (grid cards, version tree) keep the old layout.
  title?: string;
}) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase() || '?';
  // tg: references resolve through the same-origin avatar route; data:/http
  // images render directly. Anything else → the initial-letter avatar.
  const avatarSrc = image
    ? (image.startsWith('tg:') && creatorId
        ? `/api/users/${creatorId}/avatar`
        : (image.startsWith('data:') || image.startsWith('http') ? image : null))
    : null;
  const identity = onOpenProfile ? (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpenProfile(); }}
      title={openLabel || name}
      aria-label={openLabel || name}
      className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    />
  ) : null;
  return (
    <div className={`shrink-0 relative flex items-center rounded-3xl bg-gradient-to-r from-[#FFE3D6] via-[#FFF4EE] to-[#FFE3D6] border-2 border-black/10 pl-1.5 pr-1.5 shadow-md ${compact ? 'h-10' : 'h-14 sm:h-16'}`}>
      {/* Author photo — pinned left of the header band, big and ringed. No
      name text: the photo alone identifies the author (full name is the
      hover/long-press tooltip and lives in their library). */}
      <span
        className={`rounded-full overflow-hidden bg-cta text-white flex items-center justify-center font-extrabold ring-[3px] ring-white shadow-md shrink-0 ${compact ? 'w-8 h-8 text-sm' : 'w-11 h-11 sm:w-12 sm:h-12 text-base sm:text-lg'}`}
        title={name}
      >
        {avatarSrc ? <img src={avatarSrc} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : initial}
      </span>
      {identity}
      {/* Test title — parked between the author icon and the pin button
      (moved up from the old cover band). z-10 + later DOM order keep it
      above the profile overlay, so tapping the TITLE is inert; the avatar
      side of the strip still opens the creator's library. */}
      {title ? (
        <p title={title} className="relative z-10 flex-1 min-w-0 px-2 text-center font-bold text-cta leading-tight line-clamp-2 text-[15px] sm:text-base">{title}</p>
      ) : null}
      {/* The bookmark button — big and pretty: large icon + label on wide screens */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onToggleBookmark(); }}
        title={bookmarked ? removeLabel : addLabel}
        aria-label={bookmarked ? removeLabel : addLabel}
        className={`ml-auto shrink-0 relative z-10 flex items-center justify-center gap-1.5 border-2 text-xs font-bold transition-all active:scale-90 shadow-sm ${
          compact ? 'h-7 min-w-7 px-1.5 rounded-xl' : 'h-10 sm:h-11 min-w-10 sm:min-w-11 px-2.5 rounded-2xl'
        } ${
          bookmarked
            ? 'bg-primary text-white border-primary shadow-md hover:bg-primary/90'
            : 'bg-white border-black/20 text-black hover:border-black hover:shadow-md'
        }`}
      >
        {bookmarked ? <BookmarkCheck className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} /> : <BookmarkPlus className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} />}
        <span className={`hidden min-[430px]:inline max-w-[96px] truncate ${compact ? 'text-[10px]' : ''}`}>{bookmarked ? removeShort : addShort}</span>
      </button>
    </div>
  );
}

// Small floating pill shown while on-the-fly question translation is running
// (auto-translation only kicks in for questions with no stored translation).
export function TranslatingPill({ show, label }: { show: boolean; label: string }) {
  // Fade in/out instead of popping: the pill stays mounted briefly on hide
  const mounted = useExitMount(show, 220);
  if (!mounted) return null;
  return (
    <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-1.5 rounded-full bg-white border border-black/10 shadow-lg px-3 py-1.5 text-xs font-medium text-muted-foreground pointer-events-none ${show ? 'animate-in fade-in slide-in-from-top-2 duration-200' : 'animate-out fade-out slide-out-to-top-2 duration-200'}`}>
      <Loader2 className="w-3.5 h-3.5 animate-spin text-cta" />
      {label}
    </div>
  );
}

// Cover background color per topic — shared by the cover block and the whole swipe card
export function topicBgClass(topic?: string | null) {
  switch (topic) {
    case 'Physics': return 'bg-[#E3EEFF]';
    case 'Chemistry': return 'bg-[#DFF3E8]';
    case 'Mathematics': return 'bg-[#FFF0D9]';
    default: return 'bg-[#FCE8F2]';
  }
}

// Stable hash of a string (for tag-based cover styling)
export function tagHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 99991;
  return h;
}

// Cover background: derived from the first tag when present (tests created
// after tags replaced topic), otherwise from the legacy topic field
export function coverBgFor(test: { topic?: string | null; tags?: string[] | null }) {
  const tag = test.tags?.[0];
  if (tag) {
    const palette = ['bg-[#E3EEFF]', 'bg-[#DFF3E8]', 'bg-[#FFF0D9]', 'bg-[#FCE8F2]'];
    return palette[tagHash(tag) % palette.length];
  }
  return topicBgClass(test.topic);
}

// Resolve a media reference to a same-origin/browsable URL:
// data: stays inline, tg:<file_id> streams through /api/tgimg, anything else
// is already a URL.
export function imgSrc(u?: string | null): string {
  if (!u) return '';
  if (u.startsWith('data:')) return u;
  if (u.startsWith('tg:')) return `/api/tgimg/${encodeURIComponent(u.slice(3))}`;
  return u;
}

// Glassy tile style shared by the take-test drum, sheets and option rows.
export const GLASS_TILE = 'rounded-xl border border-black/15 bg-gradient-to-b from-white/70 via-white/5 to-white/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.10),0_1px_3px_rgba(0,0,0,0.08)]';
