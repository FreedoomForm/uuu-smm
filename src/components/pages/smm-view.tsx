'use client';

// ---------------------------------------------------------------------------
// SMM DASHBOARD — the mode-switcher dashboard built on the tests site:
//
//   TOP PANEL  [＋ context] [Изменить] | [Поиск] [Закладки] [Чаты] [Вид] [Яз] [Профиль]
//   MAIN       карточки (посты / мероприятия / специалисты) or the
//              закладки / чаты / Мои запросы window
//   BAR 1      контекстное действие (Подать заявку / Пригласить на мероприятие)
//   DOCK       [Личная библиотека | Публичная библиотека]
//   MODE DOCK  [СММ специалист | Заказчик]   ← the second bottom panel
//
// Personal/public = the SAME discoverMode toggle the tests dashboard used;
// the content source swaps by (mode × library).
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { tUI } from '@/lib/i18n';
import { CreatorStrip } from '@/components/shared-bits';
import {
  ArrowLeft, Bot, ChevronDown, ChevronUp, Compass, Edit, Film, Library, LayoutGrid, Loader2, MessageCircle, MessageSquare,
  Paperclip, Pencil, Play, Plus, Rows3, Search, Send, Star, Trash2, X, ClipboardList,
  Map as MapIcon,
} from 'lucide-react';
// Professional feed engine — the SAME Swiper setup the tests feed runs
// (vertical, one slide per view, mousewheel one-gesture-one-card).
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import { useSessionStore } from '@/stores/session-store';
import { useNavStore } from '@/stores/nav-store';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useProfileStore } from '@/stores/profile-store';
import { useSmmStore, smmNow, type SmmFilesTarget, type SmmCardChatTarget } from '@/stores/smm-store';
import type { SmmChatT, SmmEventT, SmmPostT, SmmRequestRowT, SmmRoleT, SmmSpecialistT, SmmProfileT } from '@/lib/app-types';

// The card windows — the SAME panels the test cards open (the dynamic
// imports keep them out of the first paint, like app-root does):
//   AiChatPanel    — «Обсудить с ИИ» (side panel on desktop / sheet on mobile)
//   GroupChatPanel — «Чат», everyone's group chat about THIS card
const AiChatPanel = dynamic(() => import('@/components/chat-panels').then(m => m.AiChatPanel), { ssr: false, loading: () => null });
const GroupChatPanel = dynamic(() => import('@/components/chat-panels').then(m => m.GroupChatPanel), { ssr: false, loading: () => null });
const AttachmentsList = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsList), { ssr: false, loading: () => null });
// The MAP window body (topWindow === 'map'): the photo-spots map embedded
// BETWEEN the top panel and the bottom docks — the page keeps both panels.
const SpotsEmbed = dynamic(() => import('@/components/pages/spots-map-view').then(m => m.SpotsEmbed), { ssr: false, loading: () => null });
// The ИИ-АГЕНТ sheet (the one-button platform automation — the tools page's
// replacement) + the profile BODY shown in a resizable sheet (the avatar's
// «всплывающая снизу страница»)
const SmmAgentSheet = dynamic(() => import('@/components/pages/smm-agent'), { ssr: false, loading: () => null });
import { ProfileBody, type ProfileViewProps } from './profile-view';
import { useExitMount } from '@/components/motion';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import { SheetHeaderSwitcher } from '@/components/sheet-switcher';
import type { SheetOption } from '@/components/pages/take-test/sheet-config';
import { SmmEventForm, SmmPostForm, type SmmFormHandle } from './smm-editors';

// One AI conversation about one SMM card (persisted in localStorage — the
// same deal the test dashboard's threads keep, but scoped to the SMM page)
interface SmmAiThread {
  id: string; // `${kind}:${cardId}`
  kind: 'event' | 'post' | 'specialist';
  cardId: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  updatedAt: number;
}
type AiMsg = { role: 'user' | 'assistant'; content: string };
import {
  BookmarkRow, ChatRow, RequestRow, SmmEventCardView, SmmPostCardView, SmmSpecialistCardView, smmSlideBgFor, type CardCtx,
} from './smm-cards';
import { fmtMoney, mediaSrc, SmmToast } from './smm-bits';

type AnyItem = ({ kind: 'post' } & SmmPostT) | ({ kind: 'event' } & SmmEventT) | ({ kind: 'specialist' } & SmmSpecialistT);

// Desktop (lg+) prev/next controls for the vertical feed — the SAME affordance
// the tests feed keeps (phones swipe; on desktop the wheel/keys already work,
// the buttons make it discoverable). Byte-for-byte the dashboard's FeedArrows.
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

// The feed engine parameters — byte-for-byte the tests feed's swiperParams
// (vertical, one slide per view, mousewheel one-gesture-one-card).
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

export default function SmmDashboard({ profileHandlers }: { profileHandlers?: ProfileViewProps } = {}) {
  const sessionUser = useSessionStore(s => s.user);
  const hydratedUser = useSessionStore(s => s.hydratedUser);
  const lang = useSessionStore(s => s.lang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  const myAvatar = useProfileStore(s => s.myAvatar);
  const effectiveUser = sessionUser || hydratedUser;
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const setPage = useNavStore(s => s.setPage);
  const dashView = useNavStore(s => s.dashView);
  const setDashView = useNavStore(s => s.setDashView);
  const discoverMode = useNavStore(s => s.discoverMode);
  const setDiscoverMode = useNavStore(s => s.setDiscoverMode);
  const libNarrow = useDashboardStore(s => s.libNarrow);
  const libWide = useDashboardStore(s => s.libWide);
  const libUltra = useDashboardStore(s => s.libUltra);

  const smmMode = useSmmStore(s => s.smmMode);
  const topWindow = useSmmStore(s => s.topWindow);
  const editMode = useSmmStore(s => s.editMode);
  const activeCardId = useSmmStore(s => s.activeCardId);
  const pickedApplyRole = useSmmStore(s => s.pickedApplyRole);
  const pickedInviteEvent = useSmmStore(s => s.pickedInviteEvent);
  const pickedInviteRole = useSmmStore(s => s.pickedInviteRole);
  const refreshNonce = useSmmStore(s => s.refreshNonce);
  const openChatId = useSmmStore(s => s.openChatId);
  const profileUserId = useSmmStore(s => s.profileUserId);
  const filesTarget = useSmmStore(s => s.filesTarget);
  const cardChat = useSmmStore(s => s.cardChat);

  // ── data ────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<AnyItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [myRoles, setMyRoles] = useState<{ id: string; name: string }[]>([]);
  const [myEvents, setMyEvents] = useState<{ id: string; title: string; format?: 'online' | 'offline' }[]>([]);
  const [bookmarks, setBookmarks] = useState<import('@/lib/app-types').SmmBookmarkRowT[]>([]);
  const [chats, setChats] = useState<SmmChatT[]>([]);
  const [chatMessages, setChatMessages] = useState<import('@/lib/app-types').SmmChatMessageT[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [requests, setRequests] = useState<SmmRequestRowT[]>([]);
  // Отзыв modal state (the deal review left after BOTH sides complete)
  const [reviewCtx, setReviewCtx] = useState<{ kind: 'application' | 'invitation'; id: string; title: string; counterparty: string } | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatCreateOpen, setChatCreateOpen] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  // MY PROFILE sheet (the avatar's bottom page) + the ИИ-АГЕНТ sheet (the
  // one-button platform automation)
  const [meOpen, setMeOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [smmBookmarksSet, setSmmBookmarksSet] = useState<Set<string>>(new Set());
  const [profileData, setProfileData] = useState<SmmProfileT | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const smmSwiperRef = useRef<SwiperClass | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  // The card's GROUP chat window («Чат» on the card — the test-card
  // mechanic): messages + input + poll, the same contract as the open chat.
  const [cardMessages, setCardMessages] = useState<import('@/lib/app-types').SmmChatMessageT[]>([]);
  const [cardInput, setCardInput] = useState('');
  const cardEndRef = useRef<HTMLDivElement | null>(null);
  // The card windows stay mounted while their slide-down/fade exit animation
  // plays (the same deal the test windows keep) — the last target lives in a
  // ref so the panel doesn't blank out mid-exit.
  const cardChatMounted = useExitMount(!!cardChat, 220);
  const cardChatLast = useRef<SmmCardChatTarget | null>(null);
  useEffect(() => { if (cardChat) cardChatLast.current = cardChat; }, [cardChat]);
  const filesMounted = useExitMount(!!filesTarget, 220);
  const filesLast = useRef<SmmFilesTarget | null>(null);
  useEffect(() => { if (filesTarget) filesLast.current = filesTarget; }, [filesTarget]);
  // The delete dialog («Удалить» on the card — the same confirm-first dialog
  // the test cards open before deleting)
  const [smmDelete, setSmmDelete] = useState<{ kind: 'event' | 'post' | 'specialist'; id: string; title: string } | null>(null);
  // THE EDIT WINDOW («Изменить» on the card / in the window switcher — the
  // SAME window the test cards open: a resizable sheet with the editor body
  // inside + Save, NOT the full-page editor). Somebody else's card first
  // becomes a private VERSION copy (the server-side copyEvent/copyPost).
  const [editWin, setEditWin] = useState<{ kind: 'event' | 'post'; id: string; title: string } | null>(null);
  const [editWinSaving, setEditWinSaving] = useState(false);
  const editWinMounted = useExitMount(!!editWin, 200);
  const editWinLast = useRef<{ kind: 'event' | 'post'; id: string; title: string } | null>(null);
  useEffect(() => { if (editWin) editWinLast.current = editWin; }, [editWin]);
  const editEventFormRef = useRef<SmmFormHandle>(null);
  const editPostFormRef = useRef<SmmFormHandle>(null);
  // The files target per card (the switcher's «Файлы» option reuses the
  // target built at the card's «Файлы» click — the same cache the tests'
  // dashFilesCountRef keeps)
  const filesItemRef = useRef<Record<string, SmmFilesTarget>>({});
  // The last specialist context for the «пригласить» button (set on a
  // specialist card open / profile window load) — the button keeps its
  // invite target even after the view changes to events/chats/etc.
  const lastSpRef = useRef<{ id: string; name: string; roles: SmmRoleT[] } | null>(null);
  // EVERY card ever rendered (dashboard feed/grid, profile window, bookmarks)
  // lands here — «Изменить» must know own-vs-somebody's from ANY surface,
  // not only from the current dashboard list (the profile-window cards are
  // NOT in `items`; the old lookup failed there and an OWN card went through
  // the copy path and errored — the button did not «always work»).
  const seenItemsRef = useRef<Record<string, AnyItem>>({});

  // ── «Обсудить с ИИ» window state (per-card threads in localStorage) ──
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState<{ kind: 'event' | 'post' | 'specialist'; id: string; title: string } | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
  const [aiThreads, setAiThreads] = useState<Record<string, SmmAiThread>>({});
  const aiEndRef = useRef<HTMLDivElement | null>(null);

  const myId = effectiveUser?.id || '';
  const isSpecialist = smmMode === 'specialist';
  // личная библиотека (mine) vs публичная (discover) — the first dock
  const personal = !discoverMode;

  const loadLists = useCallback(async () => {
    if (!myId) return;
    setListLoading(true);
    try {
      const [posts, events, specialists, roles, evs, bms] = await Promise.all([
        api.getPosts('mine').catch(() => ({ items: [] })),
        api.getEvents('public').catch(() => ({ items: [] })),
        api.getSpecialists().catch(() => ({ items: [] })),
        api.getMyRoles().catch(() => ({ items: [] })),
        api.getEvents('mine').catch(() => ({ items: [] })),
        api.getSmmBookmarks().catch(() => ({ items: [] })),
      ]);
      setMyRoles((roles.items || []).map((r: any) => ({ id: r.id, name: r.name })));
      setMyEvents((evs.items || []).map((e: any) => ({ id: e.id, title: e.title, format: e.format })));
      setBookmarks(bms.items || []);
      setSmmBookmarksSet(new Set((bms.items || []).map((b: any) => `${b.targetType}:${b.targetId}`)));
      let list: AnyItem[] = [];
      if (isSpecialist) {
        list = personal
          ? (posts.items || []).map((p: any) => ({ ...p, kind: 'post' as const }))
          : (events.items || []).map((e: any) => ({ ...e, kind: 'event' as const }));
      } else {
        list = personal
          ? (evs.items || []).map((e: any) => ({ ...e, kind: 'event' as const }))
          : (specialists.items || []).map((s: any) => ({ ...s, kind: 'specialist' as const }));
      }
      setItems(list);
    } finally {
      setListLoading(false);
    }
  }, [myId, isSpecialist, personal]);

  useEffect(() => { void loadLists(); }, [loadLists, refreshNonce]);

  // The invite EVENT pick self-heals: as soon as the customer's own events
  // are in (they load async), the pick defaults to the first one — and
  // re-heals whenever the pick points nowhere (event deleted, stale state
  // from an old session). The «пригласить» button must never sit disabled
  // while the user HAS events.
  useEffect(() => {
    if (myEvents.length === 0) return;
    const cur = useSmmStore.getState().pickedInviteEvent;
    if (!cur || !myEvents.some(e => e.id === cur)) {
      useSmmStore.setState({ pickedInviteEvent: myEvents[0].id });
    }
  }, [myEvents]);

  const loadRequests = useCallback(async () => {
    if (!myId) return;
    try {
      // BOTH kinds for BOTH roles: the specialist's window holds their sent
      // заявки AND the приглашения that arrived for them; the customer's —
      // their sent приглашения AND the заявки that arrived for their events.
      const [apps, invs] = await Promise.all([
        api.getApplications().catch(() => ({ items: [] })),
        api.getInvitations().catch(() => ({ items: [] })),
      ]);
      const merged = [...(apps.items || []), ...(invs.items || [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(merged as SmmRequestRowT[]);
    } catch { setRequests([]); }
  }, [myId, isSpecialist]);

  const loadChats = useCallback(async () => {
    if (!myId) return;
    try {
      const r = await api.getSmmChats();
      setChats(r.items || []);
    } catch { setChats([]); }
  }, [myId]);

  useEffect(() => {
    if (topWindow === 'chats') void loadChats();
    if (topWindow === 'requests') void loadRequests();
    if (topWindow === 'bookmarks') void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topWindow]);

  // The profile window data — refetched for every profileUserId (and after a
  // refresh bump, e.g. an invite sent from the profile)
  useEffect(() => {
    if (topWindow !== 'profile' || !profileUserId) { setProfileData(null); return; }
    let alive = true;
    setProfileLoading(true);
    api.getSmmProfile(profileUserId)
      .then(r => {
        if (!alive) return;
        setProfileData(r);
        // a customer viewing a specialist: heal the invite ROLE pick (it must
        // be one of THIS user's roles) and remember them as the invite target
        if (!isSpecialist && r.user.roles.length > 0) {
          const curRole = useSmmStore.getState().pickedInviteRole;
          if (!curRole || !r.user.roles.some(x => x.id === curRole)) {
            useSmmStore.setState({ pickedInviteRole: r.user.roles[0].id });
          }
          lastSpRef.current = { id: r.user.id, name: r.user.name, roles: r.user.roles };
        }
      })
      .catch(() => { if (alive) setProfileData(null); })
      .finally(() => { if (alive) setProfileLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topWindow, profileUserId, refreshNonce]);

  // open chat messages + poll
  useEffect(() => {
    if (!openChatId) { setChatMessages([]); return; }
    let alive = true;
    const fetchMsgs = async () => {
      try {
        const r = await api.getSmmChatMessages(openChatId);
        if (alive) setChatMessages(r.messages || []);
      } catch { /* ignore */ }
    };
    void fetchMsgs();
    const iv = setInterval(fetchMsgs, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [openChatId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages.length, openChatId]);

  // open the CARD's group chat messages + poll (the test-card «Чат» window)
  useEffect(() => {
    if (!cardChat) { setCardMessages([]); return; }
    let alive = true;
    const fetchMsgs = async () => {
      try {
        const r = await api.getSmmCardChat(cardChat.kind, cardChat.id);
        if (alive) setCardMessages(r.messages || []);
      } catch { /* ignore */ }
    };
    void fetchMsgs();
    const iv = setInterval(fetchMsgs, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [cardChat]);

  useEffect(() => {
    cardEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [cardMessages.length, cardChat?.id]);

  const sendCardChatMsg = async () => {
    const text = cardInput.trim();
    if (!text || !cardChat) return;
    setCardInput('');
    try {
      await api.sendSmmCardChat(cardChat.kind, cardChat.id, text);
      const r = await api.getSmmCardChat(cardChat.kind, cardChat.id);
      setCardMessages(r.messages || []);
    } catch { /* ignore */ }
  };

  // load / persist the SMM AI threads (localStorage, session-safe)
  useEffect(() => {
    try { const raw = localStorage.getItem('smm-ai-threads'); if (raw) setAiThreads(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('smm-ai-threads', JSON.stringify(aiThreads)); } catch { /* ignore */ }
  }, [aiThreads]);
  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [aiMessages.length, aiOpen]);

  // ── derived ─────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((it: any) => {
      const hay = [it.title, it.summary, it.description, it.name, it.role?.name, it.specialist?.name, it.customer?.name]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, q]);

  const gridPerRow = dashView === 'shelf' ? 1 : (dashView === 'library' && libNarrow ? 2 : (libUltra ? 5 : libWide ? 4 : 3));
  const isGrid = dashView === 'library' || dashView === 'shelf';
  const gridRows: AnyItem[][] = [];
  for (let i = 0; i < filtered.length; i += gridPerRow) gridRows.push(filtered.slice(i, i + gridPerRow));

  const activeItem = filtered.find(x => x.id === activeCardId) || null;
  const activeEvent = activeItem && activeItem.kind === 'event' ? activeItem : null;
  const activeSpecialist = activeItem && activeItem.kind === 'specialist' ? activeItem : null;

  // ── actions ─────────────────────────────────────────────────────────────
  const toast = (title: string) => {
    try {
      // the app uses sonner-style toast in app-root; here a lightweight inline toast
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: title }));
    } catch { /* noop */ }
  };

  // NOTE: the role switcher is GONE — SEPARATE REGISTRATION fixed the tab
  // (User.smmRole, picked at signup; smm-store is seeded from the account at
  // boot and right after register/login). The view renders that one tab only.

  const gotoLibrary = (discover: boolean) => {
    setDiscoverMode(discover);
    useSmmStore.setState({ topWindow: 'none', activeCardId: null, openChatId: null, pickedApplyRole: null, pickedInviteEvent: null, pickedInviteRole: null, profileUserId: null, filesTarget: null, cardChat: null });
  };

  const toggleBookmark = async (targetType: 'event' | 'specialist' | 'post', targetId: string) => {
    const key = `${targetType}:${targetId}`;
    const has = smmBookmarksSet.has(key);
    setSmmBookmarksSet(prev => {
      const next = new Set(prev);
      if (has) next.delete(key); else next.add(key);
      return next;
    });
    try {
      if (has) await api.removeSmmBookmark(targetType, targetId);
      else await api.addSmmBookmark(targetType, targetId);
      toast(has ? t('smmBookmarkRemoved') : t('smmBookmarkAdded'));
    } catch { void loadLists(); }
  };

  const bookmarkOf = (targetType: string, targetId: string) => smmBookmarksSet.has(`${targetType}:${targetId}`);

  const openDirectChat = async (peerId: string) => {
    try {
      const chat = await api.createSmmChat('', peerId);
      useSmmStore.setState({ topWindow: 'chats', openChatId: chat.id });
      void loadChats();
    } catch (e: any) {
      toast(e?.message || 'Error');
    }
  };

  const doShare = async (kind: 'event' | 'post', id: string) => {
    const url = `${window.location.origin}/?${kind}=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('smmShareCopied'));
    } catch { toast(url); }
  };

  // ── «Обсудить с ИИ» — the SAME window the test cards open, fed by the
  // card's passport (/api/smm/ai-chat). One window at a time: the files /
  // chat / edit windows yield (the same rule the test cards keep).
  const openSmmAi = (kind: 'event' | 'post' | 'specialist', id: string, title: string) => {
    const tid = `${kind}:${id}`;
    const th = aiThreads[tid];
    setEditWin(null);
    useSmmStore.setState({ filesTarget: null, cardChat: null, topWindow: 'none' });
    setAiTarget({ kind, id, title });
    setAiMessages(th ? [...th.messages] : []);
    setAiOpen(true);
    setAiHistoryOpen(false);
  };

  const sendSmmAi = async (existing?: AiMsg[]) => {
    if (!aiTarget) return;
    let msgs: AiMsg[];
    if (existing) {
      msgs = existing;
      setAiMessages(msgs);
    } else {
      if (!aiInput.trim()) return;
      msgs = [...aiMessages, { role: 'user', content: aiInput.trim() }];
      setAiMessages(msgs);
      setAiInput('');
    }
    setAiLoading(true);
    try {
      const r = await api.smmCardChat(aiTarget.kind, aiTarget.id, msgs);
      let final = msgs;
      if (r.response) final = [...msgs, { role: 'assistant', content: r.response }];
      else if ((r as any).rateLimited) final = [...msgs, { role: 'assistant', content: t('aiBusy') }];
      else final = [...msgs, { role: 'assistant', content: (r as any).error || t('aiError') }];
      setAiMessages(final);
      const tid = `${aiTarget.kind}:${aiTarget.id}`;
      setAiThreads(prev => ({
        ...prev,
        [tid]: { id: tid, kind: aiTarget.kind, cardId: aiTarget.id, title: aiTarget.title, messages: final, updatedAt: Date.now() },
      }));
    } catch (e: any) {
      const errMsg = e?.message || '';
      const txt = errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('Too many') ? t('aiBusy') : t('aiError');
      setAiMessages(prev => [...prev, { role: 'assistant', content: txt }]);
    }
    setAiLoading(false);
  };

  const selectSmmAiThread = (tid: string) => {
    const th = aiThreads[tid];
    if (!th) return;
    setAiTarget({ kind: th.kind, id: th.cardId, title: th.title });
    setAiMessages([...th.messages]);
    setAiHistoryOpen(false);
    setAiOpen(true);
  };

  const newSmmAiThread = () => {
    setAiMessages([]);
    setAiHistoryOpen(false);
  };

  const aiThreadMetas = Object.values(aiThreads)
    .map(th => ({
      id: th.id,
      testId: th.cardId,
      title: th.title,
      preview: th.messages[th.messages.length - 1]?.content?.slice(0, 80) || '',
      updatedAt: th.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const startCreate = () => {
    // the files / card-chat windows are floating panels — «+» closes them and
    // creates a card of the current mode (the same routing the tests keep)
    if (topWindow === 'files' || topWindow === 'card-chat') useSmmStore.setState({ topWindow: 'none', filesTarget: null, cardChat: null });
    if (topWindow === 'chats') { setChatCreateOpen(true); setRenamingChatId(null); setChatTitle(''); return; }
    if (topWindow === 'requests' || topWindow === 'bookmarks') { toast(t('smmRequestsEmpty')); return; }
    if (isSpecialist) {
      if (personal) { useSmmStore.setState({ editingId: null }); setPage('smm-post-editor'); }
      else useSmmStore.setState({ topWindow: 'requests' });
    } else {
      if (personal) { useSmmStore.setState({ editingId: null }); setPage('smm-event-editor'); }
      else useSmmStore.setState({ topWindow: 'requests' });
    }
  };

  const startEditActive = () => {
    if (topWindow === 'files' || topWindow === 'card-chat') useSmmStore.setState({ topWindow: 'none', filesTarget: null, cardChat: null });
    else if (topWindow !== 'none') return;
    if (!activeItem) return;
    // the SAME edit window the card's «Изменить» button opens (own → window;
    // somebody else's → private version copy first, then the jump into the
    // copier's own account/library)
    void openEditWindow(
      activeItem.kind,
      activeItem.id,
      activeItem.kind === 'event' ? activeItem.title : activeItem.kind === 'post' ? (activeItem.role?.name || t('smmPost')) : activeItem.name,
      activeItem,
    );
  };

  const submitChatCreate = async () => {
    if (renamingChatId) {
      try {
        await api.renameSmmChat(renamingChatId, chatTitle);
        toast(t('smmChatRenamed'));
      } catch (e: any) { toast(e?.message || 'Error'); }
    } else {
      try {
        await api.createSmmChat(chatTitle);
        toast(t('smmChatCreated'));
      } catch (e: any) { toast(e?.message || 'Error'); }
    }
    setChatCreateOpen(false); setRenamingChatId(null); setChatTitle('');
    void loadChats();
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || !openChatId) return;
    setChatInput('');
    try {
      await api.sendSmmChatMessage(openChatId, text);
      const r = await api.getSmmChatMessages(openChatId);
      setChatMessages(r.messages || []);
    } catch { /* ignore */ }
  };

  const withdraw = async (row: SmmRequestRowT) => {
    try {
      if (row.kind === 'application') await api.deleteApplication(row.id);
      else await api.deleteInvitation(row.id);
      toast(t('smmRequestWithdrawn'));
      void loadRequests();
    } catch (e: any) { toast(e?.message || 'Error'); }
  };

  // ── Сделка (Mercur deal lifecycle): decisions, both-side completion, reviews
  const decideRow = async (row: SmmRequestRowT, decision: 'accepted' | 'declined') => {
    try {
      if (row.kind === 'application') await api.decideApplication(row.id, decision);
      else await api.decideInvitation(row.id, decision);
      toast(decision === 'accepted' ? t('smmAcceptToast') : t('smmDeclineToast'));
      void loadRequests();
      useSmmStore.setState((s: any) => ({ refreshNonce: (s.refreshNonce || 0) + 1 }));
    } catch (e: any) { toast(e?.message || 'Error'); }
  };

  const completeDealRow = async (row: SmmRequestRowT) => {
    try {
      await api.completeDeal(row.kind, row.id);
      toast(t('smmDealConfirmToast'));
      void loadRequests();
    } catch (e: any) { toast(e?.message || 'Error'); }
  };

  const openReview = (row: SmmRequestRowT) => {
    setReviewCtx({ kind: row.kind, id: row.id, title: row.eventTitle, counterparty: row.counterpartyName });
    setReviewRating(0);
    setReviewComment('');
  };

  const submitReview = async () => {
    if (!reviewCtx || reviewRating < 1) { toast(t('smmReviewNeedStars')); return; }
    setReviewBusy(true);
    try {
      await api.createReview({ dealType: reviewCtx.kind, dealId: reviewCtx.id, rating: reviewRating, comment: reviewComment });
      toast(t('smmReviewToast'));
      setReviewCtx(null);
      void loadRequests();
    } catch (e: any) { toast(e?.message || 'Error'); } finally { setReviewBusy(false); }
  };

  const applyFromCard = () => {
    if (!activeEvent) return;
    // The button ALWAYS works: a specialist without any role yet is led to
    // the post editor — the role (+ prices) is born there, then the заявка
    // can be sent. Never a dead disabled button.
    if (myRoles.length === 0) {
      toast(t('smmApplyNeedRole'));
      useSmmStore.setState({ editingId: null });
      setPage('smm-post-editor');
      return;
    }
    if (!pickedApplyRole) return;
    useSmmStore.setState({
      applyCtx: { eventId: activeEvent.id, roleId: pickedApplyRole, testIds: activeEvent.testIds || [] },
      inviteCtx: null,
    });
    setPage('smm-apply');
  };

  // Приглашение: примерная сумма depends on the EVENT's format — онлайн =
  // цена за 1000 просмотров, оффлайн = цена за день (8 часов).
  const inviteFrom = (sp: { id: string; name: string; roles: SmmRoleT[] }, pickedEventId: string | null, pickedRoleId: string | null) => {
    if (!sp) return;
    // the picks self-heal: a stale id (deleted event/role, an old pick from
    // a previous session) falls back to the first own event / first
    // specialist role — the button never resolves into a silent no-op
    const role = sp.roles.find(r => r.id === pickedRoleId) || sp.roles[0];
    const ev = myEvents.find(e => e.id === pickedEventId) || myEvents[0];
    if (!role || !ev) return;
    const format: 'online' | 'offline' = ev.format === 'offline' ? 'offline' : 'online';
    const estimate = format === 'online' ? (role.pricePerK ?? null) : (role.pricePerDay ?? null);
    useSmmStore.setState({
      inviteCtx: {
        specialistId: sp.id,
        specialistName: sp.name,
        eventId: ev.id,
        eventTitle: ev.title,
        roleId: role.id,
        roleName: role.name,
        pricePerK: role.pricePerK ?? null,
        pricePerDay: role.pricePerDay ?? null,
        eventFormat: format,
        estimate,
      },
      applyCtx: null,
    });
    setPage('smm-invite');
  };

  // The invite button's single entry — NEVER dead: every «nothing to pick»
  // case leads somewhere useful instead of sitting disabled.
  const inviteClick = (sp: { id: string; name: string; roles: SmmRoleT[] } | null) => {
    if (!sp) {
      // no specialist in sight — the public library is where they live
      toast(t('smmInvitePickSpecialist'));
      gotoLibrary(true);
      return;
    }
    if (!sp.roles || sp.roles.length === 0) {
      // the invite needs a role only the specialist can create
      toast(t('smmInviteNoRoles'));
      return;
    }
    if (myEvents.length === 0) {
      // no event to invite to — the event editor is one tap away
      toast(t('smmInviteNoEvent'));
      useSmmStore.setState({ editingId: null });
      setPage('smm-event-editor');
      return;
    }
    inviteFrom(sp, pickedInviteEvent, pickedInviteRole);
  };

  // feed slide commit — the SAME contract the tests feed keeps: the visible
  // slide IS the active card (the «Изменить» own-detection and the edit-mode
  // UI bind to it).
  const commitSlide = (idx: number) => {
    const it = filtered[Math.min(Math.max(0, idx), filtered.length - 1)];
    if (it && it.id !== smmNow().activeCardId) useSmmStore.setState({ activeCardId: it.id });
  };

  // Wheel gate: events originating inside an inner scrollable (the slide's
  // white content card) keep their NATIVE scrolling — stopped here in the
  // capture phase so the Swiper mousewheel engine never sees them.
  const onWheelCapture = (e: React.WheelEvent) => {
    const t = e.target as Element | null;
    if (t?.closest?.('[data-inner-scroll]')) e.stopPropagation();
  };

  // Keyboard parity with TikTok web — the SAME keys the tests feed answers:
  // ↑/↓/PgUp/PgDn/Space step one card, Home/End jump to the ends. Ignored
  // while typing, while a window/sheet is open or in the grid modes.
  useEffect(() => {
    if (isGrid || topWindow !== 'none' || openChatId || smmDelete || searchOpen || agentOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tgt?.isContentEditable) return;
      if (tag === 'BUTTON' && e.key === ' ') return; // space activates the focused button
      const sw = smmSwiperRef.current;
      if (!sw || sw.destroyed || filtered.length <= 0) return;
      const i = sw.activeIndex;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); sw.slideTo(Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); sw.slideTo(Math.max(i - 1, 0)); }
      else if (e.key === 'Home') { e.preventDefault(); sw.slideTo(0); }
      else if (e.key === 'End') { e.preventDefault(); sw.slideTo(filtered.length - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGrid, filtered.length, topWindow, openChatId, smmDelete, searchOpen, agentOpen]);

  // External activeCardId changes (a card tap sets itself, scope resets) drive
  // the swiper; slide commits flow back through onSlideChange — the equality
  // check makes the loop settle immediately.
  useEffect(() => {
    const sw = smmSwiperRef.current;
    if (!sw || sw.destroyed || isGrid || !activeCardId) return;
    const idx = filtered.findIndex(x => x.id === activeCardId);
    if (idx >= 0 && idx !== sw.activeIndex) sw.slideTo(idx, 0);
  }, [activeCardId, filtered, isGrid]);
  // Appended/removed slides (creates, deletes, scope swaps) — keep the
  // engine's internal slide bookkeeping in sync.
  useEffect(() => { const sw = smmSwiperRef.current; if (sw && !sw.destroyed && !isGrid) sw.update(); }, [filtered.length, isGrid]);

  const userInitials = (() => {
    const userName = effectiveUser?.name || effectiveUser?.email || '';
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : userName.slice(0, 2);
    return (s || '?').toUpperCase();
  })();

  // ── THE EDIT WINDOW TARGET («Изменить» from a card or the switcher) ─────
  // Somebody else's мероприятие/пост is NEVER edited in place — the test-card
  // rule (startEditTest → copyTest): the server makes a private VERSION of
  // the original (parentId = the source). THEN THE USER'S RULE kicks in:
  // «Изменить» ALWAYS works and TRANSLATES the user into their own account —
  // the копия lands in the ЛИЧНАЯ библиотека of the matching side (event →
  // заказчик, post → СММ специалист), so after the click the user stands in
  // their own library with the template editable right there. Own cards open
  // in the window directly (no copy, no jump).
  const openEditWindow = async (kind: 'event' | 'post' | 'specialist', id: string, title: string, item?: AnyItem) => {
    // one window at a time: the AI panel / files / chat windows yield
    setAiOpen(false);
    useSmmStore.setState({ filesTarget: null, cardChat: null, topWindow: 'none' });
    if (kind === 'specialist') {
      // The specialist card is edited through YOUR profile (name/avatar);
      // a stranger's card can never be changed.
      if (id === myId) setMeOpen(true);
      else toast(t('smmEditOwnOnly'));
      return;
    }
    // own-or-not: the captured card first, then the seen-cards cache (every
    // rendered card), then the current dashboard list — the button must work
    // from EVERY surface the card can appear on.
    const known = (item as any) || (seenItemsRef.current as any)[id] || (items.find(x => x.id === id) as any);
    const own = kind === 'post' ? known?.specialistId === myId : known?.customerId === myId;
    if (own) { setEditWin({ kind, id, title }); return; }
    setBusy(true);
    toast(t('copyCreating'));
    try {
      const copy: any = kind === 'post' ? await api.copySmmPost(id) : await api.copySmmEvent(id);
      // THE JUMP (reworked): the copy always lands on the matching side of
      // the account (event → customerId = me, post → specialistId = me) in
      // the ЛИЧНАЯ библиотека. The view STAYS in the user's fixed tab (no
      // role switcher exists — separate registration), so we just reload the
      // personal list and open the template in the edit window right here.
      toast(t('smmCopyLanded'));
      gotoLibrary(false);
      useSmmStore.setState((s: any) => ({ refreshNonce: (s.refreshNonce || 0) + 1 }));
      setEditWin({ kind, id: copy.id, title });
    } catch (e: any) {
      toast(e?.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  // ── THE WINDOW SWITCHER — the SAME header dropdown every dashboard window
  // of the tests site wears (dashSwitcher): files / AI / chat / edit, ALL
  // windows of ONE card share it, so switching from the chat window that
  // slid up from the bottom lands you in the «Прикреплённые файлы» or
  // «Изменить» window of the SAME card without closing anything.
  const smmWindowCard: { kind: 'event' | 'post' | 'specialist'; id: string; title: string } | null = (() => {
    if (filesTarget) return { kind: filesTarget.kind, id: filesTarget.id, title: filesTarget.title };
    if (cardChat) return cardChat;
    if (aiOpen && aiTarget) return aiTarget;
    if (editWin) return editWin;
    return null;
  })();
  const smmFilesCount = (() => {
    if (!smmWindowCard) return 0;
    if (filesTarget && filesTarget.id === smmWindowCard.id) {
      return (filesTarget.files?.length || 0)
        + (filesTarget.kind === 'event' ? (filesTarget.tests?.length || 0) : (filesTarget.media?.length || 0));
    }
    const cached = filesItemRef.current[smmWindowCard.id];
    if (!cached) return 0;
    return (cached.files?.length || 0)
      + (cached.kind === 'event' ? (cached.tests?.length || 0) : (cached.media?.length || 0));
  })();
  const smmSheetOptions: SheetOption[] = [
    ...((smmFilesCount > 0) ? [{
      key: 'files' as const,
      label: t('files', { n: smmFilesCount }),
      icon: <Paperclip className="w-3.5 h-3.5" />,
      active: !!filesTarget,
    }] : []),
    { key: 'ai', label: t('aiTutor'), icon: <MessageSquare className="w-3.5 h-3.5" />, active: aiOpen },
    { key: 'group', label: t('chat'), icon: <MessageCircle className="w-3.5 h-3.5" />, active: !!cardChat },
    ...((smmWindowCard && smmWindowCard.kind !== 'specialist') ? [{
      key: 'edit' as const,
      label: smmWindowCard.kind === 'event' ? t('smmEventEdit') : t('smmPostEdit'),
      icon: <Pencil className="w-3.5 h-3.5" />,
      active: !!editWin,
    }] : []),
  ];
  const smmSwitcher = { options: smmSheetOptions, onSelect: (key: string) => {
    if (!smmWindowCard) return;
    const w = smmWindowCard;
    if (key === 'edit') {
      // the edit window for the SAME card the switcher lives on
      if (w.kind === 'specialist') return;
      setEditWin(null);
      void openEditWindow(w.kind, w.id, w.title);
      return;
    }
    if (key === 'files') {
      setEditWin(null); setAiOpen(false);
      const cached = filesItemRef.current[w.id];
      if (cached) useSmmStore.setState({ filesTarget: cached, topWindow: 'files', openChatId: null });
      return;
    }
    if (key === 'ai') {
      setEditWin(null);
      useSmmStore.setState({ filesTarget: null, cardChat: null, topWindow: 'none' });
      openSmmAi(w.kind, w.id, w.title);
      return;
    }
    if (key === 'group') {
      setEditWin(null); setAiOpen(false);
      useSmmStore.setState({ cardChat: { kind: w.kind, id: w.id, title: w.title }, topWindow: 'card-chat', openChatId: null });
    }
  } };

  const makeCtx = (it: AnyItem, selected: boolean): CardCtx => ({
    t,
    myId,
    editMode,
    bookmarked: it.kind === 'event' ? bookmarkOf('event', it.id) : it.kind === 'post' ? bookmarkOf('post', it.id) : bookmarkOf('specialist', it.id),
    onToggleBookmark: () => {
      if (it.kind === 'event') void toggleBookmark('event', it.id);
      else if (it.kind === 'post') void toggleBookmark('post', it.id);
      else void toggleBookmark('specialist', it.id);
    },
    onOpenProfile: () => {
      // Tap the author on any card → THEIR profile window (their card + their
      // published cards). Your own profile lives behind the top-panel avatar.
      const target = it.kind === 'event' ? it.customer
        : it.kind === 'post' ? it.specialist
        : { id: it.id, name: it.name, image: it.image ?? null };
      if (!target?.id || target.id === myId) return;
      useSmmStore.setState({ profileUserId: target.id, topWindow: 'profile', openChatId: null });
    },
    onAi: () => {
      if (it.kind === 'event') openSmmAi('event', it.id, it.title);
      else if (it.kind === 'post') openSmmAi('post', it.id, it.role?.name || t('smmPost'));
      else openSmmAi('specialist', it.id, it.name);
    },
    aiActive: aiOpen && aiTarget?.id === it.id,
    onFiles: () => {
      if (it.kind === 'event') {
        const target: SmmFilesTarget = {
          kind: 'event', id: it.id, title: it.title,
          tests: (it.tests || []).map(tt => ({ id: tt.id, title: tt.title, questions: tt._count?.questions ?? 0 })),
          files: ((it as SmmEventT).attachments || []) as SmmFilesTarget['files'],
        };
        filesItemRef.current[it.id] = target;
        useSmmStore.setState({ filesTarget: target, topWindow: 'files', openChatId: null });
      } else if (it.kind === 'post') {
        const target: SmmFilesTarget = {
          kind: 'post', id: it.id, title: it.role?.name || t('smmPost'),
          media: ((it.media || []) as { url: string; type: string }[]).slice(0, 30),
          files: ((it as SmmPostT).attachments || []) as SmmFilesTarget['files'],
        };
        filesItemRef.current[it.id] = target;
        useSmmStore.setState({ filesTarget: target, topWindow: 'files', openChatId: null });
      } else {
        // the specialist card: the files window carries the media + files of
        // THEIR posts (the profile API returns the posts with both)
        setBusy(true);
        api.getSmmProfile(it.id)
          .then((p: any) => {
            const media = (p.posts || []).flatMap((pp: any) => ((pp.media || []) as { url: string; type: string }[]));
            const files = (p.posts || []).flatMap((pp: any) => ((pp.attachments || []) as SmmFilesTarget['files']));
            const target: SmmFilesTarget = { kind: 'post', id: it.id, title: it.name, media: media.slice(0, 60), files: files.slice(0, 30) };
            filesItemRef.current[it.id] = target;
            useSmmStore.setState({ filesTarget: target, topWindow: 'files', openChatId: null });
          })
          .catch((e: any) => toast(e?.message || 'Error'))
          .finally(() => setBusy(false));
      }
    },
    isPublic: it.kind === 'event' ? (it as SmmEventT).isPublic : it.kind === 'post' ? (it as SmmPostT).isPublic : undefined,
    onPublic: () => {
      if (it.kind === 'event') {
        api.updateEvent(it.id, { isPublic: !(it as SmmEventT).isPublic })
          .then(() => { toast(t('smmEventSaved')); bumpAndReload(); })
          .catch((e: any) => toast(e?.message || 'Error'));
        return;
      }
      if (it.kind === 'post') {
        // «Публичная» on an own post: publishing (an автопост included) puts
        // it on the specialist's profile — the personal library keeps it too
        api.updatePost(it.id, { isPublic: !(it as SmmPostT).isPublic })
          .then(() => { toast(t('smmPostSaved')); bumpAndReload(); })
          .catch((e: any) => toast(e?.message || 'Error'));
      }
    },
    onChat: () => {
      // «Чат» on the card = the per-card GROUP CHAT WINDOW — everyone's chat
      // about THIS card, the exact mechanic the test cards keep. One window
      // at a time: the AI panel and the edit window close (the same rule the
      // test card keeps).
      setAiOpen(false);
      setEditWin(null);
      const title = it.kind === 'event' ? it.title : it.kind === 'post' ? (it.role?.name || t('smmPost')) : it.name;
      useSmmStore.setState({ cardChat: { kind: it.kind, id: it.id, title }, topWindow: 'card-chat', openChatId: null });
    },
    onShare: () => { if (it.kind !== 'specialist') void doShare(it.kind, it.id); },
    onEdit: () => { openEditWindow(it.kind, it.id, it.kind === 'event' ? it.title : it.kind === 'post' ? (it.role?.name || t('smmPost')) : it.name, it); },
    onDelete: () => {
      // «Удалить» opens the same confirm-first dialog the test cards open —
      // the delete itself happens only after the confirmation.
      const title = it.kind === 'event' ? it.title : it.kind === 'post' ? (it.role?.name || t('smmPost')) : it.name;
      setSmmDelete({ kind: it.kind, id: it.id, title });
    },
    onOpen: () => {
      useSmmStore.setState({ activeCardId: it.id });
      // picking defaults: the first own role / first event+role
      if (it.kind === 'event' && isSpecialist) {
        if (!smmNow().pickedApplyRole) useSmmStore.setState({ pickedApplyRole: myRoles[0]?.id || null });
      }
      if (it.kind === 'specialist') {
        // heal the picks: the role must be one of THIS specialist's, the
        // event — one of the customer's own (stale ids re-default)
        const curRole = smmNow().pickedInviteRole;
        if (!curRole || !(it.roles || []).some(r => r.id === curRole)) useSmmStore.setState({ pickedInviteRole: it.roles[0]?.id || null });
        const curEv = smmNow().pickedInviteEvent;
        if (!curEv || !myEvents.some(e => e.id === curEv)) useSmmStore.setState({ pickedInviteEvent: myEvents[0]?.id || null });
        lastSpRef.current = { id: it.id, name: it.name, roles: it.roles };
      }
    },
    myRoles,
    pickedRole: pickedApplyRole,
    onPickRole: (roleId: string) => useSmmStore.setState({ pickedApplyRole: roleId }),
    myEvents,
    pickedEvent: pickedInviteEvent,
    pickedInvRole: pickedInviteRole,
    onPickEvent: (eventId: string) => useSmmStore.setState({ pickedInviteEvent: eventId }),
    onPickInvRole: (roleId: string) => useSmmStore.setState({ pickedInviteRole: roleId }),
    selected,
    onImageOpen: (url: string) => setImgPreview(url),
  });

  const bumpAndReload = () => {
    useSmmStore.setState((s: any) => ({ refreshNonce: (s.refreshNonce || 0) + 1 }));
    if (topWindow === 'chats') void loadChats();
    if (topWindow === 'requests') void loadRequests();
  };

  // The delete dialog's confirm — the same mechanic the test cards keep:
  // the card disappears only after the user confirms in the dialog.
  const confirmSmmDelete = async () => {
    if (!smmDelete) return;
    const d = smmDelete;
    setSmmDelete(null);
    setBusy(true);
    try {
      if (d.kind === 'event') { await api.deleteEvent(d.id); toast(t('smmEventDeleted')); }
      else if (d.kind === 'post') { await api.deletePost(d.id); toast(t('smmPostDeleted')); }
      else { await api.deleteSpecialistCard(d.id); toast(t('smmSpecialistDeleted')); }
      bumpAndReload();
    } catch (e: any) { toast(e?.message || 'Error'); }
    setBusy(false);
  };

  // ── the first bottom bar (context action) ───────────────────────────────
  // «Пригласить на мероприятие» ALWAYS stands in the bottom panel for the
  // customer — on every surface (main area, profile, bookmarks, chats,
  // requests, floating panels) — and it is NEVER a dead button: with no
  // specialist in sight it opens the public library (where specialist cards
  // live), with no own events it leads to the event editor, with a role-less
  // specialist it says so. The specialist mode keeps the contextual
  // «Подать заявку» / «Изменить» behavior.
  const barAction = (() => {
    // the MAP window keeps the frame but drops the context bar — the map has
    // its own floating «добавить спот» control
    if (topWindow === 'map') return null;
    // the profile window: a customer invites the viewed specialist right
    // from here (the same пригласить bar the specialist card carries)
    if (topWindow === 'profile') {
      if (isSpecialist) return null;
      // while the profile loads the invite target is unknown — an honest
      // transient disable (the real states never disable: data arrived →
      // the button invites; role-less user → the hint toast)
      if (profileLoading) return { label: t('smmInviteBtn'), disabled: true, fn: () => {} };
      if (profileData && profileData.user.roles.length > 0) {
        const profileSp = { id: profileData.user.id, name: profileData.user.name, roles: profileData.user.roles };
        return { label: t('smmInviteBtn'), fn: () => inviteClick(profileSp) };
      }
      return { label: t('smmInviteBtn'), fn: () => toast(t('smmInviteNoRoles')) };
    }
    // the files / card-chat windows are floating PANELS now — the main area
    // (and the bar with it) stays visible while they are open; bookmarks /
    // chats / requests windows keep the bar standing too («всегда в панели»)
    const mainVisible = topWindow === 'none' || topWindow === 'files' || topWindow === 'card-chat';
    if (!mainVisible && topWindow !== 'bookmarks' && topWindow !== 'chats' && topWindow !== 'requests') return null;
    if (editMode) {
      const canEdit = (activeItem?.kind === 'post' && activeItem.specialistId === myId)
        || (activeItem?.kind === 'event' && activeItem.customerId === myId);
      if (canEdit && activeItem) return { label: activeItem.kind === 'post' ? t('smmPostEdit') : t('smmEventEdit'), fn: startEditActive };
      return null;
    }
    if (isSpecialist) {
      if (mainVisible && activeItem?.kind === 'event' && activeEvent && activeEvent.customerId !== myId) {
        // Disabled only in the transient state «roles exist but none picked»
        // (the picker defaults the first role instantly, so it never sticks);
        // role-less specialists get a WORKING button that opens the post editor.
        return { label: t('smmApplyBtn'), fn: applyFromCard, disabled: myRoles.length > 0 && !pickedApplyRole };
      }
      return null;
    }
    // CUSTOMER MODE — the invite button always stands: the active specialist
    // card, the seen one (any surface), or the last viewed specialist —
    // otherwise the button leads to the public library.
    const seen = activeCardId ? seenItemsRef.current[activeCardId] : null;
    const sp = activeSpecialist
      || (seen && seen.kind === 'specialist' ? seen : null)
      || lastSpRef.current
      || null;
    return { label: t('smmInviteBtn'), fn: () => inviteClick(sp) };
  })();

  // ── window contents ─────────────────────────────────────────────────────
  // The card-chat / files windows are FLOATING PANELS now (the same docked-
  // panel format the «Обсудить с ИИ» window keeps) — they no longer replace
  // the main window, so they carry no windowTitle.
  const windowTitle = topWindow === 'bookmarks' ? t('smmTopBookmarks')
    : topWindow === 'chats' ? t('smmTopChats')
    : topWindow === 'requests' ? t('smmRequestsMine')
    : topWindow === 'profile' ? t('smmViewProfile')
    : topWindow === 'map' ? t('mapTitle') : null;

  const renderCard = (it: AnyItem, selected: boolean, variant: 'grid' | 'shelf' | 'slide' | 'feed') => {
    seenItemsRef.current[it.id] = it; // «Изменить» own-detection from ANY surface
    const ctx = makeCtx(it, selected);
    if (it.kind === 'event') return <SmmEventCardView key={it.id} event={it} variant={variant} ctx={ctx} />;
    if (it.kind === 'post') return <SmmPostCardView key={it.id} post={it} variant={variant} ctx={ctx} />;
    return <SmmSpecialistCardView key={it.id} sp={it} variant={variant} ctx={ctx} />;
  };

  const renderMainWindow = () => {
    if (topWindow === 'map') {
      // ── the MAP WINDOW (Карта спотов) — a MAIN-PAGE variant: the top panel
      // and the bottom docks (library + mode) stay on screen; the universal
      // back arrow in the top panel closes the window. Scope/add controls
      // float over the map itself.
      return <SpotsEmbed lang={lang} myId={myId} authed={!!effectiveUser} />;
    }
    if (windowTitle) {
      // ── the ОКНО ПРОФИЛЯ (opened by tapping an author on any card) ──
      if (topWindow === 'profile') {
        const spProfile: SmmSpecialistT | null = profileData && profileData.user.roles.length > 0
          ? { id: profileData.user.id, name: profileData.user.name, image: profileData.user.image, rating: profileData.user.rating, orders: profileData.user.orders, roles: profileData.user.roles }
          : null;
        return (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-2xl mx-auto flex flex-col gap-3 px-3 sm:px-4 py-3">
              {profileLoading && (
                <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-10"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>
              )}
              {!profileLoading && !profileData && <p className="text-sm text-muted-foreground text-center py-10">—</p>}
              {profileData && (
                <>
                  {spProfile ? (
                    /* the specialist profile leads with THEIR card — the very
                    same card the публичная библиотека shows (rating, orders,
                    roles+prices, the event/role pickers) */
                    <SmmSpecialistCardView
                      sp={spProfile}
                      variant="feed"
                      ctx={makeCtx({ kind: 'specialist', ...spProfile }, true)}
                    />
                  ) : (
                    /* a customer (or a role-less specialist) — the identity
                    card in the same style: the standard strip + «написать» */
                    <div className="rounded-2xl border bg-white p-2 sm:p-3 lg:p-4 flex flex-col gap-2">
                      <CreatorStrip
                        name={profileData.user.name}
                        creatorId={profileData.user.id}
                        image={profileData.user.image}
                        bookmarked={bookmarkOf('specialist', profileData.user.id)}
                        onToggleBookmark={() => void toggleBookmark('specialist', profileData.user.id)}
                        addLabel={t('bookmarkAdd')} removeLabel={t('bookmarkRemove')}
                        addShort={t('bookmarkAddShort')} removeShort={t('bookmarkRemoveShort')}
                        openLabel={t('openProfile')}
                      />
                      {profileData.user.id !== myId && (
                        <Button variant="outline" className="h-8 rounded-full border-black text-[11px] sm:text-xs justify-start gap-1" onClick={() => void openDirectChat(profileData.user.id)}>
                          <MessageCircle className="size-3.5 shrink-0" /> <span>{t('smmProfileOpenChats')}</span>
                        </Button>
                      )}
                    </div>
                  )}
                  {/* their published cards — the same cards with the same
                  capabilities (share / chat / bookmark / profile) */}
                  {profileData.posts.length > 0 && (
                    <>
                      <h3 className="text-sm font-bold text-muted-foreground px-1">{t('smmPosts')}</h3>
                      {profileData.posts.map(p => renderCard({ ...p, kind: 'post' } as AnyItem, false, 'feed'))}
                    </>
                  )}
                  {profileData.events.length > 0 && (
                    <>
                      <h3 className="text-sm font-bold text-muted-foreground px-1">{t('smmEvents')}</h3>
                      {profileData.events.map(e => renderCard({ ...e, kind: 'event' } as AnyItem, false, 'feed'))}
                    </>
                  )}
                  {profileData.posts.length === 0 && profileData.events.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('smmProfileNothing')}</p>
                  )}
                  {/* ── Отзывы (Mercur model): the real received deal reviews ── */}
                  {profileData.reviewAgg && (
                    <div className="rounded-2xl border bg-white p-3 sm:p-4">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" fill="currentColor" />
                        <p className="text-sm font-bold">{t('smmReviews')}</p>
                        <span className="text-xs text-muted-foreground">
                          {profileData.reviewAgg.count > 0
                            ? `${profileData.reviewAgg.avg ?? '—'} · ${t('smmReviewsCount', { n: profileData.reviewAgg.count })}`
                            : t('smmReviewsEmpty')}
                        </span>
                      </div>
                      {(profileData.reviews || []).map(rv => (
                        <div key={rv.id} className="mt-2 rounded-xl bg-muted/50 p-2.5">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <Star key={n} className={`w-3 h-3 ${n <= rv.rating ? 'text-amber-500' : 'text-black/15'}`} fill={n <= rv.rating ? 'currentColor' : 'none'} />
                            ))}
                            <span className="text-[11px] text-muted-foreground ml-1 truncate">{rv.authorName}</span>
                          </div>
                          {rv.comment && <p className="text-xs mt-1 break-words">{rv.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      }
      // ── the закладки / чаты / запросы window ──
      if (topWindow === 'bookmarks') {
        return (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
            <div className="max-w-2xl mx-auto flex flex-col gap-2">
              {bookmarks.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">{t('smmBookmarksEmpty')}</p>}
              {bookmarks.map(b => {
                if (b.targetType === 'event' && b.event) return (
                  <BookmarkRow key={b.id} kind="event" label={b.event.title} sub={b.event.customer?.name || ''}
                    onOpen={() => { if (b.event?.customerId) useSmmStore.setState({ profileUserId: b.event.customerId, topWindow: 'profile', openChatId: null }); }}
                    onRemove={async () => { await api.removeSmmBookmark('event', b.targetId); void loadLists(); }}
                    t={t} />
                );
                if (b.targetType === 'specialist' && b.specialist) return (
                  <BookmarkRow key={b.id} kind="specialist" label={b.specialist.name} sub={`${t('smmRating')}: ${b.specialist.rating > 0 ? b.specialist.rating.toFixed(1) : '—'}`}
                    onOpen={() => useSmmStore.setState({ profileUserId: b.targetId, topWindow: 'profile', openChatId: null })}
                    onRemove={async () => { await api.removeSmmBookmark('specialist', b.targetId); void loadLists(); }}
                    t={t} />
                );
                if (b.targetType === 'post' && b.post) return (
                  <BookmarkRow key={b.id} kind="post" label={b.post.role?.name || t('smmPost')} sub={b.post.specialist?.name || ''}
                    onOpen={() => { if (b.post?.specialistId) useSmmStore.setState({ profileUserId: b.post.specialistId, topWindow: 'profile', openChatId: null }); }}
                    onRemove={async () => { await api.removeSmmBookmark('post', b.targetId); void loadLists(); }}
                    t={t} />
                );
                return null;
              })}
            </div>
          </div>
        );
      }
      if (topWindow === 'chats') {
        if (openChatId) {
          const chat = chats.find(c => c.id === openChatId);
          return (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
                <div className="max-w-2xl mx-auto flex flex-col gap-2">
                  {chatMessages.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">—</p>}
                  {chatMessages.map(m => {
                    const mine = m.userId === myId;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.kind === 'system' ? 'bg-[#FFF0D9] border border-black/10 text-black/80' : mine ? 'bg-cta text-white' : 'bg-muted'}`}>
                          {!mine && m.kind !== 'system' && <p className="text-[10px] font-bold opacity-70 mb-0.5">{m.userName}</p>}
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-3 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
                <div className="max-w-2xl mx-auto flex gap-2">
                  <Input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                    placeholder={t('smmChatMessage')} className="h-9 rounded-full bg-white border-black/15" />
                  <Button size="sm" onClick={sendChat} className="h-9 rounded-full shrink-0"><Send className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
            <div className="max-w-2xl mx-auto flex flex-col gap-2">
              {chatCreateOpen && (
                <Card className="rounded-2xl border-2 border-cta bg-white">
                  <CardContent className="p-3 flex flex-col gap-2">
                    <p className="text-sm font-bold">{renamingChatId ? t('smmPostEdit') : t('smmChatNew')}</p>
                    <Input autoFocus value={chatTitle} onChange={e => setChatTitle(e.target.value)} placeholder={t('smmChatTitlePh')} className="h-9 rounded-full bg-white border-black/15" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={submitChatCreate} disabled={!chatTitle.trim()} className="h-8 rounded-full flex-1">{t('smmChatSend')}</Button>
                      <Button size="sm" variant="outline" onClick={() => { setChatCreateOpen(false); setRenamingChatId(null); }} className="h-8 rounded-full border-black/30">{t('cancel')}</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {chats.length === 0 && !chatCreateOpen && <p className="text-sm text-muted-foreground text-center py-10">{t('smmChatEmpty')}</p>}
              {chats.map(c => (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <ChatRow title={c.title || (c.kind === 'direct' ? 'Диалог' : 'Чат')} last={c.lastMessage} active={false} onClick={() => useSmmStore.setState({ openChatId: c.id })} />
                  </div>
                  {editMode && c.ownerId === myId && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-full border-black/30 shrink-0"
                        onClick={() => { setRenamingChatId(c.id); setChatCreateOpen(true); setChatTitle(c.title); }}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-full border-destructive/50 text-destructive shrink-0"
                        onClick={async () => { await api.deleteSmmChat(c.id); toast(t('smmChatDeleted')); void loadChats(); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }
      // requests
      return (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
          <div className="max-w-2xl mx-auto flex flex-col gap-2">
            {requests.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">{t('smmRequestsEmpty')}</p>}
            {requests.map(r => {
              const canDecide = r.direction === 'incoming' && r.status === 'pending';
              const myConfirmDone = r.kind === 'application'
                ? (r.direction === 'incoming' ? r.completedByCustomer : r.completedBySpecialist)
                : (r.direction === 'incoming' ? r.completedBySpecialist : r.completedByCustomer);
              const confirmations = (r.completedByCustomer ? 1 : 0) + (r.completedBySpecialist ? 1 : 0);
              return (
              <RequestRow key={r.id} kindLabel={`${r.kind === 'application' ? t('smmApplication') : t('smmInvitation')} · ${r.direction === 'incoming' ? t('smmReqIn') : t('smmReqOut')}`}
                title={r.eventTitle}
                sub={`${r.counterpartyName ? `${r.counterpartyName} · ` : ''}${r.roleName}`}
                proofUrl={r.kind === 'application' ? (r.proofUrl || null) : null}
                status={r.status} score={r.kind === 'application' ? `${r.score}/${r.totalQuestions}` : (r.estimate != null ? `${t('smmEstimate')}: ${fmtMoney(r.estimate)}` : undefined)}
                onWithdraw={r.direction === 'incoming' ? undefined : () => withdraw(r)} withdrawLabel={t('smmRequestWithdraw')}
                canDecide={canDecide}
                onAccept={() => decideRow(r, 'accepted')}
                onDecline={() => decideRow(r, 'declined')}
                onComplete={r.status === 'accepted' ? () => completeDealRow(r) : undefined}
                onReview={r.status === 'completed' ? () => openReview(r) : undefined}
                reviewed={!!r.myReview}
                confirmations={confirmations}
                myConfirmDone={myConfirmDone}
                t={t} />
              );
            })}
          </div>
        </div>
      );
    }
    // ── the SMM cards main window ──
    if (listLoading && items.length === 0) {
      return (
        <main className="flex-1 min-h-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>
        </main>
      );
    }
    if (filtered.length === 0) {
      // The specialist's ПУБЛИЧНАЯ библиотека is the orders feed — its empty
      // state spells out what an order carries: date, short description, the
      // place on the map, the budget per specialist and the order type.
      const emptyTitle = isSpecialist
        ? (personal ? t('smmMyPosts') : t('smmEvents'))
        : (personal ? t('smmMyEvents') : t('smmSpecialists'));
      const emptyDesc = isSpecialist
        ? (personal ? t('smmPostEmpty') : t('smmOrdersEmpty'))
        : (personal ? t('smmEventEmpty') : t('smmSpecialistsEmpty'));
      return (
        /* The empty-state card FILLS the space between the panels: h-full
        flex column + flex-1 card with centered content — a short text no
        longer leaves the card floating small under the top panel. */
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 h-full min-h-0 flex flex-col">
            <Card className="rounded-4xl border-dashed border-black/30 bg-white flex-1 min-h-0 flex flex-col justify-center">
              <CardContent className="py-12 text-center">
                <LayoutGrid className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{emptyTitle}</h3>
                <p className="text-muted-foreground mb-4">{emptyDesc}</p>
                {((isSpecialist && personal) || (!isSpecialist && personal)) && (
                  <Button onClick={startCreate}><Plus className="w-4 h-4 mr-2" /> {isSpecialist ? t('smmPostCreate') : t('smmEventCreate')}</Button>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      );
    }
    if (isGrid) {
      return (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* flex flex-col: the .grid-row-h rows GROW into the free space — the
          cards ALWAYS fill the area between the top and the bottom panels no
          matter how little text they carry (1 short card = a full screen). */}
          <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto h-full flex flex-col">
            {gridRows.map((row, ri) => (
              <div key={ri} className={`grid-row-h grid ${gridPerRow === 1 ? 'grid-cols-1' : gridPerRow === 2 ? 'grid-cols-2' : gridPerRow === 4 ? 'grid-cols-4' : gridPerRow === 5 ? 'grid-cols-5' : 'grid-cols-3'} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {row.map(it => renderCard(it, it.id === activeCardId, dashView === 'shelf' ? 'shelf' : 'grid'))}
              </div>
            ))}
          {/* Desktop clearance for the TWO floating docks (context bar /
          library): the last row must scroll clear above them. Mobile
          docks are in-flow panels — no spacer needed there. */}
            <div aria-hidden="true" className="hidden lg:block h-44 shrink-0" />
          </div>
        </div>
      );
    }
    // feed — the SAME engine the tests feed runs: Swiper (vertical, one
    // slide per view) + mousewheel one-gesture-one-card + the desktop
    // arrows; every slide wears ITS cover colour full-bleed and the card
    // content sits directly on it (the tests feed slide anatomy).
    const activeIdx = Math.max(0, filtered.findIndex(x => x.id === activeCardId));
    return (
      <div className="relative flex-1 min-h-0 min-w-0" onWheelCapture={onWheelCapture}>
        <Swiper
          key="smm-feed-swiper"
          {...swiperParams}
          className="feed-swiper h-full screen-enter"
          initialSlide={Math.min(Math.max(0, activeIdx), Math.max(0, filtered.length - 1))}
          onSwiper={sw => { smmSwiperRef.current = sw; }}
          onSlideChange={sw => commitSlide(sw.activeIndex)}
        >
          <FeedArrows
            onPrev={() => smmSwiperRef.current?.slidePrev()}
            onNext={() => smmSwiperRef.current?.slideNext()}
            canPrev={activeIdx > 0}
            canNext={activeIdx < filtered.length - 1}
            prevLabel={t('feedPrev')}
            nextLabel={t('feedNext')}
          />
          {filtered.map(it => (
            <SwiperSlide key={it.id} style={smmSlideBgFor(it)} className="relative !h-full overflow-hidden">
              <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-44 min-h-0">
                {renderCard(it, it.id === activeCardId, 'slide')}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    );
  };

  const plusHidden = topWindow === 'bookmarks' || topWindow === 'profile' || topWindow === 'map';
  const tw = topWindow as string; // widened read for the JSX comparisons

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="relative max-w-7xl mx-auto px-3 sm:px-4 h-14 lg:h-16 flex flex-nowrap items-center justify-between gap-1 sm:gap-2">
          {searchOpen && (
            <div className="absolute inset-0 z-50 bg-white flex items-center gap-2 px-3 sm:px-4 animate-in fade-in duration-150">
              <div className="flex-1 min-w-0 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearch(''); } }}
                  placeholder={t('smmSearchPh')} className="h-9 lg:h-10 rounded-full pl-9 bg-white border-black/15 text-sm" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSearchOpen(false); setSearch(''); }} className="shrink-0 h-9 w-9 p-0" aria-label={t('cancel')}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0">
            {(topWindow !== 'none' || openChatId) && (
              <Button variant="outline" size="icon"
                onClick={() => { if (openChatId) useSmmStore.setState({ openChatId: null }); else useSmmStore.setState({ topWindow: 'none', filesTarget: null, cardChat: null }); }}
                className="rounded-full shrink-0 border-black lg:h-10 lg:w-10" title={t('back')} aria-label={t('back')}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            {windowTitle ? (
              <h1 className="text-base sm:text-lg font-bold truncate">{windowTitle}</h1>
            ) : (
              <>
                <Button onClick={startCreate} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm">
                  <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{isSpecialist ? (personal ? t('smmPostCreate') : t('smmRequestsMine')) : (personal ? t('smmEventCreate') : t('smmRequestsMine'))}</span>
                </Button>
                <Button variant="outline" onClick={() => useSmmStore.setState({ editMode: !editMode })}
                  className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm ${editMode ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}>
                  <Edit className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('editTest')}</span>
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
            <Button variant="outline" onClick={() => setSearchOpen(true)} className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10" title={t('searchByTags')} aria-label={t('searchByTags')}>
              <Search className="w-4 h-4" />
            </Button>
            {/* MAP — the top-panel icon into the Карта спотов window: the map
            opens INSIDE this main page (top + bottom panels stay), the
            universal back arrow (left) closes it */}
            <Button variant="outline" onClick={() => useSmmStore.setState({ topWindow: tw === 'map' ? 'none' : 'map', openChatId: null, filesTarget: null, cardChat: null })}
              className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10 ${tw === 'map' ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
              title={t('navMap')} aria-label={t('navMap')}>
              <MapIcon className="w-4 h-4" />
            </Button>
            {/* ИИ-АГЕНТ — the one-button platform automation (plan / ТЗ / идеи /
            хештеги; ТЗ becomes a real заказ with one tap) */}
            <Button variant="outline" onClick={() => setAgentOpen(true)}
              className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10"
              title={t('navAgent')} aria-label={t('navAgent')}>
              <Bot className="w-4 h-4" />
            </Button>
            {!plusHidden && (
              <Button variant="outline" onClick={() => useSmmStore.setState({ topWindow: tw === 'bookmarks' ? 'none' : 'bookmarks', openChatId: null })}
                className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10 ${tw === 'bookmarks' ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
                title={t('smmTopBookmarks')} aria-label={t('smmTopBookmarks')}>
                <Star className={`w-4 h-4 ${tw === 'bookmarks' ? 'fill-current' : ''}`} />
              </Button>
            )}
            <Button variant="outline" onClick={() => useSmmStore.setState({ topWindow: tw === 'chats' ? 'none' : 'chats', openChatId: null })}
              className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10 ${tw === 'chats' ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
              title={t('smmTopChats')} aria-label={t('smmTopChats')}>
              <MessageCircle className="w-4 h-4" />
            </Button>
            {!windowTitle && (
              <Button variant="outline" onClick={() => setDashView(dashView === 'tiktok1' ? 'library' : dashView === 'library' ? 'shelf' : 'tiktok1')}
                className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('viewMode')} aria-label={t('viewMode')}>
                {dashView === 'library' ? <LayoutGrid className="w-4 h-4 sm:mr-2" /> : dashView === 'shelf' ? <Rows3 className="w-4 h-4 sm:mr-2" /> : <Play className="w-4 h-4 sm:mr-2" />}
                <span className="hidden sm:inline">{dashView === 'library' ? t('viewLibrary') : dashView === 'shelf' ? t('viewShelf') : t('viewTikTok')}</span>
              </Button>
            )}
            <div className="hidden md:flex h-8 lg:h-10 w-8 lg:w-10 items-center justify-center" />
            <button
              onClick={() => setMeOpen(true)}
              title={t('profileTitle')} aria-label={t('profileTitle')}
              className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-cta text-white flex items-center justify-center font-bold text-sm shadow-sm active:scale-95 transition-transform shrink-0 overflow-hidden"
            >
              {myAvatar ? <img src={myAvatar} alt="" className="absolute inset-0 w-full h-full object-cover" /> : userInitials}
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      {renderMainWindow()}

      {/* ── BAR 1: the context action (Подать заявку / Пригласить / Изменить).
      desktop-dock-raised: the SMM dashboard stacks TWO docks — the library
      dock at the very bottom and this bar above it — without the raise the
      bar paints OVER the library dock. (The third dock — the role switcher —
      is GONE: separate registration fixed the specialist/customer tab.) */}
      {barAction && (
        <div className="desktop-dock desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-3">
            <Button onClick={barAction.fn} disabled={'disabled' in barAction && barAction.disabled} className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-cta hover:bg-cta/90 text-white">
              {barAction.label}
            </Button>
          </div>
        </div>
      )}

      {/* ── DOCK: личная библиотека | публичная библиотека — the very-bottom
      dock (the role switcher panel used to sit under it — removed: the tab
      is fixed by the separate registration). */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => gotoLibrary(false)} disabled={listLoading}
              title={t('modeMine')} aria-label={t('modeMine')}
              className={`min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 rounded-full border-2 text-[11px] sm:text-[13px] lg:text-sm font-semibold transition-colors ${personal ? 'bg-cta hover:bg-cta/90 text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}>
              <Library className="w-4 h-4 shrink-0" />
              <span className="min-w-0 truncate">{t('modeMine')}</span>
            </button>
            <button type="button" onClick={() => gotoLibrary(true)} disabled={listLoading}
              title={t('modeDiscover')} aria-label={t('modeDiscover')}
              className={`min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 rounded-full border-2 text-[11px] sm:text-[13px] lg:text-sm font-semibold transition-colors ${!personal ? 'bg-cta hover:bg-cta/90 text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}>
              <Compass className="w-4 h-4 shrink-0" />
              <span className="min-w-0 truncate">{t('modeDiscover')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* image preview dialog (post photo collections) */}
      {imgPreview && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-6" onClick={() => setImgPreview(null)}>
          <img src={imgPreview} alt="" className="max-h-full max-w-full rounded-2xl shadow-2xl" />
          <Button variant="outline" size="icon" className="absolute top-4 right-4 rounded-full bg-white" onClick={() => setImgPreview(null)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
      {/* THE DELETE DIALOG — «Удалить» from any card opens the same
      confirm-first dialog the test cards keep: the card disappears only
      after the confirmation, and the server still refuses a stranger's card. */}
      <AlertDialog open={!!smmDelete} onOpenChange={() => setSmmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('smmDeleteQ')}</AlertDialogTitle>
            <AlertDialogDescription>
              {smmDelete?.title ? `«${smmDelete.title}» · ` : ''}{t('smmDeleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSmmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('gDelete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* «Обсудить с ИИ» — the SAME panel the test cards open, docked to the
      right edge on desktop exactly like the dashboard's AI window in app-root */}
      <div className={aiOpen ? 'fixed inset-0 z-50 flex items-center justify-end lg:p-5 pointer-events-none' : 'contents'}>
        <div className="pointer-events-auto max-h-full">
          <AiChatPanel
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            subtitle={aiTarget?.title}
            messages={aiMessages}
            loading={aiLoading}
            input={aiInput}
            onInputChange={setAiInput}
            onSend={() => sendSmmAi()}
            endRef={aiEndRef}
            inputPlaceholder={t('aiTestChatPlaceholder')}
            historyOpen={aiHistoryOpen}
            onToggleHistory={() => setAiHistoryOpen(v => !v)}
            threads={aiThreadMetas}
            activeThreadId={aiTarget ? `${aiTarget.kind}:${aiTarget.id}` : undefined}
            onSelectThread={selectSmmAiThread}
            historyLabel={t('chatHistory')}
            noChatsLabel={t('noChatsYet')}
            onNewChat={newSmmAiThread}
            newChatLabel={t('newChat')}
            switcher={smmSwitcher}
          />
        </div>
      </div>
      {/* «Чат» on the card — everyone's group chat about THIS card, the SAME
      GroupChatPanel the test cards open (side panel on desktop / the
      resizable bottom sheet on mobile) */}
      {cardChatMounted && cardChatLast.current && (
        <div className="fixed inset-0 z-50 flex items-center justify-end lg:p-5 pointer-events-none">
          <div className="pointer-events-auto max-h-full">
            <GroupChatPanel
              open={!!cardChat}
              onClose={() => useSmmStore.setState({ cardChat: null, topWindow: 'none' })}
              title={t('gChat')}
              subtitle={cardChatLast.current.title}
              messages={cardMessages.map(m => ({ id: m.id, userId: m.userId, userName: m.userName, text: m.text, createdAt: m.createdAt }))}
              currentUserId={myId}
              input={cardInput}
              onInputChange={setCardInput}
              onSend={() => { void sendCardChatMsg(); }}
              sending={false}
              endRef={cardEndRef}
              inputPlaceholder={t('smmChatMessage')}
              onOpenProfile={(u) => useSmmStore.setState({ cardChat: null, filesTarget: null, topWindow: 'profile', profileUserId: u.id })}
              openProfileLabel={t('smmViewProfile')}
              switcher={smmSwitcher}
            />
          </div>
        </div>
      )}
      {/* «Файлы» on the card — the SAME docked-panel window the test files
      button opens: the card's «Прикреплённые файлы» + the event's
      qualification tests OR the post's media collection */}
      {filesMounted && filesLast.current && (
        <SmmFilesWindow
          target={filesLast.current}
          open={!!filesTarget}
          onClose={() => useSmmStore.setState({ filesTarget: null, topWindow: 'none' })}
          t={t}
          onOpenImage={(u) => setImgPreview(u)}
          switcher={smmSwitcher}
        />
      )}
      {/* THE EDIT WINDOW — «Изменить» from a card or the window switcher: the
      SAME resizable sheet the test cards open (the editor body inside + Save
      in the footer; the header wears the window switcher). Somebody else's
      card first became a private VERSION copy — the rule startEditTest keeps. */}
      {editWinMounted && editWinLast.current && (() => {
        const w = editWinLast.current;
        const title = w.kind === 'event' ? t('smmEventEdit') : t('smmPostEdit');
        return (
          <ResizableSheetFrame
            open={!!editWin}
            onClose={() => setEditWin(null)}
            initialVh={0.85}
            minVh={0.4}
            maxW="max-w-3xl"
            header={
              <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                <SheetHeaderSwitcher
                  icon={<Pencil className="w-4 h-4 text-white" />}
                  title={title}
                  subtitle={w.title}
                  options={smmSheetOptions}
                  onSelect={smmSwitcher.onSelect}
                />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setEditWin(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            }
            body={
              <div className="px-4 py-4">
                <div className="max-w-3xl mx-auto space-y-4">
                  {w.kind === 'event' ? (
                    <SmmEventForm
                      ref={editEventFormRef}
                      editingId={w.id}
                      onSaving={setEditWinSaving}
                      onSaved={() => { setEditWin(null); bumpAndReload(); }}
                      onFail={() => setEditWin(null)}
                    />
                  ) : (
                    <SmmPostForm
                      ref={editPostFormRef}
                      editingId={w.id}
                      onSaving={setEditWinSaving}
                      onSaved={() => { setEditWin(null); bumpAndReload(); }}
                      onFail={() => setEditWin(null)}
                    />
                  )}
                </div>
              </div>
            }
            footer={
              <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                <Button
                  onClick={() => (w.kind === 'event' ? editEventFormRef.current?.save() : editPostFormRef.current?.save())}
                  disabled={editWinSaving}
                  className="w-full rounded-full bg-primary hover:bg-primary/90"
                >
                  {editWinSaving ? t('saving') : t('save')}
                </Button>
              </div>
            }
          />
        );
      })()}
      {/* ── MY PROFILE — the avatar's «всплывающая снизу страница»: the SAME
      resizable-sheet page type, the ProfileBody inside (avatar/name/company/
      background/logout); the universal back of the sheet is its drag-down +
      the X button, no dedicated page anymore */}
      {meOpen && profileHandlers && (
        <ResizableSheetFrame
          open={meOpen}
          onClose={() => setMeOpen(false)}
          initialVh={0.85}
          minVh={0.4}
          maxW="max-w-3xl"
          header={
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-2xl bg-cta text-white flex items-center justify-center shrink-0 font-bold text-xs">
                  {myAvatar ? <img src={myAvatar} alt="" className="w-full h-full rounded-2xl object-cover" /> : userInitials}
                </span>
                <p className="text-sm font-bold truncate">{t('profileTitle')}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setMeOpen(false)} aria-label={t('cancel')}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          }
          body={
            <div className="px-1 py-1">
              <div className="max-w-2xl mx-auto">
                <ProfileBody {...profileHandlers} />
              </div>
            </div>
          }
        />
      )}
      {/* ── ИИ-АГЕНТ — the platform automation sheet (the top-panel Bot button);
      the ТЗ result becomes a real заказ in the personal library with one tap */}
      <SmmAgentSheet
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        lang={lang}
        isSpecialist={isSpecialist}
        onEventCreated={() => {
          toast(t('agentEventCreated'));
          useSmmStore.setState((s: any) => ({ refreshNonce: (s.refreshNonce || 0) + 1 }));
          void loadLists();
        }}
      />
      {/* ── ОТЗЫВ modal — the deal review left after BOTH sides complete ── */}
      {reviewCtx && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-3" onClick={() => setReviewCtx(null)}>
          <div className="w-full max-w-md rounded-4xl border border-black bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold">{t('smmReviewTitle')}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">«{reviewCtx.title}»{reviewCtx.counterparty ? ` · ${reviewCtx.counterparty}` : ''}</p>
            <div className="flex items-center gap-1.5 mt-3" role="radiogroup" aria-label={t('smmReviewRating')}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" role="radio" aria-checked={reviewRating === n} aria-label={`${n} ★`}
                  onClick={() => setReviewRating(n)}
                  className="p-1 active:scale-90 transition-transform">
                  <Star className={`w-7 h-7 ${n <= reviewRating ? 'text-amber-500' : 'text-black/20'}`}
                    fill={n <= reviewRating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder={t('smmReviewCommentPh')}
              rows={3}
              maxLength={1000}
              className="mt-3 w-full rounded-2xl border border-black/15 bg-white p-3 text-sm outline-none focus:border-cta"
            />
            <div className="flex gap-2 mt-3">
              <Button onClick={submitReview} disabled={reviewBusy || reviewRating < 1} className="h-9 rounded-full flex-1 bg-cta hover:bg-cta/90">
                {t('smmReviewSend')}
              </Button>
              <Button variant="outline" onClick={() => setReviewCtx(null)} className="h-9 rounded-full border-black/30">{t('cancel')}</Button>
            </div>
          </div>
        </div>
      )}
      <SmmToast />
    </div>
  );
}

// true when viewport >= lg (1024px) — the files window is a right-docked
// panel on desktop and a resizable bottom sheet on mobile (the same split
// the test files window keeps)
function useIsDesktopLg() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

// THE FILES WINDOW («Файлы» on any card) — the same chrome the test files
// window keeps (right-docked 400px panel on desktop / the resizable bottom
// sheet on mobile): the card's «Прикреплённые файлы» rows first (inline
// players for audio/video, PDF.js for pdf, previews for images), then the
// event's qualification tests OR the post's media collection.
function SmmFilesWindow({ target, open, onClose, t, onOpenImage, switcher }: {
  target: SmmFilesTarget;
  open: boolean;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onOpenImage: (url: string) => void;
  switcher?: { options: SheetOption[]; onSelect: (key: string) => void };
}) {
  const isDesktop = useIsDesktopLg();
  const files = (target.files || []) as import('@/components/attachment-utils').AttachmentItem[];
  const tests = target.tests || [];
  const media = target.media || [];
  const total = files.length + (target.kind === 'event' ? tests.length : media.length);

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
      {switcher ? (
        <SheetHeaderSwitcher
          icon={<Paperclip className="w-4 h-4 text-white" />}
          title={t('attachedFiles', { n: total })}
          subtitle={target.title}
          options={switcher.options}
          onSelect={switcher.onSelect}
        />
      ) : (
        <span className="min-w-0">
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <Paperclip className="w-4 h-4" /> {t('attachedFiles', { n: total })}
          </span>
          <span className="block text-xs text-muted-foreground truncate">{target.title}</span>
        </span>
      )}
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  const rows = (
    <div className="px-4 pb-6 flex flex-col gap-2">
      {files.length > 0 && (
        <div className="pt-2 -mx-1">
          <AttachmentsList items={files} />
        </div>
      )}
      {target.kind === 'event' && (
        tests.length === 0 && files.length === 0
          ? <p className="text-sm text-muted-foreground text-center py-8">{t('smmEventTestsNone')}</p>
          : tests.map(tt => (
            <div key={tt.id} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
              <span className="w-10 h-10 rounded-xl bg-[#DFF3E8] flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5 text-cta" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{tt.title}</p>
                <p className="text-xs text-muted-foreground">{t('smmTestQuestions', { n: tt.questions ?? 0 })}</p>
              </div>
            </div>
          ))
      )}
      {target.kind === 'post' && (
        media.length === 0 && files.length === 0
          ? <p className="text-sm text-muted-foreground text-center py-8">{t('smmProfileNothing')}</p>
          : media.map((m, i) => (
            m.type === 'image' ? (
              <button key={i} type="button" onClick={() => onOpenImage(mediaSrc(m.url))} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3 text-left hover:border-black/30 transition-colors">
                <span className="w-10 h-10 rounded-xl overflow-hidden shrink-0"><img src={mediaSrc(m.url)} alt="" className="w-full h-full object-cover" /></span>
                <span className="min-w-0 flex-1 text-sm font-bold truncate">{t('smmPhoto')}</span>
              </button>
            ) : (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
                <span className="w-10 h-10 rounded-xl bg-[#FFF0D9] flex items-center justify-center shrink-0"><Film className="w-5 h-5 text-cta" /></span>
                <span className="min-w-0 flex-1 text-sm font-bold truncate">{t('smmVideo')}</span>
              </div>
            )
          ))
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-end p-5 pointer-events-none">
        <div className={`pointer-events-auto ${open ? 'animate-in fade-in slide-in-from-right-2 duration-300' : 'animate-out fade-out slide-out-to-right-2 pointer-events-none duration-200'}`}>
          <div className="rounded-4xl border border-black bg-white flex flex-col h-[680px] overflow-hidden w-[400px]">
            {header}
            <div className="flex-1 min-h-0 overflow-y-auto">{rows}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <ResizableSheetFrame
      open={open}
      onClose={onClose}
      initialVh={0.78}
      minVh={0.35}
      header={header}
      body={<div className="min-h-full">{rows}</div>}
      footer={<span />}
    />
  );
}

// Lightweight toast: listens to the local 'smm-toast' event
// (the component itself lives in smm-bits so the editor pages can host it too)
