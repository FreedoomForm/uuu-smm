import { makeStore } from '@/stores/make-store';
import type { Page, GroupMessage } from '@/lib/app-types';

// ---------------------------------------------------------------------------
// NAV store — which screen is open, the dashboard's content mode / view mode /
// files overlays, and the globally mounted bottom sheets & dialogs. Previously
// ~16 loose useState hooks inside app-root.tsx (plus three mirror-refs that
// existed only to defeat stale closures — replaced by getState() reads).
// ---------------------------------------------------------------------------

export interface ViewingUser {
  id: string;
  name: string;
  image: string | null;
}

export type DashView = 'tiktok1' | 'tiktok2' | 'library' | 'shelf';

interface NavData {
  // Current screen
  page: Page;
  // Dashboard CONTENT MODE — toggled by the account button (like the language
  // button cycles): personal library (own tests + bookmarks) ↔ discover (public
  // tests of other authors). Session-only: reload returns to the library.
  discoverMode: boolean;
  // Another user's library (opened from their profile photo or a chat avatar):
  // the dashboard shows THEIR public tests; every card carries their name and
  // photo; the header back arrow returns to the viewer's own feed.
  viewingUser: ViewingUser | null;
  // Dashboard VIEW modes: tiktok1 = card swipe feed, tiktok2 = the same feed
  // opened from the library (back button in the header), library = shelves of
  // 3 mini cards per shelf, shelf = one card per shelf.
  dashView: DashView;
  // Files feed mode: the TikTok feed flips from one-slide-per-test to the
  // files flow of the whole recommendation list (one slide per test that has
  // attachments, in feed order). filesFeedTestId is the LEGACY per-test pin —
  // always null since the recommendation flow took over (kept for the state
  // shape; every entry point resets it to null).
  filesFeedMode: boolean;
  filesFeedTestId: string | null;
  // Grid files mode (Library/Shelf): the grid KEEPS its layout but swaps the
  // test cards for the attachment cards of ONE test (the one whose paperclip
  // was tapped). The header back arrow / files toggle returns to the test cards.
  gridFilesMode: boolean;
  gridFilesTestId: string | null;
  // VERSION-TREE modes — the same contract as the files modes above, one
  // level up: the feed (tiktok) swaps to the TREE FLOW — one tree card per
  // test of the recommendation list (slide i IS test i); the grid
  // (library/shelf) swaps its cards for the version tree of ONE test (the
  // one whose tree button was tapped). treeFeedTestId follows the VISIBLE
  // tree card's test (updated on every feed commit). Every apple on the
  // tree is a version; tapping it re-roots that card at the version
  // (the card's own fetch refetches).
  treeFeedMode: boolean;
  treeFeedTestId: string | null;
  gridTreeMode: boolean;
  gridTreeTestId: string | null;
  // «Обсудить с ИИ» — the dashboard AI window opened from a test card
  // (library grid / shelf / feed). Holds the test id whose passport + chat
  // window is open; null = closed. Replaces the version-tree entry points.
  aiCardTestId: string | null;
  // Index of the visible slide inside the FILES / TREE feed (the two modes
  // are mutually exclusive, so one index serves both).
  dashSlideIdx: number;
  // Delete-confirmation dialog (test id) + dead share-link screen
  deleteId: string | null;
  deadLink: boolean;
  // Bottom sheets / panels mounted over the take-test screen
  chatOpen: boolean;
  filesOpen: boolean;
  groupOpen: boolean;
  editOpen: boolean;
  chatHistoryOpen: boolean;
}

const INITIAL: NavData = {
  page: 'auth',
  discoverMode: false,
  viewingUser: null,
  dashView: 'tiktok1',
  filesFeedMode: false,
  filesFeedTestId: null,
  gridFilesMode: false,
  gridFilesTestId: null,
  treeFeedMode: false,
  treeFeedTestId: null,
  gridTreeMode: false,
  gridTreeTestId: null,
  aiCardTestId: null,
  dashSlideIdx: 0,
  deleteId: null,
  deadLink: false,
  chatOpen: false,
  filesOpen: false,
  groupOpen: false,
  editOpen: false,
  chatHistoryOpen: false,
};

export const useNavStore = makeStore(INITIAL);

// Fresh, hook-free reads for gesture handlers and scope-switch logic — the
// professional replacement for the mirror-refs (discoverModeRef /
// viewingUserRef / filesFeedModeRef) that used to shadow this state.
export const navNow = () => useNavStore.getState();
