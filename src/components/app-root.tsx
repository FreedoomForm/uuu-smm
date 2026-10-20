'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { api, setUser, getUser } from '@/lib/api';
import { useFeed } from '@/hooks/use-feed';
import {
  feedKey,
  userLibraryKey,
  BOOKMARKS_KEY,
  FEED_PAGE_LIMIT,
  feedQueryOptions,
  patchScope,
  type FeedScope,
} from '@/lib/feed-queries';
import { migrateLocalToServer, readLegacyLang } from '@/lib/legacy-migrate';
import { bindProgressFlush } from '@/lib/test-progress';
import { getGuestTakeTestId, setGuestTakeTestId, readGuestSnapshot, writeGuestSnapshot, clearGuestSnapshot } from '@/lib/guest-take';
import { GuestBootSplash, RegisterWallSheet } from '@/components/guest-flow';
import { autoTranslateQuestions, QTranslationsV } from '@/lib/qtrans';
import MathText from '@/components/math-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
// ---------------------------------------------------------------------------
// Zustand domain stores — the professional state layer (zustand.com, used by
// TikTok-adjacent products, Vercel templates and most serious Next.js apps).
// Every `useState` of the old soup moved into ONE of these domain stores and
// is consumed here through fine-grained selectors with the SAME identifiers,
// so all ~300 call sites in this file keep compiling unchanged.
// ---------------------------------------------------------------------------
import { useSessionStore } from '@/stores/session-store';
import { useProfileStore } from '@/stores/profile-store';
import { useNavStore, navNow } from '@/stores/nav-store';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useEditorStore, resetTestForm as resetTestFormStore } from '@/stores/editor-store';
import { useTakeStore } from '@/stores/take-store';
import { useChatStore, newThreadKey } from '@/stores/chat-store';
// ---------------------------------------------------------------------------
// Perf: heavy, on-demand modules are loaded via next/dynamic so the initial
// bundle (First Load JS) stays small. Only the screens that actually open the
// attachments editor, a chat panel or the cover-color picker download them.
// Types + tiny helpers (AttachmentItem, typeIcon, attachmentFileUrl, formatSize)
// live in the lightweight attachment-utils module and stay static imports.
// ---------------------------------------------------------------------------
import { typeIcon, attachmentFileUrl, formatSize, type AttachmentItem } from '@/components/attachment-utils';
const AttachmentsEditor = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsEditor), { ssr: false });
const AttachmentsList = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsList), { ssr: false });
const AttachmentsBottomSheet = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsBottomSheet), { ssr: false });
const AttachmentsSidePanel = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsSidePanel), { ssr: false });
import { SheetHeaderSwitcher } from '@/components/sheet-switcher';
import type { AiThreadMeta } from '@/components/chat-panels';
const AiChatPanel = dynamic(() => import('@/components/chat-panels').then(m => m.AiChatPanel), { ssr: false, loading: () => <SheetLoadingPlaceholder /> });
const GroupChatPanel = dynamic(() => import('@/components/chat-panels').then(m => m.GroupChatPanel), { ssr: false, loading: () => <SheetLoadingPlaceholder /> });
import { ResizableSheetFrame } from '@/components/resize-sheet';
import { useExitMount } from '@/components/motion';
import type { SheetOption } from '@/components/pages/take-test/sheet-config';
import { Collapse } from '@/components/motion';
import {
  LogIn,
  Plus,
  Trash2,
  MessageCircle,
  Edit,
  Play,
  Shuffle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Trophy,
  BookOpen,
  FlaskConical,
  Home,
  RefreshCw,
  GraduationCap,
  Clock,
  Minus,
  ListChecks,
  MessageSquare,
  Sparkles,
  Paperclip,
  Pencil,
  Users,
  ChevronDown,
  ChevronRight,
  X,
  Hash,
  Palette,
  Languages,
  Search,
  ClipboardList,
  Loader2,
  Link2,
  LayoutGrid,
  Library,
  Rows3,
  ExternalLink,
  Compass,
  BookmarkPlus,
  BookmarkCheck,
  BookmarkX,
  ImagePlus,
  Camera,
  LogOut,
  TreeDeciduous,
  Ban,
  GitBranch,
  Bell,
  Briefcase,
  Building2,
  Banknote,
  CalendarClock,
  Landmark,
  MapPin,
  Megaphone,
  ShieldAlert,
  UserPlus,
  Video,
} from 'lucide-react';
import { VersionNameSheet } from '@/components/version-name-sheet';
const PhotoshopColorPicker = dynamic(() => import('@/components/color-picker').then(m => m.PhotoshopColorPicker), { ssr: false });
import type { Page, Question, Attachment, Test, GroupMessage, Attempt } from '@/lib/app-types';
import { testBackgroundCss } from '@/lib/test-bg';
import AuthView from '@/components/pages/auth-view';
import ProfileView from '@/components/pages/profile-view';
import HistoryView from '@/components/pages/history-view';
import StartTestView from '@/components/pages/start-test-view';
import TakeTestView from '@/components/pages/take-test-view';
import DashboardView from '@/components/pages/dashboard-view';
import type { FeedApi } from '@/components/pages/dashboard-view';
import SmmWizardView from '@/components/pages/smm-wizard-view';
import SmmEventsView from '@/components/pages/smm-events-view';
import SmmEventEditorView from '@/components/pages/smm-event-editor-view';
import SmmInboxView from '@/components/pages/smm-inbox-view';
import SmmRequestsView from '@/components/pages/smm-requests-view';
import SmmRequestEditorView from '@/components/pages/smm-request-editor-view';
import SmmRequestFillView from '@/components/pages/smm-request-fill-view';
import SmmRolesView from '@/components/pages/smm-roles-view';
import { useSmmStore, smmNow } from '@/stores/smm-store';
import { useEventEditorStore, resetEventForm, eventEditorNow } from '@/stores/event-editor-store';
import { useRequestEditorStore, resetRequestForm, requestEditorNow } from '@/stores/request-editor-store';
import CreateEditView from '@/components/pages/create-edit-view';
import LangButton from '@/components/lang-button';
import { CreatorStrip, TranslatingPill, topicBgClass, tagHash, coverBgFor, imgSrc, GLASS_TILE } from '@/components/shared-bits';
import { readTestProgress, writeTestProgress, clearTestProgress, countAnsweredProgress, type SavedTestProgress } from '@/lib/test-progress';
import { Lang, NEXT_LANG, LANG_LABEL, isLang, tUI, trText, trOption, trExpl } from '@/lib/i18n';

// Tiny neutral placeholder shown while a lazily-loaded bottom-sheet panel
// (chat / attachments) is downloading its chunk — keeps the sheet frame sized.
function SheetLoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-full min-h-[240px]">
      <div className="animate-pulse text-neutral-400 text-sm">…</div>
    </div>
  );
}

// Server-rendered boot: the SERVER sets the httpOnly session cookie on login
// (token backed by the Session table); the server page reads its presence and
// pre-renders the DASHBOARD shell (header, every button, feed skeletons)
// directly in the initial HTML — a returning user never sees a splash/loading
// screen, exactly like TikTok. The cookie holds no user data — the client
// confirms identity via GET /api/me against the database.

// STABLE empty file-slides array. The fileSlides memo recomputes whenever a
// prefetch resolves (dashFullTests is in its deps) — in the normal test feed
// it always returns empty. Returning a fresh [] each time gave the memo a new
// reference on EVERY prefetch resolution, which re-ran the feed sync effect
// mid-swipe; the effect saw the not-yet-committed index and scrolled the feed
// back to the previous card for a frame — the user-visible "the PREVIOUS test
// flashes for a split second during a swipe". A stable constant kills that
// trigger class entirely.
const NO_FILE_SLIDES: { test: Test; files: AttachmentItem[]; count: number }[] = [];







// Per-test group chat message (see /api/tests/[id]/chat)
// Shuffle utility
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function shuffleOptions(question: Question): Question {
  const optionKeys: string[] = ['A', 'B', 'C', 'D'];
  const optionE = question.optionE;
  if (optionE) optionKeys.push('E');

  const options = optionKeys.map(key => ({
    key,
    value: key === 'E' ? optionE! : question[`option${key}` as keyof Question] as string,
    img: question.optionImages?.[key] || null, // photo travels WITH its answer text
  }));

  const shuffled = shuffleArray(options);
  const newQ: any = { ...question };
  const keyMap: Record<string, string> = {};

  shuffled.forEach((opt, idx) => {
    const newKey = optionKeys[idx];
    newQ[`option${newKey}`] = opt.value;
    keyMap[opt.key] = newKey;
  });

  newQ.correctAnswer = keyMap[question.correctAnswer] || question.correctAnswer;

  // Per-option photos follow their option text; absent photos leave null slots
  if (question.optionImages && Object.keys(question.optionImages).length) {
    const remapped: Record<string, { u: string; m?: number | null }> = {};
    shuffled.forEach((opt, idx) => {
      if (opt.img) remapped[optionKeys[idx]] = opt.img;
    });
    newQ.optionImages = remapped;
  }

  // Stored interface-language translations must follow the SAME shuffle,
  // otherwise ru/uz users see translated texts pinned to the old letters while
  // the correct-answer badge (and every option photo) moved on.
  if (question.translations && typeof question.translations === 'object') {
    const t: any = { ...question.translations };
    for (const lg of Object.keys(t)) {
      const opts = t[lg]?.options;
      if (opts && typeof opts === 'object') {
        const remappedOpts: Record<string, string> = {};
        shuffled.forEach((opt, idx) => {
          const v = opts[opt.key];
          if (v) remappedOpts[optionKeys[idx]] = v;
        });
        t[lg] = { ...t[lg], options: remappedOpts };
      }
    }
    newQ.translations = t;
  }

  return newQ as Question;
}

// Resolve a stored photo reference to a browser-visible src:
//   data:...  → used as-is (small fallback uploads)
//   tg:<id>   → streamed from the Telegram channel via /api/tgimg/<id>
//   otherwise → external URL, used as-is

// Downscale a picked photo in the browser (max 1600px, JPEG) so uploads stay
// small and pages stay fast even with big phone-camera pictures.
async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  try {
    if (typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 900 * 1024) return file; // already small enough
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size > 0 && blob.size < file.size ? blob : file;
  } catch {
    return file; // any decode hiccup — upload the original bytes
  }
}

// Frosted-glass tile shared by the take-test bottom bar: the lens over the
// current question number AND the prev/next arrow buttons use the SAME material
// (same border, gradient and shadows), so the whole bar reads as one glass set.

// =================== SAVED TEST PROGRESS ("Continue Test") ===================
// Saved test progress (readTestProgress / writeTestProgress /
// clearTestProgress / countAnsweredProgress) lives in src/lib/test-progress.ts
// and is persisted in the DATABASE (SavedProgress table) — never on the device.

function AppRootInner({ authed, guestTest }: { authed: boolean; guestTest?: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loading = useSessionStore(s => s.loading);
  const setLoading = useSessionStore(s => s.setLoading);
  const currentTest = useTakeStore(s => s.currentTest);
  const setCurrentTest = useTakeStore(s => s.setCurrentTest);
  // GUEST share-link session (?test=<id> without a session): boot failure flag
  // (dead link → the splash offers registration) and the registration-wall
  // sheet over the taking screen ('home' | 'chat' | 'edit' — which surface
  // the visitor tried to open; guests can reach nothing outside the test).
  const [guestBootFailed, setGuestBootFailed] = useState(false);
  const [registerWall, setRegisterWall] = useState<null | 'home' | 'chat' | 'edit'>(null);
  // Fresh "is this an anonymous share-link visitor?" read — store-backed so
  // handlers never trip over stale closures after login/registration.
  const isGuestNow = () => {
    const s = useSessionStore.getState();
    return !(s.user || s.hydratedUser);
  };

  // --- Personalized recommendation feed ("under the hood") ---
  // The dashboard looks exactly like before, but invisibly it is powered by
  // /api/feed: tag-affinity ranking (views / starts / completions / time spent
  // / difficult tests), keyset pagination and silent infinite append, so the
  // list stays fast at any test volume and surfaces what the user cares about.
  const shareBusy = useDashboardStore(s => s.shareBusy);
  const setShareBusy = useDashboardStore(s => s.setShareBusy);
  // Dashboard CONTENT MODE — toggled by the account button (like the language
  // button cycles): personal library (own tests + bookmarks) ↔ discover (public
  // tests of other authors). Session-only: reload returns to the library.
  const discoverMode = useNavStore(s => s.discoverMode);
  const setDiscoverMode = useNavStore(s => s.setDiscoverMode);
  // My profile photo (served by /api/users/[id]/avatar) + its tiny uploader
  const myAvatar = useProfileStore(s => s.myAvatar);
  const setMyAvatar = useProfileStore(s => s.setMyAvatar);
  const avatarBusy = useProfileStore(s => s.avatarBusy);
  const setAvatarBusy = useProfileStore(s => s.setAvatarBusy);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // --- Profile page state ---
  // Test-taking background preset key ('' = standard); loaded once per session
  // from GET /api/me together with the editable display name.
  const myBgStyle = useProfileStore(s => s.myBgStyle);
  const setMyBgStyle = useProfileStore(s => s.setMyBgStyle);
  const profileName = useProfileStore(s => s.profileName);
  const setProfileName = useProfileStore(s => s.setProfileName);
  const profileSaving = useProfileStore(s => s.profileSaving);
  const setProfileSaving = useProfileStore(s => s.setProfileSaving);
  const accBusy = useProfileStore(s => s.accBusy);
  const setAccBusy = useProfileStore(s => s.setAccBusy);
  const deleteAccOpen = useProfileStore(s => s.deleteAccOpen);
  const setDeleteAccOpen = useProfileStore(s => s.setDeleteAccOpen);
  // Files feed mode: the TikTok feed flips from one-slide-per-test to the
  // files card(s). When filesFeedTestId is set the feed shows THAT test's
  // files (per-test files mode); null keeps the legacy flattened flow.
  // Header and bottom bar stay untouched; the paperclip button toggles back.
  const filesFeedMode = useNavStore(s => s.filesFeedMode);
  const setFilesFeedMode = useNavStore(s => s.setFilesFeedMode);
  const filesFeedTestId = useNavStore(s => s.filesFeedTestId);
  const setFilesFeedTestId = useNavStore(s => s.setFilesFeedTestId);
  // Grid files mode (Library/Shelf): the grid KEEPS its layout but swaps the
  // test cards for the attachment cards of ONE test (the one whose paperclip
  // was tapped). The header back arrow / files toggle returns to the test cards.
  const gridFilesMode = useNavStore(s => s.gridFilesMode);
  const setGridFilesMode = useNavStore(s => s.setGridFilesMode);
  const gridFilesTestId = useNavStore(s => s.gridFilesTestId);
  const setGridFilesTestId = useNavStore(s => s.setGridFilesTestId);
  // version-tree modes (feed + grid) — the same contract as the files modes
  const treeFeedMode = useNavStore(s => s.treeFeedMode);
  const setTreeFeedMode = useNavStore(s => s.setTreeFeedMode);
  const treeFeedTestId = useNavStore(s => s.treeFeedTestId);
  const setTreeFeedTestId = useNavStore(s => s.setTreeFeedTestId);
  const gridTreeMode = useNavStore(s => s.gridTreeMode);
  const setGridTreeMode = useNavStore(s => s.setGridTreeMode);
  const gridTreeTestId = useNavStore(s => s.gridTreeTestId);
  const setGridTreeTestId = useNavStore(s => s.setGridTreeTestId);
  // Blocked save/share of a trivial copy (fewer than 2 changed questions)
  // → open the RULE dialog explaining the version gate. NOTE: declared with
  // the other hooks — any hook placed after the first conditional return
  // below would break the rules of hooks (the auth screen renders a shorter
  // hook sequence).
  const [gateDialogTest, setGateDialogTest] = useState<{ id: string; title: string } | null>(null);
  // The version-naming gate: the FIRST save of an existing test / the FIRST
  // share-by-link of a personal test opens the chat-style naming sheet before
  // the action proceeds. Holds the action context while the sheet is open.
  const [versionNameGate, setVersionNameGate] = useState<
    null | { mode: 'save' | 'share'; testId: string; title: string; fromTake?: boolean; fromDash?: boolean }
  >(null);
  const [versionNameValue, setVersionNameValue] = useState('');
  const [versionNameBusy, setVersionNameBusy] = useState(false);
  // Throttle for the "color already taken" toast — the picker fires onChange
  // continuously while the user drags across the SV square.
  const lastColorToastAt = useRef(0);
  // Another user's library (opened from their profile photo or a chat avatar):
  // the dashboard shows THEIR public tests; every card carries their name and
  // photo; the header back arrow returns to the viewer's own feed.
  const viewingUser = useNavStore(s => s.viewingUser);
  const setViewingUser = useNavStore(s => s.setViewingUser);
  const dashSlideIdx = useNavStore(s => s.dashSlideIdx);
  const setDashSlideIdx = useNavStore(s => s.setDashSlideIdx);
  // Dashboard header search: searches tests server-side (/api/feed?q=) by
  // TAGS with a dropdown. Hidden behind a search BUTTON; tapping it opens an
  // input overlay that covers the whole header row until dismissed (X / Esc /
  // test chosen) — same pattern as the take-test search.
  const dashSearch = useDashboardStore(s => s.dashSearch);
  const setDashSearch = useDashboardStore(s => s.setDashSearch);
  const dashSearchOpen = useDashboardStore(s => s.dashSearchOpen);
  const setDashSearchOpen = useDashboardStore(s => s.setDashSearchOpen);
  const dashSearchResults = useDashboardStore(s => s.dashSearchResults);
  const setDashSearchResults = useDashboardStore(s => s.setDashSearchResults);
  // Tag dictionary feedback for the current search: whether the exact tag
  // exists, whether we just created it, and similar tags to offer instead.
  const dashTagInfo = useDashboardStore(s => s.dashTagInfo);
  const setDashTagInfo = useDashboardStore(s => s.setDashTagInfo);
  const dashSearching = useDashboardStore(s => s.dashSearching);
  const setDashSearching = useDashboardStore(s => s.setDashSearching);
  // Take-test header search: filters the questions of the running test.
  // Hidden behind a search BUTTON; tapping it opens an input overlay that
  // covers the whole header row until dismissed (X / Esc / question chosen).
  const qSearch = useTakeStore(s => s.qSearch);
  const setQSearch = useTakeStore(s => s.setQSearch);
  const qSearchOpen = useTakeStore(s => s.qSearchOpen);
  const setQSearchOpen = useTakeStore(s => s.setQSearchOpen);
  // Results-page header search: filters the review questions after finishing a test.
  const resSearch = useTakeStore(s => s.resSearch);
  const setResSearch = useTakeStore(s => s.setResSearch);
  const resHighlightIdx = useTakeStore(s => s.resHighlightIdx);
  const setResHighlightIdx = useTakeStore(s => s.setResHighlightIdx);
  const viewSignaledRef = useRef<Set<string>>(new Set());
  // Recommendation-signal bookkeeping: which card is currently settled on
  // screen and when it got there. On every card TRANSITION the previous card
  // is scored by dwell time — a fast swipe-away is the TikTok "skip" signal.
  const dashPrevCardIdRef = useRef<string | null>(null);
  const dashCardShownAtRef = useRef(0);
  const feedSentinelRef = useRef<HTMLDivElement | null>(null);
  const sharedTestHandledRef = useRef(false);
  const attempts = useSessionStore(s => s.attempts);
  const setAttempts = useSessionStore(s => s.setAttempts);

  // Auth - start from the state the SERVER already knows: with the auth cookie
  // the very first HTML paints the dashboard shell, otherwise the login screen.
  // Both sides render the SAME thing on the first pass — zero hydration
  // mismatch, zero splash screen, zero "screen loading" flash.
  const user = useSessionStore(s => s.user);
  const setUserState = useSessionStore(s => s.setUser);
  // `page` is seeded by AppRoot from the SSR-known auth cookie BEFORE this
  // component takes its first store snapshot — see the useState-seed there.
  const page = useNavStore(s => s.page);
  const setPage = useNavStore(s => s.setPage);

  // Mount guard to prevent hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // "First data restore finished" — while false, empty lists render the feed
  // SKELETON (never a "no tests" card, never a splash): the shell the server
  // sent stays visually stable until real (or cached) data swaps in.
  const dataReady = useSessionStore(s => s.dataReady);
  const setDataReady = useSessionStore(s => s.setDataReady);
  // true while the post-boot background refresh is still fetching the first
  // real data (only when the localStorage cache had nothing to paint)
  const bootRefreshing = useSessionStore(s => s.bootRefreshing);
  const setBootRefreshing = useSessionStore(s => s.setBootRefreshing);

  // Interface language (en/ru/uz) — cycles with the header button, persisted
  const lang = useSessionStore(s => s.lang);
  const setLang = useSessionStore(s => s.setLang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  // On-the-fly question translation (see lib/qtrans): questions without a
  // stored translation for the selected language are machine-translated while
  // the test is being taken / reviewed, cached in localStorage and persisted
  // to the DB best-effort. `autoTranslating` drives the small progress pill.
  const autoTranslating = useTakeStore(s => s.autoTranslating);
  const setAutoTranslating = useTakeStore(s => s.setAutoTranslating);
  const trGenRef = useRef(0);
  const trTriedRef = useRef<Set<string>>(new Set());

  // Auth state
  const authMode = useSessionStore(s => s.authMode);
  const setAuthMode = useSessionStore(s => s.setAuthMode);
  const email = useSessionStore(s => s.email);
  const setEmail = useSessionStore(s => s.setEmail);
  const name = useSessionStore(s => s.name);
  const setName = useSessionStore(s => s.setName);
  const password = useSessionStore(s => s.password);
  const setPassword = useSessionStore(s => s.setPassword);

  // Test creation state
  const testTitle = useEditorStore(s => s.testTitle);
  const setTestTitle = useEditorStore(s => s.setTestTitle);
  const testDescription = useEditorStore(s => s.testDescription);
  const setTestDescription = useEditorStore(s => s.setTestDescription);
  // Tags (replace the old topic field): chips + autocomplete from the global tag dictionary
  const testTags = useEditorStore(s => s.testTags);
  const setTestTags = useEditorStore(s => s.setTestTags);
  const tagInput = useEditorStore(s => s.tagInput);
  const setTagInput = useEditorStore(s => s.setTagInput);
  const allTags = useEditorStore(s => s.allTags);
  const setAllTags = useEditorStore(s => s.setAllTags);
  const tagsOpen = useEditorStore(s => s.tagsOpen);
  const setTagsOpen = useEditorStore(s => s.setTagsOpen);
  // Cover customization (create / edit test): '' = auto (derived from tags/topic)
  const testCoverIcon = useEditorStore(s => s.testCoverIcon);
  const setTestCoverIcon = useEditorStore(s => s.setTestCoverIcon);
  const testCoverColor = useEditorStore(s => s.testCoverColor);
  const setTestCoverColor = useEditorStore(s => s.setTestCoverColor);
  const randomizeQ = useEditorStore(s => s.randomizeQ);
  const setRandomizeQ = useEditorStore(s => s.setRandomizeQ);
  const randomizeO = useEditorStore(s => s.randomizeO);
  const setRandomizeO = useEditorStore(s => s.setRandomizeO);
  // Randomization chosen at test START (Start Test page), not in the editor
  const startRandomizeQ = useTakeStore(s => s.startRandomizeQ);
  const setStartRandomizeQ = useTakeStore(s => s.setStartRandomizeQ);
  const startRandomizeO = useTakeStore(s => s.startRandomizeO);
  const setStartRandomizeO = useTakeStore(s => s.setStartRandomizeO);
  const questions = useEditorStore(s => s.questions);
  const setQuestions = useEditorStore(s => s.setQuestions);
  const editingTestId = useEditorStore(s => s.editingTestId);
  const setEditingTestId = useEditorStore(s => s.setEditingTestId);
  // The bound test's version name — null = not named yet → the naming dialog
  // must appear before the first save / the first share-by-link.
  const editingVersionName = useEditorStore(s => s.editingVersionName);
  const setEditingVersionName = useEditorStore(s => s.setEditingVersionName);
  // Dashboard "Edit Test" mode: when ON, clicking a test opens it in the editor
  const editMode = useEditorStore(s => s.editMode);
  const setEditMode = useEditorStore(s => s.setEditMode);

  // Attachments editor state (create / edit test)
  const formAttachments = useEditorStore(s => s.formAttachments);
  const setFormAttachments = useEditorStore(s => s.setFormAttachments);
  // Publication variant of the test — saved WITH the test and applies to the
  // test AND its attached files: false = only people with the link can open,
  // true = the whole community sees it in their feed. Edited in the
  // "Test Information" section of the editor, same option-card style as the
  // share selector on the test card.
  const testIsPublic = useEditorStore(s => s.testIsPublic);
  const setTestIsPublic = useEditorStore(s => s.setTestIsPublic);
  const editingTestIsVersion = useEditorStore(s => s.editingTestIsVersion);
  const setEditingTestIsVersion = useEditorStore(s => s.setEditingTestIsVersion);
  // Attached Files collapse in the editor — same behavior as on the test card
  const editorFilesExpanded = useEditorStore(s => s.editorFilesExpanded);
  const setEditorFilesExpanded = useEditorStore(s => s.setEditorFilesExpanded);
  // All editor sections start collapsed — the page opens as a compact list of one-line cards
  const editorInfoExpanded = useEditorStore(s => s.editorInfoExpanded);
  const setEditorInfoExpanded = useEditorStore(s => s.setEditorInfoExpanded);
  const editorCoverExpanded = useEditorStore(s => s.editorCoverExpanded);
  const setEditorCoverExpanded = useEditorStore(s => s.setEditorCoverExpanded);
  const editorQuestionsExpanded = useEditorStore(s => s.editorQuestionsExpanded);
  const setEditorQuestionsExpanded = useEditorStore(s => s.setEditorQuestionsExpanded);

  // Test taking state
  const currentAttempt = useTakeStore(s => s.currentAttempt);
  const setCurrentAttempt = useTakeStore(s => s.setCurrentAttempt);
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  const setShuffledQuestions = useTakeStore(s => s.setShuffledQuestions);
  const currentQuestionIdx = useTakeStore(s => s.currentQuestionIdx);
  const setCurrentQuestionIdx = useTakeStore(s => s.setCurrentQuestionIdx);

  const answers = useTakeStore(s => s.answers);
  const setAnswers = useTakeStore(s => s.setAnswers);
  const showResult = useTakeStore(s => s.showResult);
  const setShowResult = useTakeStore(s => s.setShowResult);
  const selectedQuestionCount = useTakeStore(s => s.selectedQuestionCount);
  const setSelectedQuestionCount = useTakeStore(s => s.setSelectedQuestionCount);
  const practiceMode = useTakeStore(s => s.practiceMode);
  const setPracticeMode = useTakeStore(s => s.setPracticeMode);
  // Start Test: attached files section — collapsed to one line by default, expandable via arrow
  const startFilesExpanded = useTakeStore(s => s.startFilesExpanded);
  const setStartFilesExpanded = useTakeStore(s => s.setStartFilesExpanded);
  const revealedAnswers = useTakeStore(s => s.revealedAnswers);
  const setRevealedAnswers = useTakeStore(s => s.setRevealedAnswers);
  const explanations = useTakeStore(s => s.explanations);
  const setExplanations = useTakeStore(s => s.setExplanations);
  const loadingExplanations = useTakeStore(s => s.loadingExplanations);
  const setLoadingExplanations = useTakeStore(s => s.setLoadingExplanations);

  // Take-test bottom drum: one-line question strip + tap-to-type jump.
  // The drum strip and the question feed are a Swiper engine inside
  // take-test-view.tsx now — the hand-rolled settle/magnify/sync machinery
  // (drumRef, rAF scales, programmatic-scroll guards, touch-until windows)
  // died with it. What stays here: the typing-mode flag (also reset by the
  // start flows) and the keyboard-close window-scroll restore.
  const drumInputMode = useTakeStore(s => s.drumInputMode);
  const setDrumInputMode = useTakeStore(s => s.setDrumInputMode);

  // When the drum number input closes, the keyboard that opened for it may leave
  // the window scrolled up (the page shifts and a white gap stays below it).
  // Restore the window position immediately and again after the keyboard-close
  // animation settles.
  const prevDrumInputModeRef = React.useRef(false);
  useEffect(() => {
    if (prevDrumInputModeRef.current && !drumInputMode) {
      const restore = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      };
      restore();
      const t = setTimeout(restore, 350);
      prevDrumInputModeRef.current = drumInputMode;
      return () => clearTimeout(t);
    }
    prevDrumInputModeRef.current = drumInputMode;
  }, [drumInputMode]);

  // AI Chat state — ONE SEPARATE conversation per test. Threads persist in
  // localStorage (per user) and are listed in the ☰ history drawer of the
  // chat window; opening the chat on a test resumes THAT test's thread.
  const chatOpen = useNavStore(s => s.chatOpen);
  const setChatOpen = useNavStore(s => s.setChatOpen);
  const chatMessages = useChatStore(s => s.chatMessages);
  const setChatMessages = useChatStore(s => s.setChatMessages);
  const chatInput = useChatStore(s => s.chatInput);
  const setChatInput = useChatStore(s => s.setChatInput);
  const chatLoading = useChatStore(s => s.chatLoading);
  const setChatLoading = useChatStore(s => s.setChatLoading);
  const chatQuestionId = useChatStore(s => s.chatQuestionId);
  const setChatQuestionId = useChatStore(s => s.setChatQuestionId);
  const chatUserAnswer = useChatStore(s => s.chatUserAnswer);
  const setChatUserAnswer = useChatStore(s => s.setChatUserAnswer);
  const chatQuestionObj = useChatStore(s => s.chatQuestionObj);
  const setChatQuestionObj = useChatStore(s => s.setChatQuestionObj);
  const chatThreadId = useChatStore(s => s.chatThreadId);
  const setChatThreadId = useChatStore(s => s.setChatThreadId); // the ACTIVE thread id (a key of chatThreads)
  const chatThreads = useChatStore(s => s.chatThreads);
  const setChatThreads = useChatStore(s => s.setChatThreads);
  const chatHistoryOpen = useNavStore(s => s.chatHistoryOpen);
  const setChatHistoryOpen = useNavStore(s => s.setChatHistoryOpen);
  // The dashboard's AI window (opened from a card button) lives in the nav store:
  const aiCardTestId = useNavStore(s => s.aiCardTestId);
  const setAiCardTestId = useNavStore(s => s.setAiCardTestId);
  // DASHBOARD FILES WINDOW — «Файлы» from any card opens the SAME window
  // format as the AI window (right-docked panel on desktop, resizable bottom
  // sheet on mobile) with the test's attachments inside. Replaces the old
  // files feed/grid modes as the card's files entry.
  const [dashFiles, setDashFiles] = useState<{ testId: string; title: string; items: AttachmentItem[] } | null>(null);
  const [dashFilesOpen, setDashFilesOpen] = useState(false);
  const [dashFilesLoadingId, setDashFilesLoadingId] = useState<string | null>(null);
  // Holds the desktop right-docked panel during its slide-out exit animation
  const dashFilesSideMounted = useExitMount(dashFilesOpen, 220);
  // DASHBOARD GROUP CHAT WINDOW — «Чат» from any card opens the per-test
  // group chat (everyone's chat about THIS test) in the SAME window format
  // as the files/AI windows (right-docked panel on desktop, bottom sheet on
  // mobile). The messages/input reuse the take-test group-chat store, so the
  // conversation follows the user between the taking screen and the dashboard.
  const [dashGroupTestId, setDashGroupTestId] = useState<string | null>(null);
  const dashGroupTitleRef = useRef('');
  // The dashboard window switcher needs the FULL card test (creatorId for the
  // copy-on-edit path) plus a files-count cache — the feed payload carries
  // only the count (test._count.attachments), the full list lands later.
  const dashWindowTestRef = useRef<any>(null);
  const dashFilesCountRef = useRef<Record<string, number>>({});
  // Keep the richest object seen for this test (the switcher's Edit branch
  // needs creatorId even when it re-opens windows with slim {id,title}).
  const stashDashWindowTest = (test: any) => {
    const id = String(test?.id || '');
    if (!id) return;
    const prev: any = dashWindowTestRef.current;
    dashWindowTestRef.current = (prev && String(prev.id) === id && prev.creatorId) ? prev : test;
    dashFilesCountRef.current[id] = ((test as any).attachments || []).length
      || ((test as any)._count?.attachments as number | undefined)
      || dashFilesCountRef.current[id] || 0;
  };
  // Title of the test whose AI window is open on the dashboard (set by the
  // card button together with aiCardTestId; ref — no store churn).
  const aiCardTitleRef = useRef('');
  const chatThreadsLoadedRef = useRef(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Attached files panel (take test)
  const filesOpen = useNavStore(s => s.filesOpen);
  const setFilesOpen = useNavStore(s => s.setFilesOpen);

  // Per-test group chat (everyone taking the same test)
  const groupOpen = useNavStore(s => s.groupOpen);
  const setGroupOpen = useNavStore(s => s.setGroupOpen);
  // Take-test "Edit Test" bottom sheet (opens the shared editor over the taking screen)
  const editOpen = useNavStore(s => s.editOpen);
  const setEditOpen = useNavStore(s => s.setEditOpen);
  const groupMessages = useChatStore(s => s.groupMessages);
  const setGroupMessages = useChatStore(s => s.setGroupMessages);
  const groupInput = useChatStore(s => s.groupInput);
  const setGroupInput = useChatStore(s => s.setGroupInput);
  const groupSending = useChatStore(s => s.groupSending);
  const setGroupSending = useChatStore(s => s.setGroupSending);
  const groupEndRef = React.useRef<HTMLDivElement>(null);

  // Delete confirmation
  const deleteId = useNavStore(s => s.deleteId);
  const setDeleteId = useNavStore(s => s.setDeleteId);
  // Dead share link: the ?test=<id> target was deleted (or unshared) — the
  // dashboard is replaced by a bare "test unavailable" screen with a single
  // way back to the main page.
  const deadLink = useNavStore(s => s.deadLink);
  const setDeadLink = useNavStore(s => s.setDeadLink);

  // Resolve the session from the DATABASE (httpOnly cookie → GET /api/me).
  // ZERO-ON-DEVICE: nothing user-related is read from (or written to) the
  // phone — identity, language, avatar and history all come from the network.
  const hydratedUser = useSessionStore(s => s.hydratedUser);
  const setHydratedUser = useSessionStore(s => s.setHydratedUser);

  // ─── SMM MARKETPLACE ────────────────────────────────────────────────────
  // The role-aware feed (customer → specialists / specialist → events),
  // the wizard bindings and the SMM bookmark cache. See smm-store.ts.
  const [smmFeed, setSmmFeed] = useState<{ kind: 'specialists' | 'events'; items: any[] }>({ kind: 'specialists', items: [] });
  const [smmLoading, setSmmLoading] = useState(false);
  const wizardBusy = useSmmStore(s => s.wizardBusy);
  const smmBmSpecialists = useSmmStore(s => s.smmBmSpecialists);
  const smmBmEvents = useSmmStore(s => s.smmBmEvents);
  const smmBmRequests = useSmmStore(s => s.smmBmRequests);
  const smmBmRoles = useSmmStore(s => s.smmBmRoles);
  const requestsEditModeFlag = useSmmStore(s => s.requestsEditMode);
  const refreshSmmFeed = useCallback(async (scopeOverride?: 'mine' | 'discover') => {
    const st = useSessionStore.getState();
    const uid = st.user?.id || st.hydratedUser?.id;
    if (!uid) return;
    const scope = scopeOverride || (navNow().discoverMode ? 'discover' : 'mine');
    setSmmLoading(true);
    try {
      const feed = await api.getSmmFeed({ scope, limit: 30 });
      setSmmFeed({ kind: feed.kind, items: feed.items || [] });
    } catch { /* transient */ }
    setSmmLoading(false);
  }, []);
  const loadSmmBookmarks = useCallback(() => {
    api.getSmmBookmarks().then(r => {
      const st = useSmmStore.getState();
      st.setSmmBmSpecialists(r.pairs.filter(p => p.targetType === 'specialist').map(p => p.targetId));
      st.setSmmBmEvents(r.pairs.filter(p => p.targetType === 'event').map(p => p.targetId));
      st.setSmmBmRequests(r.pairs.filter(p => p.targetType === 'request').map(p => p.targetId));
      st.setSmmBmRoles(r.pairs.filter(p => p.targetType === 'role').map(p => p.targetId));
    }).catch(() => {});
  }, []);

  // ─── The customer's EVENTS PAGE feed (kind=events override) ──────────────
  // Personal scope = the customer's OWN events + the pinned ones; discover =
  // the general events library (every public open event). The events page is
  // the dashboard's twin: same panels, same view kinds, event cards instead
  // of specialist cards.
  const [eventsScope, setEventsScope] = useState<'mine' | 'discover'>('mine');
  const [eventsItems, setEventsItems] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const eventsScopeRef = useRef(eventsScope);
  eventsScopeRef.current = eventsScope;
  // ── ЗАПРОСЫ (the specialist's structured proposals) + РОЛИ pages state ──
  const [requestsScope, setRequestsScope] = useState<'mine' | 'public'>('mine');
  const [requestsItems, setRequestsItems] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null);
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null);
  const [requestSaving, setRequestSaving] = useState(false);
  // The filling screen (the test-taking twin): the запрос being filled with
  // its editable steps + the save spinner
  const [fillRequest, setFillRequest] = useState<any | null>(null);
  const [fillBusy, setFillBusy] = useState(false);
  // ── РОЛИ (the customer's «Личные роли» + «Общие роли») pages state ──
  const [rolesScope, setRolesScope] = useState<'mine' | 'public'>('mine');
  const [rolesItems, setRolesItems] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [myEventsCache, setMyEventsCache] = useState<any[]>([]);
  const refreshEventsFeed = useCallback(async (scopeOverride?: 'mine' | 'discover', focusId?: string | null) => {
    const st = useSessionStore.getState();
    const uid = st.user?.id || st.hydratedUser?.id;
    if (!uid) return;
    const scope = scopeOverride || eventsScopeRef.current;
    setEventsLoading(true);
    try {
      const feed = await api.getSmmFeed({ scope, limit: 30, kind: 'events' });
      setEventsItems(feed.items || []);
    } catch { /* transient */ }
    setEventsLoading(false);
    if (focusId !== undefined) setFocusEventId(focusId);
  }, []);
  const changeEventsScope = useCallback((s: 'mine' | 'discover') => {
    setEventsScope(s);
    eventsScopeRef.current = s;
    void refreshEventsFeed(s);
  }, [refreshEventsFeed]);

  useEffect(() => {
    void (async () => {
      const me = await api.getSession();
      if (!me?.id) {
        // No live session (fresh visitor / expired token). A stale cookie may
        // have made the server pre-render the dashboard shell — the logout
        // endpoint clears it for the next visit.
        if (authed) api.logout().catch(() => {});
        // GUEST SHARE LINK (?test=<id> without a session): boot THAT test
        // straight into the taking screen — the visitor takes the test and
        // reaches nothing else. No login card flash.
        if (guestTest) {
          await bootGuestTest(guestTest);
          return;
        }
        setPage('auth');
        setDataReady(true);
        return;
      }
      // Normalize the SMM account kind (string → union) for the session store
      const meNorm = { ...me, smmRole: (me.smmRole === 'specialist' ? 'specialist' : 'customer') as 'customer' | 'specialist' };
      setUser(meNorm); // in-memory session cache only
      setHydratedUser(meNorm);
      // Interface language: DB first (User.lang), then the pre-DB device
      // choice (one-time migration), then browser detection. The picked
      // language is PERSISTED TO THE DB, never to the device.
      const legacyLang = readLegacyLang();
      if (isLang(me.lang) && me.lang !== 'en') {
        bootLangRef.current = me.lang;
        setLang(me.lang);
      } else if (isLang(legacyLang) && legacyLang !== 'en') {
        bootLangRef.current = legacyLang;
        setLang(legacyLang);
        api.updateProfile({ lang: legacyLang }).catch(() => {});
      } else {
        const nav = (navigator.language || '').toLowerCase();
        const detected = nav.startsWith('ru') ? 'ru' : nav.startsWith('uz') ? 'uz' : 'en';
        bootLangRef.current = detected;
        setLang(detected);
        if (me.lang === 'en' && detected !== 'en') {
          api.updateProfile({ lang: detected }).catch(() => {});
        }
      }
      // One-time migration: upload whatever data older versions left on this
      // device (saved progress, AI threads) into the database, then wipe the
      // device clean. Runs in the background — never blocks the first paint.
      void migrateLocalToServer(me.id, api);
      // Profile identity for the first frames — straight from the DB response.
      if (me.image && me.image.startsWith('data:')) setMyAvatar(me.image);
      if (typeof me.bgStyle === 'string') setMyBgStyle(me.bgStyle);
      setProfileName(me.name);
      // SMM boot: the bookmark cache + the role-aware feed (background —
      // the dashboard skeleton paints first, the SMM slides fill in after)
      loadSmmBookmarks();
      refreshSmmFeed();
      bindProgressFlush();
      // === Stale-while-revalidate boot (TikTok-speed first paint) ===
      // The server HTML already painted the full dashboard shell; within a
      // session the in-memory Query cache fills the feed instantly, and a
      // cold boot keeps the skeleton (NOT a splash, NOT the "no tests" card)
      // until the network answers — capped so a hanging request still lands
      // on an honest empty state.
      const initialScope: FeedScope = navNow().discoverMode ? 'discover' : 'mine';
      const refresh = Promise.all([
        queryClient.fetchInfiniteQuery(feedQueryOptions(initialScope)).catch(() => {}),
        api.getAttempts()
          .then(data => { setAttempts(data); })
          .catch(() => {}),
      ]);
      setBootRefreshing(true);
      await Promise.race([refresh, new Promise(r => setTimeout(r, 2200))]);
      setBootRefreshing(false);
      setDataReady(true);
      refresh.finally(() => setBootRefreshing(false));
      // Warm the lazily-loaded chunks right after the first paint: when the user
      // later opens a chat / attachments / color picker the panel appears
      // instantly — no "…" placeholder, no buttons popping in.
      const idle = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1200));
      idle(() => {
        import('@/components/chat-panels');
        import('@/components/attachments');
        import('@/components/color-picker');
      });
    })();
  }, []);

  // Only use hydratedUser after mount to avoid hydration mismatch
  const effectiveUser = user || (mounted ? hydratedUser : null);
  // Landing-page resolution WITHOUT store writes (the render-time store seed
  // cannot reach the store copy AppRootInner reads — the server kept painting
  // the LOGIN screen for every returning user, killing the instant dashboard
  // shell). Before mount, the auth cookie is the only evidence: an authed
  // visit pre-renders the dashboard (skeleton) — the same rule on server and
  // client-first-frame, so hydration stays mismatch-free. After mount the
  // real store page wins again (stale cookie + no stored user falls back to
  // login via the mount effect below).
  const landingPage = !mounted && authed && page === 'auth' ? 'dashboard' : page;
  const effectivePage = landingPage === 'auth' && mounted && hydratedUser ? 'dashboard' : landingPage;

  // The SMM account kind drives the dashboard feed kind + the dock button
  const mySmmRole = effectiveUser?.smmRole || 'customer';
  // The SMM feed follows the dashboard scope (personal ↔ discover)
  useEffect(() => {
    if (!effectiveUser || effectivePage !== 'dashboard') return;
    refreshSmmFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverMode, effectiveUser?.id]);

  // Persist the interface language to the DATABASE on every change the USER
  // makes (the cycle button). The value applied during boot is consumed via
  // bootLangRef — boot already PUT where needed; the login flow PUTs the
  // language the visitor picked on the auth screen.
  const bootLangRef = useRef<Lang | null>(null);
  useEffect(() => {
    if (!effectiveUser) return;
    if (bootLangRef.current !== null) {
      bootLangRef.current = null;
      return;
    }
    api.updateProfile({ lang }).catch(() => {});
  }, [lang, effectiveUser?.id]);

  // My profile photo: probe the avatar route once per session/user — a 200
  // means a photo exists (shown on the account button), 404 → initials.
  // (The photo itself lives in the TELEGRAM channel; identity comes from
  // /api/me on boot.)
  useEffect(() => {
    const uid = effectiveUser?.id;
    if (!uid) { setMyAvatar(null); return; }
    let alive = true;
    fetch(`/api/users/${uid}/avatar`)
      .then(res => { if (alive) setMyAvatar(res.ok ? `/api/users/${uid}/avatar?t=${Date.now()}` : null); })
      .catch(() => { if (alive) setMyAvatar(null); });
    return () => { alive = false; };
  }, [effectiveUser?.id]);
  // Profile identity now comes from the DB (/api/me on boot) — the old
  // localStorage profile snapshot effect is gone. The avatar effect above
  // resolves the Telegram-channel photo right after the user is known.

  // Profile-photo upload: center-cropped 256×256 JPEG (a few dozen KB),
  // stored IN THE TELEGRAM CHANNEL by /api/me/avatar like every other file.
  const handleAvatarFile = async (file: File) => {
    if (!effectiveUser || avatarBusy) return;
    setAvatarBusy(true);
    try {
      let blob: Blob = file;
      try {
        const bitmap = await createImageBitmap(file);
        const side = Math.min(bitmap.width, bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
          blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b || file), 'image/jpeg', 0.85));
        }
      } catch { /* keep the original file when the browser cannot decode it */ }
      await api.uploadAvatar(blob);
      setMyAvatar(`/api/users/${effectiveUser.id}/avatar?t=${Date.now()}`);
      toast({ title: t('avatarSaved') });
    } catch (e: any) {
      toast({ title: t('error'), description: e.message, variant: 'destructive' });
    } finally {
      setAvatarBusy(false);
    }
  };

  // --- Profile page ---
  // Load the profile (name + background preset) once per session/user. The
  // name also seeds the editable input; bgStyle drives the test-taking
  // background applied to start-test / take-test / results.
  useEffect(() => {
    const uid = effectiveUser?.id;
    if (!uid) { setMyBgStyle(''); setProfileName(''); return; }
    let alive = true;
    api.getProfile()
      .then((p: any) => {
        if (!alive) return;
        setMyBgStyle(typeof p?.bgStyle === 'string' ? p.bgStyle : '');
        setProfileName(typeof p?.name === 'string' ? p.name : (effectiveUser?.name || ''));
      })
      .catch(() => { if (alive) setProfileName(effectiveUser?.name || ''); });
    return () => { alive = false; };
  }, [effectiveUser?.id]);

  // Rename: PUT /api/me, then mirror the new name into the in-memory session
  // so the dashboard header picks it up instantly.
  const saveProfileName = async () => {
    if (!effectiveUser || profileSaving) return;
    const name = profileName.trim();
    if (!name || name === effectiveUser.name) return;
    setProfileSaving(true);
    try {
      const r: any = await api.updateProfile({ name });
      const next = { id: effectiveUser.id, email: effectiveUser.email, name: r?.name || name };
      setUserState(next);
      setUser(next); // in-memory session cache
      toast({ title: t('profileNameSaved') });
    } catch (e: any) {
      toast({ title: t('error'), description: e.message, variant: 'destructive' });
    } finally {
      setProfileSaving(false);
    }
  };

  // Background preset: optimistic switch — the preview updates instantly and
  // the choice is persisted silently; the previous preset comes back on error.
  const saveBgStyle = async (id: string) => {
    if (!effectiveUser || id === myBgStyle) return;
    const prev = myBgStyle;
    setMyBgStyle(id);
    try {
      await api.updateProfile({ bgStyle: id });
    } catch (e: any) {
      setMyBgStyle(prev);
      toast({ title: t('error'), description: e.message, variant: 'destructive' });
    }
  };

  // Shared cleanup for logout / account deletion: drop the session, the
  // in-memory caches and all user-scoped UI state, then land on the login
  // screen. The device was already storage-free — nothing to wipe here.
  const resetSessionState = () => {
    queryClient.clear(); // every scope cache + bookmarks die with the session
    setUser(null); // in-memory session cache
    setUserState(null);
    setHydratedUser(null);
    setMyAvatar(null);
    setMyBgStyle('');
    setProfileName('');
    setAttempts([]);
    setDiscoverMode(false);
    setViewingUser(null);
    setDataReady(false);
  };

  const handleLogout = () => {
    // Destroy the DB session + clear the httpOnly cookie server-side, then
    // drop the in-memory UI state. Next visit pre-renders the login screen.
    api.logout().catch(() => {});
    resetSessionState();
    setPage('auth');
    toast({ title: t('logoutDone') });
  };

  const handleDeleteAccount = async () => {
    if (!effectiveUser || accBusy) return;
    setAccBusy(true);
    try {
      await api.deleteAccount();
      resetSessionState();
      setPage('auth');
      toast({ title: t('accountDeleted') });
    } catch (e: any) {
      toast({ title: t('error'), description: e.message, variant: 'destructive' });
    } finally {
      setAccBusy(false);
    }
  };


  // --- Saved test progress ("Continue Test") ---
  const progressUserId = effectiveUser?.id || 'anon';
  const savedProgress = useTakeStore(s => s.savedProgress);
  const setSavedProgress = useTakeStore(s => s.setSavedProgress);
  // Re-check saved progress whenever the screen or the current test changes —
  // the start-test page uses it to swap "Start Test" for "Continue Test".
  // The snapshot lives in the DATABASE (async read; in-memory cache serves
  // repeat views instantly).
  useEffect(() => {
    let alive = true;
    if (!currentTest) { setSavedProgress(null); return; }
    readTestProgress(progressUserId, currentTest.id).then(p => {
      if (alive) setSavedProgress(p);
    });
    return () => { alive = false; };
  }, [currentTest?.id, effectivePage, progressUserId]);

  // --- Professional feed data layer (TanStack Query) ---
  // ONE hook owns every dashboard scope. Scopes live under isolated query
  // keys (['feed', scope] / ['user-library', id] / ['bookmarks']), mutations
  // patch the cache locally, and no code path can ever merge one scope into
  // another. See src/lib/feed-queries.ts + src/hooks/use-feed.ts.
  const feedScope: FeedScope = discoverMode ? 'discover' : 'mine';
  const {
    tests,
    bookmarkIds,
    feedLoading,
    viewingLoading,
    fetchNextFeedPage,
    libraryError,
  } = useFeed({
    scope: feedScope,
    viewingUserId: viewingUser?.id || null,
    enabled: !!effectiveUser && effectivePage === 'dashboard',
  });

  // The query key of the list currently on screen (every local patch targets it)
  const activeScopeKey = () =>
    viewingUser?.id ? userLibraryKey(viewingUser.id) : feedKey(navNow().discoverMode ? 'discover' : 'mine');

  // Next pages, appended silently when the user approaches the end of the feed
  const loadMoreFeed = useCallback(() => {
    if (navNow().viewingUser) return; // another user's library: no pagination
    void fetchNextFeedPage();
  }, [fetchNextFeedPage]);

  // Silent infinite scroll (LIBRARY/SHELF grids only): observe the sentinel
  // below the last card. The Swiper feeds append their next page in
  // onDashCommit (3 cards before the end) — no sentinel there: Swiper's
  // wrapper must contain nothing but slides.
  useEffect(() => {
    if (effectivePage !== 'dashboard') return;
    if (dashView !== 'library' && dashView !== 'shelf') return;
    const el = feedSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) loadMoreFeed(); },
      { root: dashFeedRef.current, rootMargin: '700px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  });

  // Shared test link (?test=<id>): open that exact test on the dashboard.
  // Powers the "share by link" option — recipients land directly on the test.
  useEffect(() => {
    if (sharedTestHandledRef.current || !dataReady || effectivePage !== 'dashboard') return;
    let raw: string | null = null;
    try { raw = new URLSearchParams(window.location.search).get('test'); } catch { raw = null; }
    if (!raw) return;
    sharedTestHandledRef.current = true;
    const id = raw.trim().slice(0, 40);
    const cleanUrl = () => { try { window.history.replaceState({}, '', window.location.pathname); } catch {} };
    const idx = tests.findIndex(x => x.id === id);
    const jump = (i: number) => {
      // Deep links always open the swipe feed, never the grid views
      if (dashView !== 'tiktok1' && dashView !== 'tiktok2') setDashView('tiktok1');
      setDashTestIdx(i);
      scrollDashTo(i);
    };
    if (idx >= 0) {
      jump(idx);
      cleanUrl();
      return;
    }
    // Not in the loaded pages — fetch the full test and pin it to the top
    api.getTest(id).then((full: Test) => {
      patchScope(queryClient, activeScopeKey(), { prepend: [full] });
      jump(0);
      cleanUrl();
    }).catch((e: any) => {
      // The linked test is gone (deleted by its author): keep the URL and
      // swap the whole dashboard for the dead-link screen — just a message
      // and the return-home button. Transient failures stay silent.
      if (String(e?.message || '').toLowerCase().includes('not found')) setDeadLink(true);
      else cleanUrl();
    });
  });

  // Shared EVENT link (?event=<id>): open that event's card on the events
  // page — the events analogue of the tests' ?test= deep link. A guest who
  // opens the link lands on the auth screen first; the URL stays intact, so
  // right after login/registration this handler fires and opens the event.
  const sharedEventHandledRef = useRef(false);
  useEffect(() => {
    if (sharedEventHandledRef.current || !dataReady || !effectiveUser || effectivePage !== 'dashboard') return;
    let raw: string | null = null;
    try { raw = new URLSearchParams(window.location.search).get('event'); } catch { raw = null; }
    if (!raw) return;
    sharedEventHandledRef.current = true; // guard before the async work
    const id = raw.trim().slice(0, 40);
    const cleanUrl = () => { try { window.history.replaceState({}, '', window.location.pathname); } catch {} };
    api.getSmmEvent(id).then((detail: any) => {
      const own = detail.customerId === effectiveUser.id;
      setEventsScope(own ? 'mine' : 'discover');
      eventsScopeRef.current = own ? 'mine' : 'discover';
      setEventsItems(prev => (prev.some(x => x.id === id) ? prev : [detail, ...prev]));
      setFocusEventId(id);
      setPage('smm-events');
      cleanUrl();
    }).catch((e: any) => {
      // The linked event is gone or hidden: dead-link screen (the same
      // behavior the tests' deep link has); transient failures stay silent.
      if (String(e?.message || '').toLowerCase().includes('not found')) setDeadLink(true);
      else cleanUrl();
    });
  });

  // Shared REQUEST link (?request=<id>): open that запрос's card on the
  // «Отправленные запросы» page — the запрос analogue of the ?event= link.
  // Own запросы always open; foreign ones only when public (the server
  // enforces the same rule on GET /api/smm/requests/[id]).
  const sharedRequestHandledRef = useRef(false);
  useEffect(() => {
    if (sharedRequestHandledRef.current || !dataReady || !effectiveUser || effectivePage !== 'dashboard') return;
    let raw: string | null = null;
    try { raw = new URLSearchParams(window.location.search).get('request'); } catch { raw = null; }
    if (!raw) return;
    sharedRequestHandledRef.current = true;
    const id = raw.trim().slice(0, 40);
    const cleanUrl = () => { try { window.history.replaceState({}, '', window.location.pathname); } catch {} };
    api.getSmmRequest(id).then((detail: any) => {
      const own = detail.specialistId === effectiveUser.id;
      setRequestsScope(own ? 'mine' : 'public');
      setRequestsItems(prev => (prev.some(x => x.id === id) ? prev : [detail, ...prev]));
      setFocusRequestId(id);
      setPage('smm-requests');
      cleanUrl();
    }).catch(() => cleanUrl());
  });

  // Every open of the events page revalidates its feed in the background
  // (the cached items paint first, the refresh slides in silently).
  useEffect(() => {
    if (effectivePage === 'smm-events' && effectiveUser) void refreshEventsFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePage]);

  // Header search (tests context): debounce 350ms, server-side /api/feed?q=
  // In SMM mode the search filters the SMM feed LOCALLY instead (see
  // dashboard-view) — the tests tag search stays out of the marketplace.
  useEffect(() => {
    if (effectivePage !== 'dashboard') return;
    const q = dashSearch.trim();
    if (q.length < 2) { setDashSearchResults(null); setDashTagInfo(null); setDashSearching(false); return; }
    if (effectiveUser && !navNow().viewingUser && (navNow().dashView === 'tiktok1' || navNow().dashView === 'tiktok2')) {
      // The SMM TikTok feed is active — the search filters it locally (see
      // dashboard-view); the tests tag dropdown stays out of the marketplace.
      setDashSearchResults(null); setDashTagInfo(null); setDashSearching(false); return;
    }
    setDashSearching(true);
    let alive = true;
    const t = setTimeout(() => {
      api.getFeed({ tab: 'foryou', q, limit: 8 })
        .then((res: { items?: Test[]; tagInfo?: { query: string; exists: boolean; created: boolean; similar: string[] } | null }) => { if (alive) { setDashSearchResults(res?.items || []); setDashTagInfo(res?.tagInfo || null); setDashSearching(false); } })
        .catch(() => { if (alive) { setDashSearchResults([]); setDashTagInfo(null); setDashSearching(false); } });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [dashSearch, effectivePage]);

  // Dashboard: TikTok-style vertical feed of tests
  const dashTestIdx = useDashboardStore(s => s.dashTestIdx);
  const setDashTestIdx = useDashboardStore(s => s.setDashTestIdx);
  // Dashboard: TikTok-style vertical feed of tests (Swiper engine; see
  // dashboard-view — commits arrive through onDashCommit after the slide
  // settles, external jumps go out through the feedApiRef handle).
  const dashFullTests = useDashboardStore(s => s.dashFullTests);
  const setDashFullTests = useDashboardStore(s => s.setDashFullTests);
  const dashFeedRef = React.useRef<HTMLDivElement>(null);
  // Imperative handle to the Swiper feed engine (dashboard-view registers it)
  const feedApiRef = React.useRef<FeedApi | null>(null);

  // The feed container keeps its DOM node across scope switches — snap the
  // swiper (feed) or the scroll (grid) back to the top whenever a foreign
  // library opens. (Hooks must live ABOVE the first conditional page return.)
  useEffect(() => {
    if (!viewingUser) return;
    const raf = requestAnimationFrame(() => {
      if (navNow().filesFeedMode || navNow().dashView === 'tiktok1' || navNow().dashView === 'tiktok2') {
        feedApiRef.current?.slideTo(0, 0);
      } else {
        const el = dashFeedRef.current;
        if (el) el.scrollTop = 0;
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUser?.id]);

  // Library load failure — surface it once per attempt (v5 has no onError)
  const libraryErrorSeenRef = useRef('');
  useEffect(() => {
    if (!viewingUser || !libraryError) return;
    const sig = `${viewingUser.id}:${libraryError.message}`;
    if (libraryErrorSeenRef.current === sig) return;
    libraryErrorSeenRef.current = sig;
    toast({ title: t('error'), variant: 'destructive' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUser, libraryError]);

  const dashFetchedRef = React.useRef<Set<string>>(new Set());

  // ── PREDICTION ENGINE (TikTok-style "prepare the next action") ──────────
  // TikTok never waits for the user to land before it starts working: while
  // card N is on screen the payloads and media of N+1/N+2 are already in
  // flight, and the next feed page is loading before the user reaches it.
  // Same here:
  //   • fetchFullTest   — deduped GET /tests/<id> → dashFullTests cache
  //   • prefetchFullTest — same, scheduled in idle time (never janks a frame)
  //   • prefetchNeighbors — the ±2 window around an anchor, direction-first
  //   • preheatMedia     — decode-ahead of the images a card will show
  // The nearest neighbour in the movement direction is fetched URGENTLY
  // (immediately), the rest go through requestIdleCallback.
  const dashMoveDirRef = React.useRef<1 | -1>(1);
  const dashQueuedRef = React.useRef<Set<string>>(new Set());
  const mediaPreheatedRef = React.useRef<Set<string>>(new Set());

  const startFullFetch = React.useCallback((id: string) => {
    if (!id || dashFetchedRef.current.has(id)) return;
    dashFetchedRef.current.add(id);
    api.getTest(id)
      .then((full: Test) => {
        setDashFullTests(prev => ({ ...prev, [id]: full }));
        preheatMedia(full);
      })
      .catch(() => { dashFetchedRef.current.delete(id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle scheduler: requestIdleCallback with a deadline so prefetches always
  // run (max 400ms late), plain timeout fallback elsewhere.
  const idleSchedule = (fn: () => void, timeout = 400): void => {
    const w = window as any;
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout });
    else setTimeout(fn, Math.min(timeout, 200));
  };

  const prefetchFullTest = React.useCallback((id: string, urgent = false) => {
    if (!id || dashFetchedRef.current.has(id) || dashQueuedRef.current.has(id)) return;
    if (urgent) { startFullFetch(id); return; }
    dashQueuedRef.current.add(id);
    idleSchedule(() => {
      dashQueuedRef.current.delete(id);
      startFullFetch(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFullFetch]);

  // Decode-ahead for the images the NEXT cards will render: creator avatar +
  // up to 3 image attachments. Browser cache + decoded image pool = the card
  // paints complete on its first visible frame (no half-loaded pop-in).
  function preheatMedia(full: Test) {
    idleSchedule(() => {
      try {
        const urls: string[] = [];
        const creator: any = (full as any).creator;
        if (creator?.image) {
          urls.push(creator.image.startsWith('tg:') ? `/api/users/${creator.id}/avatar` : creator.image);
        }
        const atts = ((full.attachments ?? []) as AttachmentItem[]).filter(Boolean);
        for (const a of atts) {
          if (urls.length >= 4) break;
          if (a.type && a.type.startsWith('image') && a.url) urls.push(attachmentFileUrl(a));
        }
        for (const u of urls) {
          if (mediaPreheatedRef.current.has(u) || mediaPreheatedRef.current.size > 60) continue;
          mediaPreheatedRef.current.add(u);
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => { try { (img as any).decode?.().catch(() => {}); } catch {} };
          img.src = u;
        }
      } catch { /* preheat is best-effort */ }
    }, 600);
  }

  // Direction-weighted neighbourhood prefetch: while card `anchor` is on
  // screen, prepare the cards the user is most likely to swipe to next.
  const prefetchNeighbors = React.useCallback((anchor: number, dir: 1 | -1 = 1) => {
    const n = tests.length;
    if (n === 0) return;
    const order = dir === 1
      ? [anchor + 1, anchor + 2, anchor - 1]
      : [anchor - 1, anchor - 2, anchor + 1];
    order.forEach((i, rank) => {
      if (i < 0 || i >= n) return;
      // rank 0 = the most likely next card → fetch right now, not in idle
      prefetchFullTest(tests[i].id, rank === 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, prefetchFullTest]);
  // Dashboard VIEW modes: tiktok1 = card swipe feed, tiktok2 = the same feed
  // opened from the library (back button in the header), library = shelves of
  // 3 mini cards per shelf, shelf = one card per shelf. Library & shelf scroll
  // endlessly downwards while tests remain.
  const dashView = useNavStore(s => s.dashView);
  const setDashView = useNavStore(s => s.setDashView);
  // Library grid: 2 cards per row on phones (full button names need the width),
  // 3 per row from sm up, 4 per row from lg up (desktop), 5 per row on ≥1440px
  const libNarrow = useDashboardStore(s => s.libNarrow);
  const setLibNarrow = useDashboardStore(s => s.setLibNarrow);
  const setLibWide = useDashboardStore(s => s.setLibWide);
  const setLibUltra = useDashboardStore(s => s.setLibUltra);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const mqWide = window.matchMedia('(min-width: 1024px)');
    const mqUltra = window.matchMedia('(min-width: 1440px)');
    const sync = () => {
      setLibNarrow(mq.matches);
      setLibWide(mqWide.matches);
      setLibUltra(mqUltra.matches);
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
  // Dashboard CONTENT MODE lives with the other dashboard state above; the
  // bookmark ids live in their own query (['bookmarks'], see use-feed).
  const gridScrollTopRef = useRef(0);
  const libReturnViewRef = useRef<'library' | 'shelf'>('library');

  // Flattened file slides for files feed mode: every loaded test contributes
  // ONE slide listing ALL of its attachments, in recommendation order (tests
  // without files are skipped — the swipe flows from this test's files card
  // to the next test's).
  // A test's slides join ONLY once every earlier loaded test is fetched too,
  // so resolving fetches APPEND slides and never shift the visible position.
  // ONE slide per test — the card lists ALL of the test's attached files
  // (scrollable), not one file per slide.
  const fileSlides = React.useMemo(() => {
    if (!filesFeedMode) return NO_FILE_SLIDES;
    const out: { test: Test; files: AttachmentItem[]; count: number }[] = [];
    // Per-test files mode: exactly ONE slide with that test's files (even if
    // the test has left the loaded list — the cached full payload covers it).
    if (filesFeedTestId) {
      const t = tests.find(x => x.id === filesFeedTestId) || (dashFullTests[filesFeedTestId] as Test | undefined);
      if (!t) return out;
      const full = dashFullTests[t.id];
      if (!full) return out; // attachments still loading
      const fl = ((full.attachments ?? []) as AttachmentItem[]).filter(Boolean);
      if (fl.length > 0) out.push({ test: t, files: fl, count: fl.length });
      return out;
    }
    for (const t of tests) {
      const full = dashFullTests[t.id];
      if (!full) break; // earlier test's attachments still loading — stop here
      const fl = ((full.attachments ?? []) as AttachmentItem[]).filter(Boolean);
      if (fl.length === 0) continue; // tests without files don't contribute a card
      out.push({ test: t, files: fl, count: fl.length });
    }
    return out;
  }, [filesFeedMode, filesFeedTestId, tests, dashFullTests]);
  const fileSlidesRef = useRef<{ test: Test; files: AttachmentItem[]; count: number }[]>([]);
  const fileSlidesCountRef = useRef(0);
  useEffect(() => { fileSlidesRef.current = fileSlides; fileSlidesCountRef.current = fileSlides.length; }, [fileSlides]);

  // Instantly align the dashboard feed with slide/test index i (post-commit)
  const scrollDashTo = useCallback((i: number) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      feedApiRef.current?.slideTo(i, 0);
    }));
  }, []);

  // Entering files mode: remember which test's files to land on; once its
  // slides exist (attachments may still be loading), scroll to the first one.
  const pendingFilesJumpRef = useRef<string | null>(null);
  useEffect(() => {
    if (!filesFeedMode || !pendingFilesJumpRef.current) return;
    const idx = fileSlides.findIndex(s => s.test.id === pendingFilesJumpRef.current);
    if (idx < 0) return;
    pendingFilesJumpRef.current = null;
    setDashSlideIdx(idx);
    scrollDashTo(idx);
  }, [fileSlides, filesFeedMode, scrollDashTo]);

  // When the visible test/slide changes: apply its defaults, lazy-fetch the
  // full test for attachments, sync feed scroll (test mode only — in files
  // or tree mode the settle handler is the single source of truth for the
  // position; the bottom bar still follows the visible card's test).
  useEffect(() => {
    if (effectivePage !== 'dashboard') return;
    if (tests.length === 0) return;
    if (dashView !== 'tiktok1' && dashView !== 'tiktok2') return; // grid views have no "current test"
    if (filesFeedMode || treeFeedMode) {
      // FILES: the visible slide's test; TREE: the visible tree card's test
      // (tree cards map 1:1 onto the feed's tests — slide i is test i).
      const t = filesFeedMode
        ? fileSlides[Math.min(Math.max(0, dashSlideIdx), Math.max(0, fileSlides.length - 1))]?.test
        : tests[Math.min(Math.max(0, dashSlideIdx), Math.max(0, tests.length - 1))];
      if (!t) return;
      // Keep dashTestIdx on the test whose files/tree are visible — the
      // bottom bar (Start Test etc.) then stays EXACTLY as it is in the
      // normal feed
      const tIdx = tests.findIndex(x => x.id === t.id);
      if (tIdx >= 0 && tIdx !== dashTestIdx) setDashTestIdx(tIdx);
      const totalQ = t._count?.questions || t.questions?.length || 0;
      setSelectedQuestionCount(Math.max(1, totalQ));
      setStartRandomizeQ(t.randomizeQuestions !== false);
      setStartRandomizeO(t.randomizeOptions !== false);
      setStartFilesExpanded(false);
      // PREDICTION: files mode needs every loaded test's attachments (slides
      // append as fetches resolve); tree mode runs the same prefetch so the
      // bottom bar and a potential Start stay fully backed. Current slide
      // first, the rest in idle time through the shared dedup engine.
      startFullFetch(t.id);
      for (const t2 of tests) prefetchFullTest(t2.id);
      return;
    }
    const safeIdx = Math.min(Math.max(0, dashTestIdx), tests.length - 1);
    if (safeIdx !== dashTestIdx) { setDashTestIdx(safeIdx); return; }
    const t = tests[safeIdx];
    const totalQ = t._count?.questions || t.questions?.length || 0;
    setSelectedQuestionCount(Math.max(1, totalQ));
    setStartRandomizeQ(t.randomizeQuestions !== false);
    setStartRandomizeO(t.randomizeOptions !== false);
    setStartFilesExpanded(false);
    // Feed position: the Swiper engine owns it (dashboard-view syncs the
    // swiper to dashTestIdx / dashSlideIdx — including the return-to-dashboard
    // remount via initialSlide). No native scrollTo left to fight gestures.
    // PREDICTION: the current card + its direction-weighted neighbours are
    // prefetched here too (covers non-scroll index changes: return to the
    // dashboard, jump-to-test, delete, ...). All deduped by the engine.
    startFullFetch(t.id);
    prefetchNeighbors(safeIdx, dashMoveDirRef.current);
  }, [dashTestIdx, dashSlideIdx, filesFeedMode, treeFeedMode, dashView, effectivePage, tests, fileSlides, startFullFetch, prefetchNeighbors, prefetchFullTest]);

  // Grid views (library / shelf): prefetch the full tests of every loaded card
  // so the per-card attached-files button knows the real file count — routed
  // through the prediction engine (idle-scheduled, deduped, media preheated)
  useEffect(() => {
    if (effectivePage !== 'dashboard') return;
    if (dashView !== 'library' && dashView !== 'shelf') return;
    for (const t of tests) prefetchFullTest(t.id);
  }, [dashView, effectivePage, tests, prefetchFullTest]);

  // Scroll the page down to the newly added question (questions scroll with the whole page)
  const prevQuestionCountRef = React.useRef(questions.length);
  useEffect(() => {
    if (questions.length > prevQuestionCountRef.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
    prevQuestionCountRef.current = questions.length;
  }, [questions.length]);

  const handleAuth = async () => {
    if (!email || !password || (authMode === 'signup' && !name)) {
      toast({ title: 'Error', description: 'All fields are required', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      let result;
      if (authMode === 'signup') {
        result = await api.register({ email, name, password, smmRole: useSessionStore.getState().smmRole });
      } else {
        result = await api.login({ email, password });
      }
      setUser(result);
      setUserState(result);
      setHydratedUser(result);
      // SMM: fresh session → the bookmark cache + the role-aware feed
      loadSmmBookmarks();
      refreshSmmFeed();
      // The login/register response already set the httpOnly session cookie
      // (DB-backed) — the next visit pre-renders the dashboard shell.
      // Professional fresh-session boot: prefetch of the personal feed BEFORE
      // the dashboard shows — no empty flash. (The hook then serves the very
      // same in-memory cache; no duplicate request.)
      const [, userAttempts] = await Promise.all([
        queryClient.prefetchInfiniteQuery(feedQueryOptions('mine')).catch(() => {}),
        api.getAttempts().catch(() => [] as Attempt[]),
      ]);
      setAttempts(userAttempts);
      setDataReady(true);
      // GUEST continuation: a share-link visitor just registered / logged in —
      // drop them straight back into the test at the exact saved position
      // (the local snapshot migrates into the account) instead of the dashboard.
      const guestId = getGuestTakeTestId();
      if (guestId) {
        await resumeGuestTake(result, guestId);
      } else {
        setPage('dashboard');
      }
      if (authMode === 'signup') {
        toast({ title: t('accountCreated'), description: t('welcomeBack') });
      } else {
        toast({ title: t('welcomeBack') });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };
  // NOTE: the header account button no longer hosts a logout dropdown — it
  // toggles the dashboard content modes now (see toggleDiscoverMode). Logout
  // happens through clearing the session (browser data).




  // --- TEST CREATION ---
  const addQuestion = () => {
    setQuestions([...questions, { text: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A' }]);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: string, value: string) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], [field]: value };
    setQuestions(updated);
  };

  // Multi-field question patch (photos set url + channel-post id in one go)
  const patchQuestion = (idx: number, patch: Partial<Question>) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], ...patch };
    setQuestions(updated);
  };

  // --- Question / option photos ---
  // Photos go to the OWNER'S TELEGRAM CHANNEL via /api/attachments/upload
  // (kind=image): the DB keeps only a `tg:<file_id>` reference. Small files
  // fall back to data: URLs when the bot is not connected. The picked image is
  // downscaled in the browser first (max 1600px JPEG) to keep uploads light.
  const photoBusy = useEditorStore(s => s.photoBusy);
  const setPhotoBusy = useEditorStore(s => s.setPhotoBusy);

  const pickQuestionPhoto = async (idx: number, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('error'), description: t('notAnImage'), variant: 'destructive' });
      return;
    }
    setPhotoBusy(`q-${idx}`);
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append('file', new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: blob.type || 'image/jpeg' }));
      fd.append('kind', 'image');
      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        body: fd,
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok && body?.url) {
        patchQuestion(idx, { imageUrl: body.url as string, imageMsgId: typeof body.tgMessageId === 'number' ? body.tgMessageId : null });
      } else {
        toast({ title: t('photoUploadFail'), description: body?.error || `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('photoUploadFail'), variant: 'destructive' });
    } finally {
      setPhotoBusy('');
    }
  };

  const pickOptionPhoto = async (idx: number, letter: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('error'), description: t('notAnImage'), variant: 'destructive' });
      return;
    }
    setPhotoBusy(`o-${idx}-${letter}`);
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append('file', new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: blob.type || 'image/jpeg' }));
      fd.append('kind', 'image');
      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        body: fd,
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok && body?.url) {
        const q = questions[idx];
        const next = { ...(q.optionImages || {}) };
        next[letter] = { u: body.url as string, m: typeof body.tgMessageId === 'number' ? body.tgMessageId : null };
        patchQuestion(idx, { optionImages: next });
      } else {
        toast({ title: t('photoUploadFail'), description: body?.error || `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('photoUploadFail'), variant: 'destructive' });
    } finally {
      setPhotoBusy('');
    }
  };

  const clearQuestionPhoto = (idx: number) => patchQuestion(idx, { imageUrl: null, imageMsgId: null });
  const clearOptionPhoto = (idx: number, letter: string) => {
    const q = questions[idx];
    if (!q.optionImages?.[letter]) return;
    const next = { ...q.optionImages };
    delete next[letter];
    patchQuestion(idx, { optionImages: Object.keys(next).length ? next : null });
  };

  const resetTestForm = () => {
    resetTestFormStore();
  };

  // ─── Event editor (the «+» action over the SMM feed) ────────────────────
  // The customer's full-page event editor — the visual twin of the test
  // editor: same header, same collapsible section cards, same bottom bar.
  const [eventSaving, setEventSaving] = useState(false);
  // The event-delete confirmation dialog id (the ladder's «Удалить» asks
  // before the cascade removes roles/invites/apps/files).
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const startCreateEvent = () => {
    resetEventForm();
    setPage('create-event');
  };
  const startEditEvent = (ev: any) => {
    // OWNERSHIP (the brief): a customer edits ONLY the events they created.
    // Somebody else's event never opens in the editor — a toast explains.
    if (!effectiveUser) return;
    if (ev.customerId !== effectiveUser.id) {
      toast({ title: t('smmOnlyOwnEvents'), variant: 'destructive' });
      return;
    }
    useEventEditorStore.setState({
      evTitle: ev.title || '', evSummary: ev.summary || '', evBrief: ev.brief || '',
      evDeadline: ev.deadline || '', evBudget: ev.budget || '', evRestrictions: ev.restrictions || '',
      evKind: ev.kind === 'government' ? 'government' : 'business',
      evCoverColor: ev.coverColor || '', evIsPublic: ev.isPublic !== false,
      roles: (ev.roles || []).map((r: any) => ({ id: r.id, name: r.name || '', brief: r.brief || '', payment: r.payment || '', deadline: r.deadline || '' })),
      editingEventId: ev.id, evFiles: [],
      evInfoExpanded: true, evFilesExpanded: false, evCoverExpanded: false, evRolesExpanded: false,
      evFileBusy: false,
    });
    api.getSmmFiles('event', ev.id)
      .then((items: any[]) => useEventEditorStore.setState({ evFiles: items || [] }))
      .catch(() => {});
    setPage('create-event');
  };
  const handleSaveEvent = async () => {
    const st = eventEditorNow();
    if (!st.evTitle.trim() || eventSaving) return;
    setEventSaving(true);
    try {
      const payload: any = {
        title: st.evTitle.trim(), summary: st.evSummary, brief: st.evBrief,
        deadline: st.evDeadline, budget: st.evBudget, restrictions: st.evRestrictions,
        kind: st.evKind, coverColor: st.evCoverColor || null, isPublic: st.evIsPublic,
      };
      if (st.editingEventId) {
        await api.updateSmmEvent(st.editingEventId, payload);
        toast({ title: t('smmEventSavedToast') });
      } else {
        const created = await api.createSmmEvent({
          ...payload,
          roles: st.roles.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), brief: r.brief, payment: r.payment, deadline: r.deadline })),
        });
        toast({ title: t('smmEventCreated') });
        // The fresh event lands at the top of the personal events library —
        // no reload, the feed slides straight to it.
        setEventsItems(prev => [{
          ...created,
          filesCount: 0,
          pendingApplications: 0,
          customer: effectiveUser ? { id: effectiveUser.id, name: effectiveUser.name, image: (effectiveUser as any).image || null } : null,
          customerOtherEvents: [],
        }, ...prev]);
        setFocusEventId(created.id);
      }
      // The event may have joined/left the general library — the dashboard's
      // SMM feed revalidates in the background.
      void refreshSmmFeed();
      setPage('smm-events');
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
    setEventSaving(false);
  };

  const startCreateTest = () => {
    setViewingUser(null); // creating always happens in the user's own library
    // Over the SMM TikTok feed the customer's «+» creates an EVENT (the
    // full-page twin of this editor); over the tests grids (library/shelf —
    // the tests site's own surface) it keeps creating TESTS.
    const v = navNow().dashView;
    if ((v === 'tiktok1' || v === 'tiktok2') && !navNow().viewingUser && mySmmRole === 'customer') {
      startCreateEvent();
      return;
    }
    resetTestForm();
    setPage('create-test');
  };

  // ----- Tags editor helpers -----
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!t) return;
    if (!testTags.some(x => x.toLowerCase() === t.toLowerCase()) && testTags.length < 10) {
      setTestTags([...testTags, t]);
    }
    setTagInput('');
  };

  const removeTag = (t: string) => setTestTags(testTags.filter(x => x !== t));

  // Autocomplete: dictionary tags matching the typed text, minus already-added ones
  const tagSuggestions = allTags
    .filter(t => !testTags.some(x => x.toLowerCase() === t.toLowerCase()))
    .filter(t => !tagInput.trim() || t.toLowerCase().includes(tagInput.trim().toLowerCase()))
    .slice(0, 8);

  const startEditTest = async (test: Test) => {
    // Somebody else's test is NEVER edited in place: "Edit" makes a private
    // copy with a unique name in the user's own library and opens THAT copy.
    setViewingUser(null); // after editing, the user lands back in their own library
    if (effectiveUser && test.creatorId && test.creatorId !== effectiveUser.id) {
      setLoading(true);
      try {
        toast({ title: t('copyCreating') });
        const copy = await api.copyTest(test.id);
        // The server auto-pins the modified test (bookmark upsert) — mirror
        // it in the bookmarks cache so the card shows the «закреплено»
        // marker immediately.
        const bm = queryClient.getQueryData<{ ids: string[] }>(BOOKMARKS_KEY);
        if (bm && !bm.ids.includes(copy.id)) {
          patchScope(queryClient, BOOKMARKS_KEY, { setBookmarks: new Set([...bm.ids, copy.id]) });
        }
        // viewingUser was cleared above — back in the own-library scope. The
        // copy is pinned into the personal feed cache directly: the feed is
        // never reloaded mid-session, so it can neither reorder nor leak.
        // ONE TEST PER NAME: the modified copy takes the original's spot —
        // the same-name source drops out of the list locally (it stays
        // bookmarked server-side and resurfaces if the copy is deleted).
        if (queryClient.getQueryData(feedKey('mine'))) {
          patchScope(queryClient, feedKey('mine'), { prepend: [copy as Test], removeId: test.id });
        } else {
          await queryClient.fetchInfiniteQuery(feedQueryOptions('mine')).catch(() => {});
        }
        toast({ title: t('copyCreated') });
        setLoading(false);
        return startEditTest(copy as Test); // now it's mine — normal edit path
      } catch (e: any) {
        setLoading(false);
        toast({ title: t('error'), description: e.message, variant: 'destructive' });
        return;
      }
    }
    setLoading(true);
    setEditorFilesExpanded(false);
    setEditorInfoExpanded(false);
    setEditorCoverExpanded(false);
    setEditorQuestionsExpanded(false);
    try {
      const fullTest = await api.getTest(test.id);
      setCurrentTest(fullTest);
      setTestTitle(fullTest.title);
      setTestDescription(fullTest.description);
      setTestTags(fullTest.tags || []);
      setTestCoverIcon(fullTest.coverIcon || '');
      setTestCoverColor(fullTest.coverColor || '');
      // null = the version was never named → the naming dialog appears on
      // the first save of this test
      setEditingVersionName((fullTest as any).versionName || null);
      setRandomizeQ(fullTest.randomizeQuestions);
      setRandomizeO(fullTest.randomizeOptions);
      setTestIsPublic(fullTest.isPublic !== false);
      // A version can never be public (server-enforced) — the editor hides
      // the publication selector for it (see the publish-variant block).
      setEditingTestIsVersion(!!(fullTest as any).parentId);
      setQuestions(fullTest.questions.map(q => ({
        text: q.text,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        optionE: q.optionE,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation ?? null,
        translations: q.translations ?? null,
        imageUrl: q.imageUrl ?? null,
        imageMsgId: (q as any).imageMsgId ?? null,
        optionImages: (q as any).optionImages ?? null,
        id: q.id,
      })));
      setFormAttachments((fullTest.attachments || []).map(a => ({
        id: a.id,
        title: a.title,
        type: a.type,
        url: a.url,
        size: a.size ?? null,
        orderNum: a.orderNum,
        tgMessageId: (a as any).tgMessageId ?? null,
      })));
      setEditingTestId(fullTest.id);
      // The card's «Редактировать» opens the EDIT WINDOW (the same sheet the
      // taking screen uses) instead of navigating to the full-page editor.
      setEditOpen(true);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  // Take-screen "Edit Test": fill the shared editor form from the CURRENT test
  // and open the edit bottom sheet without leaving the taking screen.
  const startEditTestInTake = () => {
    if (!currentTest) return;
    // A test owned by somebody else cannot be edited in place — make a copy
    // into my library and keep editing THAT copy (the sheet opens on it).
    if (effectiveUser && (currentTest as any).creatorId && (currentTest as any).creatorId !== effectiveUser.id) {
      setLoading(true);
      api.copyTest((currentTest as any).id)
        .then(async (copy: any) => {
          toast({ title: t('copyCreated') });
          // The server auto-pins the modified test (bookmark upsert) — mirror
          // it in the bookmarks cache (the «закреплено» marker on the card).
          const bm = queryClient.getQueryData<{ ids: string[] }>(BOOKMARKS_KEY);
          if (bm && !bm.ids.includes(copy.id)) {
            patchScope(queryClient, BOOKMARKS_KEY, { setBookmarks: new Set([...bm.ids, copy.id]) });
          }
          // The copy joins the personal feed cache directly (no refetch).
          // ONE TEST PER NAME: the modified copy takes the original's spot.
          if (queryClient.getQueryData(feedKey('mine'))) {
            patchScope(queryClient, feedKey('mine'), { prepend: [copy as Test], removeId: (currentTest as any).id });
          }
          // Fill the editor form from the copy — the sheet opens on it
          setTestTitle(copy.title);
          setTestDescription(copy.description);
          setTestTags(copy.tags || []);
          setTestCoverIcon(copy.coverIcon || '');
          setTestCoverColor(copy.coverColor || '');
          setEditingVersionName((copy as any).versionName || null);
          setRandomizeQ(!!copy.randomizeQuestions);
          setRandomizeO(!!copy.randomizeOptions);
          setTestIsPublic(copy.isPublic !== false);
          // The copy of a version stays a version — hide the publication
          // selector for it the same way.
          setEditingTestIsVersion(!!(copy as any).parentId);
          setQuestions((copy.questions || []).map((q: any) => ({
            text: q.text,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            optionE: q.optionE,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation ?? null,
            translations: q.translations ?? null,
            imageUrl: q.imageUrl ?? null,
            imageMsgId: q.imageMsgId ?? null,
            optionImages: q.optionImages ?? null,
            id: q.id,
          })));
          setFormAttachments((copy.attachments || []).map((a: any) => ({
            id: a.id,
            title: a.title,
            type: a.type,
            url: a.url,
            size: a.size ?? null,
            orderNum: a.orderNum,
            tgMessageId: a.tgMessageId ?? null,
          })));
          setCurrentTest(copy);
          setEditingTestId(copy.id);
          setEditOpen(true);
        })
        .catch((e: any) => toast({ title: t('error'), description: e.message, variant: 'destructive' }))
        .finally(() => setLoading(false));
      return;
    }
    setEditorFilesExpanded(false);
    setEditorInfoExpanded(false);
    setEditorCoverExpanded(false);
    setEditorQuestionsExpanded(false);
    setTestTitle(currentTest.title);
    setTestDescription(currentTest.description);
    setTestTags(currentTest.tags || []);
    setTestCoverIcon(currentTest.coverIcon || '');
    setTestCoverColor(currentTest.coverColor || '');
    setEditingVersionName((currentTest as any).versionName || null);
    setRandomizeQ(!!currentTest.randomizeQuestions);
    setRandomizeO(!!currentTest.randomizeOptions);
    setTestIsPublic(currentTest.isPublic !== false);
    // Same version rule for the take-screen edit path.
    setEditingTestIsVersion(!!(currentTest as any).parentId);
    setQuestions(currentTest.questions.map(q => ({
      text: q.text,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      optionE: q.optionE,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ?? null,
      translations: q.translations ?? null,
      imageUrl: q.imageUrl ?? null,
      imageMsgId: (q as any).imageMsgId ?? null,
      optionImages: (q as any).optionImages ?? null,
      id: q.id,
    })));
    setFormAttachments((currentTest.attachments || []).map(a => ({
      id: a.id,
      title: a.title,
      type: a.type,
      url: a.url,
      size: a.size ?? null,
      orderNum: a.orderNum,
    })));
    setEditingTestId(currentTest.id);
    setEditOpen(true);
  };

  // Mirror a freshly saved FULL test (PUT /tests + POST /tests payloads both
  // carry questions + attachments + creator) into every cache the UI reads,
  // so a save is visible INSTANTLY — no reload, no refetch:
  //   • dashFullTests — files cards (attachment lists/counts), the
  //     start-from-dashboard prep and the files-grid cells;
  //   • feed caches  — the card on screen (mine + discover), patched IN PLACE
  //     (order preserved, nothing refetched, nothing can reorder).
  const mirrorSavedTest = (full: Test) => {
    if (!full?.id) return;
    setDashFullTests(prev => ({ ...prev, [full.id]: full }));
    const merge = (old: Test | undefined): Test => ({ ...(old || ({} as Test)), ...full });
    patchScope(queryClient, feedKey('mine'), { patchId: full.id, patch: merge });
    if (full.isPublic === false) {
      // No longer public (or a private version) → it leaves the cached
      // community feed AT ONCE instead of lingering until the next reload.
      patchScope(queryClient, feedKey('discover'), { removeId: full.id });
    } else {
      patchScope(queryClient, feedKey('discover'), { patchId: full.id, patch: merge });
    }
  };

  const handleSaveTest = async (fromTake = false, fromDash = false) => {
    if (!testTitle) {
      toast({ title: t('error'), description: t('titleRequired'), variant: 'destructive' });
      return;
    }
    if (questions.some(q => !q.text || !q.optionA || !q.optionB || !q.optionC || !q.optionD)) {
      toast({ title: t('error'), description: t('allQuestionsNeed'), variant: 'destructive' });
      return;
    }
    // A file picked moments ago may still be mid-upload (Telegram round trip).
    // Saving now would drop it — block the save with a clear message instead.
    if (formAttachments.some(a => (a as any).uploading)) {
      toast({ title: t('error'), description: t('uploadInProgress'), variant: 'destructive' });
      return;
    }

    // VERSION-NAME GATE: creating a version starts with a NAME. The first
    // save of an existing test opens the chat-style naming sheet first —
    // the save itself continues from the sheet's confirm button.
    if (editingTestId && !editingVersionName) {
      setVersionNameValue(testTitle);
      setVersionNameGate({ mode: 'save', testId: editingTestId, title: testTitle, fromTake, fromDash });
      return;
    }
    await performSaveTest(fromTake, undefined, fromDash);
  };

  // The save itself — runs after the naming gate (when one was required).
  // versionName rides along in the PUT payload when the sheet provided it.
  const performSaveTest = async (fromTake = false, versionName?: string, fromDash = false) => {
    setLoading(true);
    try {
      const data = {
        title: testTitle,
        description: testDescription,
        tags: testTags,
        coverIcon: testCoverIcon || null,
        coverColor: testCoverColor || null,
        // Publication variant chosen in the "Test Information" section:
        // false = share only with those who have the link,
        // true = public — the test AND its attached files are visible to everyone
        isPublic: testIsPublic,
        randomizeQuestions: randomizeQ,
        randomizeOptions: randomizeO,
        // The version's own name from the naming sheet (first save only)
        ...(versionName ? { versionName } : {}),
        questions: questions.map((q, i) => ({
          text: q.text,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          optionE: q.optionE || null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation ?? null,
          translations: q.translations ?? null,
          imageUrl: q.imageUrl ?? null,
          imageMsgId: q.imageMsgId ?? null,
          optionImages: q.optionImages ?? null,
          orderNum: i,
        })),
        attachments: formAttachments.map((a, i) => ({
          title: a.title,
          type: a.type,
          url: a.url,
          size: a.size ?? null,
          tgMessageId: a.tgMessageId ?? null,
          orderNum: i,
        })),
      };

      if (editingTestId) {
        // PUT returns the FULL updated test (questions + attachments + creator)
        // — one round trip, mirrored straight into every cache below.
        const updated: any = await api.updateTest(editingTestId, data);
        toast({ title: t('testUpdated'), description: t('testUpdatedDesc') });
        if (updated?.id) mirrorSavedTest(updated as Test);
        // The version is named now — further saves in this session skip the
        // naming sheet.
        if (versionName) setEditingVersionName(versionName);
        if (fromTake) {
          // Saved from the take-test / results "Edit Test" sheet: rebuild the
          // session in place from the SAME payload (no second GET). Editing
          // recreates every question with a NEW id (the old attempt cannot be
          // submitted), so:
          //  - the OLD question order is restored by matching texts — the
          //    session continues on the very SAME question the user was on;
          //  - answers carry over by OPTION TEXT (not letter), so a re-shuffle
          //    of options can never move someone's answer to another option;
          //  - practice reveals carry over by question text.
          // The PUT payload IS the fresh full test — no second GET round trip.
          const full = updated as Test;
          const oldByText = new Map<string, Question>();
          shuffledQuestions.forEach(q => { if (q.text && !oldByText.has(q.text)) oldByText.set(q.text, q); });
          const matched: Question[] = [];
          const usedNewIds = new Set<string>();
          shuffledQuestions.forEach(oq => {
            if (!oq.text) return;
            const nq = full.questions.find((n: Question) => n.text === oq.text && !usedNewIds.has(n.id || ''));
            if (nq) { matched.push(nq); usedNewIds.add(nq.id || ''); }
          });
          let rest = full.questions.filter((n: Question) => !usedNewIds.has(n.id || ''));
          if (startRandomizeQ) rest = shuffleArray(rest);
          let qList = [...matched, ...rest];
          if (startRandomizeO) qList = qList.map(q => shuffleOptions(q));
          const count = Math.min(Math.max(1, selectedQuestionCount || qList.length), qList.length);
          qList = qList.slice(0, count);
          const carriedAnswers: Record<string, string> = {};
          const carriedReveals: Record<string, boolean> = {};
          qList.forEach(q => {
            const oq = q.text ? oldByText.get(q.text) : undefined;
            if (!oq) return;
            const oldId = oq.id || '';
            const letter = answers[oldId];
            if (letter) {
              const optText = (oq as any)[`option${letter}`];
              const newLetter = ['A', 'B', 'C', 'D', 'E'].find(L => (q as any)[`option${L}`] === optText);
              if (newLetter) carriedAnswers[q.id || ''] = newLetter;
            }
            if (revealedAnswers[oldId]) carriedReveals[q.id || ''] = true;
          });
          const wasOnResults = showResult;
          if (!wasOnResults) {
            // Fresh open attempt for the recreated questions
            const attempt: any = await api.createAttempt(full.id, count);
            setCurrentAttempt(attempt);
            // History mirrors the fresh attempt at once (in-progress badge)
            if (attempt?.id) setAttempts(prev => [
              { ...attempt, test: { id: full.id, title: full.title, topic: (full as any).topic || '' } } as Attempt,
              ...prev.filter(a => a.id !== attempt.id),
            ]);
          }
          setCurrentTest(full);
          setShuffledQuestions(qList);
          setAnswers(carriedAnswers);
          setRevealedAnswers(carriedReveals);
          setExplanations({});
          setSelectedQuestionCount(count);
          if (!wasOnResults) {
            // Continue on the SAME question the user was on (clamped — the
            // editor may have removed some of the questions)
            setCurrentQuestionIdx(Math.min(currentQuestionIdx, qList.length - 1));
          }
          // From the results screen: stay on the (updated) results; from the
          // taking screen: keep taking.
          setShowResult(wasOnResults);
          setEditOpen(false);
          setDrumInputMode(false);
          setLoading(false);
          return;
        }
        // Saved from the EDITOR page or the DASHBOARD edit window: land on
        // the dashboard — the card already shows the new title/cover/files
        // (mirrored above, in place, no refetch, no reorder, no reload
        // needed to "see it worked"). The edit window closes on save.
        setPage('dashboard');
        if (fromDash) setEditOpen(false);
        setLoading(false);
        return;
      } else {
        const created = await api.createTest(data);
        toast({ title: 'Test created!', description: 'Your new test has been created.' });
        // Show the new test right away: pin it to the top of the personal
        // feed cache (no refetch — the feed never reloads mid-session).
        if (created?.id) {
          mirrorSavedTest(created as Test); // files card + prep are instant too
          setViewingUser(null); // a fresh test of one's own — land in own library
          setDiscoverMode(false); // ...in the OWN library, not the community feed
          if (queryClient.getQueryData(feedKey('mine'))) {
            patchScope(queryClient, feedKey('mine'), { prepend: [created as Test] });
          } else {
            // The personal feed was never loaded this session — load it once;
            // the created test is already on the server, the fetch shows it.
            await queryClient.fetchInfiniteQuery(feedQueryOptions('mine')).catch(() => {});
          }
          setPage('dashboard');
          setDashTestIdx(0);
          setLoading(false);
          return;
        }
      }
      setPage('dashboard');
    } catch (e: any) {
      // Publishing rule: a public test must have a title that no other public
      // test uses — the server rejects the save with PUBLISH_NAME_TAKEN.
      if (e?.message === 'PUBLISH_NAME_TAKEN') {
        toast({ title: t('error'), description: t('publishNameTaken'), variant: 'destructive' });
      } else if (e?.message === 'VERSION_TOO_SIMILAR') {
        // Version rule: a copy of somebody's test can only be SAVED as a
        // shareable version after 2+ questions/answers changed. The dialog
        // explains the rule (the note alternative was removed).
        setGateDialogTest({ id: editingTestId || '', title: testTitle });
      } else {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      }
    }
    setLoading(false);
  };

  const handleDeleteTest = async (id: string) => {
    try {
      await api.deleteTest(id);
      // Purge every cached surface of the deleted test: the full-test cache
      // and both files modes (a files card of a deleted test would keep
      // rendering from the cache). The feed reload below drops the card
      // itself; the community feed loses it through the cascading delete.
      setDashFullTests(prev => {
        if (!prev[id]) return prev;
        const next = { ...prev }; delete next[id]; return next;
      });
      if ((gridFilesMode && gridFilesTestId === id) || (filesFeedMode && filesFeedTestId === id)) {
        pendingFilesJumpRef.current = null;
        setGridFilesMode(false); setGridFilesTestId(null);
        setFilesFeedMode(false); setFilesFeedTestId(null);
        setDashSlideIdx(0);
      }
      // the deleted test's version tree must not keep rendering from the API
      if ((gridTreeMode && gridTreeTestId === id) || (treeFeedMode && treeFeedTestId === id)) {
        setGridTreeMode(false); setGridTreeTestId(null);
        setTreeFeedMode(false); setTreeFeedTestId(null);
      }
      toast({ title: t('testDeleted'), description: t('testDeletedDesc') });
      // Drop the deleted card LOCALLY (deliberate user action — the card
      // disappears now, not whenever a reload lands) and purge it from every
      // cached scope: the cascading delete removed it server-side too.
      patchScope(queryClient, feedKey('mine'), { removeId: id });
      patchScope(queryClient, feedKey('discover'), { removeId: id });
      if (viewingUser?.id) patchScope(queryClient, userLibraryKey(viewingUser.id), { removeId: id });
      // The pin marker of a deleted test must not linger in the bookmarks
      // cache either (it would resurrect the marker on a same-name card).
      const bm = queryClient.getQueryData<{ ids: string[] }>(BOOKMARKS_KEY);
      if (bm?.ids?.includes(id)) {
        patchScope(queryClient, BOOKMARKS_KEY, { setBookmarks: new Set(bm.ids.filter(x => x !== id)) });
      }
      // The DB cascade removed the deleted test's attempts — mirror it in
      // the History store so its rows do not linger until a reload.
      setAttempts(prev => prev.filter(a => a.testId !== id));
    } catch (e: any) {
      toast({ title: t('error'), description: e.message, variant: 'destructive' });
    }
    setDeleteId(null);
  };

  // --- TEST TAKING ---

  // ── GUEST TAKE (anonymous share-link visitors) ───────────────────────────
  // A visitor without a session who opens ?test=<id> takes the test right on
  // the taking screen — the first question up, no start page, no account.
  // Progress snapshots live in LOCALSTORAGE (guest-take.ts) until the visitor
  // registers; then they migrate into the account and the taking screen
  // resumes at the exact saved position.
  const startGuestTake = (full: Test) => {
    let qList = [...full.questions];
    if (full.randomizeQuestions !== false) qList = shuffleArray(qList);
    if (full.randomizeOptions !== false) qList = qList.map(q => shuffleOptions(q));
    setCurrentTest(full);
    setShuffledQuestions(qList);
    setCurrentQuestionIdx(0);
    setAnswers({});
    setShowResult(false);
    setRevealedAnswers({});
    setExplanations({});
    setPracticeMode(false);
    setCurrentAttempt(null); // guests have no server-side attempt
    setSelectedQuestionCount(qList.length);
    setFilesOpen(false); setGroupOpen(false); setEditOpen(false); setChatOpen(false);
    setQSearch(''); setQSearchOpen(false);
    setGuestTakeTestId(full.id);
    setPage('take-test');
  };

  // Restore a guest session from the LOCAL snapshot (reload / returning link):
  // merge fresh translations from the DB copy like continueTestWith does —
  // WITHOUT touching the shuffled option order or the carried answers.
  const applyGuestSnapshot = (full: Test, saved: SavedTestProgress) => {
    const freshById = new Map(full.questions.map(q => [q.id, q]));
    const qList = saved.shuffledQuestions.map(q => {
      const fresh = q.id ? freshById.get(q.id) : undefined;
      if (!fresh) return q;
      return {
        ...q,
        explanation: q.explanation ?? fresh.explanation ?? null,
        translations: { ...(fresh.translations || {}), ...(q.translations || {}) },
      };
    });
    setCurrentTest(full);
    setShuffledQuestions(qList);
    setCurrentQuestionIdx(Math.min(Math.max(0, saved.currentQuestionIdx || 0), qList.length - 1));
    setAnswers(saved.answers || {});
    setPracticeMode(!!saved.practiceMode);
    setRevealedAnswers(saved.revealedAnswers || {});
    setExplanations({});
    setShowResult(false);
    setCurrentAttempt(null);
    setSelectedQuestionCount(qList.length);
    setFilesOpen(false); setGroupOpen(false); setEditOpen(false); setChatOpen(false);
    setQSearch(''); setQSearchOpen(false);
    setGuestTakeTestId(full.id);
    setPage('take-test');
  };

  // Boot the guest session: fetch the test (public endpoint), resume the
  // local snapshot when there is one, otherwise start fresh. A dead link
  // leaves the splash up with the registration way in.
  const bootGuestTest = async (id: string) => {
    try {
      const full = await api.getTest(id);
      if (!full || !Array.isArray(full.questions) || full.questions.length === 0) throw new Error('not found');
      const saved = readGuestSnapshot(id);
      if (saved) applyGuestSnapshot(full, saved);
      else startGuestTake(full);
    } catch {
      setGuestBootFailed(true);
    }
    setDataReady(true);
  };

  // AFTER AUTH: migrate the guest snapshot into the account (DB + cache) and
  // restore the taking screen at the exact saved position — "continue from
  // where you stopped". The attempt is (re)created server-side so History
  // reflects the session too.
  const resumeGuestTake = async (user: { id: string }, testId: string) => {
    try {
      const full = await api.getTest(testId);
      const saved = readGuestSnapshot(testId);
      if (saved) {
        // Seed the account's progress cache + DB first, then restore in place.
        writeTestProgress(user.id, saved);
        api.saveProgress(testId, saved).catch(() => {});
        await continueTestWith(full, saved);
      } else {
        // Nothing to restore — hand the fresh account a normal start of the
        // same test (creates the attempt through the usual path).
        const totalQ = full.questions.length;
        setSelectedQuestionCount(totalQ);
        setStartRandomizeQ(full.randomizeQuestions !== false);
        setStartRandomizeO(full.randomizeOptions !== false);
        setCurrentTest(full);
        await startTestWith(full, totalQ);
      }
      clearGuestSnapshot(testId);
      setGuestTakeTestId(null);
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message, variant: 'destructive' });
      setPage('dashboard');
    }
  };

  const openStartTest = async (test: Test) => {
    setLoading(true);
    try {
      const fullTest = await api.getTest(test.id);
      setCurrentTest(fullTest);
      const totalQ = fullTest.questions.length;
      setSelectedQuestionCount(totalQ);
      setStartRandomizeQ(fullTest.randomizeQuestions !== false);
      setStartRandomizeO(fullTest.randomizeOptions !== false);
      setPracticeMode(false);
      setFilesOpen(false);
      setChatOpen(false);
      setGroupOpen(false);
      setEditOpen(false);
      setPage('start-test');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const startTestWith = async (test: Test, count: number) => {
    setLoading(true);
    try {
      // Apply randomization (chosen on the Start Test page / dashboard feed)
      let qList = [...test.questions];
      if (startRandomizeQ) {
        qList = shuffleArray(qList);
      }
      if (startRandomizeO) {
        qList = qList.map(q => shuffleOptions(q));
      }

      // Slice to selected count
      qList = qList.slice(0, count);

      // Create attempt with the actual number of questions being answered.
      // GUESTS (share-link visitors without a session) skip the server attempt
      // entirely: the run is graded locally on submit and mirrored to History
      // only after they register.
      const attempt: any = isGuestNow() ? null : await api.createAttempt(test.id, count);
      setCurrentAttempt(attempt);
      // The attempt shows up in History immediately (in-progress badge) —
      // the store is patched locally, no reload needed to "see it worked".
      if (attempt?.id) setAttempts(prev => [
        { ...attempt, test: { id: test.id, title: test.title, topic: (test as any).topic || '' } } as Attempt,
        ...prev.filter(a => a.id !== attempt.id),
      ]);
      setShuffledQuestions(qList);
      setCurrentQuestionIdx(0);
      setAnswers({});
      setShowResult(false);
      setRevealedAnswers({});
      setExplanations({});
      setFilesOpen(false);
      setGroupOpen(false);
      setEditOpen(false);
      setPage('take-test');

      // If practice mode, pre-fetch explanations (in the current UI language)
      if (practiceMode) {
        setLoadingExplanations(true);
        try {
          const ids = qList.map(q => q.id).filter(Boolean) as string[];
          if (ids.length > 0) {
            const result = await api.generateExplanations(ids, lang);
            const explMap: Record<string, string> = {};
            if (result.explanations) {
              for (const item of result.explanations) {
                if (item.explanation) explMap[item.id] = item.explanation;
              }
            }
            setExplanations(explMap);
          }
        } catch (e) {
          console.error('Failed to load explanations:', e);
        }
        setLoadingExplanations(false);
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const startTest = async () => {
    if (!currentTest) return;
    await startTestWith(currentTest, selectedQuestionCount);
  };

  // Start directly from the dashboard feed (fetch the full test first)
  // fresh=true (Restart button) — skip any saved progress and start over;
  // override — start THIS test (grid cards), otherwise the test on screen
  const startFromDashboard = async (fresh = false, override?: Test) => {
    const t = override || tests[Math.min(Math.max(0, dashTestIdx), tests.length - 1)];
    if (!t || loading) return;
    setLoading(true);
    try {
      const fullTest = dashFullTests[t.id] || await api.getTest(t.id);
      setCurrentTest(fullTest);
      // Saved progress (DB)? Resume that attempt instead of a fresh start
      if (!fresh && (await continueTestWith(fullTest))) { setLoading(false); return; }
      const totalQ = fullTest.questions.length;
      const count = Math.min(Math.max(1, selectedQuestionCount || totalQ), totalQ);
      setSelectedQuestionCount(count);
      setFilesOpen(false);
      setChatOpen(false);
      setGroupOpen(false);
      setEditOpen(false);
      await startTestWith(fullTest, count);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  // Resume a saved attempt: restore the exact shuffled order, answers, practice
  // reveals and position, and reuse the original attempt so history stays clean.
  // Returns true when there was progress to resume. The snapshot comes from
  // the DATABASE (async), so this is async too — or pass `injected` to restore
  // from an already-in-hand snapshot (the guest→account migration path).
  const continueTestWith = async (test: Test, injected?: SavedTestProgress): Promise<boolean> => {
    const saved = injected || await readTestProgress(progressUserId, test.id);
    if (!saved) return false;
    // The snapshot may predate stored translations (e.g. the session was saved
    // before a translation update). Merge fresh translation/explanation data
    // from the DB copy by question id — WITHOUT touching the shuffled option
    // order or correct answers, so carried answers stay valid. Edits recreate
    // question ids, so mismatched ids are simply left untouched.
    const freshById = new Map(test.questions.map(q => [q.id, q]));
    const qList = saved.shuffledQuestions.map(q => {
      const fresh = q.id ? freshById.get(q.id) : undefined;
      if (!fresh) return q;
      return {
        ...q,
        explanation: q.explanation ?? fresh.explanation ?? null,
        translations: { ...(fresh.translations || {}), ...(q.translations || {}) },
      };
    });
    setCurrentTest(test);
    setShuffledQuestions(qList);
    setCurrentQuestionIdx(Math.min(Math.max(0, saved.currentQuestionIdx || 0), qList.length - 1));
    setAnswers(saved.answers || {});
    setPracticeMode(!!saved.practiceMode);
    setRevealedAnswers(saved.revealedAnswers || {});
    setExplanations({});
    setShowResult(false);
    setQSearch(''); setQSearchOpen(false); setResSearch(''); setResHighlightIdx(null);
    setSelectedQuestionCount(qList.length);
    if (saved.attempt && saved.attempt.id) {
      setCurrentAttempt(saved.attempt);
    } else {
      // Attempt object missing (old/corrupted save) — open a new one, same count
      api.createAttempt(test.id, qList.length).then((att: any) => {
        setCurrentAttempt(att);
        // History mirrors the fresh attempt at once (in-progress badge)
        if (att?.id) setAttempts(prev => [
          { ...att, test: { id: test.id, title: test.title, topic: (test as any).topic || '' } } as Attempt,
          ...prev.filter(a => a.id !== att.id),
        ]);
      }).catch(() => {});
    }
    setFilesOpen(false);
    setChatOpen(false);
    setGroupOpen(false);
    setEditOpen(false);
    setDrumInputMode(false);
    setPage('take-test');
    return true;
  };

  // Persist take-test progress (debounced 400ms): position, answers, practice
  // reveals and the exact shuffled order — everything needed to continue later.
  // Logged-in users → the DATABASE (SavedProgress); guests (share-link
  // visitors) → LOCALSTORAGE until they register (then migrated into the DB).
  useEffect(() => {
    if (effectivePage !== 'take-test' || showResult || !currentTest || shuffledQuestions.length === 0) return;
    const t = setTimeout(() => {
      const snapshot: SavedTestProgress = {
        v: 1,
        testId: currentTest.id,
        savedAt: Date.now(),
        attempt: currentAttempt,
        currentQuestionIdx,
        answers,
        practiceMode,
        revealedAnswers,
        shuffledQuestions,
      };
      if (isGuestNow()) writeGuestSnapshot(snapshot);
      else writeTestProgress(progressUserId, snapshot);
    }, 400);
    return () => clearTimeout(t);
  }, [effectivePage, showResult, currentTest, currentAttempt, currentQuestionIdx, answers, practiceMode, revealedAnswers, shuffledQuestions, progressUserId]);

  // PREDICTION in the test runner (TikTok's "prepare the next action"): while
  // question N is on screen, the images of N+1 and N+2 are fetched and decoded
  // in idle time — swiping to the next question paints complete on its first
  // frame instead of lazily popping its picture in afterwards.
  const questionPreheatedRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    if (effectivePage !== 'take-test' || shuffledQuestions.length === 0) return;
    const w = window as any;
    const schedule = (fn: () => void) => {
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 350 });
      else setTimeout(fn, 150);
    };
    schedule(() => {
      for (const q of shuffledQuestions.slice(currentQuestionIdx + 1, currentQuestionIdx + 3)) {
        const urls: string[] = [];
        if (q.imageUrl) urls.push(imgSrc(q.imageUrl));
        for (const letter of ['A', 'B', 'C', 'D', 'E']) {
          const oi: any = (q as any).optionImages?.[letter];
          if (oi?.u) urls.push(imgSrc(oi.u));
        }
        for (const u of urls) {
          if (questionPreheatedRef.current.has(u)) continue;
          questionPreheatedRef.current.add(u);
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => { try { (img as any).decode?.().catch(() => {}); } catch {} };
          img.src = u;
        }
      }
    });
  }, [currentQuestionIdx, shuffledQuestions, effectivePage]);

  // On-the-fly translation: while taking / reviewing a test, translate any
  // question that has no stored translation for the selected interface
  // language (user-created tests, old continue-snapshots, languages the test
  // was never translated to). Each result is applied to the state immediately,
  // cached in localStorage and persisted to the DB best-effort so everyone
  // loads it instantly afterwards. Generation counter guards against overlap:
  // a new run (deps changed) cancels the previous one; per-question failure
  // markers prevent infinite retry loops.
  useEffect(() => {
    if (!mounted || effectivePage !== 'take-test' || editOpen || !currentTest || shuffledQuestions.length === 0) return;
    const missing = shuffledQuestions.filter(
      q => q.text && q.id && !q.translations?.[lang] && !trTriedRef.current.has(`${currentTest.id}|${lang}|${q.id}`)
    );
    if (!missing.length) return;
    const testId = currentTest.id;
    const gen = ++trGenRef.current;
    const cancelled = () => trGenRef.current !== gen;
    setAutoTranslating(true);
    (async () => {
      const applyOne = (id: string, tr: QTranslationsV) => {
        if (cancelled()) return;
        const patch = (q: Question) => ({ ...q, translations: { ...(q.translations || {}), [lang]: tr } });
        setShuffledQuestions(prev => prev.map(q => (q.id === id ? patch(q) : q)));
        setCurrentTest(prev => (prev && prev.id === testId ? { ...prev, questions: prev.questions.map(q => (q.id === id ? patch(q) : q)) } : prev));
      };
      try {
        const map = await autoTranslateQuestions(missing, lang, applyOne);
        if (cancelled()) return;
        // Questions that failed stay unmarked by success — record them so the
        // effect doesn't retry them forever (e.g. when the MT service is down).
        missing.forEach(q => {
          if (q.id && !map.has(q.id)) trTriedRef.current.add(`${testId}|${lang}|${q.id}`);
        });
        const items = [...map.entries()].map(([id, tr]) => ({ id, ...tr }));
        if (items.length) api.saveTranslations(testId, lang, items).catch(() => {});
      } finally {
        if (!cancelled()) setAutoTranslating(false);
      }
    })();
  }, [mounted, effectivePage, editOpen, currentTest, shuffledQuestions, lang]);


  // ── FEED COMMIT (Swiper onSlideChange → here) ────────────────────────────
  // The gesture engine itself is Swiper's now; this is the single state
  // transition when a card SETTLES: commit the index, adopt the landed card's
  // start defaults, score the recommendation signal, prefetch the
  // direction-weighted neighbours and append the next feed page near the end.
  const dashLastCommittedRef = React.useRef(0);
  const onDashCommit = React.useCallback((idx: number, mode: 'tests' | 'files' | 'tree') => {
    if (idx !== dashLastCommittedRef.current) {
      dashMoveDirRef.current = idx > dashLastCommittedRef.current ? 1 : -1;
      dashLastCommittedRef.current = idx;
    }
    // RECOMMENDATION SIGNALS (invisible to the user): each card TRANSITION
    // scores the card the user just LEFT — dwell >= 1.8 s counts as a real
    // view (ms recorded for the quality prior), anything faster is the
    // TikTok-style skip (negative signal). The freshly landed card only
    // stamps its "shown at" moment; its own signal fires when it is left.
    // Guards keep this fire-and-forget: bookkeeping must never throw, never
    // re-render, never touch the scroll chain.
    const signal = (shown?: Test) => {
      if (!effectiveUser || !shown) return;
      try {
        const nowMs = Date.now();
        const prevId = dashPrevCardIdRef.current;
        if (prevId && shown.id !== prevId) {
          const dwell = nowMs - dashCardShownAtRef.current;
          const kind: 'view' | 'skip' = dwell >= 1800 ? 'view' : 'skip';
          const key = `${prevId}:${kind}`;
          if (!viewSignaledRef.current.has(key)) {
            viewSignaledRef.current.add(key);
            api.feedSignal(prevId, kind, dwell).catch(() => {});
          }
        } else if (!prevId && !viewSignaledRef.current.has(`${shown.id}:imp`)) {
          // Session start: the first card counts the moment it appears —
          // the user may read it without ever swiping away.
          viewSignaledRef.current.add(`${shown.id}:imp`);
          api.feedSignal(shown.id, 'view').catch(() => {});
        }
        if (shown.id !== prevId) {
          dashPrevCardIdRef.current = shown.id;
          dashCardShownAtRef.current = nowMs;
        }
      } catch { /* signal bookkeeping must never break the commit */ }
    };
    if (mode === 'tree') {
      // TREE mode: commit the visible TREE card — one per test, in the same
      // recommendation order as the test feed (slide i IS test i). The rec
      // signals and the silent pagination run exactly like the files feed:
      // the recommendation engine keeps working under every card type.
      if (tests.length === 0) return;
      const clamped = Math.min(tests.length - 1, Math.max(0, idx));
      setDashSlideIdx(clamped);
      setTreeFeedTestId(tests[clamped]?.id ?? null);
      signal(tests[clamped]);
      // PREDICTION: the next page of recommended tests is already loading
      // before the user reaches the end of the tree cards.
      if (clamped >= tests.length - 3) loadMoreFeed();
      return;
    }
    if (mode === 'files') {
      // Files mode: commit the visible FILE slide
      if (fileSlidesCountRef.current === 0) return;
      const clamped = Math.min(fileSlidesCountRef.current - 1, Math.max(0, idx));
      setDashSlideIdx(clamped);
      signal(fileSlidesRef.current[clamped]?.test);
      // PREDICTION: the next page of tests is already loading before the user
      // reaches the end of the slides (TikTok preloads the next batch too).
      if (clamped >= fileSlidesCountRef.current - 3) loadMoreFeed();
      return;
    }
    if (tests.length === 0) return;
    const clamped = Math.min(tests.length - 1, Math.max(0, idx));
    setDashTestIdx(clamped);
    // Adopt the landed card's start defaults in the same batched render: the
    // freshly committed card switches from its own defaults (exactly what it
    // showed mid-swipe) to the shared start-params — they must be IDENTICAL
    // in that frame, or the counter/highlights would visibly flip right
    // after landing. dashboard-view keeps every NON-current card on its own
    // defaults, so nothing can flip while the swipe is still moving either.
    const landed = tests[clamped];
    if (landed) {
      const landedTotalQ = landed._count?.questions || landed.questions?.length || 0;
      setSelectedQuestionCount(Math.max(1, landedTotalQ));
      setStartRandomizeQ(landed.randomizeQuestions !== false);
      setStartRandomizeO(landed.randomizeOptions !== false);
    }
    // Recommendation signal (invisible): this card stayed on screen — count a view
    signal(tests[clamped]);
    // PREDICTION: while this card is on screen, the neighbours the user is
    // most likely to swipe to are already fetched (direction-first), and the
    // next feed page starts loading 3 cards before the end.
    prefetchNeighbors(clamped, dashMoveDirRef.current);
    if (clamped >= tests.length - 3) loadMoreFeed();
  }, [tests, effectiveUser, prefetchNeighbors, loadMoreFeed, setDashTestIdx, setDashSlideIdx, setSelectedQuestionCount, setStartRandomizeQ, setStartRandomizeO]);

  const selectAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    // In practice mode, reveal the correct answer immediately.
    // NOTE: the AI tutor chat is ONLY opened manually via the
    // "Ask AI Tutor about this question" button.
    if (practiceMode) {
      setRevealedAnswers(prev => ({ ...prev, [questionId]: true }));
    }
  };

  const buildQuestionContext = (q?: Question | null) => {
    if (!q) return undefined;
    const options: Record<string, string> = {};
    for (const letter of ['A', 'B', 'C', 'D', 'E']) {
      const val = trOption(q, letter, lang);
      if (val) options[letter] = val;
    }
    return {
      text: trText(q, lang),
      options,
      correctAnswer: q.correctAnswer,
      topic: currentTest?.topic || 'General',
    };
  };

  // Load the per-user AI chat threads once (after the user is known) —
  // from the DATABASE (AiThread table), never from the device. Many threads
  // per test are allowed («Новый чат»); the map is keyed by THREAD id.
  useEffect(() => {
    if (!effectiveUser || chatThreadsLoadedRef.current) return;
    chatThreadsLoadedRef.current = true;
    let alive = true;
    api.getAiThreads()
      .then((res: any) => {
        if (!alive || !Array.isArray(res?.threads)) return;
        const map: Record<string, { testId: string; title: string; messages: any[]; updatedAt: number }> = {};
        for (const th of res.threads) {
          if (th?.id && th?.testId && Array.isArray(th.messages)) {
            map[String(th.id)] = { testId: String(th.testId), title: String(th.title || ''), messages: th.messages, updatedAt: th.updatedAt || Date.now() };
          }
        }
        setChatThreads(map);
      })
      .catch(() => { /* offline — the session just starts with empty threads */ });
    return () => { alive = false; };
  }, [effectiveUser?.id]);

  // Mirror the visible conversation into the ACTIVE thread (take-test flow;
  // the dashboard window mirrors inside sendTestChatMessage)
  useEffect(() => {
    if (!chatOpen || chatMessages.length === 0 || !chatThreadId) return;
    setChatThreads(prev => {
      const th = prev[chatThreadId];
      if (!th) return prev;
      return { ...prev, [chatThreadId]: { ...th, messages: chatMessages, updatedAt: Date.now() } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, chatOpen]);

  // Persist changed threads to the DATABASE (per user) — debounced 1s,
  // only the threads whose content actually changed since the last sync.
  const threadSyncRef = useRef<Map<string, string>>(new Map()); // threadId -> serialized snapshot
  useEffect(() => {
    if (!effectiveUser || !chatThreadsLoadedRef.current) return;
    const t = setTimeout(() => {
      for (const [threadId, th] of Object.entries(chatThreads)) {
        if (!th || !Array.isArray(th.messages) || th.messages.length === 0) continue;
        const snap = JSON.stringify([th.title, th.messages]);
        if (threadSyncRef.current.get(threadId) === snap) continue;
        threadSyncRef.current.set(threadId, snap);
        api.saveAiThread(threadId, th.testId, th.title || '', th.messages).catch(() => {
          // Offline — the next change retries; the in-memory copy keeps working.
          threadSyncRef.current.delete(threadId);
        });
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [chatThreads, effectiveUser?.id]);

  // History drawer entries: every conversation with at least one message
  const aiThreadMetas: AiThreadMeta[] = React.useMemo(() => Object.entries(chatThreads)
    .filter(([, th]) => th.messages.length > 0)
    .map(([id, th]) => ({
      id,
      testId: th.testId,
      title: th.title || 'Test',
      preview: th.messages[th.messages.length - 1]?.content?.slice(0, 90) || '',
      updatedAt: th.updatedAt || 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt), [chatThreads]);

  const selectChatThread = (threadId: string) => {
    setChatHistoryOpen(false);
    if (threadId === chatThreadId) return;
    const th = chatThreads[threadId];
    setChatThreadId(threadId);
    setChatMessages(th ? [...th.messages] : []);
    setChatInput('');
  };

  const openChat = (questionId: string, userAnswer?: string, opts?: { force?: boolean }) => {
    const q = shuffledQuestions.find(x => x.id === questionId) || null;
    setChatQuestionId(questionId);
    setChatQuestionObj(q);
    setChatUserAnswer(userAnswer || '');
    const tid = (currentTest as any)?.id || '';
    // Reuse the conversation already open for THIS test…
    const activeTh = chatThreadId ? chatThreads[chatThreadId] : null;
    let base: { role: 'user' | 'assistant'; content: string }[];
    if (activeTh && activeTh.testId === tid) {
      base = [...activeTh.messages];
    } else {
      // …otherwise resume the test's most recent thread (fresh when none).
      const cand = Object.entries(chatThreads)
        .filter(([, th]) => th.testId === tid)
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))[0];
      if (cand) {
        base = [...cand[1].messages];
        setChatThreadId(cand[0]);
        setChatMessages(base);
      } else {
        const id = newThreadKey();
        base = [];
        setChatThreads(prev => ({ ...prev, [id]: { testId: tid, title: (currentTest as any)?.title || 'Test', messages: [], updatedAt: Date.now() } }));
        setChatThreadId(id);
        setChatMessages([]);
      }
      setChatInput('');
    }
    // Auto-send the context message when the conversation is still empty, or
    // when the user explicitly tapped "Ask AI" on a question (force).
    const shouldAutoSend = opts?.force || base.length === 0;
    if (shouldAutoSend) {
      const initialMsg = userAnswer
        ? t('iChose', { a: userAnswer })
        : t('helpUnderstand');
      sendChatMessage(questionId, [...base, { role: 'user', content: initialMsg }], userAnswer, q);
    }
    setChatOpen(true);
  };

  // ------------------------------------------------------------------
  // DASHBOARD AI WINDOW — «Обсудить с ИИ» from a card (library/shelf/feed).
  // Opens STRAIGHT INTO the conversation (no diagnostic passport anymore):
  // the test's most recent thread resumes, «Новый чат» starts a fresh one.
  // The AI always answers with the WHOLE test context (POST
  // /api/tests/[id]/ai-chat builds the prompt from the thread's test).
  // ------------------------------------------------------------------
  const openAiDiscuss = (test: any) => {
    aiCardTitleRef.current = String(test?.title || '');
    setDashFilesOpen(false); // one dashboard window at a time
    setDashGroupTestId(null); // ...the group chat window yields too
    stashDashWindowTest(test);
    setAiCardTestId(String(test?.id || ''));
  };
  const closeAiCard = () => {
    setAiCardTestId(null);
  };
  // «Файлы» from a card: fetch the test's attachments (the feed payload only
  // carries the COUNT) and open the files window — the AI-window format.
  const openCardFiles = (test: any) => {
    if (!test?.id || dashFilesLoadingId === String(test.id)) return;
    // SMM entity (event «smm-e:<id>» / specialist «smm-u:<id>»)? Their files
    // live in the polymorphic SmmFile table — the same window, another source.
    const smmKind0 = String(test.id).startsWith('smm-e:') ? 'event' : String(test.id).startsWith('smm-u:') ? 'specialist' : null;
    if (smmKind0) { return openSmmFiles(smmKind0 as 'event' | 'specialist', test); }
    setAiCardTestId(null); // one dashboard window at a time
    setDashGroupTestId(null); // ...the group chat window yields too
    stashDashWindowTest(test);
    const cached = ((dashFullTests as any)[test.id]?.attachments as AttachmentItem[] | undefined)
      || ((test as any).attachments as AttachmentItem[] | undefined)
      || [];
    const items = cached.filter(Boolean);
    if (items.length) {
      setDashFiles({ testId: String(test.id), title: String(test.title || ''), items });
      setDashFilesOpen(true);
      return;
    }
    setDashFilesLoadingId(String(test.id));
    setLoading(true);
    api.getTest(test.id)
      .then((full: any) => {
        setDashFiles({ testId: String(test.id), title: String(full?.title || test.title || ''), items: ((full?.attachments || []) as AttachmentItem[]).filter(Boolean) });
        setDashFilesOpen(true);
      })
      .catch((e: any) => toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' }))
      .finally(() => { setDashFilesLoadingId(null); setLoading(false); });
  };
  const closeCardFiles = () => setDashFilesOpen(false);
  // «Чат» from a card: open the per-test GROUP CHAT window (the files-window
  // format). Guests meet the chat-style signup wall — sending needs an
  // account, the same rule the taking screen's chat button follows.
  const openCardGroupChat = (test: any) => {
    if (!test?.id) return;
    // SMM entity? The chat scope is the event / the specialist, not a test.
    const gid0 = String(test.id);
    if (gid0.startsWith('smm-e:') || gid0.startsWith('smm-u:')) {
      return openSmmGroupChat(gid0.startsWith('smm-e:') ? 'event' : 'specialist', test);
    }
    // setRegisterWall directly — the `wall` helper lives below the dashboard
    // early-return, so referencing it here would trip the TDZ on click.
    if (isGuestNow()) { setRegisterWall('chat'); return; }
    setAiCardTestId(null); // one dashboard window at a time
    setDashFilesOpen(false);
    setEditOpen(false);
    setGroupMessages([]); // no stale lines from another test's chat
    setGroupInput('');
    dashGroupTitleRef.current = String(test?.title || '');
    stashDashWindowTest(test);
    setDashGroupTestId(String(test.id));
  };
  const closeCardGroupChat = () => {
    setDashGroupTestId(null);
    setGroupMessages([]);
    setGroupInput('');
  };

  // ─── SMM openers ────────────────────────────────────────────────────────
  // Group chat about an SMM entity: the SAME window + polling as the per-test
  // chat, keyed by the «smm-e:<id>» / «smm-u:<id>» scope prefix.
  const openSmmGroupChat = (kind: 'event' | 'specialist', entity: any) => {
    if (isGuestNow()) { setRegisterWall('chat'); return; }
    setAiCardTestId(null);
    setDashFilesOpen(false);
    setEditOpen(false);
    setGroupMessages([]);
    setGroupInput('');
    dashGroupTitleRef.current = kind === 'event' ? String(entity?.title || '') : String(entity?.name || '');
    stashDashWindowTest({ ...entity, smmKind: kind });
    setDashGroupTestId(`smm-${kind === 'event' ? 'e' : 'u'}:${entity.id}`);
  };
  // Files of an SMM entity (the polymorphic SmmFile table) — the SAME window
  // format as the test files window.
  const openSmmFiles = (kind: 'event' | 'specialist', entity: any) => {
    const raw = String(entity?.id || '');
    const rawId = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    if (!rawId) return;
    setAiCardTestId(null);
    setDashGroupTestId(null);
    stashDashWindowTest({ ...entity, smmKind: kind });
    const title = kind === 'event' ? String(entity?.title || '') : String(entity?.name || '');
    setDashFilesLoadingId(rawId);
    setLoading(true);
    api.getSmmFiles(kind === 'event' ? 'event' : 'user', rawId)
      .then((items: any[]) => {
        setDashFiles({ testId: `smm-${kind === 'event' ? 'e' : 'u'}:${rawId}`, title, items: (items || []).filter(Boolean) });
        setDashFilesOpen(true);
      })
      .catch((e: any) => toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' }))
      .finally(() => { setDashFilesLoadingId(null); setLoading(false); });
  };
  // «Подать заявку» (specialist → event) / «Пригласить» (customer →
  // specialist): the wizard in the same full-screen window the question
  // cards used. invite preloads the customer's own events for the pick.
  const openSmmWizard = async (mode: 'invite' | 'apply' | 'send', target: any) => {
    if (isGuestNow()) { setRegisterWall('home'); return; }
    const st = useSmmStore.getState();
    st.setWizardMode(mode);
    st.setWizardSpecialist(mode === 'invite' ? target : null);
    st.setWizardEvent(mode === 'apply' ? target : null);
    st.setSelEventId(null);
    st.setSelRoleId(null);
    st.setWizardMessage('');
    st.setWizardStep(0);
    st.setWizardBusy(false);
    st.setInvitePickSpecialist(false); // the specialist is preset — no pick stage
    st.setSpecialistCandidates([]);
    if (mode === 'invite') {
      try {
        const evs = await api.getMySmmEvents();
        st.setMyEvents(evs || []);
        if ((evs || []).length === 1) st.setSelEventId(evs[0].id);
      } catch { st.setMyEvents([]); }
    }
    if (mode === 'send') {
      // The SEND flow picks one of the specialist's own запросы
      st.setSelRequestId(null);
      try {
        const mine = await api.getSmmRequests('mine');
        st.setWizardRequests(mine || []);
      } catch { st.setWizardRequests([]); }
    }
    setPage('smm-wizard');
  };
  // Personal-library pin for SMM entities (customer pins specialists,
  // specialist pins events) — optimistic, like the test bookmarks.
  const toggleSmmBookmark = async (kind: 'specialist' | 'event' | 'request' | 'role', id: string) => {
    if (isGuestNow()) { setRegisterWall('home'); return; }
    const st = useSmmStore.getState();
    const curList = kind === 'specialist' ? st.smmBmSpecialists
      : kind === 'event' ? st.smmBmEvents
      : kind === 'request' ? st.smmBmRequests
      : st.smmBmRoles;
    const has = curList.includes(id);
    const nextList = has ? curList.filter(x => x !== id) : [...curList, id];
    if (kind === 'specialist') st.setSmmBmSpecialists(nextList);
    else if (kind === 'event') st.setSmmBmEvents(nextList);
    else if (kind === 'request') st.setSmmBmRequests(nextList);
    else st.setSmmBmRoles(nextList);
    try {
      if (has) await api.removeSmmBookmark(kind, id);
      else await api.addSmmBookmark(kind, id);
      if (!navNow().discoverMode && (kind === 'specialist' || kind === 'event')) refreshSmmFeed('mine');
    } catch (e: any) {
      if (kind === 'specialist') st.setSmmBmSpecialists(curList);
      else if (kind === 'event') st.setSmmBmEvents(curList);
      else if (kind === 'request') st.setSmmBmRequests(curList);
      else st.setSmmBmRoles(curList);
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };
  // Wizard confirmation («Подтвердить»): send the invitation / application →
  // back to the feed — the ending the brief describes. Invites opened from
  // the events page return there (and refresh its feed).
  const confirmSmmWizard = async () => {
    const st = smmNow();
    if (st.wizardBusy) return;
    if (st.wizardMode === 'invite') {
      if (!st.selEventId || !st.selRoleId || !st.wizardSpecialist) return;
    } else {
      if (!st.wizardEvent?.id || !st.selRoleId) return;
    }
    const fromEventsPage = st.invitePickSpecialist;
    st.setWizardBusy(true);
    try {
      if (st.wizardMode === 'invite') {
        await api.createSmmInvitation({ eventId: st.selEventId!, roleId: st.selRoleId!, specialistId: st.wizardSpecialist!.id, message: st.wizardMessage });
        toast({ title: t('smmInviteSentTitle'), description: t('smmInviteSentDesc') });
      } else if (st.wizardMode === 'send') {
        // The structured запрос goes to the event's role — the application
        // carries the requestId so the customer sees the full step structure.
        await api.createSmmApplication({ eventId: st.wizardEvent!.id, roleId: st.selRoleId!, requestId: st.selRequestId || undefined, message: st.wizardMessage });
        toast({ title: t('smmRequestSentTitle'), description: t('smmRequestSentDesc') });
      } else {
        await api.createSmmApplication({ eventId: st.wizardEvent!.id, roleId: st.selRoleId!, message: st.wizardMessage });
        toast({ title: t('smmApplicationSentTitle'), description: t('smmApplicationSentDesc') });
      }
      st.setWizardMode(null);
      st.setWizardSpecialist(null);
      st.setWizardEvent(null);
      st.setSelEventId(null);
      st.setSelRoleId(null);
      st.setWizardMessage('');
      st.setWizardStep(0);
      st.setInvitePickSpecialist(false);
      st.setSpecialistCandidates([]);
      st.setSelRequestId(null);
      st.setWizardRequests([]);
      const fromRequests = st.wizardMode === 'send';
      setPage(fromEventsPage ? 'smm-events' : fromRequests ? 'smm-requests' : 'dashboard');
      refreshSmmFeed();
      if (fromEventsPage) void refreshEventsFeed();
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
    st.setWizardBusy(false);
  };
  const gotoSmmPage = (p: 'smm-events' | 'smm-inbox' | 'smm-requests' | 'smm-roles') => setPage(p);

  // ═════════════════════════ ЗАПРОС handlers ══════════════════════════════
  const refreshRequests = useCallback(async (scopeOverride?: 'mine' | 'public') => {
    const scope = scopeOverride || requestsScope;
    setRequestsLoading(true);
    try {
      setRequestsItems(await api.getSmmRequests(scope));
    } catch { /* transient */ }
    setRequestsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestsScope]);

  const changeRequestsScope = useCallback((s2: 'mine' | 'public') => {
    setRequestsScope(s2);
    void refreshRequests(s2);
  }, [refreshRequests]);

  // The «Отправленные запросы» page refreshes whenever it opens
  useEffect(() => {
    if (effectivePage === 'smm-requests' && effectiveUser) void refreshRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePage === 'smm-requests', effectiveUser?.id]);

  const startCreateRequest = () => {
    resetRequestForm();
    setPage('smm-request-editor');
  };

  const startEditRequest = async (rq: any) => {
    try {
      const fresh = await api.getSmmRequest(rq.id);
      resetRequestForm();
      useRequestEditorStore.setState({
        rqTitle: fresh.title || '',
        rqSummary: fresh.summary || '',
        rqCoverColor: fresh.coverColor || '',
        rqIsPublic: !!fresh.isPublic,
        steps: (fresh.steps || []).map((st: any) => ({ id: st.id, title: st.title || '', hint: st.hint || '', answer: st.answer || '' })),
        editingRequestId: fresh.id,
        rqStepsExpanded: true,
      });
      setPage('smm-request-editor');
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  const handleSaveRequest = async () => {
    if (requestSaving) return;
    const st = requestEditorNow();
    if (!st.rqTitle.trim()) return;
    setRequestSaving(true);
    try {
      const payload = {
        title: st.rqTitle.trim(),
        summary: st.rqSummary,
        coverColor: st.rqCoverColor || null,
        coverIcon: null as string | null,
        isPublic: st.rqIsPublic,
        steps: st.steps.map((st2: any) => ({ title: st2.title, hint: st2.hint, answer: st2.answer })),
      };
      if (st.editingRequestId) {
        await api.updateSmmRequest(st.editingRequestId, payload);
        toast({ title: t('smmRequestSavedToast') });
        setFocusRequestId(st.editingRequestId);
      } else {
        const created = await api.createSmmRequest(payload);
        toast({ title: t('smmRequestCreated') });
        setFocusRequestId(created.id);
      }
      setRequestsScope('mine');
      await refreshRequests('mine');
      setPage('smm-requests');
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
    setRequestSaving(false);
  };

  const doShareRequestLink = async (rq: any) => {
    try {
      await api.shareSmmRequest(rq.id, 'link');
      const link = `${window.location.origin}/?request=${rq.id}`;
      try { await navigator.clipboard.writeText(link); toast({ title: t('linkCopied') }); }
      catch { toast({ title: link }); }
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  const doMakeRequestPublic = async (rq: any) => {
    try {
      const res = await api.shareSmmRequest(rq.id, 'community');
      setRequestsItems(prev => prev.map(x => (x.id === rq.id ? { ...x, isPublic: res.isPublic } : x)));
      toast({ title: res.isPublic ? t('smmMakePublicBtn') : t('smmMakeLinkOnly') });
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  const confirmDeleteRequest = async () => {
    const id = deleteRequestId;
    setDeleteRequestId(null);
    if (!id) return;
    try {
      await api.deleteSmmRequest(id);
      setRequestsItems(prev => prev.filter(x => x.id !== id));
      toast({ title: t('smmRequestDeleted') });
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  // «Взять шаблон» on a foreign PUBLIC запрос: copies the structure into the
  // specialist's own library (the template economy — take, adapt, send).
  const takeRequestTemplate = async (rq: any) => {
    if (isGuestNow()) { setRegisterWall('home'); return; }
    try {
      const fresh = await api.getSmmRequest(rq.id);
      const created = await api.createSmmRequest({
        title: fresh.title,
        summary: fresh.summary || '',
        coverColor: fresh.coverColor || null,
        isPublic: false,
        steps: (fresh.steps || []).map((st: any) => ({ title: st.title, hint: st.hint, answer: st.answer || '' })),
      });
      toast({ title: t('smmRequestCreated') });
      setRequestsScope('mine');
      await refreshRequests('mine');
      setFocusRequestId(created.id);
      setPage('smm-requests');
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  // ── The FILLING screen (the test-taking twin) ──
  const startFillRequest = async (rq: any) => {
    try {
      const fresh = await api.getSmmRequest(rq.id);
      setFillRequest(fresh);
      setPage('smm-request-fill');
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  const handleFillAnswerChange = (stepId: string, answer: string) => {
    setFillRequest((prev: any) => prev ? { ...prev, steps: prev.steps.map((st: any) => (st.id === stepId ? { ...st, answer } : st)) } : prev);
  };

  const handleFillSaveAnswers = async () => {
    if (!fillRequest || fillBusy) return;
    setFillBusy(true);
    try {
      await api.updateSmmRequest(fillRequest.id, {
        steps: (fillRequest.steps || []).map((st: any) => ({ title: st.title, hint: st.hint, answer: st.answer || '' })),
      });
      toast({ title: t('smmFillSaved') });
      setRequestsScope('mine');
      await refreshRequests('mine');
      setFocusRequestId(fillRequest.id);
      setFillRequest(null);
      setPage('smm-requests');
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
    setFillBusy(false);
  };

  // «Отправить запрос» — the SEND wizard (запрос → роль → сообщение → обзор)
  const openSmmSendWizard = async (target: any) => {
    if (isGuestNow()) { setRegisterWall('home'); return; }
    const st = smmNow();
    st.setWizardMode('send');
    st.setWizardSpecialist(null);
    st.setWizardEvent(target);
    st.setSelEventId(null);
    st.setSelRoleId(null);
    st.setWizardMessage('');
    st.setWizardStep(0);
    st.setWizardBusy(false);
    st.setInvitePickSpecialist(false);
    st.setSpecialistCandidates([]);
    st.setSelRequestId(null);
    try {
      const mine = await api.getSmmRequests('mine');
      st.setWizardRequests(mine || []);
    } catch { st.setWizardRequests([]); }
    setPage('smm-wizard');
  };

  // ── РОЛИ handlers (the customer's «Личные роли» / «Общие роли») ──
  const refreshRoles = useCallback(async (scopeOverride?: 'mine' | 'public') => {
    const scope = scopeOverride || rolesScope;
    setRolesLoading(true);
    try {
      setRolesItems(await api.getSmmRoles(scope));
    } catch { /* transient */ }
    setRolesLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesScope]);

  const changeRolesScope = useCallback((s2: 'mine' | 'public') => {
    setRolesScope(s2);
    void refreshRoles(s2);
  }, [refreshRoles]);

  useEffect(() => {
    if (effectivePage === 'smm-roles' && effectiveUser) {
      // The dock preset wins: «Личные роли»/«Общие роли» buttons carry the
      // scope they want the page to open with.
      const preset = smmNow().rolesScopeRequest;
      setRolesScope(preset);
      void refreshRoles(preset);
      api.getMySmmEvents().then((evs: any[]) => setMyEventsCache(evs || [])).catch(() => setMyEventsCache([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePage === 'smm-roles', effectiveUser?.id]);

  const doShareRoleTemplate = async (role: any) => {
    try {
      const next = !role.isPublic;
      await api.updateSmmRole(role.id, { isPublic: next });
      setRolesItems(prev => prev.map(x => (x.id === role.id ? { ...x, isPublic: next } : x)));
      toast({ title: next ? t('smmShareRoleTpl') : t('smmUnshareRoleTpl') });
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  const doAttachRoleTemplate = async (roleId: string, eventId: string) => {
    try {
      await api.attachSmmRoleTemplate(roleId, eventId);
      toast({ title: t('smmRoleTplAdded') });
      void refreshRoles();
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  const doDeleteRoleTemplate = async (role: any) => {
    try {
      await api.deleteSmmRole(role.id);
      setRolesItems(prev => prev.filter(x => x.id !== role.id));
      toast({ title: t('smmRequestDeleted') });
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
  };

  const doEditRoleInline = async (role: any) => {
    // A prompt-free inline edit is heavy; route to the event's manage window
    // (the roles tab) — the exact surface the customer edits roles on.
    if (role.event?.id) {
      changeEventsScope('mine');
      setPage('smm-events');
    }
  };

  // ── The ACCOUNT SWITCHER (заказчик ↔ SMM-специалист) — the top-panel
  // button styled like the language switcher: one tap cycles the account
  // kind, persisted via PUT /api/smm/profile, the feed re-resolves.
  const [switchingRole, setSwitchingRole] = useState(false);
  const switchSmmRole = async () => {
    if (switchingRole || !effectiveUser) return;
    const next = mySmmRole === 'customer' ? 'specialist' : 'customer';
    setSwitchingRole(true);
    try {
      await api.switchSmmRole(next);
      const patch = { ...effectiveUser, smmRole: next } as any;
      setUser({ id: patch.id, email: patch.email, name: patch.name, smmRole: next });
      useSessionStore.getState().setUser(patch);
      useSessionStore.getState().setHydratedUser(patch);
      toast({ title: next === 'customer' ? t('smmSwitchedCustomer') : t('smmSwitchedSpecialist') });
      // The feed kind flips with the account: re-resolve both SMM feeds
      setRequestsItems([]); setRolesItems([]);
      refreshSmmFeed();
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
    setSwitchingRole(false);
  };
  // The window's open effect: resume the test's most recent thread — or
  // spawn a fresh (empty, unsaved) one, «Новый чат» style. No passport.
  React.useEffect(() => {
    if (!aiCardTestId) return;
    const tid = aiCardTestId;
    const st = useChatStore.getState();
    const cand = Object.entries(st.chatThreads)
      .filter(([, th]) => th.testId === tid)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))[0];
    if (cand) {
      setChatThreadId(cand[0]);
      setChatMessages([...cand[1].messages]);
    } else {
      const id = newThreadKey();
      setChatThreads(prev => ({ ...prev, [id]: { testId: tid, title: aiCardTitleRef.current || 'Test', messages: [], updatedAt: Date.now() } }));
      setChatThreadId(id);
      setChatMessages([]);
    }
    setChatInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiCardTestId]);
  // «Новый чат» in the dashboard AI window's drawer: a fresh conversation
  // about the SAME test; the previous threads stay in the list.
  const startNewDashChat = () => {
    setChatHistoryOpen(false);
    const tid = navNow().aiCardTestId;
    if (!tid) return;
    const id = newThreadKey();
    setChatThreads(prev => ({ ...prev, [id]: { testId: tid, title: aiCardTitleRef.current || 'Test', messages: [], updatedAt: Date.now() } }));
    setChatThreadId(id);
    setChatMessages([]);
    setChatInput('');
  };
  // Leaving the dashboard (start test / create / profile…) closes the windows.
  React.useEffect(() => {
    if (page !== 'dashboard') {
      if (navNow().aiCardTestId) setAiCardTestId(null);
      if (dashGroupTestId) setDashGroupTestId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  const sendTestChatMessage = async (existingMessages?: { role: 'user' | 'assistant'; content: string }[]) => {
    // The conversation carries its OWN test context: the drawer can switch to
    // a thread about another test, so the testId resolves from the ACTIVE
    // thread (falling back to the card the window was opened from).
    const st0 = useChatStore.getState();
    const activeTh = st0.chatThreadId ? st0.chatThreads[st0.chatThreadId] : null;
    const testId = activeTh?.testId || navNow().aiCardTestId || '';
    if (!testId) return;
    const threadKey = st0.chatThreadId;
    let newMsgs: { role: 'user' | 'assistant'; content: string }[];
    if (existingMessages) {
      newMsgs = existingMessages;
      setChatMessages(existingMessages);
    } else {
      if (!chatInput.trim()) return;
      const userMsg = { role: 'user' as const, content: chatInput };
      newMsgs = [...useChatStore.getState().chatMessages, userMsg];
      setChatMessages(newMsgs);
      setChatInput('');
    }
    setChatLoading(true);
    try {
      // SMM entity threads («smm-u:<id>» specialist / «smm-e:<id>» event /
      // «smm-r:<id>» запрос)? The AI prompt is built server-side from that
      // entity's data; otherwise it's the whole-test tutor.
      const tidStr = String(testId);
      const result = tidStr.startsWith('smm-u:')
        ? await api.chatAboutSpecialist(tidStr.slice(5), newMsgs)
        : tidStr.startsWith('smm-e:')
          ? await api.chatAboutEvent(tidStr.slice(5), newMsgs)
          : tidStr.startsWith('smm-r:')
            ? await api.chatAboutRequest(tidStr.slice(5), newMsgs)
            : tidStr.startsWith('smm-role:')
              ? await api.chatAboutRole(tidStr.slice(9), newMsgs)
              : await api.chatAboutTest(testId, newMsgs);
      if (result.response) {
        const assistantMsg = { role: 'assistant' as const, content: result.response };
        const finalMsgs = [...newMsgs, assistantMsg];
        setChatMessages(finalMsgs);
        // mirror into the ACTIVE thread → the debounced sync persists it
        setChatThreads(prev => {
          const cur = threadKey ? prev[threadKey] : null;
          if (!cur && !threadKey) return prev;
          return {
            ...prev,
            [threadKey]: { testId, title: cur?.title || aiCardTitleRef.current || 'Test', messages: finalMsgs, updatedAt: Date.now() },
          };
        });
      } else if ((result as any).rateLimited) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: t('aiBusy') }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: (result as any).error || t('aiError') }]);
      }
    } catch (e: any) {
      const errMsg = e?.message || '';
      if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('Too many')) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: t('aiBusy') }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: t('aiError') }]);
      }
    }
    setChatLoading(false);
  };

  const sendChatMessage = async (questionId?: string, existingMessages?: { role: 'user' | 'assistant'; content: string }[], userAnswer?: string, question?: Question | null) => {
    const qId = questionId || chatQuestionId;
    const uAns = userAnswer !== undefined ? userAnswer : chatUserAnswer;
    const qObj = question !== undefined ? question : (chatQuestionObj || shuffledQuestions.find(x => x.id === qId) || null);

    let newMsgs: { role: 'user' | 'assistant'; content: string }[];

    if (existingMessages) {
      // Initial auto-message from openChat - show it in the chat UI
      newMsgs = existingMessages;
      setChatMessages(existingMessages);
    } else {
      // User typed a message
      if (!chatInput.trim()) return;
      const userMsg = { role: 'user' as const, content: chatInput };
      newMsgs = [...chatMessages, userMsg];
      setChatMessages(newMsgs);
      setChatInput('');
    }

    setChatLoading(true);

    try {
      const result = await api.chat(qId, newMsgs, uAns, buildQuestionContext(qObj));
      if (result.response) {
        const assistantMsg = { role: 'assistant' as const, content: result.response };
        setChatMessages(prev => [...prev, assistantMsg]);
      } else if (result.rateLimited) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: t('aiBusy') }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: result.error || t('aiError') }]);
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      const errMsg = e?.message || '';
      if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('Too many')) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: t('aiBusy') }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: t('aiError') }]);
      }
    }
    setChatLoading(false);
  };

  const closeChat = () => {
    setChatOpen(false);
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  // ---------- Group chat (everyone taking this test) ----------
  const closeGroupChat = () => {
    setGroupOpen(false);
    setGroupMessages([]);
    setGroupInput('');
  };

  const openGroupChat = () => {
    setGroupOpen(true);
    setFilesOpen(false);
    setEditOpen(false);
    if (chatOpen) closeChat();
  };

  // Poll the group chat while the panel is open (serverless-safe, no WebSockets)
  useEffect(() => {
    if (!groupOpen || !currentTest) return;
    let stop = false;
    const poll = async () => {
      try {
        const msgs = await api.getGroupMessages(currentTest.id);
        if (!stop && Array.isArray(msgs)) setGroupMessages(msgs);
      } catch { /* transient network errors are fine — next tick retries */ }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(timer); };
  }, [groupOpen, currentTest]);

  // Dashboard group chat window: the SAME serverless-safe polling, keyed on
  // the card's test instead of the taking screen's one. SMM entities (the
  // «smm-e:» / «smm-u:» prefixes) poll the polymorphic SMM chat instead.
  useEffect(() => {
    if (!dashGroupTestId) return;
    const smmScope: 'event' | 'specialist' | null = dashGroupTestId.startsWith('smm-e:') ? 'event' : dashGroupTestId.startsWith('smm-u:') ? 'specialist' : null;
    const smmScopeId = smmScope ? dashGroupTestId.slice(dashGroupTestId.indexOf(':') + 1) : '';
    let stop = false;
    const poll = async () => {
      try {
        const msgs = smmScope
          ? await api.getSmmMessages(smmScope, smmScopeId)
          : await api.getGroupMessages(dashGroupTestId);
        if (!stop && Array.isArray(msgs)) setGroupMessages(msgs);
      } catch { /* transient network errors are fine — next tick retries */ }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(timer); };
  }, [dashGroupTestId]);

  // Auto-scroll group chat to bottom on new messages
  useEffect(() => {
    if ((groupOpen || dashGroupTestId) && groupEndRef.current) {
      groupEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [groupMessages, groupOpen, dashGroupTestId]);

  const sendGroupMessage = async () => {
    if (!currentTest || !groupInput.trim() || groupSending) return;
    const text = groupInput.trim();
    setGroupInput('');
    setGroupSending(true);
    try {
      const saved = await api.sendGroupMessage(currentTest.id, text);
      setGroupMessages(prev => (prev.some(m => m.id === saved.id) ? prev : [...prev, saved]));
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to send message', variant: 'destructive' });
      setGroupInput(text); // restore the typed text so nothing is lost
    }
    setGroupSending(false);
  };

  // Dashboard group chat window: send into THIS card's test chat (the same
  // API the taking screen uses — the message appears for the whole group).
  const sendDashGroupMessage = async () => {
    if (!dashGroupTestId || !groupInput.trim() || groupSending) return;
    const text = groupInput.trim();
    setGroupInput('');
    setGroupSending(true);
    try {
      const smmScope: 'event' | 'specialist' | null = dashGroupTestId.startsWith('smm-e:') ? 'event' : dashGroupTestId.startsWith('smm-u:') ? 'specialist' : null;
      const saved = smmScope
        ? await api.sendSmmMessage(smmScope, dashGroupTestId.slice(dashGroupTestId.indexOf(':') + 1), text)
        : await api.sendGroupMessage(dashGroupTestId, text);
      setGroupMessages(prev => (prev.some(m => m.id === saved.id) ? prev : [...prev, saved]));
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to send message', variant: 'destructive' });
      setGroupInput(text); // restore the typed text so nothing is lost
    }
    setGroupSending(false);
  };

  const submitTest = async () => {
    if (!currentTest) return;

    // GUEST submit (share-link visitor, no server attempt): grade locally and
    // show the results screen — no History write (there is no account yet).
    // The finished run's local snapshot is dropped.
    if (!currentAttempt) {
      if (!isGuestNow()) return;
      clearGuestSnapshot(currentTest.id);
      setGuestTakeTestId(null);
      setShowResult(true);
      toast({ title: t('testCompleted'), description: t('answersSubmitted') });
      return;
    }

    const answerData = shuffledQuestions.map(q => {
      const selected = answers[q.id || ''] || '';
      return {
        questionId: q.id,
        selectedAnswer: selected,
        isCorrect: selected === q.correctAnswer,
      };
    });

    setLoading(true);
    try {
      const saved: any = await api.updateAttempt(currentAttempt.id, {
        answers: answerData,
        completed: true,
      });
      // History shows the finished attempt the moment it is opened — the
      // store is patched from the SAME server response (the score was graded
      // server-side), no reload, no refetch.
      const finished: Attempt = saved?.id ? saved : {
        ...(currentAttempt as any),
        score: answerData.filter(a => a.isCorrect).length,
        totalQuestions: answerData.length,
        completed: true,
        completedAt: new Date().toISOString(),
      };
      setAttempts(prev => {
        const i = prev.findIndex(a => a.id === finished.id);
        if (i < 0) return [finished, ...prev];
        const next = [...prev];
        next[i] = { ...next[i], ...finished };
        return next;
      });
      // Attempt submitted — the saved "continue" progress is no longer needed
      clearTestProgress(progressUserId, currentTest.id);
      setSavedProgress(null);
      setShowResult(true);
      toast({ title: t('testCompleted'), description: t('answersSubmitted') });

      // Load explanations for the review section
      try {
        const ids = shuffledQuestions.map(q => q.id).filter(Boolean) as string[];
        if (ids.length > 0) {
          const result = await api.generateExplanations(ids, lang);
          const explMap: Record<string, string> = {};
          if (result.explanations) {
            for (const item of result.explanations) {
              if (item.explanation) explMap[item.id] = item.explanation;
            }
          }
          setExplanations(explMap);
        }
      } catch (e) {
        console.error('Failed to load explanations for review:', e);
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const goHome = () => {
    setPage('dashboard');
    setCurrentTest(null);
    setCurrentAttempt(null);
  };

  // =================== RENDER ===================

  // GUEST BOOT (?test=<id> without a session): splash while the linked test
  // loads; on a dead link it shows the message and the registration way in.
  if (effectivePage === 'guest-boot') {
    return (
      <GuestBootSplash
        failed={guestBootFailed}
        onAuth={() => {
          setGuestBootFailed(false);
          useSessionStore.getState().setAuthMode('signup');
          setPage('auth');
        }}
      />
    );
  }

  // AUTH PAGE (view extracted to src/components/pages/auth-view.tsx).
  // In the guest flow the card grows a Cancel link back to the test — the
  // taking session is still alive in the stores and localStorage.
  if (effectivePage === 'auth') {
    const guestPending = mounted && !!getGuestTakeTestId() && shuffledQuestions.length > 0;
    return (
      <AuthView
        handleAuth={handleAuth}
        onCancel={guestPending ? () => setPage('take-test') : undefined}
      />
    );
  }

  // Round avatar initials for the dashboard header
  const userName = effectiveUser?.name || effectiveUser?.email || '';
  const userInitials = (() => {
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : userName.slice(0, 2);
    return (s || '?').toUpperCase();
  })();

  // Share = COPY THE LINK to the clipboard. No native share sheet, no window —
  // the button presses straight through to the clipboard.
  //   doShareLink   → copies the direct test link (?test=<id>) — available on
  //                   EVERY card; for versions the card keeps it passive until
  //                   2+ questions/answers changed (server still re-checks).
  //   doMakePublic  → own FROM-SCRATCH tests only: flips isPublic=true
  //                   (server) and copies the link. Versions never get here —
  //                   the card does not render the button for them at all.
  const copyTestLink = async (test: Test) => {
    const url = `${window.location.origin}/?test=${test.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('linkCopied') });
    } catch {
      toast({ title: t('error'), description: url, variant: 'destructive' });
    }
  };

  const doShareLink = async (test: Test) => {
    // VERSION-NAME GATE (share): the FIRST share-by-link of a personal test
    // asks for the version name first — the chat-style naming sheet opens;
    // the link is copied after the name is saved. Already-named tests (and
    // other authors' tests) share straight through.
    if (effectiveUser && test.creatorId === effectiveUser.id && !test.versionName) {
      setVersionNameValue(test.title);
      setVersionNameGate({ mode: 'share', testId: test.id, title: test.title });
      return;
    }
    await copyTestLink(test);
  };

  // Confirm in the naming sheet: 'save' → continue the interrupted save with
  // the entered name; 'share' → persist the name, mirror it into every cache
  // instantly, then copy the link the user asked for.
  const confirmVersionName = async () => {
    const gate = versionNameGate;
    if (!gate) return;
    const name = versionNameValue.trim();
    if (!name) return;
    if (gate.mode === 'save') {
      setVersionNameGate(null);
      await performSaveTest(gate.fromTake, name, gate.fromDash);
      return;
    }
    setVersionNameBusy(true);
    try {
      await api.setVersionName(gate.testId, name);
      // Mirror instantly into every cache the cards read (no reload):
      const withName = (x: Test) => ({ ...x, versionName: name });
      patchScope(queryClient, feedKey('mine'), { patchId: gate.testId, patch: withName });
      setDashFullTests(prev => {
        const full = prev[gate.testId];
        if (!full) return prev;
        return { ...prev, [gate.testId]: { ...full, versionName: name } };
      });
      if (currentTest?.id === gate.testId) setCurrentTest({ ...currentTest, versionName: name } as Test);
      if (editingTestId === gate.testId) setEditingVersionName(name);
      setVersionNameGate(null);
      setVersionNameValue('');
      await copyTestLink({ id: gate.testId } as Test);
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message, variant: 'destructive' });
    } finally {
      setVersionNameBusy(false);
    }
  };

  // Cancel in the naming sheet: the interrupted action does NOT proceed —
  // a save stays unsaved, a share copies nothing.
  const cancelVersionName = () => {
    const mode = versionNameGate?.mode;
    setVersionNameGate(null);
    setVersionNameValue('');
    if (mode === 'save') {
      toast({ title: t('versionNameCancelHint') });
    }
  };

  const doMakePublic = async (test: Test) => {
    setShareBusy(true);
    try {
      if (effectiveUser && test.creatorId === effectiveUser.id) {
        const r = await api.shareTest(test.id, 'community');
        if (r && typeof r.isPublic === 'boolean' && r.isPublic !== test.isPublic) {
          const flip = (x: Test) => ({ ...x, isPublic: r.isPublic });
          // Patch EVERY cached scope — not just the active one — so the flip
          // is visible everywhere without a reload:
          patchScope(queryClient, feedKey('mine'), { patchId: test.id, patch: flip });
          if (r.isPublic) {
            // Going public → the test JOINES a cached discover feed at once
            // (prepend dedupes if it is already there).
            if (queryClient.getQueryData(feedKey('discover'))) {
              patchScope(queryClient, feedKey('discover'), { prepend: [{ ...test, isPublic: true }] });
            }
          } else {
            // Going link-only → it leaves the cached discover feed at once.
            patchScope(queryClient, feedKey('discover'), { removeId: test.id });
          }
        }
        toast({ title: r?.isPublic ? t('shareMadePublic') : t('shareMadeLink') });
      }
      await copyTestLink(test);
    } catch (e: any) {
      // Publishing rule: the community flip requires a unique public title
      if (e?.message === 'PUBLISH_NAME_TAKEN') {
        toast({ title: t('error'), description: t('publishNameTaken'), variant: 'destructive' });
      } else if (e?.message === 'VERSION_NOT_PUBLIC') {
        toast({ title: t('error'), description: t('versionNotPublicToast'), variant: 'destructive' });
      } else if (e?.message === 'VERSION_TOO_SIMILAR') {
        setGateDialogTest({ id: test.id, title: test.title });
      } else {
        toast({ title: t('error'), description: e?.message, variant: 'destructive' });
      }
    } finally {
      setShareBusy(false);
    }
  };

  // ─── Event share / publish / delete — the exact analogues of the tests'
  // share trio, scoped to the events page. A customer shares and publishes
  // only their OWN events (server-enforced too); the link works for anyone.
  const copyEventLink = async (ev: any) => {
    const url = `${window.location.origin}/?event=${ev.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('linkCopied') });
    } catch {
      toast({ title: t('error'), description: url, variant: 'destructive' });
    }
  };
  const doShareEventLink = async (ev: any) => {
    // «Приватная ссылка» — copies the direct event link (?event=<id>);
    // the link opens the event for anyone who has it.
    await copyEventLink(ev);
  };
  const doMakeEventPublic = async (ev: any) => {
    if (effectiveUser && ev.customerId !== effectiveUser.id) {
      toast({ title: t('smmOnlyOwnEvents'), variant: 'destructive' });
      return;
    }
    setShareBusy(true);
    try {
      const r = await api.shareSmmEvent(ev.id, 'community');
      // Mirror the flip into the events page list without a reload
      setEventsItems(prev => prev.map(x => (x.id === ev.id ? { ...x, isPublic: r.isPublic } : x)));
      toast({ title: r.isPublic ? t('shareMadePublic') : t('shareMadeLink') });
      // The general library membership changed — the feeds revalidate
      void refreshSmmFeed();
      void refreshEventsFeed();
      await copyEventLink(ev);
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    } finally {
      setShareBusy(false);
    }
  };
  const requestDeleteEvent = (ev: any) => {
    if (effectiveUser && ev.customerId !== effectiveUser.id) {
      toast({ title: t('smmOnlyOwnEvents'), variant: 'destructive' });
      return;
    }
    setDeleteEventId(ev.id);
  };
  const handleDeleteEvent = async () => {
    if (!deleteEventId) return;
    try {
      await api.deleteSmmEvent(deleteEventId);
      toast({ title: t('smmEventDeleted') });
      setEventsItems(prev => prev.filter(x => x.id !== deleteEventId));
      void refreshSmmFeed();
    } catch (e: any) {
      toast({ title: t('error'), description: e?.message || 'Error', variant: 'destructive' });
    }
    setDeleteEventId(null);
  };

  // «Пригласить специалиста» FROM the events page: the event is preset, the
  // wizard gains the «specialist» pick stage (event → role → WHO → message).
  const openSmmInviteForEvent = async (ev: any) => {
    if (isGuestNow()) { setRegisterWall('home'); return; }
    if (effectiveUser && ev.customerId !== effectiveUser.id) {
      toast({ title: t('smmOnlyOwnEvents'), variant: 'destructive' });
      return;
    }
    const st = useSmmStore.getState();
    st.setWizardMode('invite');
    st.setWizardSpecialist(null); // picked inside the wizard's specialist stage
    st.setWizardEvent(ev);
    st.setSelEventId(ev.id);
    st.setSelRoleId(null);
    st.setWizardMessage('');
    st.setWizardStep(0);
    st.setWizardBusy(false);
    st.setMyEvents([{ ...ev, roles: ev.roles || [] }]);
    st.setInvitePickSpecialist(true);
    st.setSpecialistCandidates([]);
    setPage('smm-wizard');
    // The candidates come from the general specialists feed (fetched once)
    api.getSmmFeed({ scope: 'discover', limit: 50 })
      .then((f: any) => { if (f?.kind === 'specialists') useSmmStore.getState().setSpecialistCandidates(f.items || []); })
      .catch(() => {});
  };

  // Jump to a test from the search dropdown: scroll to it if already loaded,
  // otherwise fetch the full test and pin it to the top (same as deep-link)
  const jumpToTest = (id: string) => {
    pendingFilesJumpRef.current = null;
    if (filesFeedMode) setFilesFeedMode(false);
    // Leaving the grid files view (if open) — the search jump goes to the test itself
    setGridFilesMode(false); setGridFilesTestId(null);
    // ...and any open version tree — the jump opens the TEST card itself
    setTreeFeedMode(false); setTreeFeedTestId(null);
    setGridTreeMode(false); setGridTreeTestId(null);
    setDashSearch(''); setDashSearchResults(null); setDashTagInfo(null); setDashSearchOpen(false);
    // From the grid views a search result opens the swipe feed with a back
    // button that returns to the grid at its remembered scroll position
    if (dashView === 'library' || dashView === 'shelf') {
      libReturnViewRef.current = dashView;
      gridScrollTopRef.current = dashFeedRef.current?.scrollTop || 0;
      setDashView('tiktok2');
    }
    const idx = tests.findIndex(x => x.id === id);
    const go = (i: number) => { setDashTestIdx(i); scrollDashTo(i); };
    if (idx >= 0) { go(idx); return; }
    api.getTest(id).then((full: Test) => {
      patchScope(queryClient, activeScopeKey(), { prepend: [full] });
      go(0);
    }).catch(() => {});
  };

  // Flip the feed to files mode: the feed shows the FILES flow of the whole
  // recommendation list — one card per test that has attachments, in feed
  // order — landing on the tapped test's card (the swipe then continues
  // into the OTHER recommended tests' files cards). The header/bottom bar
  // stay untouched; the on-card control exits.
  const openFilesCard = (test: Test) => {
    pendingFilesJumpRef.current = test.id;
    setDashSearch(''); setDashSearchResults(null); setDashTagInfo(null); setDashSearchOpen(false);
    // Flattened recommendation flow (filesFeedTestId stays null — the
    // per-test pin is legacy). The pending jump scrolls to THIS test's
    // card as soon as its slides exist (attachments resolve async).
    setFilesFeedTestId(null);
    setFilesFeedMode(true);
    // Make sure this test's attachments are actually loaded (the list payload
    // only carries the attachment COUNT)
    if (!dashFetchedRef.current.has(test.id)) {
      dashFetchedRef.current.add(test.id);
      api.getTest(test.id)
        .then((full: Test) => setDashFullTests(prev => ({ ...prev, [test.id]: full })))
        .catch(() => { dashFetchedRef.current.delete(test.id); });
    }
  };
  // Back to the regular test card of the test whose files are on screen
  const closeFilesCard = () => {
    const cur = fileSlides[Math.min(Math.max(0, dashSlideIdx), Math.max(0, fileSlides.length - 1))];
    const tid = cur?.test.id;
    pendingFilesJumpRef.current = null;
    setFilesFeedMode(false);
    setFilesFeedTestId(null);
    setDashSlideIdx(0);
    setDashSearch(''); setDashSearchResults(null); setDashTagInfo(null); setDashSearchOpen(false);
    if (tid) {
      const idx = tests.findIndex(x => x.id === tid);
      if (idx >= 0) { setDashTestIdx(idx); scrollDashTo(idx); }
    }
  };
  // Files mode is a persistent dashboard state: it survives view switches
  // (the presentation converts between the feed and the grid) and content-
  // mode switches. This is the single "off" switch for it.
  const exitFilesMode = () => {
    pendingFilesJumpRef.current = null;
    setFilesFeedMode(false);
    setFilesFeedTestId(null);
    setGridFilesMode(false);
    setGridFilesTestId(null);
    const top = gridScrollTopRef.current;
    if (top > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = dashFeedRef.current;
        if (el && el.clientHeight > 0) el.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
      }));
    }
  };

  // View switcher: TikTok swipe feed / Library shelves (3 cards per shelf) /
  // Shelf view (1 card per shelf). Files AND tree modes SURVIVE the switch —
  // only their presentation changes (grid ⇄ feed) for the same source test.
  const switchDashView = (v: 'tiktok1' | 'library' | 'shelf') => {
    if (v === dashView) return;
    // The source test of the visible FILES card: the per-test pin (legacy),
    // the grid pin, or — in the flattened recommendation flow — the test of
    // the slide actually on screen.
    const filesId = filesFeedTestId || gridFilesTestId
      || (filesFeedMode ? fileSlides[Math.min(Math.max(0, dashSlideIdx), Math.max(0, fileSlides.length - 1))]?.test.id : null);
    // The source test of the visible TREE card (the commit keeps
    // treeFeedTestId on the visible card while the tree feed is open).
    const treeId = treeFeedTestId || gridTreeTestId;
    if (v === 'tiktok1') {
      if (filesFeedMode) { pendingFilesJumpRef.current = null; setDashSlideIdx(0); }
      else if (gridFilesMode && filesId) {
        // grid → feed: keep showing the SAME test's files as a feed slide
        setGridFilesMode(false); setGridFilesTestId(null);
        setFilesFeedTestId(null); setFilesFeedMode(true);
        pendingFilesJumpRef.current = filesId;
      }
      if (gridTreeMode && treeId) {
        // grid → feed: the SAME test's tree becomes a feed card of the
        // tree flow (the swipe then continues through the recommendations)
        setGridTreeMode(false); setGridTreeTestId(null);
        const idx = tests.findIndex(x => x.id === treeId);
        setDashSlideIdx(idx >= 0 ? idx : 0);
        setTreeFeedTestId(treeId); setTreeFeedMode(true);
      }
      setDashView('tiktok1');
    } else {
      if (filesFeedMode) {
        pendingFilesJumpRef.current = null;
        setFilesFeedMode(false); setFilesFeedTestId(null);
        setDashSlideIdx(0);
        if (filesId) { setGridFilesTestId(filesId); setGridFilesMode(true); } // feed → grid
      }
      if (treeFeedMode) {
        // feed → grid: the SAME test's tree keeps rendering inside the grid
        setTreeFeedMode(false); setTreeFeedTestId(null);
        setDashSlideIdx(0);
        if (treeId) { setGridTreeTestId(treeId); setGridTreeMode(true); }
      }
      setDashView(v);
    }
  };
  // View button cycles the three layouts (like the language button cycles
  // EN → RU → UZ): TikTok feed → Library → Shelf → TikTok feed …
  const cycleDashView = () => {
    const order: Array<'tiktok1' | 'library' | 'shelf'> = ['tiktok1', 'library', 'shelf'];
    const cur = dashView === 'tiktok2' ? 'tiktok1' : dashView;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    switchDashView(next);
  };

  // Account button: one tap switches the dashboard between the two content
  // modes — personal library (own tests + bookmarks) and discover (public
  // tests from other authors). The badge icon on the avatar shows the mode.
  const toggleDiscoverMode = () => {
    // Leaving another user's library always lands in the viewer's own library
    setViewingUser(null);
    const next = !navNow().discoverMode;
    setDiscoverMode(next); // the store IS the source — getState() readers see it immediately
    // Reset feed positions: the new mode starts from its own top card.
    // The files/tree special feeds are reset with it — their slide flow
    // belongs to the scope that is being left.
    setDashTestIdx(0); setDashSlideIdx(0);
    setFilesFeedMode(false); setFilesFeedTestId(null); pendingFilesJumpRef.current = null;
    setTreeFeedMode(false); setTreeFeedTestId(null);
    setGridTreeMode(false); setGridTreeTestId(null);
    // Deliberate scope switch: the OTHER query key takes over — its cache
    // paints instantly, an uncached scope fetches fresh from position 0.
  };

  // --- Another user's library (opened from their profile photo / chat avatar)
  // The dashboard swaps its test list for that user's public tests; every card
  // shows their name + photo; the header back arrow returns to the own feed.
  const openUserLibrary = (u: { id: string; name?: string; image?: string | null }) => {
    if (!u.id || !effectiveUser) return; // need a target and a session
    if (u.id === effectiveUser.id) {
      // Own card's «Open library»: Discover shows the author strip on every
      // card — including the user's OWN tests during the scope-switch window
      // (the fresh list has not landed yet). The destination for one's own
      // profile is one's OWN library — leave Discover. A silent return here
      // looked like a dead button: tapped the profile, nothing happened.
      if (navNow().discoverMode || navNow().viewingUser) toggleDiscoverMode();
      return;
    }
    if (navNow().viewingUser && viewingUser?.id === u.id) return;   // already there
    pendingFilesJumpRef.current = null;
    setFilesFeedMode(false); setFilesFeedTestId(null);
    setGridFilesMode(false); setGridFilesTestId(null);
    setTreeFeedMode(false); setTreeFeedTestId(null);
    setGridTreeMode(false); setGridTreeTestId(null);
    // Close any open bottom sheet (group chat / AI tutor / files / editor):
    // the tap happened INSIDE one of them and the dashboard is changing scope
    setGroupOpen(false);
    setChatOpen(false); setChatMessages([]); setChatQuestionId(''); setChatQuestionObj(null); setChatThreadId('');
    setFilesOpen(false);
    setEditOpen(false);
    // Scope switch = a query-key switch: React Query drops in THAT user's
    // cache (or fetches it) — the previous scope's list can never bleed in
    // and an in-flight fetch can never stomp this one. No guards needed.
    setViewingUser({ id: u.id, name: u.name || 'User', image: u.image || null });
    setDashTestIdx(0); setDashSlideIdx(0);
  };

  const closeUserLibrary = () => {
    if (!navNow().viewingUser) return;
    setViewingUser(null);
    pendingFilesJumpRef.current = null;
    setFilesFeedMode(false); setFilesFeedTestId(null);
    setGridFilesMode(false); setGridFilesTestId(null);
    setTreeFeedMode(false); setTreeFeedTestId(null);
    setGridTreeMode(false); setGridTreeTestId(null);
    // Back to the viewer's own scope = back to its cached query — instant,
    // and the foreign list can never merge into it (different query keys).
  };

  // Bookmark toggle (the bookmark button lives on the cards in Discover mode
  // and on foreign cards): bookmarked tests join the user's personal library
  // next to their own tests.
  const toggleBookmark = async (test: Test) => {
    const has = bookmarkIds.has(test.id);
    const prevIds = bookmarkIds;
    const nextIds = new Set(prevIds);
    if (has) nextIds.delete(test.id); else nextIds.add(test.id);
    // Optimistic update — the canonical TanStack Query pattern: patch the
    // caches locally, NEVER refetch. A refetch would reorder the feed under
    // the user (the original "карточка меняется через секунду" bug) — and
    // with isolated keys it could even glue foreign cards into this list.
    patchScope(queryClient, BOOKMARKS_KEY, { setBookmarks: nextIds });
    // The personal library is its OWN isolated query key ('mine'): patching
    // it from ANY mode (Discover, someone else's library, the files feed)
    // never disturbs the list on screen — it only keeps the library cache
    // truthful for the moment the user returns to it. This is what makes
    // «закрепил в общей библиотеке → вернулся → карточка тут же» work with
    // no reload: the feed loads once per session and is afterwards ONLY
    // patched locally, so a bookmark that only touched the id set would
    // otherwise stay invisible until the next F5.
    const mineNow = queryClient.getQueryData(feedKey('mine')) as { pages?: { items?: Test[] }[] } | undefined;
    const wasInMine = !!mineNow?.pages?.some(p => (p.items || []).some(x => x.id === test.id));
    if (has) {
      // Un-bookmarked → the card leaves the personal library NOW (every mode).
      patchScope(queryClient, feedKey('mine'), { removeId: test.id });
    } else if (mineNow) {
      // Bookmarked → the card JOINS the personal library cache at once, on
      // top. Returning from Discover / a foreign library shows it instantly.
      patchScope(queryClient, feedKey('mine'), { prepend: [test] });
    }
    try {
      if (has) await api.removeBookmark(test.id); else await api.addBookmark(test.id);
      toast({ title: has ? t('bookmarkRemoved') : t('bookmarkAdded') });
    } catch (e: any) {
      patchScope(queryClient, BOOKMARKS_KEY, { setBookmarks: prevIds }); // revert
      // Revert the library patch too — restore what the cache held before.
      if (has) {
        if (queryClient.getQueryData(feedKey('mine'))) {
          patchScope(queryClient, feedKey('mine'), { prepend: [test] });
        }
      } else if (mineNow && !wasInMine) {
        // Clean revert: the card was never in the library before our patch.
        patchScope(queryClient, feedKey('mine'), { removeId: test.id });
      }
      toast({ title: t('error'), description: e.message, variant: 'destructive' });
    }
  };

  // A card in library/shelf opens the swipe feed at that test (tiktok2 = feed
  // with a back button that returns to the grid at its scroll position)
  const openFromLibrary = (idx: number) => {
    libReturnViewRef.current = dashView === 'shelf' ? 'shelf' : 'library';
    gridScrollTopRef.current = dashFeedRef.current?.scrollTop || 0;
    if (filesFeedMode) { pendingFilesJumpRef.current = null; setFilesFeedMode(false); setFilesFeedTestId(null); setDashSlideIdx(0); }
    setDashTestIdx(idx);
    setDashView('tiktok2');
    scrollDashTo(idx);
  };
  // The per-card paperclip on a grid card: the SAME grid view (library or
  // shelf) keeps its layout but shows the ATTACHED-FILES cards of this test
  // instead of the test cards. Tapping the paperclip of the SAME test again
  // returns to the test cards; «К тестам» on a files card does the same.
  const openGridFiles = (test: Test) => {
    gridScrollTopRef.current = dashFeedRef.current?.scrollTop || 0;
    // Files and tree grids are MUTUALLY EXCLUSIVE overlays: opening the files
    // of a version card while the tree grid is on screen swaps the whole grid
    // to the files page (the render branch checks tree mode first).
    setGridTreeMode(false); setGridTreeTestId(null);
    setGridFilesTestId(test.id);
    setGridFilesMode(true);
    // Make sure the attachments are actually loaded (the list payload only
    // carries the attachment COUNT)
    if (!dashFetchedRef.current.has(test.id)) {
      dashFetchedRef.current.add(test.id);
      api.getTest(test.id)
        .then((full: Test) => setDashFullTests(prev => ({ ...prev, [test.id]: full })))
        .catch(() => { dashFetchedRef.current.delete(test.id); });
    }
  };
  const toggleGridFiles = (test: Test) => {
    if (gridFilesMode && gridFilesTestId === test.id) closeGridFiles();
    else openGridFiles(test);
  };
  const closeGridFiles = () => {
    setGridFilesMode(false);
    setGridFilesTestId(null);
    const top = gridScrollTopRef.current;
    if (top > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = dashFeedRef.current;
        if (el && el.clientHeight > 0) el.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
      }));
    }
  };

  // ----- VERSION-TREE modes (the same contract as the files modes) ---------
  // Feed: the feed swaps to the TREE flow — one tree card per recommended
  // test, landing on the tapped test's card; swiping continues through the
  // recommendation list (the inner level-swiper walks ancestors first).
  const openTreeCard = (test: Test) => {
    setDashSearch(''); setDashSearchResults(null); setDashTagInfo(null); setDashSearchOpen(false);
    // The tree cards map 1:1 onto the feed's tests (slide i = test i), so
    // the landing index is known synchronously — no pending-jump needed.
    const idx = tests.findIndex(x => x.id === test.id);
    setDashSlideIdx(idx >= 0 ? idx : 0);
    setTreeFeedTestId(test.id);
    setTreeFeedMode(true);
  };
  // Back to the regular test card of the test whose tree is on screen
  const closeTreeCard = () => {
    const idx = Math.min(Math.max(0, dashSlideIdx), Math.max(0, tests.length - 1));
    const tid = treeFeedTestId || tests[idx]?.id;
    setTreeFeedMode(false);
    setTreeFeedTestId(null);
    setDashSlideIdx(0);
    if (tid) {
      const tIdx = tests.findIndex(x => x.id === tid);
      if (tIdx >= 0) { setDashTestIdx(tIdx); scrollDashTo(tIdx); }
    }
  };
  // Grid (library/shelf): the grid keeps its layout and swaps its cards for
  // the version tree of ONE test.
  const toggleGridTree = (test: Test) => {
    if (gridTreeMode && gridTreeTestId === test.id) closeGridTree();
    else {
      // Same mutual exclusion, the other way: the tree button on ANY card
      // (regular or version) replaces whatever files page was open.
      setGridFilesMode(false); setGridFilesTestId(null);
      setGridTreeTestId(test.id);
      setGridTreeMode(true);
    }
  };
  const closeGridTree = () => {
    setGridTreeMode(false);
    setGridTreeTestId(null);
  };
  const backToLibrary = () => {
    // Leaving the files feed back to the grid also resets files mode
    if (navNow().filesFeedMode) {
      pendingFilesJumpRef.current = null;
      setFilesFeedMode(false);
      setDashSlideIdx(0);
    }
    // ...and the tree feed (defensive parity — the header back arrow closes
    // it earlier via closeTreeCard; this covers every other caller)
    if (navNow().treeFeedMode) {
      setTreeFeedMode(false);
      setTreeFeedTestId(null);
      setDashSlideIdx(0);
    }
    const target = libReturnViewRef.current === 'shelf' ? 'shelf' : 'library';
    const top = gridScrollTopRef.current;
    setDashView(target);
    if (top > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = dashFeedRef.current;
        if (el && el.clientHeight > 0) el.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
      }));
    }
  };

  // PROFILE PAGE (view extracted to src/components/pages/profile-view.tsx)
  if (effectivePage === 'profile') {
    return (
      <ProfileView
        avatarInputRef={avatarInputRef}
        handleAvatarFile={handleAvatarFile}
        saveProfileName={saveProfileName}
        saveBgStyle={saveBgStyle}
        handleLogout={handleLogout}
        handleDeleteAccount={handleDeleteAccount}
      />
    );
  }

  // --- CARD-COLOR UNIQUENESS ------------------------------------------------
  // Colors already worn by the user's OTHER tests. Selecting an identical
  // card color is BLOCKED at the picker: the same-color cards would be
  // indistinguishable in the library/shelf grids. Auto (coverColor = '')
  // is never blocked — it is not an explicit choice.
  const usedCoverColors = (() => {
    const used = new Map<string, string>();
    const collect = (list?: Test[]) => (list || []).forEach(x => {
      if (!x || !x.coverColor || x.id === (editingTestId || '')) return;
      used.set(x.coverColor.toUpperCase(), x.title);
    });
    const mine = queryClient.getQueryData<any>(feedKey('mine'));
    mine?.pages?.forEach((p: any) => collect(p?.items));
    return used;
  })();

  const onCoverColorPick = (hex: string) => {
    const taken = usedCoverColors.get((hex || '').toUpperCase());
    if (taken) {
      // The picker fires onChange continuously while dragging — throttle the
      // rejection toast so the drag never spams.
      const now = Date.now();
      if (now - lastColorToastAt.current > 1200) {
        lastColorToastAt.current = now;
        toast({ title: t('colorTakenToast', { title: taken }), variant: 'destructive' });
      }
      return; // identical color selection is rejected — the value stays
    }
    setTestCoverColor(hex);
  };

  const editorBody = (
    <>
          <Card className="rounded-4xl border border-black bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setEditorInfoExpanded(v => !v)}
              className="w-full flex items-center gap-1.5 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-base">{t('testInformation')}</span>
              {editorInfoExpanded ? (
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-auto shrink-0" />
              )}
            </button>
            <Collapse open={editorInfoExpanded} className="pt-0">
            <CardContent className="space-y-4 !pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('testTitle')}</Label>
                  <Input value={testTitle} onChange={e => setTestTitle(e.target.value)} placeholder={t('testTitlePh')} />
                </div>
                <div className="space-y-2">
                  <Label>{t('tags')}</Label>
                  <div className="relative">
                    <div
                      className="flex flex-wrap items-center gap-1.5 min-h-[42px] w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm cursor-text"
                      onClick={() => document.getElementById('tag-input-field')?.focus()}
                    >
                      {testTags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#FFF0D9] border border-black/15 px-2 py-0.5 text-xs font-medium">
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            aria-label={`Remove tag ${tag}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        id="tag-input-field"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onFocus={() => {
                          setTagsOpen(true);
                          api.getTags().then(setAllTags).catch(() => {});
                        }}
                        onBlur={() => setTimeout(() => setTagsOpen(false), 150)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
                            e.preventDefault();
                            addTag(tagInput);
                          } else if (e.key === 'Backspace' && !tagInput && testTags.length > 0) {
                            setTestTags(testTags.slice(0, -1));
                          }
                        }}
                        placeholder={testTags.length === 0 ? t('tagPh') : ''}
                        className="flex-1 min-w-[7rem] bg-transparent outline-none text-sm py-1"
                      />
                    </div>
                    {tagsOpen && tagSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-black/10 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                        {tagSuggestions.map(t => (
                          <button
                            key={t}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); addTag(t); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                          >
                            <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{t('tagHint')}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('description')}</Label>
                <Textarea value={testDescription} onChange={e => setTestDescription(e.target.value)} placeholder={t('descriptionPh')} rows={2} />
              </div>
              {/* Publication variant — the SAME option-card style as the share
              selector on the test card. The choice is SAVED with the test and
              applies to the test AND its attached files: «Только по ссылке» keeps
              it out of the community feed (link opens it for anyone who has it),
              «Всему сообществу» makes test + files public. A VERSION of another
              test can never be public (server-enforced) — the whole selector is
              hidden while editing a version, nothing to choose. */}
              {!editingTestIsVersion && (
              <div className="space-y-2">
                <Label>{t('publishVariant')}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTestIsPublic(false)}
                    className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                      !testIsPublic
                        ? 'border-primary bg-[#FFE8DE] shadow-md'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link2 className="w-4 h-4 text-cta shrink-0" />
                      <span className="font-semibold text-sm">{t('shareOptLink')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('shareOptLinkSub')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestIsPublic(true)}
                    className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                      testIsPublic
                        ? 'border-primary bg-[#FFE8DE] shadow-md'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm">{t('shareOptCommunity')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('shareOptCommunitySub')}</p>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{t('publishNote')}</p>
              </div>
              )}
            </CardContent>
            </Collapse>
          </Card>

          {/* Attached files — collapsed to one line by default, same expand/collapse as the test card */}
          <Card className="rounded-4xl border border-black bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setEditorFilesExpanded(v => !v)}
              className="w-full flex items-center gap-1.5 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
            >
              <Paperclip className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-base">{t('attachedFiles', { n: formAttachments.length })}</span>
              {editorFilesExpanded ? (
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-auto shrink-0" />
              )}
            </button>
            <Collapse open={editorFilesExpanded} keepMountedOnceShown>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground mb-3">
                  {t('editorFilesHint')}
                </p>
                <AttachmentsEditor items={formAttachments} onChange={setFormAttachments} />
              </CardContent>
            </Collapse>
          </Card>

          {/* Cover customization: science icon pack + card color */}
          <Card className="rounded-4xl border border-black bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setEditorCoverExpanded(v => !v)}
              className="w-full flex items-center gap-1.5 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
            >
              <Palette className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-base">{t('cover')}</span>
              {editorCoverExpanded ? (
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-auto shrink-0" />
              )}
            </button>
            <Collapse open={editorCoverExpanded}>
            <CardContent className="space-y-4 !pt-0">
              <p className="text-xs text-muted-foreground">
                {t('coverHint')}
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">{t('cardColor')}</Label>
                  <button
                    type="button"
                    onClick={() => setTestCoverColor('')}
                    title={t('autoIcon')}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border-2 transition-all ${
                      testCoverColor === '' ? 'border-cta bg-[#FFF0D9] text-cta font-semibold' : 'border-black/10 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {t('auto')}
                  </button>
                </div>
                <PhotoshopColorPicker value={testCoverColor || '#E3EEFF'} onChange={onCoverColorPick} />
                {usedCoverColors.size > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground">{t('usedColorsLabel')}:</span>
                    {[...usedCoverColors.entries()].slice(0, 14).map(([hex, title]) => (
                      <span
                        key={hex}
                        title={`${t('colorTakenToast', { title })}`}
                        aria-label={`${t('usedColorsLabel')}: ${title}`}
                        className="relative w-5 h-5 rounded-md border border-black/15 shrink-0"
                        style={{ backgroundColor: hex }}
                      >
                        <Ban className="absolute inset-0 m-auto w-3 h-3 text-white drop-shadow" />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
            </Collapse>
          </Card>

          <Card className="rounded-4xl border border-black bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setEditorQuestionsExpanded(v => !v)}
              className="w-full flex items-center gap-1.5 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
            >
              <ListChecks className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-base">{t('questionsN', { n: questions.length })}</span>
              {editorQuestionsExpanded ? (
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-auto shrink-0" />
              )}
            </button>
            <Collapse open={editorQuestionsExpanded} keepMountedOnceShown>
            <CardContent className="!pt-0">
              <div className="flex justify-end gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={() => setQuestions(shuffleArray(questions))}>
                  <Shuffle className="w-3 h-3 mr-1" /> {t('shuffleAll')}
                </Button>
                <Button size="sm" onClick={addQuestion}>
                  <Plus className="w-3 h-3 mr-1" /> {t('addQuestion')}
                </Button>
              </div>

              <div className="space-y-4">
                {questions.map((q, idx) => (
                  <Card key={idx} className="rounded-3xl border border-black bg-white">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{t('questionN', { n: idx + 1 })}</Badge>
                        <Button variant="ghost" size="sm" className="text-destructive h-7 w-7 p-0" onClick={() => removeQuestion(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea value={q.text} onChange={e => updateQuestion(idx, 'text', e.target.value)} placeholder={t('questionTextPh')} rows={2} />
                      {/* Question photo — uploaded to the Telegram channel, shown
                      above the answers when taking the test */}
                      <div className="flex items-center gap-2">
                        <label
                          className={`h-7 rounded-full border px-2.5 text-xs flex items-center gap-1.5 cursor-pointer select-none ${photoBusy === `q-${idx}` ? 'border-primary bg-[#FFE8DE] text-primary' : 'border-black hover:bg-muted/50'}`}
                          title={t('qPhotoTip')}
                        >
                          {photoBusy === `q-${idx}`
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <ImagePlus className="w-3.5 h-3.5" />}
                          <span className="truncate">{q.imageUrl ? t('changePhoto') : t('addPhoto')}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onClick={e => { (e.target as HTMLInputElement).value = ''; }}
                            onChange={e => pickQuestionPhoto(idx, e.target.files?.[0])}
                          />
                        </label>
                        {q.imageUrl && (
                          <>
                            <span className="h-9 w-14 rounded-lg overflow-hidden border border-black/15 shrink-0">
                              <img src={imgSrc(q.imageUrl)} alt="" className="w-full h-full object-cover" />
                            </span>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-destructive shrink-0"
                              onClick={() => clearQuestionPhoto(idx)}
                              title={t('removePhoto')} aria-label={t('removePhoto')}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {photoBusy === `q-${idx}` && <span className="text-xs text-muted-foreground truncate">{t('photoUploading')}</span>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {['A', 'B', 'C', 'D'].map(letter => {
                          const optImg = q.optionImages?.[letter];
                          return (
                          <div key={letter} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              q.correctAnswer === letter ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                            }`}>
                              {letter}
                            </div>
                            <Input
                              value={q[`option${letter}` as keyof Question] as string}
                              onChange={e => updateQuestion(idx, `option${letter}`, e.target.value)}
                              placeholder={t('optionL', { letter })}
                              className="text-sm"
                            />
                            {/* Option photo chip: empty → plus tile opens the picker;
                            set → live thumbnail (click replaces) + red dot removes */}
                            <span className="relative shrink-0" title={t('oPhotoTip', { letter })}>
                              <label
                                className={`block w-8 h-8 rounded-lg overflow-hidden cursor-pointer ${photoBusy === `o-${idx}-${letter}` ? 'ring-2 ring-primary' : 'ring-1 ring-black/15'}`}
                              >
                                {optImg ? (
                                  <img src={imgSrc(optImg.u)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className={`w-full h-full flex items-center justify-center ${photoBusy === `o-${idx}-${letter}` ? 'bg-[#FFE8DE]' : 'bg-muted'}`}>
                                    {photoBusy === `o-${idx}-${letter}`
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                      : <ImagePlus className="w-3.5 h-3.5 text-muted-foreground" />}
                                  </span>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onClick={e => { (e.target as HTMLInputElement).value = ''; }}
                                  onChange={e => pickOptionPhoto(idx, letter, e.target.files?.[0])}
                                />
                              </label>
                              {optImg && (
                                <button
                                  type="button"
                                  onClick={() => clearOptionPhoto(idx, letter)}
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center shadow"
                                  title={t('removePhoto')} aria-label={t('removePhoto')}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </span>
                            <input
                              type="radio"
                              name={`correct-${idx}`}
                              checked={q.correctAnswer === letter}
                              onChange={() => updateQuestion(idx, 'correctAnswer', letter)}
                              className="shrink-0 accent-[#fe5933]"
                              title={t('markCorrect')}
                            />
                          </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
            </Collapse>
          </Card>
    </>
  );

  // Window switcher shared by EVERY dashboard window (files / AI / chat /
  // edit) — the same header dropdown the taking screen's windows wear. The
  // entries describe the test whose window is CURRENTLY open, so switching
  // from any window keeps you inside the same test.
  const dashWindowTest: any = (dashFilesOpen && dashFiles) ? { id: dashFiles.testId, title: dashFiles.title }
    : dashGroupTestId ? { id: dashGroupTestId, title: dashGroupTitleRef.current }
    : aiCardTestId ? { id: aiCardTestId, title: aiCardTitleRef.current }
    : (editOpen && currentTest) ? { id: String((currentTest as any).id), title: String((currentTest as any).title || '') }
    : null;
  const dashWindowFilesCount = (() => {
    if (!dashWindowTest) return 0;
    if (dashFilesOpen && dashFiles && dashFiles.testId === dashWindowTest.id) return dashFiles.items.length;
    return dashFilesCountRef.current[dashWindowTest.id]
      || ((dashFullTests as any)[dashWindowTest.id]?.attachments?.length as number | undefined)
      || (String((currentTest as any)?.id || '') === dashWindowTest.id ? (((currentTest as any).attachments || []).length as number) : 0)
      || 0;
  })();
  const dashSheetOptions: SheetOption[] = [
    ...((dashWindowFilesCount > 0) ? [{
      key: 'files' as const,
      label: t('files', { n: dashWindowFilesCount }),
      icon: <Paperclip className="w-3.5 h-3.5" />,
      active: dashFilesOpen,
    }] : []),
    { key: 'ai', label: t('aiTutor'), icon: <MessageSquare className="w-3.5 h-3.5" />, active: !!aiCardTestId },
    { key: 'group' as const, label: t('chat'), icon: <MessageCircle className="w-3.5 h-3.5" />, active: !!dashGroupTestId },
    // «Изменить» — TEST-only: SMM windows (event / specialist) never offer it
    ...(((dashWindowTestRef.current as any)?.smmKind) ? [] : [{
      key: 'edit' as const,
      label: t('editTest'),
      icon: <Pencil className="w-3.5 h-3.5" />,
      active: editOpen,
    }]),
  ];
  const dashSwitcher = { options: dashSheetOptions, onSelect: (key: string) => {
    if (key === 'edit') {
      // SMM entities have no editor (the brief: no «Изменить» on SMM cards)
      if ((dashWindowTestRef.current as any)?.smmKind) return;
      // the edit window for the SAME test the switcher lives on — the stashed
      // card test keeps the creatorId for the copy-on-edit path
      setDashFilesOpen(false);
      if (dashWindowTestRef.current?.id) startEditTest(dashWindowTestRef.current);
      return;
    }
    const t0: any = dashWindowTest ? { id: dashWindowTest.id, title: dashWindowTest.title } : null;
    if (!t0) return;
    if (key === 'files') { setEditOpen(false); openCardFiles(t0); }
    else if (key === 'ai') { setEditOpen(false); setDashFilesOpen(false); openAiDiscuss(t0); }
    else if (key === 'group') { setEditOpen(false); setDashFilesOpen(false); openCardGroupChat(t0); }
  } };

  // DASHBOARD (view extracted to src/components/pages/dashboard-view.tsx)
  if (effectivePage === 'dashboard') {
    return (
      <>
        <DashboardView
          tests={tests}
          bookmarkIds={bookmarkIds}
          loading={loading}
          feedLoading={feedLoading}
          viewingLoading={viewingLoading}
          fileSlides={fileSlides}
          dashFeedRef={dashFeedRef}
          feedApiRef={feedApiRef}
          feedSentinelRef={feedSentinelRef}
          onDashCommit={onDashCommit}
          jumpToTest={jumpToTest}
          closeUserLibrary={closeUserLibrary}
          closeGridFiles={closeGridFiles}
          closeFilesCard={closeFilesCard}
          backToLibrary={backToLibrary}
          startCreateTest={startCreateTest}
          startEditTest={startEditTest}
          openFromLibrary={openFromLibrary}
          toggleBookmark={toggleBookmark}
          openUserLibrary={openUserLibrary}
          startFromDashboard={startFromDashboard}
          toggleGridFiles={toggleGridFiles}
          openTreeCard={openTreeCard}
          closeTreeCard={closeTreeCard}
          toggleGridTree={toggleGridTree}
          closeGridTree={closeGridTree}
          openAiDiscuss={openAiDiscuss}
          openCardFiles={openCardFiles}
          openCardGroupChat={openCardGroupChat}
          doShareLink={doShareLink}
          doMakePublic={doMakePublic}
          handleDeleteTest={handleDeleteTest}
          exitFilesMode={exitFilesMode}
          openFilesCard={openFilesCard}
          cycleDashView={cycleDashView}
          toggleDiscoverMode={toggleDiscoverMode}
          smmFeed={smmFeed}
          smmLoading={smmLoading}
          smmBmSpecialists={smmBmSpecialists}
          smmBmEvents={smmBmEvents}
          mySmmRole={mySmmRole}
          openSmmWizard={openSmmWizard}
          toggleSmmBookmark={toggleSmmBookmark}
          gotoSmmPage={gotoSmmPage}
          onCreateRequest={startCreateRequest}
          gotoRequestsWithEdit={() => { useSmmStore.getState().setRequestsEditMode(true); setPage('smm-requests'); }}
          onSwitchSmmRole={switchSmmRole}
          switchingRole={switchingRole}
        />
        {/* THE DASHBOARD AI WINDOW — «Обсудить с ИИ»: opens STRAIGHT INTO the
        conversation (the test's most recent thread, or a fresh one); the AI
        holds the WHOLE test context. The replacement of the version-tree
        entry on every library/shelf/feed card.
        Docked to the RIGHT edge on desktop (the AI chat lives in the right
        panel, like on the taking screen); the mobile variant brings its own
        fixed bottom-sheet overlay, the wrapper stays gesture-transparent. */}
        {aiCardTestId && (
          <div className="fixed inset-0 z-50 flex items-center justify-end lg:p-5 pointer-events-none">
            <div className="pointer-events-auto max-h-full">
              <AiChatPanel
                open
                onClose={closeAiCard}
                subtitle={(aiCardTestId && chatThreads[chatThreadId]?.title) || aiCardTitleRef.current}
                messages={chatMessages}
                loading={chatLoading}
                input={chatInput}
                onInputChange={setChatInput}
                onSend={() => sendTestChatMessage()}
                endRef={chatEndRef}
                inputPlaceholder={t('aiTestChatPlaceholder')}
                historyOpen={chatHistoryOpen}
                onToggleHistory={() => setChatHistoryOpen(v => !v)}
                threads={aiThreadMetas}
                activeThreadId={chatThreadId}
                onSelectThread={selectChatThread}
                historyLabel={t('chatHistory')}
                noChatsLabel={t('noChatsYet')}
                onNewChat={startNewDashChat}
                newChatLabel={t('newChat')}
                switcher={dashSwitcher}
              />
            </div>
          </div>
        )}
        {/* THE DASHBOARD FILES WINDOW — «Файлы» from a card: the SAME window
        format as the AI window — right-docked panel on desktop (the same
        fixed wrapper), resizable bottom sheet on mobile. The header wears
        the title + the test's name; the body lists the attachments. */}
        {dashFiles && (
          <AttachmentsBottomSheet
            items={dashFiles.items}
            open={dashFilesOpen}
            onOpenChange={v => { if (!v) closeCardFiles(); }}
            hideLauncher
            title={t('attachedFiles', { n: dashFiles.items.length })}
            subtitle={dashFiles.title}
            switcher={dashSwitcher}
          />
        )}
        {dashFiles && dashFilesSideMounted && (
          <div className="hidden lg:flex fixed inset-0 z-50 items-center justify-end p-5 pointer-events-none">
            <div className="pointer-events-auto">
              <AttachmentsSidePanel
                items={dashFiles.items}
                onClose={closeCardFiles}
                title={t('attachedFiles', { n: dashFiles.items.length })}
                subtitle={dashFiles.title}
                switcher={dashSwitcher}
              />
            </div>
          </div>
        )}
        {/* THE DASHBOARD GROUP CHAT WINDOW — «Чат» from a card: the SAME
        window format as the files window — right-docked panel on desktop
        (the same fixed wrapper the AI window wears), resizable bottom sheet
        on mobile (MobileChatSheet brings its own fixed overlay). Everyone's
        chat about THIS test; the poll keeps it live without WebSockets. */}
        {dashGroupTestId && (
          <div className="fixed inset-0 z-50 flex items-center justify-end lg:p-5 pointer-events-none">
            <div className="pointer-events-auto max-h-full">
              <GroupChatPanel
                open
                onClose={closeCardGroupChat}
                title={t('chat')}
                subtitle={dashGroupTitleRef.current}
                messages={groupMessages}
                currentUserId={user?.id}
                input={groupInput}
                onInputChange={setGroupInput}
                onSend={sendDashGroupMessage}
                sending={groupSending}
                endRef={groupEndRef}
                inputPlaceholder={t('messageGroup')}
                onOpenProfile={openUserLibrary}
                openProfileLabel={t('openProfile')}
                switcher={dashSwitcher}
              />
            </div>
          </div>
        )}
        {/* THE DASHBOARD EDIT WINDOW — «Редактировать» from a card opens the
        SAME window the taking screen uses (resizable bottom sheet on mobile,
        centered dialog on desktop, header switcher, Save) instead of the
        full-page editor. */}
        {editOpen && !!editingTestId && (
          <ResizableSheetFrame
            open={editOpen}
            onClose={() => setEditOpen(false)}
            initialVh={0.85}
            minVh={0.4}
            maxW="max-w-3xl"
            header={
              <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                <SheetHeaderSwitcher
                  icon={<Pencil className="w-4 h-4 text-white" />}
                  title={t('editTest')}
                  subtitle={currentTest?.title}
                  options={dashSwitcher.options}
                  onSelect={dashSwitcher.onSelect}
                />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setEditOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            }
            body={
              <div className="px-4 py-4">
                <div className="max-w-3xl mx-auto space-y-6">
                  {editorBody}
                </div>
              </div>
            }
            footer={
              <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                <Button onClick={() => handleSaveTest(false, true)} disabled={loading} className="w-full rounded-full bg-primary hover:bg-primary/90">
                  {loading ? t('saving') : t('saveTest')}
                </Button>
              </div>
            }
          />
        )}
        {/* Blocked trivial copy → the rule dialog (dashboard path) */}
        <GateDialog test={gateDialogTest} onClose={() => setGateDialogTest(null)} />
        {/* Version naming sheet — fires from the first share-by-link on a card */}
        <VersionNameSheet
          open={versionNameGate !== null}
          mode={versionNameGate?.mode || 'share'}
          testTitle={versionNameGate?.title || ''}
          value={versionNameValue}
          onChange={setVersionNameValue}
          onCancel={cancelVersionName}
          onConfirm={confirmVersionName}
          busy={versionNameBusy}
        />
      </>
    );
  }

  // CREATE / EDIT TEST (view extracted to src/components/pages/create-edit-view.tsx)
  if (effectivePage === 'create-test' || effectivePage === 'edit-test') {
    return (
      <>
        <CreateEditView
          editorBody={editorBody}
          handleSaveTest={handleSaveTest}
          goHome={goHome}
        />
        {/* Blocked trivial-copy save → the rule dialog (editor save path) */}
        <GateDialog test={gateDialogTest} onClose={() => setGateDialogTest(null)} />
        {/* Version naming sheet — the first save of an existing test names it first */}
        <VersionNameSheet
          open={versionNameGate !== null}
          mode={versionNameGate?.mode || 'save'}
          testTitle={versionNameGate?.title || ''}
          value={versionNameValue}
          onChange={setVersionNameValue}
          onCancel={cancelVersionName}
          onConfirm={confirmVersionName}
          busy={versionNameBusy}
        />
      </>
    );
  }

  // START TEST (view extracted to src/components/pages/start-test-view.tsx)
  if (effectivePage === 'start-test' && currentTest) {
    return (
      <StartTestView
        startTest={startTest}
        continueTestWith={continueTestWith}
        goHome={goHome}
      />
    );
  }

  // SMM WIZARD — «Подать заявку / Пригласить» in the same full-screen window
  // the question cards used: stages as slides, the bottom panel switches and
  // confirms, the review is the swipeable results-style run of cards.
  if (effectivePage === 'smm-wizard' && smmNow().wizardMode) {
    return (
      <SmmWizardView
        goHome={() => setPage('dashboard')}
        onConfirm={confirmSmmWizard}
        onCreateEvent={() => setPage('smm-events')}
      />
    );
  }
  // CREATE / EDIT EVENT — the full-page editor, the visual twin of the test
  // editor (create-edit-view): the customer creates events with the SAME
  // UX the tests have, only the text is different.
  if (effectivePage === 'create-event') {
    return (
      <SmmEventEditorView
        goHome={() => setPage('smm-events')}
        handleSaveEvent={handleSaveEvent}
        busy={eventSaving}
      />
    );
  }
  // SMM EVENTS — the customer's events page, the dashboard's twin: the same
  // top panel and dock, the same TikTok / library / shelf views with EVENT
  // cards, the ownership-scoped edit/share/publish/delete ladder and the
  // «Пригласить специалиста» wizard entry.
  if (effectivePage === 'smm-events') {
    return (
      <>
        <SmmEventsView
          user={effectiveUser ? { id: effectiveUser.id, name: effectiveUser.name, email: (effectiveUser as any).email || '', image: (effectiveUser as any).image || null } : null}
          myAvatar={myAvatar}
          events={eventsItems}
          eventsLoading={eventsLoading}
          pinnedEventIds={smmBmEvents}
          scope={eventsScope}
          onScopeChange={changeEventsScope}
          focusEventId={focusEventId}
          goHome={() => setPage('dashboard')}
          onCreateEvent={startCreateEvent}
          onEditEvent={startEditEvent}
          onDeleteEvent={requestDeleteEvent}
          onShareEvent={doShareEventLink}
          onPublicEvent={doMakeEventPublic}
          onInvite={openSmmInviteForEvent}
          onChat={(ev: any) => openSmmGroupChat('event', ev)}
          onFiles={(ev: any) => openSmmFiles('event', ev)}
          onToggleBookmark={(id: string) => void toggleSmmBookmark('event', id)}
          onOpenProfileUser={(u: any) => openUserLibrary(u)}
          onOpenOtherEvent={(o: any) => {
            // The event card's «customer's other events» row: jump to THAT
            // event — switch to the general library, fetch it if missing.
            changeEventsScope('discover');
            setEventsItems(prev => {
              if (prev.some(x => x.id === o.id)) return prev;
              api.getSmmEvent(o.id).then((detail: any) => {
                setEventsItems(p => (p.some(x => x.id === o.id) ? p : [detail, ...p]));
                setFocusEventId(o.id);
              }).catch(() => {});
              return prev;
            });
            setFocusEventId(o.id);
          }}
          onOpenProfilePage={() => setPage('profile')}
          onCycleLang={cycleLang}
          onGotoRoles={(rs: 'mine' | 'public') => { useSmmStore.getState().setRolesScopeRequest(rs); setPage('smm-roles'); }}
        />
        <AlertDialog open={!!deleteEventId} onOpenChange={() => setDeleteEventId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('smmDeleteEventQ')}</AlertDialogTitle>
              <AlertDialogDescription>{t('smmDeleteEventWarning')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteEvent} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
  // SMM INBOX — «Принятые запросы»: the requests the specialist RECEIVED
  // (invitations from customers) + the statuses of the sent ones. The same
  // top panel + the same specialist dock as every other specialist page.
  if (effectivePage === 'smm-inbox') {
    return (
      <SmmInboxView
        goHome={() => setPage('dashboard')}
        gotoLibrary={(discover: boolean) => { if (discover !== navNow().discoverMode) toggleDiscoverMode(); setPage('dashboard'); }}
        gotoRequests={() => setPage('smm-requests')}
        onCycleLang={cycleLang}
      />
    );
  }

  // SMM REQUESTS — «Отправленные запросы»: my запросы + the public templates
  // library. The dashboard's twin with the request cards (the full ladder).
  if (effectivePage === 'smm-requests') {
    return (
      <SmmRequestsView
        user={effectiveUser ? { id: effectiveUser.id, name: effectiveUser.name, email: (effectiveUser as any).email || '' } : null}
        myAvatar={myAvatar}
        requests={requestsItems}
        loading={requestsLoading}
        scope={requestsScope}
        onScopeChange={changeRequestsScope}
        pinnedRequestIds={smmBmRequests}
        focusRequestId={focusRequestId}
        initialEditMode={requestsEditModeFlag}
        onInitialEditConsumed={() => useSmmStore.getState().setRequestsEditMode(false)}
        goHome={() => setPage('dashboard')}
        onCreateRequest={startCreateRequest}
        onEditRequest={startEditRequest}
        onDeleteRequest={(rq: any) => setDeleteRequestId(rq.id)}
        onShareRequest={doShareRequestLink}
        onPublicRequest={doMakeRequestPublic}
        onTakeTemplate={takeRequestTemplate}
        onFillRequest={startFillRequest}
        onSendRequest={openSmmSendWizard}
        onChat={(rq: any) => openSmmGroupChat('specialist', { id: rq.specialistId || rq.specialist?.id, name: rq.specialist?.name || rq.title })}
        onAiChat={(rq: any) => openAiDiscuss({ ...rq, id: `smm-r:${rq.id}`, title: rq.title, smmKind: 'request' })}
        onToggleBookmark={(id: string) => void toggleSmmBookmark('request', id)}
        onOpenProfileUser={(u: any) => openUserLibrary(u)}
        onOpenProfilePage={() => setPage('profile')}
        onCycleLang={cycleLang}
        gotoLibrary={(discover: boolean) => { if (discover !== navNow().discoverMode) toggleDiscoverMode(); setPage('dashboard'); }}
        gotoInbox={() => setPage('smm-inbox')}
      />
    );
  }

  // SMM REQUEST EDITOR — the «+» / «изменить» full-page editor, the visual
  // twin of the test editor (title, summary, cover, steps, save bar).
  if (effectivePage === 'smm-request-editor') {
    return (
      <SmmRequestEditorView
        goHome={() => setPage('smm-requests')}
        handleSaveRequest={handleSaveRequest}
        busy={requestSaving}
      />
    );
  }

  // SMM REQUEST FILL — the test-taking twin: one STEP CARD per slide, the
  // answers save on the last slide.
  if (effectivePage === 'smm-request-fill') {
    return (
      <SmmRequestFillView
        request={fillRequest}
        busy={fillBusy}
        onAnswerChange={handleFillAnswerChange}
        onSaveAnswers={handleFillSaveAnswers}
        goHome={() => { setFillRequest(null); setPage('smm-requests'); }}
      />
    );
  }

  // SMM ROLES — the customer's «Личные роли» (their roles across their
  // events) + «Общие роли» (public task templates people share).
  if (effectivePage === 'smm-roles') {
    return (
      <SmmRolesView
        user={effectiveUser ? { id: effectiveUser.id, name: effectiveUser.name, email: (effectiveUser as any).email || '' } : null}
        myAvatar={myAvatar}
        roles={rolesItems}
        loading={rolesLoading}
        scope={rolesScope}
        onScopeChange={changeRolesScope}
        myEvents={myEventsCache}
        goHome={() => setPage('dashboard')}
        onCreateEvent={startCreateEvent}
        onEditRole={doEditRoleInline}
        onDeleteRole={doDeleteRoleTemplate}
        onShareRole={doShareRoleTemplate}
        onAttachRole={(role: any, eventId: string) => doAttachRoleTemplate(role.id, eventId)}
        onOpenEvent={(ev: any) => { changeEventsScope('mine'); setEventsItems(prev => (prev.some(x => x.id === ev.id) ? prev : prev)); setFocusEventId(ev.id); setPage('smm-events'); }}
        onChat={(role: any) => openSmmGroupChat('event', role.event || { id: role.eventId, name: role.name })}
        onAiChat={(role: any) => openAiDiscuss({ ...role, id: `smm-role:${role.id}`, title: role.name, smmKind: 'role' })}
        onToggleBookmark={(id: string) => void toggleSmmBookmark('role', id)}
        onOpenProfileUser={(u: any) => openUserLibrary(u)}
        onOpenProfilePage={() => setPage('profile')}
        onCycleLang={cycleLang}
        gotoLibrary={(discover: boolean) => { if (discover !== navNow().discoverMode) toggleDiscoverMode(); setPage('dashboard'); }}
        gotoEvents={() => setPage('smm-events')}
      />
    );
  }

  // TAKE TEST + RESULTS (view extracted to src/components/pages/take-test-view.tsx)
  if (effectivePage === 'take-test' && shuffledQuestions.length > 0) {
    // GUEST GATE: an anonymous share-link visitor takes the test and reaches
    // NOTHING else. Home (library/dashboard), the AI tutor, the test chat,
    // another author's library and the editor all open the registration wall
    // instead — a bottom sheet that looks exactly like the chat windows.
    // Retrying stays free (same test, still taking scope). Every guard reads
    // the session store fresh (isGuestNow) — no stale closures after login.
    const wall = (ctx: 'home' | 'chat' | 'edit') => { setRegisterWall(ctx); };
    return (
      <>
        <TakeTestView
          goHome={() => { if (isGuestNow()) return wall('home'); goHome(); }}
          openChat={(questionId, userAnswer, opts) => { if (isGuestNow()) return wall('chat'); openChat(questionId, userAnswer, opts); }}
          closeChat={closeChat}
          openGroupChat={() => { if (isGuestNow()) return wall('chat'); openGroupChat(); }}
          closeGroupChat={closeGroupChat}
          selectChatThread={selectChatThread}
          sendChatMessage={sendChatMessage}
          sendGroupMessage={sendGroupMessage}
          openUserLibrary={(u) => { if (isGuestNow()) return wall('home'); openUserLibrary(u); }}
          startEditTestInTake={() => { if (isGuestNow()) return wall('edit'); startEditTestInTake(); }}
          selectAnswer={selectAnswer}
          submitTest={submitTest}
          openStartTest={(test) => {
            if (isGuestNow()) {
              // Guests skip the start page: Retry restarts THIS test in place.
              if (test && currentTest && test.id === currentTest.id) startGuestTake(test);
              else wall('home');
              return;
            }
            void openStartTest(test);
          }}
          handleSaveTest={handleSaveTest}
          cycleDashView={cycleDashView}
          editorBody={editorBody}
          chatEndRef={chatEndRef}
          groupEndRef={groupEndRef}
        />
        <RegisterWallSheet
          open={registerWall !== null}
          context={registerWall || 'home'}
          onClose={() => setRegisterWall(null)}
          onRegister={() => {
            setRegisterWall(null);
            // The taking session (stores + localStorage snapshot) survives the
            // detour; handleAuth resumes it at the saved position.
            useSessionStore.getState().setAuthMode('signup');
            setPage('auth');
          }}
        />
        {/* Version naming sheet — the first save from the Edit-Test sheet in
        the taking screen names the version before the save proceeds */}
        <VersionNameSheet
          open={versionNameGate !== null}
          mode={versionNameGate?.mode || 'save'}
          testTitle={versionNameGate?.title || ''}
          value={versionNameValue}
          onChange={setVersionNameValue}
          onCancel={cancelVersionName}
          onConfirm={confirmVersionName}
          busy={versionNameBusy}
        />
      </>
    );
  }

  // HISTORY (view extracted to src/components/pages/history-view.tsx)
  if (effectivePage === 'history') {
    return <HistoryView goHome={goHome} />;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Professional architecture: the entire app runs inside ONE QueryClientProvider.
// TanStack Query is the industry-standard async state layer — the feed, the
// user libraries and the bookmarks all live in its keyed cache (see
// src/lib/feed-queries.ts). The lazy useState keeps the client per-mount and
// never blocks the server-rendered first paint.
// ---------------------------------------------------------------------------
function AppRoot({ authed, guestTest }: { authed: boolean; guestTest?: string | null }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));
  // SSR parity seed: the auth cookie decides the landing page server-side —
  // and a no-cookie visitor with ?test=<id> lands on the GUEST BOOT splash
  // (that one test only), never on the login card. The useState initializer
  // runs on EVERY server render (fresh per request) and once per client
  // mount — always BEFORE AppRootInner takes its first store snapshot, so
  // the server HTML and the first client frame agree and no cross-request
  // state can leak between SSR renders.
  useState(() => {
    useNavStore.setState({ page: authed ? 'dashboard' : (guestTest ? 'guest-boot' : 'auth') });
    return 0;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AppRootInner authed={authed} guestTest={guestTest} />
    </QueryClientProvider>
  );
}

export default AppRoot;

// ---------------------------------------------------------------------------
// GATE DIALOG — the version rule explainer. When a copy of somebody's test is
// saved/shared with fewer than 2 changed questions/answers, the server
// rejects it (VERSION_TOO_SIMILAR) and THIS dialog explains why: a version
// becomes shareable only after a real contribution (2+ questions/answers).
// The old "write a note instead" alternative was removed from the product.
// ---------------------------------------------------------------------------
function GateDialog({ test, onClose }: { test: { id: string; title: string } | null; onClose: () => void }) {
  const lang = useSessionStore(s => s.lang);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  if (!test) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/55 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl screen-enter">
        <div className="flex items-start gap-3 mb-3">
          <span className="w-10 h-10 rounded-2xl bg-[#FFE8DE] text-primary flex items-center justify-center shrink-0">
            <TreeDeciduous className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold leading-tight">{t('gateTitle')}</h3>
            <p className="text-xs text-muted-foreground truncate">{test.title}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t('gateDesc')}</p>
        <div className="flex justify-end">
          <Button className="rounded-full h-9 px-5 bg-primary hover:bg-primary/90" onClick={onClose}>
            {t('ok')}
          </Button>
        </div>
      </div>
    </div>
  );
}
