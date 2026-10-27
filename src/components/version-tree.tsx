'use client';

// ---------------------------------------------------------------------------
// VERSION TREE — the ONE CONTINUOUS LINE OF TIME.
//
//   Instead of swiping between separate level-screens, the family is drawn as
//   a single vertical line (the trunk of time): the ORIGINAL test at the top,
//   generations flowing downward — the lower a node stands, the newer it is.
//   One finger movement scrolls smoothly through ALL generations — there is
//   NO separation between levels anymore.
//
//   From that line the VERSIONS come out to the LEFT and to the RIGHT, in
//   createdAt order (oldest of the pair left, next right, …), each hanging on
//   its own little branch. Tapping ANY node (on the line or on a branch)
//   re-roots the view at that test — its own line grows below it.
//
//   This is the INNER surface of the tree card in the recommendation feed:
//   the card is a SLIDE of the dashboard's outer tree feed. The timeline
//   keeps its gestures to itself (data-inner-scroll + swiper-no-swiping —
//   the same contract as the attached-files list) so the outer feed's swipe
//   lives on the header/hint areas, exactly like the files feed.
//
//   In the LIBRARY/SHELF grid the tree renders as ONE FULL TEST CARD PER CELL
//   (dashboard-view.tsx) — the regular card code draws every version.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { TreeNode } from '@/lib/app-types';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';
import type { Lang } from '@/lib/i18n';
import { GitBranch, RotateCcw, TreeDeciduous } from 'lucide-react';
import { CreatorStrip, coverBgFor } from '@/components/shared-bits';

// Palette — the same warm wood tones the tree has always worn.
const C_TRUNK = '#7A5230';
const C_BRANCH = '#6F4A2A';
const C_INK = '#40634D';

const EMPTY_APPLES: TreeNode[] = [];

// Geometry constants (px) of the timeline.
const STATION_AV = 44;      // avatar size of a node ON the line
const BRANCH_AV = 36;       // avatar size of a branched-out version
const STATION_HALF_W = 52;  // half-width of the space a station owns
const BRANCH_DX = 104;      // branch avatar center offset from the line
const BRANCH_STEP = 78;     // vertical step between stacked branches
const ROW_MIN = 104;        // minimum vertical space per line node
const TOP_PAD = 18;
const BOTTOM_PAD = 30;

function avatarSrc(image: string | null | undefined, userId?: string): string {
  if (!image) return '';
  if (image.startsWith('tg:') && userId) return `/api/users/${userId}/avatar`;
  if (image.startsWith('data:') || image.startsWith('http')) return image;
  return '';
}

interface Station {
  node: TreeNode;
  y: number;        // avatar center
  isViewRoot: boolean;
}
interface BranchNode {
  node: TreeNode;
  x: number;        // avatar center
  y: number;        // avatar center
  parentY: number;  // y of the parent station on the line
  side: 'l' | 'r';
}
interface TimelineLayout {
  height: number;
  stations: Station[];
  branches: BranchNode[];
}

/** Build the line of time: ancestors of the viewed test from the family
 * trunk down to it, then — downward — the newest-child chain (the line keeps
 * flowing into the future as far as the family goes). Every child NOT on the
 * line branches left/right in createdAt order (oldest left). */
function buildTimeline(family: { nodes: TreeNode[] }, viewRootId: string): TimelineLayout {
  const byId = new Map<string, TreeNode>();
  const kidsByParent = new Map<string, TreeNode[]>();
  for (const n of family.nodes) {
    byId.set(n.id, n);
    const k = n.parentId || '';
    const arr = kidsByParent.get(k);
    if (arr) arr.push(n); else kidsByParent.set(k, [n]);
  }
  for (const arr of kidsByParent.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ancestors: viewRoot → … → trunk
  const up: TreeNode[] = [];
  const seen = new Set<string>();
  let cur: TreeNode | undefined = byId.get(viewRootId);
  while (cur && !seen.has(cur.id)) {
    up.push(cur);
    seen.add(cur.id);
    const pid = cur.parentId || '';
    cur = pid ? byId.get(pid) : undefined;
  }
  up.reverse(); // [trunk, …, viewRoot]

  // descendants: the newest child chain keeps the line flowing downward
  const down: TreeNode[] = [];
  const seenD = new Set<string>(seen);
  let tail = viewRootId;
  for (let guard = 0; guard < 40; guard++) {
    const kids = (kidsByParent.get(tail) || []).filter(k => !seenD.has(k.id));
    if (kids.length === 0) break;
    const newest = kids[kids.length - 1]; // createdAt asc → last is newest
    down.push(newest);
    seenD.add(newest.id);
    tail = newest.id;
  }

  const spine = [...up, ...down];
  const stations: Station[] = [];
  const branches: BranchNode[] = [];
  let y = TOP_PAD + STATION_AV / 2 + 6;
  let maxY = y + STATION_AV / 2;

  for (const node of spine) {
    stations.push({ node, y, isViewRoot: node.id === viewRootId });
    maxY = Math.max(maxY, y + STATION_AV / 2 + 34); // avatar + name + role label
    // the versions that do NOT continue the line hang off it by time
    const off = (kidsByParent.get(node.id) || []).filter(k => !seenD.has(k.id));
    if (off.length > 0) {
      const leftCount = Math.ceil(off.length / 2);
      const rightCount = off.length - leftCount;
      const sideMax = Math.max(leftCount, rightCount);
      off.forEach((k, j) => {
        const side: 'l' | 'r' = j % 2 === 0 ? 'l' : 'r';
        const slot = Math.floor(j / 2);
        const yy = Math.max(BRANCH_AV / 2 + 10, y + (slot - ((side === 'l' ? leftCount : rightCount) - 1) / 2) * BRANCH_STEP);
        branches.push({
          node: k,
          x: side === 'l' ? -BRANCH_DX : BRANCH_DX,
          y: yy,
          parentY: y,
          side,
        });
        maxY = Math.max(maxY, yy + BRANCH_AV / 2 + 26); // avatar + name + date
      });
      y += Math.max(ROW_MIN, sideMax * BRANCH_STEP + 26);
    } else {
      y += ROW_MIN;
    }
  }

  return { height: maxY + BOTTOM_PAD, stations, branches };
}

// ---- component ----------------------------------------------------------------

export interface VersionTreeProps {
  /** The test whose tree is shown (the starting root of the view). */
  testId: string;
  /** Bookmarked test ids of the viewer — drives the pin button of the
  STANDARD CARD HEADER (avatar + pin) shown above the cover band. */
  bookmarkIds?: Set<string> | null;
  /** The dashboard's bookmark toggle — its absence hides the header strip. */
  onToggleBookmark?: (test: any) => void;
  /** The viewing user — the avatar fallback for tests without creator info. */
  userFallback?: { name?: string | null; image?: string | null } | null;
}

export default function VersionTreeView({ testId, bookmarkIds, onToggleBookmark, userFallback }: VersionTreeProps) {
  const lang = useSessionStore(s => s.lang);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [family, setFamily] = useState<{ rootId: string; nodes: TreeNode[] } | null>(null);
  const [viewRootId, setViewRootId] = useState<string>(testId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFamily = useCallback((id: string) => {
    setLoading(true);
    setError(null);
    api.getTestTree(id)
      .then(data => {
        setFamily(data);
        if (!data.nodes.some(n => n.id === id)) {
          setError(t('noResults'));
        }
      })
      .catch(e => setError(e?.message || 'Error'))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchFamily(viewRootId);
  }, [viewRootId, fetchFamily]);

  // apple tap → re-root the line at THAT version: its own line grows below it
  const navigate = useCallback((id: string) => {
    if (id === viewRootId) return;
    setViewRootId(id);
  }, [viewRootId]);

  const layout = useMemo(() => (family ? buildTimeline(family, viewRootId) : null), [family, viewRootId]);
  const viewRoot = family?.nodes.find(n => n.id === viewRootId) || null;
  const directCount = useMemo(() => (family ? family.nodes.filter(n => (n.parentId || '') === viewRootId).length : 0), [family, viewRootId]);
  const dateFmt = useMemo(() => {
    try {
      const loc = lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US';
      return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' });
    } catch { return null; }
  }, [lang]);

  // ---- rendering -----------------------------------------------------------

  if (loading && !family) {
    return (
      <div className="w-full h-full max-w-md lg:max-w-3xl mx-auto flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-2xl sm:h-32" />
        <Skeleton className="flex-1 w-full rounded-3xl min-h-64" />
      </div>
    );
  }

  if (error && !family) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center">
        <TreeDeciduous className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground px-6">{error}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-full border-black h-9" onClick={() => fetchFamily(viewRootId)}>
            <RotateCcw className="w-4 h-4 mr-1.5" /> {t('restart')}
          </Button>
        </div>
      </div>
    );
  }

  // THE STANDARD CARD HEADER — the same cover band the regular test cards
  // wear on the main page (colored band + big bold title) over the author
  // strip (avatar + pin). It always describes the ROOT of the current line.
  const activeBgClass = viewRoot?.coverColor ? '' : coverBgFor({ topic: viewRoot?.topic });
  const activeBgStyle = viewRoot?.coverColor ? { backgroundColor: viewRoot.coverColor } : undefined;

  const header = (
    <div className="shrink-0 flex flex-col gap-1.5">
      {/* NO back button here on purpose: the dashboard's universal top-panel
      back is THE one exit — two back arrows on one screen confused users. */}
      {onToggleBookmark && viewRoot && (
        <CreatorStrip
          name={viewRoot.creator?.name || userFallback?.name || ''}
          creatorId={viewRoot.creatorId}
          image={viewRoot.creator?.image || userFallback?.image || null}
          bookmarked={!!bookmarkIds?.has(viewRoot.id)}
          onToggleBookmark={() => onToggleBookmark({ id: viewRoot.id, title: viewRoot.title, creatorId: viewRoot.creatorId } as any)}
          addLabel={t('bookmarkAdd')}
          removeLabel={t('bookmarkRemove')}
          addShort={t('bookmarkAddShort')}
          removeShort={t('bookmarkRemoveShort')}
          openLabel={t('openProfile')}
        />
      )}
      <div className="relative h-24 min-h-14 shrink sm:h-32 md:h-36 overflow-hidden rounded-2xl">
        <div style={activeBgStyle} className={`w-full h-full flex flex-col items-center justify-center px-4 text-center ${activeBgClass}`}>
          <p className="text-xl sm:text-2xl font-bold text-cta leading-snug line-clamp-2 px-2">{viewRoot?.title || t('versionTree')}</p>
          {/* The version's own name from the naming dialog — the label that
          distinguishes this version from its siblings in the tree */}
          {viewRoot?.versionName ? (
            <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-white/90 border border-cta/30 px-2 py-0.5 text-[10.5px] font-semibold text-cta">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate">{viewRoot.versionName}</span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 rounded-2xl bg-white/85 border border-black/10 px-3 py-1.5 flex items-center justify-center gap-2">
        <span className="text-[11px] font-semibold text-foreground/70 whitespace-nowrap">{t('versionTree')}</span>
        <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF0D9] text-cta whitespace-nowrap">
          {t('treeVersionsCount', { n: directCount })}
        </span>
      </div>
    </div>
  );

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return dateFmt ? dateFmt.format(d) : d.toLocaleDateString(); } catch { return ''; }
  };

  const Avatar = ({ node, size, version }: { node: TreeNode; size: number; version: boolean }) => {
    const author = node.creator;
    const src = avatarSrc(author?.image, author?.id);
    const initial = (author?.name || '?').trim().slice(0, 1).toUpperCase() || '?';
    return (
      <span
        className="rounded-full overflow-hidden bg-cta text-white flex items-center justify-center font-extrabold shrink-0"
        style={{
          width: size, height: size, fontSize: size * 0.4,
          boxShadow: version
            ? '0 0 0 2px #fff, 0 0 0 4px #E23B2E, 0 2px 5px rgba(58,29,7,.35)'
            : '0 0 0 2px #fff, 0 0 0 4px ' + C_TRUNK + ', 0 2px 5px rgba(58,29,7,.3)',
        }}
      >
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : initial}
      </span>
    );
  };

  // the line of time itself — a soft light halo + the wooden trunk line,
  // plus one little branch per version (HTML divs — no SVG calc quirks)
  const firstY = layout?.stations[0]?.y ?? TOP_PAD;
  const lastY = layout?.stations[layout.stations.length - 1]?.y ?? firstY;
  const lines = layout ? (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div
        className="absolute -translate-x-1/2 rounded-full"
        style={{ left: '50%', top: firstY, height: Math.max(0, lastY - firstY), width: 8, background: C_TRUNK, opacity: 0.16 }}
      />
      <div
        className="absolute -translate-x-1/2 rounded-full"
        style={{ left: '50%', top: firstY, height: Math.max(0, lastY - firstY), width: 3.5, background: C_TRUNK }}
      />
      {layout.branches.map(b => {
        const dx = b.x;
        const dy = b.y - b.parentY;
        const len = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        return (
          <div
            key={`bl-${b.node.id}`}
            className="absolute rounded-full"
            style={{
              left: '50%', top: b.parentY, width: len, height: 2,
              background: C_BRANCH, opacity: 0.85,
              transformOrigin: '0 50%', transform: `translateY(-1px) rotate(${ang}deg)`,
            }}
          />
        );
      })}
    </div>
  ) : null;

  return (
    <div className="w-full h-full flex flex-col gap-2.5 min-h-0 max-w-md lg:max-w-3xl mx-auto">
      {header}
      {/*
        THE ONE LINE OF TIME. A single native scroll surface — no level
        separation, no inner swiper: one finger movement walks ALL generations
        smoothly. data-inner-scroll + swiper-no-swiping keep this surface's
        gestures native (the same contract as the attached-files list), so the
        outer tree feed's card-swipe lives on the header and the hint strip.
      */}
      <div
        data-inner-scroll
        className="swiper-no-swiping flex-1 min-h-0 w-full overflow-y-auto overscroll-contain rounded-3xl border border-black/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(250,253,246,0.55) 0%, rgba(244,250,239,0.35) 42%, rgba(237,246,230,0.7) 78%, #EDF6E6 100%), url(/textures/sky.jpg)',
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      >
        <div className="relative mx-auto" style={{ width: 'min(100%, 320px)', height: layout?.height || 200 }}>
          {lines}
          {/* stations — the tests standing ON the line */}
          {layout?.stations.map(st => {
            const w = STATION_HALF_W * 2;
            const isRoot = !st.node.parentId;
            return (
              <button
                key={`st-${st.node.id}`}
                type="button"
                onClick={() => navigate(st.node.id)}
                title={st.node.versionName || st.node.title}
                aria-label={st.node.versionName || st.node.title}
                className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 focus:outline-none group"
                style={{ left: '50%', top: st.y, width: w }}
              >
                <Avatar node={st.node} size={STATION_AV} version={false} />
                <span className={`text-[11px] leading-tight font-bold truncate max-w-full ${st.isViewRoot ? 'text-cta' : C_INK}`}>{st.node.creator?.name?.trim().split(/\s+/)[0] || '—'}</span>
                {st.isViewRoot ? (
                  <span className="text-[9px] leading-none font-semibold text-cta bg-white/90 border border-cta/40 rounded-full px-1.5 py-0.5">{t('treeThisVersion')}</span>
                ) : (
                  <span className="text-[9px] leading-none text-foreground/60">{isRoot ? t('treeTrunk') : t('treeVersionLabel')}</span>
                )}
              </button>
            );
          })}
          {/* branches — the versions hanging off the line by time */}
          {layout?.branches.map(b => (
            <button
              key={`br-${b.node.id}`}
              type="button"
              onClick={() => navigate(b.node.id)}
              title={b.node.versionName || b.node.title}
              aria-label={b.node.versionName || b.node.title}
              className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
              style={{ left: `calc(50% + ${b.x}px)`, top: b.y, width: BRANCH_AV * 2.4 }}
            >
              <Avatar node={b.node} size={BRANCH_AV} version />
              <span className="text-[10px] leading-tight font-semibold truncate max-w-full" style={{ color: C_INK }}>{b.node.creator?.name?.trim().split(/\s+/)[0] || '—'}</span>
              <span className="text-[9px] leading-none text-foreground/55">{fmtDate(b.node.createdAt)}</span>
            </button>
          ))}
          {/* lonely trunk: the line waits for the first version */}
          {layout && layout.stations.length === 1 && (family?.nodes.filter(n => (n.parentId || '') === viewRootId).length || 0) === 0 && (
            <p className="absolute left-1/2 -translate-x-1/2 text-center text-[10.5px] leading-snug px-4" style={{ top: lastY + STATION_AV, color: C_INK, opacity: 0.85 }}>
              {t('treeEmpty')}
            </p>
          )}
        </div>
      </div>
      <p className="shrink-0 text-center text-[11px] text-foreground/70 -mt-1">{t('treeFeedSwipe')}</p>
    </div>
  );
}
