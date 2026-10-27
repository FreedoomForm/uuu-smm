'use client';

// ---------------------------------------------------------------------------
// Professional feed data layer (TanStack Query v5).
//
// Replaces the hand-rolled feed machine (loadFeed / loadMoreFeed / reqId
// counters / seenIds sets / merge-on-refresh / localStorage snapshot) with
// the industry-standard async state manager used by thousands of production
// teams. Every content scope lives under its OWN query key:
//
//   ['feed', 'mine']           — the personal For You feed (recsys-ranked)
//   ['feed', 'discover']       — the public community feed
//   ['user-library', <userId>] — another user's public tests
//   ['bookmarks']              — the viewer's bookmark ids
//
// Because keys are isolated, one scope can never leak into another and an
// in-flight fetch can never stomp a newer scope: the whole class of
// scope-pollution bugs becomes impossible BY CONSTRUCTION, not by guards.
//
// The feed NEVER refetches mid-session: mutations patch the cache locally
// (the canonical optimistic-update pattern), so the server ranking can never
// reorder cards under the user's eyes. Fresh content arrives on a scope
// re-entry or on the next app open — exactly how the TikTok feed behaves.
// ---------------------------------------------------------------------------

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Test } from '@/lib/app-types';

export type FeedScope = 'mine' | 'discover';
export const FEED_PAGE_LIMIT = 12;

export interface FeedPage {
  items: Test[];
  nextCursor?: string | null;
  tagInfo?: { query: string; exists: boolean; created: boolean; similar: string[] } | null;
}

export const feedKey = (scope: FeedScope) => ['feed', scope] as const;
export const userLibraryKey = (userId: string) => ['user-library', userId] as const;
export const BOOKMARKS_KEY = ['bookmarks'] as const;

// Canonical queryOptions factory (TanStack Query v5 pattern): ONE definition
// reused by the hook, the boot revalidation and the login prefetch.
export const feedQueryOptions = (scope: FeedScope) =>
  infiniteQueryOptions({
    queryKey: feedKey(scope),
    queryFn: ({ pageParam }) =>
      api.getFeed({
        tab: 'foryou',
        cursor: (pageParam as string | null) ?? null,
        limit: FEED_PAGE_LIMIT,
        scope,
      }) as Promise<FeedPage>,
    initialPageParam: null as string | null,
    getNextPageParam: (last: FeedPage) => last?.nextCursor ?? undefined,
    // A scope's feed is loaded ONCE per session and only patched locally
    // afterwards — it never reorders under the user.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

export const userLibraryQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: userLibraryKey(userId),
    queryFn: () => api.getTests(userId) as Promise<Test[]>, // public-only (server enforces)
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

export const bookmarksQueryOptions = queryOptions({
  queryKey: BOOKMARKS_KEY,
  queryFn: () => api.getBookmarks() as Promise<{ ids: string[] }>,
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000,
});

// ---------------------------------------------------------------------------
// Local cache patches — the ONLY way a loaded feed changes mid-session.
// ---------------------------------------------------------------------------

type InfiniteFeedData = { pages: FeedPage[]; pageParams: unknown[] };

export interface ScopePatch {
  // Pin tests to the top of the first page (new test / copy / search jump)
  prepend?: Test[];
  // Drop one test from every page (delete / unbookmark from the own library)
  removeId?: string;
  // Field-level update of one test in place (visibility flip, edit save)
  patchId?: string;
  patch?: (t: Test) => Test;
  // Replace the bookmark id set (['bookmarks'] key only)
  setBookmarks?: Set<string>;
}

export function patchScope(qc: QueryClient, key: readonly unknown[], op: ScopePatch) {
  if (op.setBookmarks) {
    qc.setQueryData<{ ids: string[] }>(BOOKMARKS_KEY, { ids: [...op.setBookmarks] });
    return;
  }
  // A foreign library is a plain list (single page, no pagination)
  if (key[0] === 'user-library') {
    if (!op.prepend && !op.removeId && !op.patchId) return;
    const patchId = op.patchId;
    const patchFn = op.patch;
    qc.setQueryData<Test[]>(key, data => {
      if (!data) return data;
      let out = data;
      if (op.prepend) {
        const ids = new Set(op.prepend.map(t => t.id));
        out = [...op.prepend, ...out.filter(t => !ids.has(t.id))];
      }
      if (op.removeId) out = out.filter(t => t.id !== op.removeId);
      if (patchId && patchFn) out = out.map(t => (t.id === patchId ? patchFn(t) : t));
      return out;
    });
    return;
  }
  // The infinite feed (mine / discover)
  qc.setQueryData<InfiniteFeedData>(key, data => {
    if (!data) return data;
    if (op.prepend) {
      const ids = new Set(op.prepend.map(t => t.id));
      const [first, ...rest] = data.pages;
      if (!first) return { ...data, pages: [{ items: [...op.prepend], nextCursor: null }, ...rest] };
      const items = [...op.prepend, ...(first.items || []).filter(t => !ids.has(t.id))];
      return { ...data, pages: [{ ...first, items }, ...rest] };
    }
    if (!op.removeId && !(op.patchId && op.patch)) return data;
    const patchId = op.patchId;
    const patchFn = op.patch;
    let changed = false;
    const pages = data.pages.map(p => {
      let items = p.items || [];
      if (op.removeId) {
        const next = items.filter(t => t.id !== op.removeId);
        if (next.length !== items.length) changed = true;
        items = next;
      }
      if (patchId && patchFn) {
        let touched = false;
        const next = items.map(t => {
          if (t.id !== patchId) return t;
          touched = true;
          return patchFn(t);
        });
        if (touched) changed = true;
        items = next;
      }
      return changed ? { ...p, items } : p;
    });
    return changed ? { ...data, pages } : data;
  });
}

// ---------------------------------------------------------------------------
// Boot revalidation, TikTok-style. The ranking may have changed since the
// persisted snapshot was taken, but the cards on screen must NOT change
// identity under the user's eyes: existing cards are updated IN PLACE (same
// positions, fresh fields) and brand-new tests are appended to the tail.
// This is the ONE place where a network refresh may touch a loaded feed.
// (Appended tests are NEWER than the keyset cursor floor, so the next
// pagination fetch — which takes items strictly OLDER than the cursor —
// can never return them a second time.)
// ---------------------------------------------------------------------------
export function reconcileFeedPage1(qc: QueryClient, key: readonly unknown[], fresh: Test[]) {
  qc.setQueryData<InfiniteFeedData>(key, data => {
    if (!data) return data;
    const flat: Test[] = [];
    for (const p of data.pages) for (const it of p.items || []) flat.push(it);
    const existingIds = new Set(flat.map(t => t.id));
    const byId = new Map(fresh.map(t => [t.id, t]));
    const merged = flat.map(t => byId.get(t.id) || t);
    const additions = fresh.filter(t => !existingIds.has(t.id));
    const all = additions.length ? [...merged, ...additions] : merged;
    // Redistribute back into the existing page shapes (sizes preserved, the
    // tail page absorbs the additions)
    const pages: FeedPage[] = [];
    let i = 0;
    for (const p of data.pages) {
      const size = (p.items || []).length;
      pages.push({ ...p, items: all.slice(i, i + size) });
      i += size;
    }
    if (i < all.length) {
      const lastCursor = data.pages[data.pages.length - 1]?.nextCursor ?? null;
      pages.push({ items: all.slice(i), nextCursor: lastCursor });
    }
    return { ...data, pages };
  });
}
