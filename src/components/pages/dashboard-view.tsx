'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AttachmentItem, attachmentFileUrl, formatSize, typeIcon } from '@/components/attachment-utils';
import LangButton from '@/components/lang-button';
import { SmmSpecialistDock } from '@/components/pages/smm-requests-view';
import { SmmCustomerDock } from '@/components/pages/smm-roles-view-dock';
import { useSmmStore } from '@/stores/smm-store';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Question } from '@/lib/app-types';
import { countAnsweredProgress, readTestProgress, type SavedTestProgress } from '@/lib/test-progress';
import {
  UserRoundCog, ArrowLeft, BookOpen, BookmarkX, Bot, Banknote, Bell, Briefcase, Building2, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Compass, Dices, Edit, ExternalLink, FlaskConical, Hash, Home, ImagePlus, Landmark, LayoutGrid, Library, Link2, ListChecks, Loader2, MapPin, Megaphone, MessageCircle, Palette, Paperclip, Pencil, Play, Plus, RefreshCw, Rows3, Search, ShieldAlert, Shuffle, Sparkles, Trash2, TreeDeciduous, UserPlus, Users, Video, X } from 'lucide-react';
const AttachmentsEditor = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsEditor), { ssr: false });
const AttachmentsList = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsList), { ssr: false });
// Version tree — its own on-demand chunk (fetches the family + renders SVG)
const VersionTreeView = dynamic(() => import('@/components/version-tree').then(m => m.default), { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> });
const PhotoshopColorPicker = dynamic(() => import('@/components/color-picker').then(m => m.PhotoshopColorPicker), { ssr: false });

import type { Page, Test, TreeNode } from '@/lib/app-types';
import { CreatorStrip, TranslatingPill, topicBgClass, tagHash, coverBgFor, imgSrc, GLASS_TILE } from '@/components/shared-bits';
import SmmEventSlide from '@/components/pages/smm-event-slide';
import { smmCoverColor } from '@/lib/smm-client';
import { testBackgroundCss } from '@/lib/test-bg';
import { useExitMount } from '@/components/motion';

// Desktop (lg+) prev/next controls for the vertical feeds. Phones swipe —
// desktop users also get the standard visible affordance (the wheel and the
// ↑/↓ keys already work; the buttons make it DISCOVERABLE).
function FeedArrows({ onPrev, onNext, canPrev, canNext, prevLabel, nextLabel }: {
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  prevLabel: string;
  nextLabel: string;
}) {
  const btn = 'w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center text-foreground hover:bg-white hover:shadow-xl active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none';
  return (
    <div className="hidden lg:flex flex-col gap-2 absolute right-5 top-1/2 -translate-y-1/2 z-30">
      <button type="button" onClick={onPrev} disabled={!canPrev} aria-label={prevLabel} title={prevLabel} className={btn}>
        <ChevronUp className="w-5 h-5" />
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label={nextLabel} title={nextLabel} className={btn}>
        <ChevronDown className="w-5 h-5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Professional feed engine: Swiper (swiper.com — the industry-standard
// carousel/gesture library behind countless TikTok/Reels clones) replaces the
// hand-rolled snap-scroll + attachFeedWheel wheel accumulator. One gesture =
// exactly one full-height card, native-feel touch physics, trackpad/wheel
// support and momentum handling — all maintained upstream instead of here.
// ---------------------------------------------------------------------------
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import type { Lang } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session-store';
import { useProfileStore } from '@/stores/profile-store';
import { useNavStore } from '@/stores/nav-store';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useEditorStore } from '@/stores/editor-store';
import { useTakeStore } from '@/stores/take-store';
import { tUI } from '@/lib/i18n';

/** Imperative handle the dashboard exposes to app-root for programmatic jumps. */
export interface FeedApi {
  /** Slide the ACTIVE feed (files mode or test feed) to card `idx`. */
  slideTo: (idx: number, speed?: number) => void;
}

/**
 * DASHBOARD screen — TikTok feed / library grid / shelf / files modes, the
 * user-library overlay, the dead-link screen and the CREATE / EDIT test form.
 * Extracted verbatim from src/app/page.tsx; all state stays in page.tsx and
 * is passed via props (list generated mechanically from block usage).
 */
export interface DashboardViewProps {
  tests: Test[];
  bookmarkIds: Set<string>;
  loading: boolean;
  // First load / revalidation-with-empty-list of the ACTIVE feed scope —
  // while true an empty `tests` MUST paint the skeleton, never the
  // "No tests yet" card (the discover scope is uncached right after login,
  // so its first fetch used to flash the empty state for ~a second).
  feedLoading: boolean;
  viewingLoading: boolean;
  fileSlides: any[];
  dashFeedRef: { current: any };
  feedApiRef: { current: FeedApi | null };
  feedSentinelRef: { current: any };
  onDashCommit: (idx: number, mode: 'tests' | 'files' | 'tree') => void;
  jumpToTest: (...args: any[]) => any;
  closeUserLibrary: (...args: any[]) => any;
  closeGridFiles: (...args: any[]) => any;
  closeFilesCard: (...args: any[]) => any;
  backToLibrary: (...args: any[]) => any;
  startCreateTest: (...args: any[]) => any;
  startEditTest: (...args: any[]) => any;
  openFromLibrary: (...args: any[]) => any;
  toggleBookmark: (...args: any[]) => any;
  openUserLibrary: (...args: any[]) => any;
  startFromDashboard: (...args: any[]) => any;
  toggleGridFiles: (...args: any[]) => any;
  // version-tree modes (same contract as the files handlers) — DORMANT:
  // every tree entry button was replaced by «Обсудить с ИИ» (openAiDiscuss);
  // the handlers stay wired so the dormant overlays keep compiling.
  openTreeCard: (...args: any[]) => any;
  closeTreeCard: (...args: any[]) => any;
  toggleGridTree: (...args: any[]) => any;
  closeGridTree: (...args: any[]) => any;
  // «Обсудить с ИИ» — opens the AI window with the test's metric passport
  // (the replacement of the version-tree entry on EVERY card).
  openAiDiscuss: (test: Test) => void;
  // «Файлы» on any card opens the FILES WINDOW (the same format as the AI
  // window: right-docked panel on desktop / bottom sheet on mobile) —
  // replaces the old files feed/grid modes.
  openCardFiles: (test: Test) => void;
  // «Чат» on any card opens the per-test GROUP CHAT WINDOW — the same
  // window format as the files window; everyone's chat about THIS test.
  openCardGroupChat: (test: Test) => void;
  doShareLink: (...args: any[]) => any;
  doMakePublic: (...args: any[]) => any;
  handleDeleteTest: (...args: any[]) => any;
  exitFilesMode: (...args: any[]) => any;
  openFilesCard: (...args: any[]) => any;
  cycleDashView: (...args: any[]) => any;
  toggleDiscoverMode: (...args: any[]) => any;
  // ─── SMM marketplace ──────────────────────────────────────────────────
  smmFeed: { kind: 'specialists' | 'events'; items: any[] };
  smmLoading: boolean;
  smmBmSpecialists: string[];
  smmBmEvents: string[];
  mySmmRole: 'customer' | 'specialist';
  openSmmWizard: (mode: 'invite' | 'apply' | 'send', target: any) => void;
  toggleSmmBookmark: (kind: 'specialist' | 'event', id: string) => void;
  gotoSmmPage: (p: 'smm-events' | 'smm-inbox' | 'smm-requests' | 'smm-roles') => void;
  // The specialist's «+» opens the ЗАПРОС editor; «изменить» routes to the
  // «Отправленные запросы» page with its edit mode on; the account switcher
  // cycles заказчик ↔ SMM-специалист (the language-button look).
  onCreateRequest: () => void;
  gotoRequestsWithEdit: () => void;
  onSwitchSmmRole: () => void;
  switchingRole: boolean;
}

export default function DashboardView({
  tests,
  bookmarkIds,
  loading,
  feedLoading,
  viewingLoading,
  fileSlides,
  dashFeedRef,
  feedApiRef,
  feedSentinelRef,
  onDashCommit,
  jumpToTest,
  closeUserLibrary,
  closeGridFiles,
  closeFilesCard,
  backToLibrary,
  startCreateTest,
  startEditTest,
  openFromLibrary,
  toggleBookmark,
  openUserLibrary,
  startFromDashboard,
  toggleGridFiles,
  closeTreeCard,
  closeGridTree,
  openAiDiscuss,
  openCardFiles,
  openCardGroupChat,
  doShareLink,
  doMakePublic,
  handleDeleteTest,
  exitFilesMode,
  openFilesCard,
  cycleDashView,
  toggleDiscoverMode,
  smmFeed,
  smmLoading,
  smmBmSpecialists,
  smmBmEvents,
  mySmmRole,
  openSmmWizard,
  toggleSmmBookmark,
  gotoSmmPage,
  onCreateRequest,
  gotoRequestsWithEdit,
  onSwitchSmmRole,
  switchingRole,
}: DashboardViewProps) {
  // ── State: read straight from the zustand domain stores ─────────────────
  // app-root keeps the ACTION handlers (they orchestrate the query cache);
  // the state itself is consumed here directly — no more ~90-prop drilling.
  const sessionUser = useSessionStore(s => s.user);
  const hydratedUser = useSessionStore(s => s.hydratedUser);
  const dataReady = useSessionStore(s => s.dataReady);
  const lang = useSessionStore(s => s.lang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  // app-root only mounts this view when effectivePage === 'dashboard'
  const effectivePage: Page = 'dashboard';
  const effectiveUser = sessionUser || hydratedUser;
  const progressUserId = effectiveUser?.id || 'anon';
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  // Round avatar initials for the dashboard header (same rule as app-root)
  const userInitials = (() => {
    const userName = effectiveUser?.name || effectiveUser?.email || '';
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : userName.slice(0, 2);
    return (s || '?').toUpperCase();
  })();
  // profile store
  const myAvatar = useProfileStore(s => s.myAvatar);
  // Saved progress ("Continue Test") for the test on screen — loaded from the
  // DATABASE (async) whenever the visible card changes.
  const [dashSaved, setDashSaved] = useState<SavedTestProgress | null>(null);
  const dashSavedIdRef = useRef<string | null>(null);
  const deadLink = useNavStore(s => s.deadLink);
  const setDeadLink = useNavStore(s => s.setDeadLink);
  const viewingUser = useNavStore(s => s.viewingUser);
  const dashView = useNavStore(s => s.dashView);
  const dashSlideIdx = useNavStore(s => s.dashSlideIdx);
  const gridFilesMode = useNavStore(s => s.gridFilesMode);
  const gridFilesTestId = useNavStore(s => s.gridFilesTestId);
  const filesFeedMode = useNavStore(s => s.filesFeedMode);
  const filesFeedTestId = useNavStore(s => s.filesFeedTestId);
  // version-tree modes
  const treeFeedMode = useNavStore(s => s.treeFeedMode);
  // «Обсудить с ИИ» — the test whose AI passport window is open (the active
  // state of the card button that opened it)
  const aiCardTestId = useNavStore(s => s.aiCardTestId);
  const treeFeedTestId = useNavStore(s => s.treeFeedTestId);
  const gridTreeMode = useNavStore(s => s.gridTreeMode);
  const gridTreeTestId = useNavStore(s => s.gridTreeTestId);
  // ── VERSION-TREE grid data ────────────────────────────────────────────────
  // The tree grid shows ONE VERSION CARD PER CELL through the SAME card code
  // as the regular tests — so the dashboard itself owns the family payload
  // (the old VersionTreeGrid component is gone). The list = the selected test
  // + every test that is a VERSION of it (the whole descendant subtree,
  // generation by generation, oldest first); every card carries the full
  // action set, and the tree button of any card re-roots the grid at THAT
  // version (gridTreeTestId changes → the effect below refetches).
  const [treeFamily, setTreeFamily] = useState<{ rootId: string; nodes: TreeNode[] } | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  useEffect(() => {
    if (!gridTreeMode || !gridTreeTestId) { setTreeFamily(null); setTreeError(null); return; }
    let alive = true;
    setTreeLoading(true); setTreeError(null);
    api.getTestTree(gridTreeTestId)
      .then(d => { if (alive) setTreeFamily(d); })
      .catch(e => { if (alive) { setTreeError(e?.message || 'Error'); setTreeFamily(null); } })
      .finally(() => { if (alive) setTreeLoading(false); });
    // Re-open / re-root also starts the grid from the top — the tapped test's
    // card is the first cell of the new list.
    requestAnimationFrame(() => dashFeedRef.current?.scrollTo({ top: 0 }));
    return () => { alive = false; };
  }, [gridTreeMode, gridTreeTestId]);
  const deleteId = useNavStore(s => s.deleteId);
  const setDeleteId = useNavStore(s => s.setDeleteId);
  // A deleted version must leave the grid at once: the delete dialog always
  // closes to deleteId=null, so the family refetch rides on that transition.
  useEffect(() => {
    if (deleteId === null && gridTreeMode && gridTreeTestId) {
      api.getTestTree(gridTreeTestId)
        .then(d => setTreeFamily(d))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteId]);
  // The card list of the tree grid: the selected test FIRST, then every test
  // that IS A VERSION of it — the whole descendant subtree, generation by
  // generation (BFS), oldest first inside a generation. Every entry renders
  // through the same full card code as the regular tests; scrolling walks
  // DOWN the generations, the tree button of any card re-roots the grid.
  const treeChain: TreeNode[] = useMemo(() => {
    if (!treeFamily || !gridTreeTestId) return [];
    const byId = new Map<string, TreeNode>();
    const kids = new Map<string, TreeNode[]>();
    for (const n of treeFamily.nodes) {
      byId.set(n.id, n);
      const k = n.parentId || '';
      const arr = kids.get(k);
      if (arr) arr.push(n); else kids.set(k, [n]);
    }
    for (const arr of kids.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const out: TreeNode[] = [];
    const seen = new Set<string>();
    let frontier: string[] = byId.has(gridTreeTestId) ? [gridTreeTestId] : [];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const node = byId.get(id);
        if (node) out.push(node);
        for (const c of kids.get(id) || []) next.push(c.id);
      }
      frontier = next;
    }
    return out;
  }, [treeFamily, gridTreeTestId]);
  // TreeNode → Test: the version nodes now drive the FULL test-card code,
  // which expects the Test shape (the fields the cards actually read).
  const nodeAsTest = (n: TreeNode): Test => ({
    id: n.id,
    title: n.title,
    description: n.description || '',
    topic: n.topic || '',
    creatorId: n.creatorId,
    creator: n.creator,
    isPublic: true,
    parentId: n.parentId,
    changedCount: n.changedCount,
    randomizeQuestions: true,
    randomizeOptions: true,
    tags: n.tags || [],
    coverIcon: n.coverIcon ?? null,
    coverColor: n.coverColor ?? null,
    questions: [],
    _count: { questions: n._count?.questions || 0, attempts: 0, attachments: n._count?.attachments || 0 },
    createdAt: n.createdAt,
  });
  const discoverMode = useNavStore(s => s.discoverMode);
  const setPage = useNavStore(s => s.setPage);
  // dashboard store
  const dashFullTests = useDashboardStore(s => s.dashFullTests);
  const dashTestIdx = useDashboardStore(s => s.dashTestIdx);
  // ─── SMM feed mode ─────────────────────────────────────────────────────
  // The dashboard feed swaps to the SMM content kind: a customer browses
  // SPECIALISTS, a specialist browses EVENTS (the brief's «лента анкет»).
  // Grid views (library/shelf) and the files/tree flows keep the tests.
  // smmActive = the SMM marketplace feed replaces the tests TikTok feed for
  // an SMM account. Deliberately TIKTOK-ONLY: the library/shelf grid views
  // keep the full TESTS ladder (the frozen brief — the tests site stays
  // intact); the events page carries its own view kinds over EVENT cards.
  const smmActive = !!effectiveUser && !viewingUser && !filesFeedMode && !treeFeedMode && (dashView === 'tiktok1' || dashView === 'tiktok2');
  // Saved progress ("Continue Test") for the card on screen — loaded from the
  // DATABASE (SavedProgress table) whenever the visible card changes. The
  // clear-on-switch keeps a stale "Continue N answers" button from ever
  // appearing under a different card while its snapshot is in flight.
  const curDashCardId = tests.length > 0
    ? (tests[Math.min(Math.max(0, dashTestIdx), tests.length - 1)]?.id ?? null)
    : null;
  useEffect(() => {
    let alive = true;
    dashSavedIdRef.current = curDashCardId;
    setDashSaved(null);
    if (!curDashCardId) return;
    readTestProgress(progressUserId, curDashCardId).then(p => {
      if (alive && dashSavedIdRef.current === curDashCardId) setDashSaved(p);
    });
    return () => { alive = false; };
  }, [curDashCardId, progressUserId]);
  const setDashTestIdx = useDashboardStore(s => s.setDashTestIdx);
  const libNarrow = useDashboardStore(s => s.libNarrow);
  const libWide = useDashboardStore(s => s.libWide);
  const libUltra = useDashboardStore(s => s.libUltra);
  const dashSearch = useDashboardStore(s => s.dashSearch);
  // SMM search — the top-panel search filters the SMM feed LOCALLY (name /
  // headline / summary / roles / city) while the feed is active; over the
  // tests grids the server tag search applies as before.
  const smmQuery = dashSearch.trim().toLowerCase();
  const visibleSmmItems = React.useMemo(() => {
    if (!smmActive || !smmQuery) return smmFeed.items;
    return (smmFeed.items as any[]).filter(it => {
      const hay = smmFeed.kind === 'events'
        ? [it.title, it.summary, it.brief, it.customer?.name, ...(it.roles || []).map((r: any) => r.name)]
        : [it.name, it.headline, it.resume, it.city, it.rate];
      return hay.filter(Boolean).join(' ').toLowerCase().includes(smmQuery);
    });
  }, [smmActive, smmQuery, smmFeed]);
  const smmLen = smmActive ? visibleSmmItems.length : 0;
  const curSmmItem: any = smmActive ? visibleSmmItems[Math.min(Math.max(0, dashTestIdx), Math.max(0, smmLen - 1))] : null;
  // The ACTIVE list length drives the skeleton/empty branches: in SMM mode
  // the tests list may be empty while the specialist/event feed has cards.
  const activeLen = smmActive ? smmLen : tests.length;
  const setDashSearch = useDashboardStore(s => s.setDashSearch);
  const dashSearchOpen = useDashboardStore(s => s.dashSearchOpen);
  const setDashSearchOpen = useDashboardStore(s => s.setDashSearchOpen);
  const dashSearchResults = useDashboardStore(s => s.dashSearchResults);
  const dashSearching = useDashboardStore(s => s.dashSearching);
  const dashTagInfo = useDashboardStore(s => s.dashTagInfo);
  const shareBusy = useDashboardStore(s => s.shareBusy);
  // editor store
  const editMode = useEditorStore(s => s.editMode);
  const setEditMode = useEditorStore(s => s.setEditMode);
  const questions = useEditorStore(s => s.questions);
  // take store
  const selectedQuestionCount = useTakeStore(s => s.selectedQuestionCount);
  const setSelectedQuestionCount = useTakeStore(s => s.setSelectedQuestionCount);
  // Card slider drag bubble: true while the user is actively moving the
  // question-count knob (pointer down/drag or keyboard arrows) — the value
  // bubble above the thumb renders only during that movement.
  const [cardSliderDrag, setCardSliderDrag] = useState(false);
  const practiceMode = useTakeStore(s => s.practiceMode);
  const setPracticeMode = useTakeStore(s => s.setPracticeMode);
  const startRandomizeQ = useTakeStore(s => s.startRandomizeQ);
  const setStartRandomizeQ = useTakeStore(s => s.setStartRandomizeQ);
  const startRandomizeO = useTakeStore(s => s.startRandomizeO);
  const setStartRandomizeO = useTakeStore(s => s.setStartRandomizeO);
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  // Search overlay: stays mounted ~150ms after close to play its fade-out
  const searchMounted = useExitMount(dashSearchOpen, 160);

  // ── SWIPER FEED ENGINE (TikTok-web gesture layer) ────────────────────────
  // The one-gesture-one-card wheel accumulator, the snap-scroll container and
  // the settle timers all died with feed-wheel.ts — Swiper owns the gestures
  // now (touch physics, mousewheel, momentum — all upstream-maintained).
  // What lives here: index commits flow out through onDashCommit
  // (onSlideChange), keyboard parity keeps its app-specific guards, and an
  // imperative FeedApi handle lets app-root jump to a card programmatically.
  const onDashCommitRef = React.useRef(onDashCommit);
  onDashCommitRef.current = onDashCommit;
  // Files and tree feed modes are mutually exclusive — at most one of the
  // three swipers below is live at any moment (the others may hold STALE
  // instances of unmounted engines — always check .destroyed).
  const feedCountRef = React.useRef(0);
  feedCountRef.current = filesFeedMode ? fileSlides.length : tests.length;
  const feedIsSwipable = dashView === 'tiktok1' || dashView === 'tiktok2';

  const testsSwiperRef = React.useRef<SwiperClass | null>(null);
  const filesSwiperRef = React.useRef<SwiperClass | null>(null);
  const treeSwiperRef = React.useRef<SwiperClass | null>(null);
  const pendingSlideRef = React.useRef<number | null>(null);
  // The one LIVE swiper of the three (destroyed instances of unmounted feeds
  // must never be driven — slideTo on them would silently target dead DOM).
  const liveFeedSwiper = () => {
    for (const sw of [treeSwiperRef.current, filesSwiperRef.current, testsSwiperRef.current]) {
      if (sw && !sw.destroyed) return sw;
    }
    return null;
  };

  // Shared engine config: one wheel notch / flick = exactly one full-height
  // card, zero rubber-banding between cards, no release-to-edges drift.
  // NO virtual windowing here: every loaded card stays fully mounted (the
  // feed loads in small pages of 12 and appends the next page before the
  // end). Mount/unmount of a heavy card mid-swipe was visibly stuttering the
  // transition, and swiper-react's virtual renderer (renderVirtual)
  // cloneElement-injects its own {top: offset} style onto every SwiperSlide,
  // silently REPLACING the slide's own style prop — the inline coverColor was
  // dropped and cards rendered white. Both regressions came with the Virtual
  // module; the question feed (take-test) keeps virtual slides because a
  // 300-question test cannot mount 300 KaTeX cards.
  const swiperParams = {
    direction: 'vertical' as const,
    modules: [Mousewheel],
    slidesPerView: 1,
    spaceBetween: 0,
    speed: 320,
    resistanceRatio: 0,
    touchReleaseOnEdges: true,
    longSwipesRatio: 0.35,
    mousewheel: { forceToAxis: true, sensitivity: 1, thresholdDelta: 12, thresholdTime: 250, releaseOnEdges: false },
  };

  // Imperative handle for app-root (jump-to-test / deep links / scope resets).
  // Exactly one of the two swipers is mounted at any time — slide the live one.
  React.useEffect(() => {
    feedApiRef.current = {
      slideTo: (idx, speed = 0) => {
        const sw = liveFeedSwiper();
        if (sw) sw.slideTo(Math.max(0, Math.min(idx, (sw.slides?.length || 1) - 1)), speed);
        else pendingSlideRef.current = idx; // feed not mounted yet — apply on init
      },
    };
    return () => { feedApiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPendingSlide = (sw: SwiperClass) => {
    if (pendingSlideRef.current == null) return;
    const i = pendingSlideRef.current;
    pendingSlideRef.current = null;
    requestAnimationFrame(() => sw.slideTo(Math.max(0, Math.min(i, (sw.slides?.length || 1) - 1)), 0));
  };

  // Wheel gate: events originating inside an inner scrollable (the attached-
  // files list) keep their NATIVE scrolling — stopped here in the capture
  // phase so the Swiper mousewheel engine never sees them.
  const onWheelCapture = (e: React.WheelEvent) => {
    const t = e.target as Element | null;
    if (t?.closest?.('[data-inner-scroll]')) e.stopPropagation();
  };

  // External index changes (jump-to-test, deep link, scope reset) drive the
  // swiper; slide commits flow back through onSlideChange — the equality
  // check makes the loop settle immediately.
  React.useEffect(() => {
    const sw = testsSwiperRef.current;
    if (!sw || filesFeedMode || tests.length === 0) return;
    const target = Math.min(Math.max(0, dashTestIdx), tests.length - 1);
    if (sw.activeIndex !== target) sw.slideTo(target, 0);
  }, [dashTestIdx, tests.length, filesFeedMode]);
  React.useEffect(() => {
    const sw = filesSwiperRef.current;
    if (!sw || sw.destroyed || !filesFeedMode) return;
    const target = Math.min(Math.max(0, dashSlideIdx), Math.max(0, fileSlides.length - 1));
    if (sw.activeIndex !== target) sw.slideTo(target, 0);
  }, [dashSlideIdx, fileSlides.length, filesFeedMode]);
  React.useEffect(() => {
    const sw = treeSwiperRef.current;
    if (!sw || sw.destroyed || !treeFeedMode) return;
    const target = Math.min(Math.max(0, dashSlideIdx), Math.max(0, tests.length - 1));
    if (sw.activeIndex !== target) sw.slideTo(target, 0);
  }, [dashSlideIdx, tests.length, treeFeedMode]);
  // Appended/removed slides (silent pagination, unpins, deletes) — keep the
  // engine's internal slide bookkeeping in sync.
  React.useEffect(() => { const sw = testsSwiperRef.current; if (sw && !sw.destroyed) sw.update(); }, [tests.length]);
  React.useEffect(() => { const sw = filesSwiperRef.current; if (sw && !sw.destroyed) sw.update(); }, [fileSlides.length]);
  React.useEffect(() => { const sw = treeSwiperRef.current; if (sw && !sw.destroyed) sw.update(); }, [tests.length, treeFeedMode]);

  // Keyboard parity with TikTok web: ↑/↓/PgUp/PgDn/Space step one card,
  // Home/End jump to the first/last one. Ignored while typing or in dialogs.
  React.useEffect(() => {
    if (!feedIsSwipable && !filesFeedMode && !treeFeedMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (deleteId || dashSearchOpen || gridFilesMode || gridTreeMode || editMode) return;
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tgt?.isContentEditable) return;
      if (tag === 'BUTTON' && e.key === ' ') return; // space activates the focused button
      let target: number | null = null;
      const sw = filesFeedMode ? filesSwiperRef.current : treeFeedMode ? treeSwiperRef.current : testsSwiperRef.current;
      if (sw && sw.destroyed) return;
      const count = feedCountRef.current;
      if (!sw || count <= 0) return;
      const cur = sw.activeIndex;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') target = Math.min(count - 1, cur + 1);
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') target = Math.max(0, cur - 1);
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End') target = count - 1;
      else return;
      if (target === cur) return;
      e.preventDefault();
      sw.slideTo(target);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedIsSwipable, filesFeedMode, treeFeedMode, deleteId, dashSearchOpen, gridFilesMode, editMode]);

  if (effectivePage === 'dashboard') {
    // Dead share link (?test=<id> of a deleted/removed test): the whole
    // dashboard is replaced by a bare screen — only a message and the way
    // back to the main page, exactly as the share-link promise demands.
    if (deadLink) {
      return (
        <div className="relative h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center screen-enter">
          <span className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Link2 className="w-8 h-8 text-destructive" />
          </span>
          <h1 className="text-xl sm:text-2xl font-bold mb-2">{t('deadLinkTitle')}</h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-sm mb-6">{t('deadLinkDesc')}</p>
          <Button
            onClick={() => {
              try { window.history.replaceState({}, '', window.location.pathname); } catch {}
              setDeadLink(false);
            }}
            className="rounded-full bg-primary hover:bg-primary/90 h-11 px-6"
          >
            <Home className="w-4 h-4 mr-2" /> {t('backHome')}
          </Button>
        </div>
      );
    }
  // CONSTANT CONTENT — every loaded card is fully mounted at all times (the
  // feed loads in small pages of 12 and appends the next page before the
  // end), so a visible card can never be an empty placeholder: nothing can
  // pop in, vanish or re-mount mid-swipe BY CONSTRUCTION. This is the TikTok
  // "already on screen before you get there" guarantee, without any window
  // arithmetic or race conditions.
  const curDashTest = tests.length > 0 ? tests[Math.min(Math.max(0, dashTestIdx), tests.length - 1)] : null;
    // Saved progress for the test on screen — dashSaved STATE (loaded from the
    // DB by the effect above) drives the Continue button
    // Library / shelf grids: slice the loaded tests into shelf rows
    // (library = 2 cards per shelf on phones / 3 from sm up / 4 on desktop
    // (lg) / 5 on ≥1440px monitors, shelf = 1 card per shelf); rows scroll
    // endlessly. The flags come from the store (matchMedia-synced in
    // app-root), so SSR always paints the 3-col layout and desktop corrects
    // right after hydration.
    const gridPerRow = dashView === 'shelf' ? 1 : (dashView === 'library' && libNarrow ? 2 : (libUltra ? 5 : libWide ? 4 : 3));
    const gridColsClass = dashView === 'shelf' ? 'grid-cols-1' : gridPerRow === 2 ? 'grid-cols-2' : gridPerRow === 4 ? 'grid-cols-4' : gridPerRow === 5 ? 'grid-cols-5' : 'grid-cols-3';
    // Grid files mode: attachments of the ONE test whose paperclip was tapped.
    // If that test has left the loaded list (a mode switch while files mode
    // was on), the cached full payload still covers it.
    const gridFilesTest = gridFilesMode && gridFilesTestId
      ? (tests.find(x => x.id === gridFilesTestId) || (dashFullTests[gridFilesTestId] as Test | undefined) || null)
      : null;
    const gridRows: Test[][] = [];
    for (let i = 0; i < tests.length; i += gridPerRow) gridRows.push(tests.slice(i, i + gridPerRow));
    const gridFiles: AttachmentItem[] = gridFilesTest
      ? (((dashFullTests[gridFilesTest.id]?.attachments ?? gridFilesTest.attachments) || []) as AttachmentItem[]).filter(Boolean)
      : [];
    const gridFileRows: AttachmentItem[][] = [];
    for (let i = 0; i < gridFiles.length; i += gridPerRow) gridFileRows.push(gridFiles.slice(i, i + gridPerRow));
    // THE STANDARD CARD HEADER of the files page — the same cover band the
    // regular test cards wear on the main page (coverColor wins, else the
    // tag/topic palette).
    const gridFilesBgClass = gridFilesTest ? (gridFilesTest.coverColor ? '' : coverBgFor(gridFilesTest)) : '';
    const gridFilesBgStyle = gridFilesTest?.coverColor ? { backgroundColor: gridFilesTest.coverColor } : undefined;
    // ONE CARD RENDERER for every grid cell of this view — regular tests AND
    // the version cards of the tree grid (one version per cell, the SAME full
    // action set, the SAME шапка). idx indexes the loaded feed list; the tree
    // grid passes idx=null: its cards are not feed entries, so the card body
    // carries no open action and Start/Restart skip the feed-index commit.
    const renderGridCard = (test: Test, idx: number | null) => {
      const totalQ = test._count?.questions || test.questions?.length || 0;
      // "Own" = created by THIS user. Bookmarked tests (saved
      // via the bookmark button) are NOT own: they show no
      // share buttons — pressing Edit makes an editable copy.
      const own = !!effectiveUser && test.creatorId === effectiveUser.id;
      // Version state on the card: a VERSION (parentId set)
      // may share its link only after 2+ questions/answers
      // changed vs its parent — otherwise the button is
      // PASSIVE and explains the rule. The count comes
      // from the server (saved at every version save).
      const isVersion = !!test.parentId;
      const canShareLink = !isVersion || (test.changedCount ?? 0) >= 2;
      const fcnt = (dashFullTests[test.id]?.attachments as AttachmentItem[] | undefined)?.length || test._count?.attachments || 0;
      const bgClass = test.coverColor ? '' : coverBgFor(test);
      const bgStyle = test.coverColor ? { backgroundColor: test.coverColor } : undefined;
      // THE STANDARD CARD HEADER — the author's photo + the pin button, on
      // EVERY card of EVERY type now (personal library included): the avatar
      // falls back to the viewer (own tests) or to the owner of the library
      // being browsed.
      const strip = (
        <CreatorStrip
          compact
          name={(test as any).creator?.name || (own ? effectiveUser?.name : null) || viewingUser?.name || ''}
          creatorId={(test as any).creator?.id || test.creatorId}
          image={(test as any).creator?.image || (own ? myAvatar : null) || viewingUser?.image || null}
          bookmarked={bookmarkIds.has(test.id)}
          onToggleBookmark={() => toggleBookmark(test)}
          addLabel={t('bookmarkAdd')}
          removeLabel={t('bookmarkRemove')}
          addShort={t('bookmarkAddShort')}
          removeShort={t('bookmarkRemoveShort')}
          onOpenProfile={() => openUserLibrary({ id: (test as any).creator?.id || test.creatorId, name: (test as any).creator?.name, image: (test as any).creator?.image })}
          openLabel={t('openProfile')}
        />
      );
      // Start/Restart from a card: the feed-index commit only makes sense for
      // feed-backed cards (idx !== null); version cards start by override.
      const startCard = (fresh: boolean) => {
        if (idx !== null) setDashTestIdx(idx);
        startFromDashboard(fresh, test);
      };
      const openBody = () => { if (idx !== null) openFromLibrary(idx); };
      return dashView === 'library' ? (
        <div
          key={test.id}
          role={idx !== null ? 'button' : undefined}
          tabIndex={idx !== null ? 0 : undefined}
          onClick={() => { if (editMode) { startEditTest(test); } else { openBody(); } }}
          className={`h-full min-h-0 flex flex-col rounded-2xl border border-black/15 bg-white p-2 sm:p-3 lg:p-4 overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left ${idx !== null ? 'cursor-pointer' : ''}`}
        >
          {strip}
          <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2">{test.title}</p>
          {/* ONE BUTTON PER LEVEL — the ladder every card follows in EVERY
          mode (library, shelf, feed): Start → Restart → AI → Chat → Files →
          Share → Public → Edit → Unpin → Delete. A button that does not apply
          to THIS test simply does not render and the others keep their
          relative order — no two buttons ever share a level (only the top
          header strip and the page's bottom bar may hold several buttons in
          one row). */}
          <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
            <Button size="sm" disabled={loading}
              onClick={e => { e.stopPropagation(); startCard(false); }}
              title={t('startTestBtn')} aria-label={t('startTestBtn')}
              className="h-8 rounded-full text-[11px] sm:text-xs lg:h-10 lg:text-sm px-2 justify-start gap-1.5 has-[>svg]:px-1.5"
            >
              <Play className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gStart')}</span>
            </Button>
            <Button size="sm" variant="outline" disabled={loading}
              onClick={e => { e.stopPropagation(); startCard(true); }}
              title={t('restart')} aria-label={t('restart')}
              className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
            >
              <RefreshCw className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gRestart')}</span>
            </Button>
            <Button size="sm" variant="outline"
              onClick={e => { e.stopPropagation(); openAiDiscuss(test); }}
              title={t('aiDiscuss')} aria-label={t('aiDiscuss')}
              className={`h-7 rounded-full text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1 ${aiCardTestId === test.id ? 'border-primary bg-[#FFE8DE]' : 'border-black'}`}
            >
              <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
            </Button>
            {/* Chat: the per-test GROUP CHAT WINDOW — the same window format
            as the files window; everyone's chat about THIS test. Its own
            level, always right after the AI button (the same neighbours the
            taking screen's header keeps). */}
            <Button size="sm" variant="outline"
              onClick={e => { e.stopPropagation(); openCardGroupChat(test); }}
              title={t('chatWithAll')} aria-label={t('chatWithAll')}
              className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
            >
              <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
            </Button>
            {fcnt > 0 && (
              <Button size="sm" variant="outline"
                onClick={e => { e.stopPropagation(); openCardFiles(test); }}
                title={t('attachedFiles', { n: fcnt })} aria-label={t('attachedFiles', { n: fcnt })}
                className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={!!shareBusy || !canShareLink}
              onClick={e => { e.stopPropagation(); doShareLink(test); }}
              title={canShareLink ? t('shareCopySub') : t('shareNeed2Changes')} aria-label={t('shareLinkBtn')}
              className="h-7 rounded-full text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
            >
              <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
            </Button>
            {/* Public: OWN from-scratch tests only (a version can never be
            public) — its own level, always after Share. */}
            {own && !isVersion && (
            <Button size="sm" variant="outline" disabled={!!shareBusy}
              onClick={e => { e.stopPropagation(); doMakePublic(test); }}
              title={t('makePublic')} aria-label={t('makePublic')}
              className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
            >
              <Users className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gPublic')}</span>
            </Button>
            )}
            <Button size="sm" variant="outline"
              onClick={e => { e.stopPropagation(); startEditTest(test); }}
              title={t('editTest')} aria-label={t('editTest')}
              className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
            >
              <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
            </Button>
            {/* Unpin: BOOKMARKED tests in the personal library (the test got
            here via the bookmark button) — its own level, always after Edit. */}
            {!discoverMode && !viewingUser && !own && bookmarkIds.has(test.id) && (
            <Button size="sm" variant="outline"
              onClick={e => { e.stopPropagation(); toggleBookmark(test); }}
              title={t('unpinBtn')} aria-label={t('unpinBtn')}
              className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
            >
              <BookmarkX className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gUnpin')}</span>
            </Button>
            )}
            {/* Delete: own tests only (the server refuses anyone else) — the
            last level of the ladder. */}
            {own && (
            <Button size="sm" variant="outline"
              onClick={e => { e.stopPropagation(); setDeleteId(test.id); }}
              title={t('deleteTest')} aria-label={t('deleteTest')}
              className="h-7 rounded-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
            >
              <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gDelete')}</span>
            </Button>
            )}
            {!canShareLink && (
              <p className="text-[9px] leading-tight text-muted-foreground">{t('shareNeed2Changes')}</p>
            )}
          </div>
        </div>
      ) : (
        <div
          key={test.id}
          role={idx !== null ? 'button' : undefined}
          tabIndex={idx !== null ? 0 : undefined}
          onClick={() => { if (editMode) { startEditTest(test); } else { openBody(); } }}
          className={`h-full min-h-0 lg:max-w-4xl lg:w-full lg:mx-auto flex rounded-2xl border border-black/15 bg-white overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left ${idx !== null ? 'cursor-pointer' : ''}`}
        >
          <div style={bgStyle} className={`${bgClass} w-20 sm:w-36 lg:w-44 shrink-0 h-full flex items-center justify-center p-2 text-center`}>
            <p className="text-xs sm:text-base font-bold text-cta leading-snug line-clamp-3">{test.title}</p>
          </div>
          <div className="flex-1 min-w-0 flex flex-col p-2 sm:p-3 lg:p-4">
            {strip}
            {/* Title lives on the spine only — no duplicate text in
            the content area */}
            <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">{(test.tags || []).slice(0, 3).join(' · ') || test.topic}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground">{t('qCount', { n: totalQ })}</p>
          {/* ONE BUTTON PER LEVEL (same ladder as the library card and the
          feed): Start → Restart → AI → Chat → Files → Share → Public → Edit →
          Unpin → Delete. Absent buttons just don't render — no two buttons
          ever share a level. */}
          <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
              <Button size="sm" disabled={loading}
                onClick={e => { e.stopPropagation(); startCard(false); }}
                title={t('startTestBtn')} aria-label={t('startTestBtn')}
                className="h-8 rounded-full text-[11px] sm:text-xs lg:h-10 lg:text-sm px-2 justify-start gap-1.5 has-[>svg]:px-1.5"
              >
                <Play className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gStart')}</span>
              </Button>
              <Button size="sm" variant="outline" disabled={loading}
                onClick={e => { e.stopPropagation(); startCard(true); }}
                title={t('restart')} aria-label={t('restart')}
                className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <RefreshCw className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gRestart')}</span>
              </Button>
              <Button size="sm" variant="outline"
                onClick={e => { e.stopPropagation(); openAiDiscuss(test); }}
                title={t('aiDiscuss')} aria-label={t('aiDiscuss')}
                className={`h-7 rounded-full text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1 ${aiCardTestId === test.id ? 'border-primary bg-[#FFE8DE]' : 'border-black'}`}
              >
                <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
              </Button>
              {/* Chat: the per-test GROUP CHAT WINDOW — its own level, always
              right after the AI button (same as the library card). */}
              <Button size="sm" variant="outline"
                onClick={e => { e.stopPropagation(); openCardGroupChat(test); }}
                title={t('chatWithAll')} aria-label={t('chatWithAll')}
                className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
              </Button>
              {fcnt > 0 && (
                <Button size="sm" variant="outline"
                  onClick={e => { e.stopPropagation(); openCardFiles(test); }}
                  title={t('attachedFiles', { n: fcnt })} aria-label={t('attachedFiles', { n: fcnt })}
                  className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
                >
                  <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
                </Button>
              )}
              {/* Share link — EVERY card (own, bookmarked and
              discover alike); PASSIVE for versions with
              <2 changed questions, the rule text shows
              right under the button. */}
              <Button size="sm" variant="outline" disabled={!!shareBusy || !canShareLink}
                onClick={e => { e.stopPropagation(); doShareLink(test); }}
                title={canShareLink ? t('shareCopySub') : t('shareNeed2Changes')} aria-label={t('shareLinkBtn')}
                className="h-7 rounded-full text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
              </Button>
              {/* Public: OWN from-scratch tests only (a version can never be
              public) — its own level, always after Share. */}
              {own && !isVersion && (
              <Button size="sm" variant="outline" disabled={!!shareBusy}
                onClick={e => { e.stopPropagation(); doMakePublic(test); }}
                title={t('makePublic')} aria-label={t('makePublic')}
                className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <Users className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gPublic')}</span>
              </Button>
              )}
              <Button size="sm" variant="outline"
                onClick={e => { e.stopPropagation(); startEditTest(test); }}
                title={t('editTest')} aria-label={t('editTest')}
                className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
              </Button>
              {/* Unpin: bookmarked tests in the personal library (shelf
              row) — its own level, always after Edit. */}
              {!discoverMode && !viewingUser && !own && bookmarkIds.has(test.id) && (
              <Button size="sm" variant="outline"
                onClick={e => { e.stopPropagation(); toggleBookmark(test); }}
                title={t('unpinBtn')} aria-label={t('unpinBtn')}
                className="h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <BookmarkX className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gUnpin')}</span>
              </Button>
              )}
              {/* Delete: own tests only — the last level of the ladder. */}
              {own && (
              <Button size="sm" variant="outline"
                onClick={e => { e.stopPropagation(); setDeleteId(test.id); }}
                title={t('deleteTest')} aria-label={t('deleteTest')}
                className="h-7 rounded-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1"
              >
                <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gDelete')}</span>
              </Button>
              )}
              {!canShareLink && (
                <p className="text-[9px] leading-tight text-muted-foreground">{t('shareNeed2Changes')}</p>
              )}
            </div>
          </div>
        </div>
      );
    };
    // Tree-grid rows: the SAME slicing/shapes the regular cards use.
    const treeRows: TreeNode[][] = [];
    for (let i = 0; i < treeChain.length; i += gridPerRow) treeRows.push(treeChain.slice(i, i + gridPerRow));
    // Author fallback for the files page header (the test whose files are open)
    const gridFilesOwn = !!effectiveUser && !!gridFilesTest && gridFilesTest.creatorId === effectiveUser.id;
    const searchQ = dashSearch.trim();
    const dashSearchDropdown = searchQ.length < 2 ? null : (
      <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-2xl border border-black/10 shadow-xl max-h-72 overflow-y-auto text-left">
        {dashSearching ? (
          <p className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>
        ) : (
          <>
            {dashTagInfo && !dashTagInfo.exists && (
              <div className="px-3 py-2.5 border-b border-black/10 bg-muted/40">
                <p className="text-sm font-medium">
                  {t('tagNotFound', { q: dashTagInfo.query })}
                  {dashTagInfo.created ? <span className="text-muted-foreground font-normal"> · {t('tagCreated')}</span> : null}
                </p>
                {(dashTagInfo.similar || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-xs text-muted-foreground">{t('similarTags')}:</span>
                    {dashTagInfo.similar.map(tg => (
                      <button key={tg} type="button" onClick={() => setDashSearch(tg)} className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors">
                        {tg}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(dashSearchResults?.length || 0) === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">{t('noResults')}</p>
            ) : (
              (dashSearchResults || []).map(r => (
                <button key={r.id} type="button" onClick={() => jumpToTest(r.id)} className="w-full text-left px-3 py-2.5 hover:bg-muted/50 border-b border-black/5 last:border-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(r.tags || []).length > 0 && <span className="text-primary font-medium">{(r.tags || []).slice(0, 3).join(' · ')} · </span>}
                    {t('qCount', { n: r._count?.questions || r.questions?.length || 0 })}
                  </p>
                </button>
              ))
            )}
          </>
        )}
      </div>
    );

    // Bottom-bar page router for the LIBRARY PAGES DOCK (the very-bottom
    // panel with two permanent page buttons). Unlike the old top-panel toggle
    // it routes to an EXPLICIT page instead of flipping a boolean:
    //   → Public: from anywhere (own library or a foreign viewer library);
    //     if Discover is already open, a viewer overlay is just closed.
    //   → Personal: leaves Discover (flip) OR closes a foreign viewer library
    //     (the old toggle would have flipped INTO Discover in that case).
    const gotoLibraryMode = (discover: boolean) => {
      if (discover) {
        if (discoverMode) {
          if (viewingUser) closeUserLibrary(); // already Discover — drop the viewer overlay
          return;
        }
        toggleDiscoverMode(); // clears a viewer library too, resets the feeds
        return;
      }
      if (discoverMode) { toggleDiscoverMode(); return; }
      if (viewingUser) closeUserLibrary();
    };

    // Bottom bar count: the committed card's start count; before the first
    // sync effect adopts the card's total, fall back to that same total so the
    // very first painted frame is ALREADY correct (no 0-count flash).
    const barCount = selectedQuestionCount || (curDashTest ? (curDashTest._count?.questions || curDashTest.questions?.length || 0) : 0);
    return (
      <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
          {/* One row on EVERY viewport, no matter how many buttons: the row
              never wraps (flex-nowrap); buttons compress to icon-only pills on
              narrow screens. Search is a button too — when open, its input
              overlay covers the whole row instead of pushing buttons out.
              FIXED h-14: every page's top panel is exactly 56px tall, on every
              viewport, in every state (uniform top-panel contract). */}
          <div className="relative max-w-7xl mx-auto px-3 sm:px-4 h-14 lg:h-16 flex flex-nowrap items-center justify-between gap-1 sm:gap-2 lg:gap-3">
            {searchMounted && (
              <div className={`absolute inset-0 z-50 bg-white flex items-center gap-2 px-3 sm:px-4 ${dashSearchOpen ? 'animate-in fade-in duration-150' : 'animate-out fade-out pointer-events-none duration-150'}`}>
                <div className="flex-1 min-w-0 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    autoFocus
                    value={dashSearch}
                    onChange={e => setDashSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setDashSearchOpen(false); setDashSearch(''); } }}
                    placeholder={t('searchByTags')}
                    className="h-9 lg:h-10 rounded-full pl-9 bg-white border-black/15 text-sm"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDashSearchOpen(false); setDashSearch(''); }}
                  className="shrink-0 h-9 w-9 p-0"
                  aria-label={t('cancel')}
                >
                  <X className="w-4 h-4" />
                </Button>
                {dashSearchDropdown}
              </div>
            )}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0">
              {/* Universal top-panel back button — shown whenever the dashboard
              is deeper than its home state (files/tree overlays, another
              user's library, the tiktok2 feed). One tap = one level back:
              the deepest overlay closes first, then the context, then the
              view mode — i.e. always the PREVIOUS page. */}
              {(dashView === 'tiktok2' || viewingUser || gridFilesMode || filesFeedMode || gridTreeMode || treeFeedMode) && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    // deepest overlay first — the true "previous page"
                    if (gridTreeMode) { closeGridTree(); return; }
                    if (treeFeedMode) { closeTreeCard(); return; }
                    if (gridFilesMode) { closeGridFiles(); return; }
                    if (filesFeedMode) { closeFilesCard(); return; }
                    if (viewingUser) { closeUserLibrary(); return; }
                    backToLibrary();
                  }}
                  className="rounded-full shrink-0 border-black lg:h-10 lg:w-10"
                  title={viewingUser ? t('back') : t('backToLibrary')}
                  aria-label={viewingUser ? t('back') : t('backToLibrary')}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              {/* Viewing another user's library: just their PHOTO next to the
              back arrow (no name text — the hover/long-press tooltip carries
              the full name). */}
              {viewingUser && (
                <span
                  className="w-8 h-8 rounded-full overflow-hidden bg-cta text-white flex items-center justify-center text-xs font-extrabold shrink-0 ring-2 ring-white shadow-md"
                  title={t('userLibraryTitle', { name: viewingUser.name })}
                >
                  {viewingUser.image
                    ? <img src={viewingUser.image.startsWith('tg:') ? `/api/users/${viewingUser.id}/avatar` : viewingUser.image} alt="" className="w-full h-full object-cover" />
                    : (viewingUser.name || '?').trim().slice(0, 1).toUpperCase() || '?'}
                </span>
              )}
              {/* «+» — the create action follows the account kind: the
              customer's opens the EVENT editor (the test editor's twin),
              the SPECIALIST's opens the ЗАПРОС editor (the same twin — a
              запрос is the specialist's document). Over the tests grids it
              keeps creating TESTS. */}
              {(!smmActive || mySmmRole === 'customer') && (
                <Button onClick={startCreateTest} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm">
                  <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{smmActive && mySmmRole === 'customer' ? t('smmCreateEvent') : t('createTest')}</span>
                </Button>
              )}
              {smmActive && mySmmRole === 'specialist' && (
                <Button onClick={onCreateRequest} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmNewRequest')}>
                  <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmNewRequest')}</span>
                </Button>
              )}
              {/* «Изменить»: the tests edit-mode over the tests feed; the
              SPECIALIST's routes to «Отправленные запросы» with its edit
              mode on (изменять можно свои запросы). */}
              {!smmActive && (
                <Button
                  variant="outline"
                  onClick={() => setEditMode(v => !v)}
                  className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm ${editMode ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
                >
                  <Edit className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('editTest')}</span>
                </Button>
              )}
              {smmActive && mySmmRole === 'specialist' && (
                <Button
                  variant="outline"
                  onClick={gotoRequestsWithEdit}
                  className="rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm border-black"
                  title={t('smmEditRequestTitle')}
                >
                  <Edit className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('gEdit')}</span>
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
              <Button
                variant="outline"
                onClick={() => setDashSearchOpen(true)}
                className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10"
                title={t('searchByTags')}
                aria-label={t('searchByTags')}
              >
                <Search className="w-4 h-4" />
              </Button>
              {/* NO files-mode buttons here on purpose — and no per-surface back
              buttons on the files/tree cards either: the universal top-panel
              back arrow is THE single exit from every nested mode. */}
              {/* View button — cycles the three layouts with one tap (like the
              language button): TikTok feed → Library → Shelf → … The icon and
              the label always show the CURRENT view. */}
              <Button
                variant="outline"
                onClick={cycleDashView}
                className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm"
                title={t('viewMode')}
                aria-label={t('viewMode')}
              >
                {dashView === 'library'
                  ? <LayoutGrid className="w-4 h-4 sm:mr-2" />
                  : dashView === 'shelf'
                    ? <Rows3 className="w-4 h-4 sm:mr-2" />
                    : <Play className="w-4 h-4 sm:mr-2" />}
                <span className="hidden sm:inline">
                  {dashView === 'library' ? t('viewLibrary') : dashView === 'shelf' ? t('viewShelf') : t('viewTikTok')}
                </span>
              </Button>
              <LangButton lang={lang} onChange={cycleLang} className="border-black px-2 sm:px-3" />
              {/* The ACCOUNT SWITCHER — the language-button twin: one tap
              cycles заказчик ↔ SMM-специалист (persisted in the DB), the
              whole feed re-resolves to the other account kind. */}
              {smmActive && (
                <Button
                  variant="outline"
                  onClick={onSwitchSmmRole}
                  disabled={switchingRole}
                  title={t('smmSwitchAccount')}
                  aria-label={t('smmSwitchAccount')}
                  className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 lg:h-10 lg:text-sm font-semibold gap-1.5"
                >
                  <UserRoundCog className="w-4 h-4" />
                  <span className="hidden sm:inline">{mySmmRole === 'customer' ? t('smmRoleCustomer') : t('smmRoleSpecialist')}</span>
                </Button>
              )}
              <div className="hidden md:block text-right min-w-0">
                <p className="text-sm font-medium truncate max-w-[180px]">{effectiveUser?.name}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[180px]">{effectiveUser?.email}</p>
              </div>
              {/* Content-mode switcher REMOVED from the top panel: the two
              library pages now live on their own very-bottom dock (see
              LIBRARY PAGES DOCK below) — two permanent page buttons side by
              side, Personal | Public. */}
              {/* Account button — opens the PROFILE page (photo, name, the
              test-taking background, logout, account deletion). The avatar
              shows the user's profile photo (Telegram-stored) with the
              initials as the fallback. */}
              <button
                onClick={() => setPage('profile')}
                title={t('profileTitle')}
                aria-label={t('profileTitle')}
                className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-cta text-white flex items-center justify-center font-bold text-sm shadow-sm active:scale-95 transition-transform shrink-0 overflow-visible"
              >
                {myAvatar
                  ? <img src={myAvatar} alt="" className="absolute inset-0 w-full h-full rounded-full object-cover" />
                  : userInitials}
              </button>
            </div>
          </div>
        </header>

        {activeLen === 0 && viewingLoading ? (
          <main className="flex-1 min-h-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
            </p>
          </main>
        ) : activeLen === 0 && (loading || feedLoading || smmLoading || !dataReady) ? (
          /* FIRST-DATA SKELETON — a stable placeholder shaped like a feed card.
             The server HTML already shows it, so a returning user never sees
             an empty screen, a splash or a "no tests" flash: cached (or fresh)
             data simply replaces the skeleton in place, same center position.
             .skeleton-mirror adds the sweeping light glint (the card reads as
             a mirror plate while the first data loads). */
          <main className="flex-1 min-h-0 flex items-center justify-center px-3" aria-hidden="true">
            {/* Placeholder shaped like a REAL feed card: feed cards are
            CONTENT-height columns (centered TikTok style), so the skeleton
            approximates the typical card height (70%, capped 560px) — when
            data replaces it the card stays visually in place. */}
            <div className="skeleton-mirror w-full max-w-md h-[70%] max-h-[560px] rounded-2xl border border-black/10 bg-white p-4 flex flex-col gap-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="flex-1 w-full rounded-xl" />
              <Skeleton className="h-9 w-2/3 mx-auto rounded-full" />
              <Skeleton className="h-9 w-1/2 mx-auto rounded-full" />
            </div>
          </main>
        ) : activeLen === 0 ? (
          smmActive ? (
            /* SMM empty state — the feed kind speaks for itself (no tests
            CTA here: the events/invitations pages carry the creation flows) */
            <main className="flex-1 min-h-0 flex items-center justify-center px-4">
              <Card className="rounded-4xl border-dashed border-black/30 bg-white w-full max-w-md">
                <CardContent className="py-12 text-center">
                  {mySmmRole === 'customer' ? <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" /> : <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-4" />}
                  <p className="text-muted-foreground">{mySmmRole === 'customer' ? t('smmEmptySpecialists') : t('smmEmptyEvents')}</p>
                </CardContent>
              </Card>
            </main>
          ) : (
          <main className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 py-6">
              <Card className="rounded-4xl border-dashed border-black/30 bg-white">
                <CardContent className="py-12 text-center">
                  <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  {viewingUser ? (
                    <>
                      <h3 className="text-lg font-medium mb-2">{t('userLibraryTitle', { name: viewingUser.name })}</h3>
                      <p className="text-muted-foreground">{t('theirLibraryEmpty', { name: viewingUser.name })}</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-medium mb-2">{discoverMode ? t('discoverEmptyTitle') : t('noTestsYet')}</h3>
                      <p className="text-muted-foreground mb-4">{discoverMode ? t('discoverEmptyDesc') : t('createFirst')}</p>
                      {!discoverMode && (
                        <div className="flex gap-3 justify-center">
                          <Button onClick={startCreateTest}><Plus className="w-4 h-4 mr-2" /> {t('createTest')}</Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
          )
        ) : (
          <>
            {/* LIBRARY / SHELF views — endless shelves, 3 per screen, scrolling down.
                minHeight (not fixed height): rows never clip their content — with six
                full-name action buttons a row simply grows a bit on short screens. */}
            {dashView === 'library' || dashView === 'shelf' ? (
              <div key={`feed-grid-${dashView}`} ref={dashFeedRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto h-full">
                  {gridTreeMode ? (
                    /* VERSION-TREE cards in the SAME grid layout — ONE VERSION
                    CARD PER GRID CELL, but now every cell is a FULL TEST CARD
                    drawn by the very same renderGridCard as the regular tests:
                    the шапка (author avatar + pin) and the complete action set
                    — Start / Restart / Files / Tree / Share / Edit / Delete.
                    The list = the selected test first, then every test that IS
                    A VERSION of it (the descendant subtree, generation by
                    generation) — 3 per row in the library (2 on narrow phones),
                    1 per row on the shelf. The tree button of any card re-roots
                    the grid at THAT version; the universal top-panel back
                    returns to the test cards. */
                    treeLoading && !treeFamily ? (
                      <div className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4 grid-row-h`}>
                        <Skeleton className="h-full w-full rounded-3xl min-h-72" />
                      </div>
                    ) : treeError && !treeFamily ? (
                      <div className="px-4 py-6 flex flex-col items-start gap-2">
                        <p className="text-sm text-muted-foreground">{treeError}</p>
                        <Button size="sm" variant="outline"
                          onClick={() => { if (gridTreeTestId) api.getTestTree(gridTreeTestId).then(d => { setTreeFamily(d); setTreeError(null); }).catch(e => setTreeError(e?.message || 'Error')); }}
                          className="h-8 rounded-full border-black text-xs px-3"
                        >
                          <RefreshCw className="size-3.5 shrink-0" /> <span>{t('restart')}</span>
                        </Button>
                      </div>
                    ) : (
                      treeRows.map((row, ri) => (
                        <div
                          key={ri}
                          className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4 grid-row-h`}
                        >
                          {row.map(node => renderGridCard(nodeAsTest(node), null))}
                        </div>
                      ))
                    )
                  ) : gridFilesMode ? (
                    /* ATTACHED-FILES cards in the SAME grid layout — the view does not
                    change, only the cards do: one card per attachment of the test whose
                    paperclip was tapped. The page opens with THE STANDARD CARD HEADER —
                    the same cover band as the regular test cards on the main page. The
                    universal top-panel back returns to the test cards — no duplicate
                    back buttons on the cards themselves. */
                    <>
                      {gridFilesTest && (
                        <div className="px-2 sm:px-3 pb-2 sm:pb-3">
                          {/* THE STANDARD CARD HEADER — the author avatar + the
                          pin button above the cover band: the files page of ONE
                          test wears the same шапка as every other card. */}
                          <CreatorStrip
                            name={(gridFilesTest as any).creator?.name || (gridFilesOwn ? effectiveUser?.name : null) || viewingUser?.name || ''}
                            creatorId={(gridFilesTest as any).creator?.id || gridFilesTest.creatorId}
                            image={(gridFilesTest as any).creator?.image || (gridFilesOwn ? myAvatar : null) || viewingUser?.image || null}
                            bookmarked={bookmarkIds.has(gridFilesTest.id)}
                            onToggleBookmark={() => toggleBookmark(gridFilesTest)}
                            addLabel={t('bookmarkAdd')}
                            removeLabel={t('bookmarkRemove')}
                            addShort={t('bookmarkAddShort')}
                            removeShort={t('bookmarkRemoveShort')}
                            onOpenProfile={() => openUserLibrary({ id: (gridFilesTest as any).creator?.id || gridFilesTest.creatorId, name: (gridFilesTest as any).creator?.name, image: (gridFilesTest as any).creator?.image })}
                            openLabel={t('openProfile')}
                          />
                          <div className="relative h-24 min-h-14 shrink sm:h-32 md:h-36 overflow-hidden rounded-2xl mt-2">
                            <div style={gridFilesBgStyle} className={`w-full h-full flex flex-col items-center justify-center px-4 text-center ${gridFilesBgClass}`}>
                              <p className="text-xl sm:text-2xl font-bold text-cta leading-snug line-clamp-2 px-2">{gridFilesTest.title}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {gridFiles.length === 0 ? (
                      <div className="px-4 py-6">
                        <p className="text-sm text-muted-foreground">{t('filesEmpty')}</p>
                      </div>
                    ) : (
                      gridFileRows.map((row, ri) => (
                        <div
                          key={ri}
                          className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4 grid-row-h`}
                        >
                          {row.map((f, ci) => dashView === 'library' ? (
                            <div
                              key={`${f.id || f.url}-${ci}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => window.open(attachmentFileUrl(f), '_blank')}
                              className="h-full min-h-0 flex flex-col rounded-2xl border border-black/15 bg-white p-2 sm:p-3 lg:p-4 overflow-hidden cursor-pointer hover:border-black/40 active:scale-[0.99] transition-all text-left"
                            >
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="w-7 h-7 rounded-lg bg-[#FFF0D9] text-cta flex items-center justify-center shrink-0">
                                  {typeIcon(f.type, 'w-4 h-4')}
                                </span>
                                {f.size ? <span className="text-[10px] text-muted-foreground">{formatSize(f.size)}</span> : null}
                              </div>
                              <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2 mt-1">{f.title}</p>
                              <div className="mt-auto pt-1.5">
                                <Button size="sm"
                                  onClick={e => { e.stopPropagation(); window.open(attachmentFileUrl(f), '_blank'); }}
                                  title={t('openFile')} aria-label={t('openFile')}
                                  className="h-8 rounded-full text-[11px] sm:text-xs lg:h-9 lg:text-[13px] px-1.5 justify-start gap-1 has-[>svg]:px-1"
                                >
                                  <ExternalLink className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('openFile')}</span>
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={`${f.id || f.url}-${ci}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => window.open(attachmentFileUrl(f), '_blank')}
                              className="h-full min-h-0 lg:max-w-4xl lg:w-full lg:mx-auto flex rounded-2xl border border-black/15 bg-white overflow-hidden cursor-pointer hover:border-black/40 active:scale-[0.99] transition-all text-left"
                            >
                              <div className="w-20 sm:w-36 shrink-0 h-full flex flex-col items-center justify-center gap-1 p-2 text-center bg-[#FFF0D9]">
                                <span className="text-cta">{typeIcon(f.type, 'w-6 h-6 sm:w-8 sm:h-8')}</span>
                                <span className="text-[10px] sm:text-xs font-semibold uppercase text-cta">{f.type}</span>
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col p-2 sm:p-3">
                                <p className="text-sm sm:text-base font-bold line-clamp-2">{f.title}</p>
                                {f.size ? <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{formatSize(f.size)}</p> : null}
                                <div className="mt-auto pt-1.5">
                                  <Button size="sm"
                                    onClick={e => { e.stopPropagation(); window.open(attachmentFileUrl(f), '_blank'); }}
                                    title={t('openFile')} aria-label={t('openFile')}
                                    className="h-8 rounded-full text-[11px] sm:text-xs px-2 justify-start"
                                  >
                                    <ExternalLink className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('openFile')}</span>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                    </>
                  ) : (
                    /* TEST cards — every card carries the FULL action set of the TikTok
                    card with its full name, one button per line (never two on one line):
                    Start / Restart / Attached files / Share by link / Share to community /
                    Edit. The same renderGridCard also draws the VERSION cards of the
                    tree grid above (idx = null there). */
                    gridRows.map((row, ri) => (
                      <div
                        key={ri}
                        className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4 grid-row-h`}
                      >
                        {row.map((test, ci) => renderGridCard(test, ri * gridPerRow + ci))}
                      </div>
                    ))
                  )}
                  {!gridFilesMode && !gridTreeMode && (
                    <div ref={feedSentinelRef} className="h-px w-full shrink-0" aria-hidden="true" />
                  )}
                  {/* Desktop clearance for the floating LIBRARY PAGES DOCK:
                  the pages pill hovers over the grid on ≥1024px (the Start
                  dock is absent in the grid views), so the scroll area ends
                  with a spacer no grid row can hide behind. Mobile is an
                  in-flow flex panel — no spacer needed there. */}
                  <div aria-hidden="true" className="hidden lg:block h-28 shrink-0" />
                </div>
              </div>
            ) : treeFeedMode ? (
              /* VERSION-TREE feed — ONE TREE CARD PER TEST, in the feed's
              recommendation order (the SAME engine and slide flow as the
              files feed: every slide carries the test the recommendation
              system put there). Each card is a full version-tree window:
              its INNER swiper walks the ancestor versions and RELEASES the
              gesture at its edges (nested swiper) — swiping up past the
              family trunk lands on the NEXT recommended test's tree, down
              at the root on the previous one. Tapping an apple re-roots
              that card at the tapped version. */
              <div className="relative flex-1 min-h-0 min-w-0" onWheelCapture={onWheelCapture}>
                <Swiper
                  key="feed-tree-swiper"
                  {...swiperParams}
                  className="feed-swiper h-full screen-enter"
                  initialSlide={Math.min(Math.max(0, dashSlideIdx), Math.max(0, tests.length - 1))}
                  onSwiper={(sw) => { treeSwiperRef.current = sw; applyPendingSlide(sw); }}
                  onSlideChange={(sw) => onDashCommitRef.current(sw.activeIndex, 'tree')}
                >
                  <FeedArrows
                    onPrev={() => treeSwiperRef.current?.slidePrev()}
                    onNext={() => treeSwiperRef.current?.slideNext()}
                    canPrev={dashSlideIdx > 0}
                    canNext={dashSlideIdx < tests.length - 1}
                    prevLabel={t('feedPrev')}
                    nextLabel={t('feedNext')}
                  />
                  {tests.map((test) => (
                    <SwiperSlide key={test.id} className="!h-full">
                      <div className="h-full w-full px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
                        <VersionTreeView
                          testId={test.id}
                          bookmarkIds={bookmarkIds}
                          onToggleBookmark={toggleBookmark}
                          userFallback={effectiveUser ? { name: effectiveUser.name, image: myAvatar } : null}
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
            ) : filesFeedMode ? (
              /* FILES feed — one attachment per slide; the flow runs through this
              test's files, then continues into the next recommended test's files.
              Header and bottom bar stay untouched; the on-card button returns.
              Engine: Swiper (vertical, one slide per view) — see swiperParams. */
              <div className="relative flex-1 min-h-0 min-w-0" onWheelCapture={onWheelCapture}>
                <Swiper
                  key="feed-files-swiper"
                  {...swiperParams}
                  className="feed-swiper h-full screen-enter"
                  initialSlide={Math.min(Math.max(0, dashSlideIdx), Math.max(0, fileSlides.length - 1))}
                  onSwiper={(sw) => { filesSwiperRef.current = sw; applyPendingSlide(sw); }}
                  onSlideChange={(sw) => onDashCommitRef.current(sw.activeIndex, 'files')}
                >
                  <FeedArrows
                    onPrev={() => filesSwiperRef.current?.slidePrev()}
                    onNext={() => filesSwiperRef.current?.slideNext()}
                    canPrev={dashSlideIdx > 0}
                    canNext={dashSlideIdx < fileSlides.length - 1}
                    prevLabel={t('feedPrev')}
                    nextLabel={t('feedNext')}
                  />
                  {fileSlides.length === 0 ? (
                    <SwiperSlide className="!h-full flex items-center justify-center">
                      <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>
                    </SwiperSlide>
                  ) : fileSlides.map((s) => {
                    const test = s.test;
                    const bgClass = test.coverColor ? '' : coverBgFor(test);
                    const bgStyle = test.coverColor ? { backgroundColor: test.coverColor } : undefined;
                    return (
                      <SwiperSlide key={`${test.id}`} style={bgStyle} className={`relative !h-full overflow-hidden ${bgClass}`}>
                      <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
                        <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 h-full min-h-0">
                          {/* THE STANDARD CARD HEADER — the author avatar + the
                          pin button above the cover band, the same шапка every
                          feed card wears. */}
                          <CreatorStrip
                            name={(test as any).creator?.name || (test.creatorId === effectiveUser?.id ? effectiveUser?.name : null) || viewingUser?.name || ''}
                            creatorId={(test as any).creator?.id || test.creatorId}
                            image={(test as any).creator?.image || (test.creatorId === effectiveUser?.id ? myAvatar : null) || viewingUser?.image || null}
                            bookmarked={bookmarkIds.has(test.id)}
                            onToggleBookmark={() => toggleBookmark(test)}
                            addLabel={t('bookmarkAdd')}
                            removeLabel={t('bookmarkRemove')}
                            addShort={t('bookmarkAddShort')}
                            removeShort={t('bookmarkRemoveShort')}
                            onOpenProfile={() => openUserLibrary({ id: (test as any).creator?.id || test.creatorId, name: (test as any).creator?.name, image: (test as any).creator?.image })}
                            openLabel={t('openProfile')}
                          />
                          {/* The regular test cards on the main feed wear their title
                          directly on the cover-colored background (big bold text-cta),
                          and this slide's own background IS that cover color — so the
                          header is the same bare title band, not a white name strip. */}
                          <div className="relative h-24 min-h-14 shrink sm:h-32 md:h-36 flex flex-col items-center justify-center px-4 text-center">
                            <p className="text-xl sm:text-2xl font-bold text-cta leading-snug line-clamp-2 px-2">{test.title}</p>
                          </div>
                          <div className="shrink-0 rounded-2xl bg-white/80 px-4 py-1.5 text-center">
                            <p className="text-sm font-bold leading-snug">{t('attachedFiles', { n: s.count })}</p>
                          </div>
                          {/* ALL of the test's files in ONE scrollable card.
                          data-inner-scroll + swiper-no-swiping: the wheel gate
                          lets this area keep its native scrolling and Swiper
                          never starts a drag from inside it. */}
                          <div data-inner-scroll className="swiper-no-swiping flex-1 min-h-0 rounded-2xl border border-black bg-white p-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <AttachmentsList items={s.files} />
                          </div>
                          {/* NO back button here — the universal top-panel arrow is
                          the single exit; the hint below explains the swipe flow. */}
                          <p className="shrink-0 text-center text-[11px] text-foreground/70">
                            {t('swipeNextTestFiles')}
                          </p>
                        </div>
                      </div>
                      </SwiperSlide>
                    );
                  })}
                </Swiper>
              </div>
            ) : (
            /* TikTok-style vertical feed — swipe up/down between tests.
            Engine: Swiper (vertical, one slide per view) — see swiperParams. */
            <div className="relative flex-1 min-h-0 min-w-0" onWheelCapture={onWheelCapture}>
              <Swiper
                key="feed-tiktok-swiper"
                {...swiperParams}
                className="feed-swiper h-full screen-enter"
                initialSlide={Math.min(Math.max(0, dashTestIdx), Math.max(0, (smmActive ? smmLen : tests.length) - 1))}
                onSwiper={(sw) => { testsSwiperRef.current = sw; applyPendingSlide(sw); }}
                onSlideChange={(sw) => onDashCommitRef.current(sw.activeIndex, 'tests')}
              >
                <FeedArrows
                  onPrev={() => testsSwiperRef.current?.slidePrev()}
                  onNext={() => testsSwiperRef.current?.slideNext()}
                  canPrev={dashTestIdx > 0}
                  canNext={dashTestIdx < (smmActive ? smmLen : tests.length) - 1}
                  prevLabel={t('feedPrev')}
                  nextLabel={t('feedNext')}
                />
              {smmActive ? (
                smmLen === 0 ? (
                  <SwiperSlide key="smm-empty" className="relative !h-full overflow-hidden bg-background">
                    <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center gap-2">
                      {smmLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {mySmmRole === 'customer' ? <Megaphone className="w-8 h-8 text-muted-foreground" /> : <Briefcase className="w-8 h-8 text-muted-foreground" />}
                          <p className="text-sm text-muted-foreground">{mySmmRole === 'customer' ? t('smmEmptySpecialists') : t('smmEmptyEvents')}</p>
                        </>
                      )}
                    </div>
                  </SwiperSlide>
                ) : visibleSmmItems.map((item: any, idx: number) => {
                  const isCurSmm = idx === Math.min(dashTestIdx, smmLen - 1);
                  if (smmFeed.kind === 'events') {
                    // The shared EVENT slide — the IDENTICAL card the
                    // customer's «Мероприятия» page draws (one component, so
                    // the two sides can never drift apart visually).
                    const ev = item;
                    return (
                      <SmmEventSlide
                        key={ev.id}
                        ev={ev}
                        pinned={smmBmEvents.includes(ev.id)}
                        isOwner={false}
                        editMode={editMode}
                        onToggleBookmark={() => toggleSmmBookmark('event', ev.id)}
                        onOpenProfile={ev.customer ? () => openUserLibrary({ id: ev.customer.id, name: ev.customer.name, image: ev.customer.image }) : undefined}
                        onChat={() => openCardGroupChat({ ...ev, id: `smm-e:${ev.id}`, title: ev.title, smmKind: 'event' })}
                        onAiDiscuss={() => openAiDiscuss({ ...ev, id: `smm-e:${ev.id}`, title: ev.title, smmKind: 'event' })}
                        onSend={() => openSmmWizard('send', ev)}
                        onFiles={(ev.filesCount || 0) > 0 ? () => openCardFiles({ ...ev, id: `smm-e:${ev.id}`, title: ev.title, smmKind: 'event' }) : undefined}
                      />
                    );
                  }
                  const sp = item;
                  const spPinned = smmBmSpecialists.includes(sp.id);
                  return (
                    <SwiperSlide key={sp.id} className="relative !h-full overflow-hidden" style={sp.videoUrl ? undefined : { backgroundColor: smmCoverColor(sp.id) }}>
                      {sp.videoUrl && (
                        <>
                          <video src={imgSrc(sp.videoUrl)} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/30" />
                        </>
                      )}
                      <div className="relative h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
                        <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
                          <CreatorStrip
                            name={sp.name}
                            creatorId={sp.id}
                            image={sp.image || null}
                            bookmarked={spPinned}
                            onToggleBookmark={() => toggleSmmBookmark('specialist', sp.id)}
                            addLabel={t('bookmarkAdd')}
                            removeLabel={t('bookmarkRemove')}
                            addShort={t('bookmarkAddShort')}
                            removeShort={t('bookmarkRemoveShort')}
                            onOpenProfile={() => openUserLibrary({ id: sp.id, name: sp.name, image: sp.image })}
                            openLabel={t('openProfile')}
                            title={sp.name}
                          />
                          <div className="rounded-3xl border-2 border-black/10 bg-white/85 backdrop-blur px-4 py-3 space-y-2">
                            {sp.headline && <p className="font-bold text-base leading-tight">{sp.headline}</p>}
                            {sp.resume && <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{sp.resume}</p>}
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                              {sp.city && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><MapPin className="w-3 h-3" />{sp.city}</span>}
                              {sp.rate && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Banknote className="w-3 h-3" />{sp.rate}</span>}
                              {sp.ready !== false && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-semibold"><CheckCircle2 className="w-3 h-3" />{t('smmReadyToWork')}</span>}
                            </div>
                          </div>
                          {!editMode && (
                            <>
                              <button type="button" onClick={() => openAiDiscuss({ ...sp, id: `smm-u:${sp.id}`, title: sp.name, smmKind: 'specialist' })} className={`shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left transition-colors ${aiCardTestId === `smm-u:${sp.id}` ? 'border-primary bg-[#FFE8DE]' : 'border-black bg-white hover:bg-muted/50'}`}>
                                <Bot className="w-4 h-4 shrink-0" />
                                <span className="font-semibold text-sm">{t('aiDiscuss')}</span>
                                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                              </button>
                              <button type="button" onClick={() => openCardGroupChat({ ...sp, id: `smm-u:${sp.id}`, title: sp.name, smmKind: 'specialist' })} className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors">
                                <MessageCircle className="w-4 h-4 shrink-0" />
                                <span className="font-semibold text-sm">{t('chat')}</span>
                                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                              </button>
                              {(sp.filesCount || 0) > 0 && (
                                <button type="button" onClick={() => openCardFiles({ ...sp, id: `smm-u:${sp.id}`, title: sp.name, smmKind: 'specialist' })} className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors">
                                  <Paperclip className="w-4 h-4 shrink-0" />
                                  <span className="font-semibold text-sm">{t('attachedFiles', { n: sp.filesCount })}</span>
                                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                                </button>
                              )}
                              {!discoverMode && !viewingUser && spPinned && (
                                <button type="button" onClick={() => toggleSmmBookmark('specialist', sp.id)} className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors">
                                  <BookmarkX className="w-4 h-4 shrink-0" />
                                  <span className="font-semibold text-sm">{t('unpinBtn')}</span>
                                </button>
                              )}
                            </>
                          )}
                          {isCurSmm && editMode && (
                            <p className="text-xs text-muted-foreground text-center">{t('editModeOn')}</p>
                          )}
                        </div>
                      </div>
                    </SwiperSlide>
                  );
                })
              ) : tests.map((test, idx) => {
                const isCur = idx === Math.min(dashTestIdx, tests.length - 1);
                const totalQ = test._count?.questions || test.questions?.length || 0;
                // Per-card stable start values: each card shows ITS OWN defaults;
                // the shared start-params bind only to the committed card (isCur).
                // Nothing can flip while the swipe is still moving — and at the
                // settle commit the adopted shared values EQUAL what was already
                // shown on this card, so the counter/highlights never visibly
                // change. Edits (slider/toggles) stay meaningful: they happen
                // on the settled card, which is always the committed one.
                const cardCount = Math.max(1, Math.min(isCur ? (selectedQuestionCount || totalQ) : totalQ, Math.max(1, totalQ)));
                // Thumb position as 0..1 — anchors the drag bubble over the knob
                // (guarded for a 1-question test where max === min).
                const cardSliderPct = totalQ > 1 ? (cardCount - 1) / (totalQ - 1) : 0;
                const cardRandQ = isCur ? startRandomizeQ : test.randomizeQuestions !== false;
                const cardRandO = isCur ? startRandomizeO : test.randomizeOptions !== false;
                // Own test vs a bookmarked one (saved from Discover): bookmarked
                // tests show no share controls — Edit copies them first.
                const own = !!effectiveUser && test.creatorId === effectiveUser.id;
                // Version state on the card (see the library card): the share
                // link button is PASSIVE until 2+ questions/answers changed.
                const isVersion = !!test.parentId;
                const canShareLink = !isVersion || (test.changedCount ?? 0) >= 2;
                const files = (dashFullTests[test.id]?.attachments ?? test.attachments ?? []) as AttachmentItem[];
                // The attached-files button must NOT pop in a moment later, when
                // the lazy full-test fetch lands: the feed payload already
                // carries the attachment COUNT — use it for the button until
                // the real list arrives. Same fallback the library cards use.
                const filesCount = files.length || test._count?.attachments || 0;
                // Explicitly picked color wins; otherwise derive from the first tag / topic
                const bgClass = test.coverColor ? '' : coverBgFor(test);
                const bgStyle = test.coverColor ? { backgroundColor: test.coverColor } : undefined;
                return (
                  // overflow-hidden: the card always fits the screen — no scrolling
                  // inside a card, swipes only move between cards
                  <SwiperSlide key={test.id} style={bgStyle} className={`relative !h-full overflow-hidden ${bgClass}`}>
                    <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
                      {/* Desktop: the card breathes — the phone-width column widens
                      on large screens instead of looking like a phone cast onto
                      the monitor. Every control row spans the wider column. */}
                      {/* COMPACT ON SHORT SCREENS: on low phones (≤700px CSS
                      height) every control row shrinks — cover, gaps, paddings,
                      sub-labels — so the FULL action set (Delete / Files / Tree
                      included) stays fully visible above the bottom bar. */}
                      <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
                        {/* THE STANDARD CARD HEADER — the author avatar + the pin
                        button on EVERY card of EVERY type now: Discover, other
                        users' libraries AND the personal library alike. */}
                        {(
                          <CreatorStrip
                            name={(test as any).creator?.name || (own ? effectiveUser?.name : null) || viewingUser?.name || ''}
                            creatorId={(test as any).creator?.id || test.creatorId}
                            image={(test as any).creator?.image || (own ? myAvatar : null) || viewingUser?.image || null}
                            bookmarked={bookmarkIds.has(test.id)}
                            onToggleBookmark={() => toggleBookmark(test)}
                            addLabel={t('bookmarkAdd')}
                            removeLabel={t('bookmarkRemove')}
                            addShort={t('bookmarkAddShort')}
                            removeShort={t('bookmarkRemoveShort')}
                            onOpenProfile={() => openUserLibrary({ id: (test as any).creator?.id || test.creatorId, name: (test as any).creator?.name, image: (test as any).creator?.image })}
                            openLabel={t('openProfile')}
                            title={test.title}
                          />
                        )}
                        {/* THE COVER BAND IS GONE: the test title moved UP into
                        the creator strip (between the author icon and the pin
                        button). The slide background already carries the cover
                        color, so the old same-color band was only burning
                        vertical space the ladder (Delete included) needs. */}

                        {isCur && editMode && (
                          <div className="shrink-0 space-y-2 text-center">
                            <p className="text-xs text-muted-foreground">{t('editModeOn')}</p>
                            {test.creatorId === effectiveUser?.id && (
                              <Button size="sm" variant="outline" className="rounded-full border-black text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(test.id)}>
                                <Trash2 className="w-3 h-3 mr-1" /> {t('deleteTest')}
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Controls on every slide — nothing pops in mid-swipe */}
                        {!editMode && (
                          <>
                            {/* Question count — ONE compact slider row: «0» on the
                            left, the test's TOTAL on the right. The old counter row
                            (− / number / +) above the slider is GONE — its vertical
                            space is what the ladder's last level (Delete) needed to
                            stay visible on every phone. While the knob moves (pointer
                            or keyboard), a value bubble rides above the thumb: it
                            follows the knob and shows the live count. */}
                            <div className="shrink-0 flex items-center gap-2.5">
                              <span className="text-xs font-bold text-muted-foreground shrink-0 tabular-nums">0</span>
                              <div className="relative flex-1 min-w-0 flex items-center py-2">
                                <input
                                  type="range"
                                  min={1}
                                  max={totalQ}
                                  value={cardCount}
                                  onChange={e => setSelectedQuestionCount(Number(e.target.value))}
                                  onPointerDown={() => setCardSliderDrag(true)}
                                  onPointerUp={() => setCardSliderDrag(false)}
                                  onPointerCancel={() => setCardSliderDrag(false)}
                                  onKeyDown={() => setCardSliderDrag(true)}
                                  onKeyUp={() => setCardSliderDrag(false)}
                                  onBlur={() => setCardSliderDrag(false)}
                                  aria-label={t('qCount', { n: cardCount })}
                                  className="w-full h-2.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#fe5933] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#fe5933] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow"
                                />
                                {isCur && cardSliderDrag && (
                                  <div
                                    className="absolute bottom-full mb-1 -translate-x-1/2 pointer-events-none z-10"
                                    style={{ left: `calc(${cardSliderPct} * (100% - 16px) + 8px)` }}
                                  >
                                    <div className="px-2.5 py-0.5 rounded-lg bg-[#fe5933] text-white text-sm font-bold leading-tight shadow-lg tabular-nums">{cardCount}</div>
                                    <div className="mx-auto w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#fe5933]" />
                                  </div>
                                )}
                              </div>
                              <span className="text-xs font-bold text-muted-foreground shrink-0 tabular-nums">{totalQ}</span>
                            </div>

                            {/* Test mode — FIXED 2-SLOT GRID: the same two
                            positions on EVERY viewport; slots never move or
                            reflow. The only adaptation is the label, and it is
                            UNIFORM: below 480px BOTH labels hide at once
                            (icons only), at 480px+ BOTH show — one button can
                            never go textless while the other keeps its text.
                            truncate guarantees a label never wraps, so button
                            height and every position stay identical. */}
                            <div className="shrink-0 grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setPracticeMode(false)}
                                title={t('examMode')}
                                aria-label={t('examMode')}
                                className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                                  !practiceMode
                                    ? 'border-cta bg-[#FFF0D9] shadow-md'
                                    : 'border-transparent bg-muted/50 hover:bg-muted'
                                }`}
                              >
                                <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                                  <ListChecks className="w-4 h-4 text-cta shrink-0" />
                                  <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('examMode')}</span>
                                </div>
                              </button>
                              <button
                                onClick={() => setPracticeMode(true)}
                                title={t('practiceMode')}
                                aria-label={t('practiceMode')}
                                className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                                  practiceMode
                                    ? 'border-primary bg-[#FFE8DE] shadow-md'
                                    : 'border-transparent bg-muted/50 hover:bg-muted'
                                }`}
                              >
                                <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                                  <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('practiceMode')}</span>
                                </div>
                              </button>
                            </div>

                            {/* Randomization — tap a card to toggle, styled like
                            the mode cards; same fixed-2-slot + uniform label
                            collapse contract. Icons differ (Shuffle questions /
                            Dices answers) so the icon-only state stays readable;
                            left slot is ALWAYS questions, right ALWAYS answers. */}
                            <div className="shrink-0 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setStartRandomizeQ(v => !v)}
                                title={t('randomizeQuestions')}
                                aria-label={t('randomizeQuestions')}
                                className={`p-2.5 sm:p-3 [@media(max-height:700px)]:p-1.5 rounded-xl border-2 transition-all text-left ${
                                  cardRandQ
                                    ? 'border-cta bg-[#FFF0D9] shadow-md'
                                    : 'border-transparent bg-muted/50 hover:bg-muted'
                                }`}
                              >
                                <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                                  <Shuffle className="w-4 h-4 text-cta shrink-0" />
                                  <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('randomizeQuestions')}</span>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => setStartRandomizeO(v => !v)}
                                title={t('randomizeAnswers')}
                                aria-label={t('randomizeAnswers')}
                                className={`p-2.5 sm:p-3 [@media(max-height:700px)]:p-1.5 rounded-xl border-2 transition-all text-left ${
                                  cardRandO
                                    ? 'border-primary bg-[#FFE8DE] shadow-md'
                                    : 'border-transparent bg-muted/50 hover:bg-muted'
                                }`}
                              >
                                <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                                  <Dices className="w-4 h-4 text-primary shrink-0" />
                                  <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('randomizeAnswers')}</span>
                                </div>
                              </button>
                            </div>

                            {/* FIXED LEVEL LADDER — the SAME sequence every
                            grid card uses (Start/Restart live in the bottom
                            bar here): AI → Chat → Files → Share → Public →
                            Edit → Unpin → Delete. Each button keeps its own
                            row and its own level on every card, in every
                            mode. */}

                            {/* «Обсудить с ИИ» — opens the AI window with the
                            test's metric passport (the version-tree button's
                            replacement). Works in EVERY view: feed, library,
                            shelf; personal AND community library alike. */}
                            <button
                              type="button"
                              onClick={() => openAiDiscuss(test)}
                              className={`shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left transition-colors ${aiCardTestId === test.id ? 'border-primary bg-[#FFE8DE]' : 'border-black bg-white hover:bg-muted/50'}`}
                            >
                              <Bot className="w-4 h-4 shrink-0" />
                              <span className="font-semibold text-sm">{t('aiDiscuss')}</span>
                              <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                            </button>

                            {/* Group chat — opens the per-test GROUP CHAT WINDOW
                            (the same window format as the files window: bottom
                            sheet on mobile / right-docked panel on desktop):
                            everyone's chat about THIS test, right on the card. */}
                            <button
                              type="button"
                              onClick={() => openCardGroupChat(test)}
                              className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors"
                            >
                              <MessageCircle className="w-4 h-4 shrink-0" />
                              <span className="font-semibold text-sm">{t('chat')}</span>
                              <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                            </button>

                            {/* Attached files — opens the FILES WINDOW (the same
                            format as the AI window: bottom sheet on mobile /
                            right-docked panel on desktop) with this test's
                            files; replaces the old files-feed flip */}
                            {filesCount > 0 && (
                              <button
                                type="button"
                                onClick={() => openCardFiles(test)}
                                className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors"
                              >
                                <Paperclip className="w-4 h-4 shrink-0" />
                                <span className="font-semibold text-sm">{t('attachedFiles', { n: filesCount })}</span>
                                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                              </button>
                            )}

                            {/* Share link — EVERY feed card (own, bookmarked and
                            discover alike). Single quiet line: active → tap
                            copies the link; the rule text appears ONLY when the
                            button is passive (versions with <2 changes). */}
                            <button
                              type="button"
                              onClick={() => doShareLink(test)}
                              disabled={!!shareBusy || !canShareLink}
                              className={`shrink-0 w-full flex items-center gap-2 rounded-2xl border-2 px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left transition-colors disabled:opacity-60 ${
                                canShareLink ? 'border-black bg-white hover:bg-muted/50' : 'border-black/15 bg-white/60 cursor-not-allowed'
                              }`}
                            >
                              <Link2 className="w-4 h-4 shrink-0 text-cta" />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-sm leading-tight">{t('shareLinkBtn')}</span>
                                {!canShareLink && (
                                  <span className="block text-xs leading-snug truncate text-destructive/80">{t('shareNeed2Changes')}</span>
                                )}
                              </span>
                            </button>

                            {/* Make public — OWN from-scratch tests ONLY: the
                            flip makes the test visible to the whole community
                            AND copies the link. A version can never be public
                            (server-enforced), so its card never renders this. */}
                            {own && !isVersion && (
                            <button
                              type="button"
                              onClick={() => doMakePublic(test)}
                              disabled={!!shareBusy}
                              className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors disabled:opacity-60"
                            >
                              <Users className="w-4 h-4 shrink-0 text-primary" />
                              <span className="font-semibold text-sm">{t('makePublic')}</span>
                              <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                            </button>
                            )}

                            {/* Edit — every card (own edits in place; a
                            bookmarked or discovered test gets an editable
                            copy) — the same handler the grid card uses. */}
                            <button
                              type="button"
                              onClick={() => startEditTest(test)}
                              className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors"
                            >
                              <Pencil className="w-4 h-4 shrink-0" />
                              <span className="font-semibold text-sm">{t('editTest')}</span>
                            </button>

                            {/* Unpin — bookmarked tests viewed in the personal
                            feed: the test got here via the bookmark button, this
                            row takes it back out of the personal library */}
                            {!discoverMode && !viewingUser && !own && bookmarkIds.has(test.id) && (
                              <button
                                type="button"
                                onClick={() => toggleBookmark(test)}
                                className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors"
                              >
                                <BookmarkX className="w-4 h-4 shrink-0" />
                                <span className="font-semibold text-sm">{t('unpinBtn')}</span>
                              </button>
                            )}

                            {/* Delete — own tests only, visible in every view
                            and content mode (an own public test can be deleted
                            straight from Discover too). The confirm dialog
                            explains everything that dies with the test. */}
                            {own && (
                              <button
                                type="button"
                                onClick={() => setDeleteId(test.id)}
                                className="shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-destructive/50 bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4 shrink-0" />
                                <span className="font-semibold text-sm">{t('deleteTest')}</span>
                              </button>
                            )}


                          </>
                        )}
                      </div>
                    </div>
                  </SwiperSlide>
                );
              })}
              </Swiper>
            </div>
            )}

            {/* Bottom bar — Start Test for the test on screen. In files mode it
            stays EXACTLY the same (dashTestIdx follows the visible slide's test);
            hidden in the grid views where each card carries its own Start. */}
            {dashView !== 'library' && dashView !== 'shelf' && (
            <div className="desktop-dock desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
              <div
                className="max-w-2xl mx-auto px-4 pt-3 pb-3"
              >
                {smmActive ? (
                  /* SMM feed: the main action per the brief — «Пригласить»
                  (customer → specialist) / «Подать заявку» (specialist →
                  event); the wizard opens in the question-cards window */
                  <Button
                    onClick={() => curSmmItem && openSmmWizard(mySmmRole === 'customer' ? 'invite' : 'apply', curSmmItem)}
                    disabled={loading || !curSmmItem}
                    className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
                  >
                    {mySmmRole === 'customer'
                      ? <><UserPlus className="w-4 h-4 mr-2 shrink-0" /> {t('smmInviteBtn')}</>
                      : <><Megaphone className="w-4 h-4 mr-2 shrink-0" /> {t('smmApplyBtn')}</>}
                  </Button>
                ) : editMode ? (
                  <Button
                    onClick={() => curDashTest && startEditTest(curDashTest)}
                    className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-cta hover:bg-cta/90 text-white"
                  >
                    <Edit className="w-4 h-4 mr-2" /> {t('editThisTest')}
                  </Button>
                ) : dashSaved ? (
                  /* SIDE-BY-SIDE (never stacked): the bottom panel keeps its
                  fixed 60px height in EVERY state — Restart | Continue. */
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => startFromDashboard(true)} disabled={loading || !curDashTest} className="flex-1 min-w-0 h-9 lg:h-11 lg:text-base rounded-full">
                      <RefreshCw className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('restart')}</span>
                    </Button>
                    <Button onClick={() => startFromDashboard()} disabled={loading || !curDashTest} className="flex-1 min-w-0 h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90">
                      {loading ? t('loading') : <><Play className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('continueTest', { n: countAnsweredProgress(dashSaved), m: dashSaved.shuffledQuestions.length })}</span></>}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => startFromDashboard()} disabled={loading || !curDashTest} className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90">
                    {loading ? t('loading') : <><Play className="w-4 h-4 mr-2" /> {practiceMode ? t('startPractice', { count: barCount }) : t('startTestN', { count: barCount })}</>}
                  </Button>
                )}
              </div>
            </div>
            )}
          </>
        )}

        {/* LIBRARY PAGES DOCK — the very-bottom panel with the PAGE buttons.
        It lives BELOW the Start-test bottom bar (which floats above it on
        desktop via .desktop-dock-raised) and is rendered in EVERY dashboard
        state — including the empty/skeleton screens. The role decides the
        four buttons: the SPECIALIST gets Личная библиотека | Публичная
        библиотека | Принятые запросы | Отправленные запросы; the CUSTOMER
        gets Личные роли | Общие роли | Личное | Общее (the «мероприятия»
        button is replaced by the roles pages per the brief). A signed-out
        visitor keeps the classic Личное | Общее pair. The active page is
        highlighted (cta fill). */}
        <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div
            className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          >
            {effectiveUser && smmActive ? (
              mySmmRole === 'specialist' ? (
                <SmmSpecialistDock
                  lang={lang}
                  active={discoverMode ? 'public' : 'library'}
                  gotoLibrary={(d: boolean) => gotoLibraryMode(d)}
                  gotoInbox={() => gotoSmmPage('smm-inbox')}
                  gotoRequests={() => gotoSmmPage('smm-requests')}
                />
              ) : (
                <SmmCustomerDock
                  lang={lang}
                  active={discoverMode ? 'public' : 'library'}
                  gotoLibrary={(d: boolean) => gotoLibraryMode(d)}
                  gotoEvents={() => gotoSmmPage('smm-events')}
                  gotoRoles={(scope) => { useSmmStore.getState().setRolesScopeRequest(scope); gotoSmmPage('smm-roles'); }}
                />
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => gotoLibraryMode(false)}
                  disabled={loading}
                  title={`${t('modeMine')} · ${t('modeMineHint')}`}
                  aria-label={t('modeMine')}
                  className={`min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors ${(!discoverMode && !viewingUser) ? 'bg-cta hover:bg-cta/90 text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}
                >
                  <Library className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
                  <span className="min-w-0 truncate">{t('modeMine')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => gotoLibraryMode(true)}
                  disabled={loading}
                  title={`${t('modeDiscover')} · ${t('modeDiscoverHint')}`}
                  aria-label={t('modeDiscover')}
                  className={`min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors ${discoverMode ? 'bg-cta hover:bg-cta/90 text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}
                >
                  <Compass className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
                  <span className="min-w-0 truncate">{t('modeDiscover')}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteTestQ')}</AlertDialogTitle>
              <AlertDialogDescription>{t('deleteWarning')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteId && handleDeleteTest(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

}
