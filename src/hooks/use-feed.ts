'use client';

// ---------------------------------------------------------------------------
// The feed hook: ONE canonical TanStack Query surface for every dashboard
// scope. Replaces the hand-rolled loadFeed / loadMoreFeed / openUserLibrary
// fetch machinery (reqId race guards, seenIds dedup, merge-on-refresh).
//
//   scope 'mine'|'discover'  → useInfiniteQuery(['feed', scope])
//   viewingUserId set        → useQuery(['user-library', id])
//   bookmarks                → useQuery(['bookmarks'])
//
// Scope switches are query-key switches: React Query serves the cached scope
// instantly, fetches an uncached one, and no in-flight request can ever land
// in the wrong list.
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  feedQueryOptions,
  userLibraryQueryOptions,
  bookmarksQueryOptions,
  type FeedScope,
} from '@/lib/feed-queries';
import type { Test } from '@/lib/app-types';

export function useFeed(args: {
  scope: FeedScope;
  viewingUserId: string | null;
  enabled: boolean;
}) {
  const { scope, viewingUserId, enabled } = args;

  // Personal / community feed — keyset-paginated infinite query
  const feed = useInfiniteQuery({ ...feedQueryOptions(scope), enabled });

  // Another user's library — isolated by userId (single page, no pagination)
  const library = useQuery({
    ...userLibraryQueryOptions(viewingUserId || ''),
    enabled: enabled && !!viewingUserId,
  });

  // Bookmark ids (previously glued onto the feed request)
  const bookmarks = useQuery({ ...bookmarksQueryOptions, enabled });

  const foreign = !!viewingUserId;

  const tests = useMemo<Test[]>(() => {
    if (foreign) return library.data || [];
    const out: Test[] = [];
    for (const page of feed.data?.pages || []) {
      for (const item of page?.items || []) out.push(item);
    }
    return out;
  }, [foreign, library.data, feed.data]);

  const bookmarkIds = useMemo(
    () => new Set(bookmarks.data?.ids || []),
    [bookmarks.data]
  );

  return {
    tests,
    bookmarkIds,
    // First load of the active feed scope: empty lists render the skeleton.
    // isPending covers a scope with no cached data at all; the isFetching
    // clause covers a scope whose PERSISTED cache holds an empty page (e.g.
    // discover was opened once while offline) that is being revalidated
    // right now — the empty-state card must never paint while a request
    // that may still return tests is in flight.
    feedLoading:
      foreign
        ? false
        : enabled && (feed.isPending || (feed.isFetching && tests.length === 0)),
    // First load of the foreign library
    viewingLoading: foreign && library.isPending,
    feedHasMore: !foreign && !!feed.hasNextPage,
    loadingMore: feed.isFetchingNextPage,
    fetchNextFeedPage: feed.fetchNextPage,
    libraryError: foreign ? (library.error as Error | null) : null,
  };
}
