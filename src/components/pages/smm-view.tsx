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
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { tUI } from '@/lib/i18n';
import { CreatorStrip } from '@/components/shared-bits';
import {
  ArrowLeft, Compass, Edit, Film, Library, LayoutGrid, Loader2, MessageCircle,
  Play, Plus, Rows3, Search, Send, Star, Trash2, X, ClipboardList,
} from 'lucide-react';
import { useSessionStore } from '@/stores/session-store';
import { useNavStore } from '@/stores/nav-store';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useProfileStore } from '@/stores/profile-store';
import { useSmmStore, smmNow, type SmmMode } from '@/stores/smm-store';
import type { SmmChatT, SmmEventT, SmmPostT, SmmRequestRowT, SmmRoleT, SmmSpecialistT, SmmProfileT } from '@/lib/app-types';

// The «Обсудить с ИИ» window — the SAME panel the test cards open (the
// dynamic import keeps it out of the first paint, like app-root does)
const AiChatPanel = dynamic(() => import('@/components/chat-panels').then(m => m.AiChatPanel), { ssr: false, loading: () => null });

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
  BookmarkRow, ChatRow, RequestRow, SmmEventCardView, SmmPostCardView, SmmSpecialistCardView, type CardCtx,
} from './smm-cards';
import { fmtMoney, mediaSrc } from './smm-bits';

type AnyItem = ({ kind: 'post' } & SmmPostT) | ({ kind: 'event' } & SmmEventT) | ({ kind: 'specialist' } & SmmSpecialistT);

export default function SmmDashboard() {
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
  const [busy, setBusy] = useState(false);
  const [chatCreateOpen, setChatCreateOpen] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [smmBookmarksSet, setSmmBookmarksSet] = useState<Set<string>>(new Set());
  const [profileData, setProfileData] = useState<SmmProfileT | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

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

  const loadRequests = useCallback(async () => {
    if (!myId) return;
    try {
      const r = isSpecialist ? await api.getApplications() : await api.getInvitations();
      setRequests(r.items || []);
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
      .then(r => { if (alive) setProfileData(r); })
      .catch(() => { if (alive) setProfileData(null); })
      .finally(() => { if (alive) setProfileLoading(false); });
    return () => { alive = false; };
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

  const switchMode = async (m: SmmMode) => {
    if (m === smmMode) return;
    useSmmStore.setState({
      smmMode: m, topWindow: 'none', editMode: false, activeCardId: null,
      pickedApplyRole: null, pickedInviteEvent: null, pickedInviteRole: null, openChatId: null,
      profileUserId: null, filesTarget: null,
    });
    api.setSmmMode(m).catch(() => {});
  };

  const gotoLibrary = (discover: boolean) => {
    setDiscoverMode(discover);
    useSmmStore.setState({ topWindow: 'none', activeCardId: null, openChatId: null, pickedApplyRole: null, pickedInviteEvent: null, pickedInviteRole: null, profileUserId: null, filesTarget: null });
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
  // card's passport (/api/smm/ai-chat) ──
  const openSmmAi = (kind: 'event' | 'post' | 'specialist', id: string, title: string) => {
    const tid = `${kind}:${id}`;
    const th = aiThreads[tid];
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
    if (topWindow !== 'none') return;
    if (!activeItem) return;
    if (activeItem.kind === 'post' && activeItem.specialistId === myId) { useSmmStore.setState({ editingId: activeItem.id }); setPage('smm-post-editor'); }
    else if (activeItem.kind === 'event' && activeItem.customerId === myId) { useSmmStore.setState({ editingId: activeItem.id }); setPage('smm-event-editor'); }
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

  const applyFromCard = () => {
    if (!activeEvent || !pickedApplyRole) return;
    useSmmStore.setState({
      applyCtx: { eventId: activeEvent.id, roleId: pickedApplyRole, testIds: activeEvent.testIds || [] },
      inviteCtx: null,
    });
    setPage('smm-apply');
  };

  // Приглашение: примерная сумма depends on the EVENT's format — онлайн =
  // цена за 1000 просмотров, оффлайн = цена за день (8 часов).
  const inviteFrom = (sp: { id: string; name: string; roles: SmmRoleT[] }, pickedEventId: string | null, pickedRoleId: string | null) => {
    if (!sp || !pickedEventId || !pickedRoleId) return;
    const role = sp.roles.find(r => r.id === pickedRoleId);
    const ev = myEvents.find(e => e.id === pickedEventId);
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

  const inviteFromCard = () => {
    if (!activeSpecialist) return;
    inviteFrom(activeSpecialist, pickedInviteEvent, pickedInviteRole);
  };

  // feed scroll → active card
  const onFeedScroll = () => {
    const el = feedRef.current;
    if (!el || isGrid) return;
    const idx = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
    const it = filtered[Math.min(idx, filtered.length - 1)];
    if (it && it.id !== smmNow().activeCardId) useSmmStore.setState({ activeCardId: it.id });
  };

  const userInitials = (() => {
    const userName = effectiveUser?.name || effectiveUser?.email || '';
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : userName.slice(0, 2);
    return (s || '?').toUpperCase();
  })();

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
        useSmmStore.setState({
          filesTarget: {
            kind: 'event', id: it.id, title: it.title,
            tests: (it.tests || []).map(tt => ({ id: tt.id, title: tt.title, questions: tt._count?.questions ?? 0 })),
          },
          topWindow: 'files', openChatId: null,
        });
      } else if (it.kind === 'post') {
        useSmmStore.setState({
          filesTarget: {
            kind: 'post', id: it.id, title: it.role?.name || t('smmPost'),
            media: ((it.media || []) as { url: string; type: string }[]).slice(0, 30),
          },
          topWindow: 'files', openChatId: null,
        });
      }
    },
    isPublic: it.kind === 'event' ? (it as SmmEventT).isPublic : undefined,
    onPublic: () => {
      if (it.kind !== 'event') return;
      api.updateEvent(it.id, { isPublic: !(it as SmmEventT).isPublic })
        .then(() => { toast(t('smmEventSaved')); bumpAndReload(); })
        .catch((e: any) => toast(e?.message || 'Error'));
    },
    onChat: () => {
      if (it.kind === 'event') { if (it.customerId !== myId) void openDirectChat(it.customerId); }
      else if (it.kind === 'post') { if (it.specialistId !== myId) void openDirectChat(it.specialistId); }
      else { if (it.id !== myId) void openDirectChat(it.id); }
    },
    onShare: () => { if (it.kind !== 'specialist') void doShare(it.kind, it.id); },
    onEdit: () => {
      if (it.kind === 'post') { useSmmStore.setState({ editingId: it.id }); setPage('smm-post-editor'); }
      else if (it.kind === 'event') { useSmmStore.setState({ editingId: it.id }); setPage('smm-event-editor'); }
    },
    onDelete: () => {
      setBusy(true);
      const done = () => { setBusy(false); bumpAndReload(); };
      if (it.kind === 'post') api.deletePost(it.id).then(done).catch((e: any) => { setBusy(false); toast(e?.message || 'Error'); });
      else if (it.kind === 'event') api.deleteEvent(it.id).then(done).catch((e: any) => { setBusy(false); toast(e?.message || 'Error'); });
    },
    onOpen: () => {
      useSmmStore.setState({ activeCardId: it.id });
      // picking defaults: the first own role / first event+role
      if (it.kind === 'event' && isSpecialist) {
        if (!smmNow().pickedApplyRole) useSmmStore.setState({ pickedApplyRole: myRoles[0]?.id || null });
      }
      if (it.kind === 'specialist') {
        if (!smmNow().pickedInviteRole) useSmmStore.setState({ pickedInviteRole: it.roles[0]?.id || null });
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

  // ── the first bottom bar (context action) ───────────────────────────────
  const barAction = (() => {
    // The profile window: a customer invites the viewed specialist right from
    // here (the same пригласить bar the specialist card carries in the
    // публичная библиотека).
    if (topWindow === 'profile') {
      if (!isSpecialist && profileData && profileData.user.roles.length > 0) {
        return {
          label: t('smmInviteBtn'),
          fn: () => inviteFrom(
            { id: profileData.user.id, name: profileData.user.name, roles: profileData.user.roles },
            pickedInviteEvent, pickedInviteRole,
          ),
          disabled: !pickedInviteEvent || !pickedInviteRole,
        };
      }
      return null;
    }
    if (topWindow !== 'none' || !activeItem) return null;
    if (editMode) {
      const canEdit = (activeItem.kind === 'post' && activeItem.specialistId === myId)
        || (activeItem.kind === 'event' && activeItem.customerId === myId);
      if (canEdit) return { label: activeItem.kind === 'post' ? t('smmPostEdit') : t('smmEventEdit'), fn: startEditActive };
      return null;
    }
    if (isSpecialist && activeItem.kind === 'event' && activeEvent && activeEvent.customerId !== myId) {
      return { label: t('smmApplyBtn'), fn: applyFromCard, disabled: !pickedApplyRole };
    }
    if (!isSpecialist && activeItem.kind === 'specialist') {
      return { label: t('smmInviteBtn'), fn: inviteFromCard, disabled: !pickedInviteEvent || !pickedInviteRole };
    }
    return null;
  })();

  // ── window contents ─────────────────────────────────────────────────────
  const windowTitle = topWindow === 'bookmarks' ? t('smmTopBookmarks')
    : topWindow === 'chats' ? t('smmTopChats')
    : topWindow === 'requests' ? t('smmRequestsMine')
    : topWindow === 'profile' ? t('smmViewProfile')
    : topWindow === 'files' ? (filesTarget?.kind === 'event' ? t('smmEventTests') : t('gFiles')) : null;

  const renderCard = (it: AnyItem, selected: boolean, variant: 'grid' | 'feed') => {
    const ctx = makeCtx(it, selected);
    if (it.kind === 'event') return <SmmEventCardView key={it.id} event={it} variant={variant} ctx={ctx} />;
    if (it.kind === 'post') return <SmmPostCardView key={it.id} post={it} variant={variant} ctx={ctx} />;
    return <SmmSpecialistCardView key={it.id} sp={it} variant={variant} ctx={ctx} />;
  };

  const renderMainWindow = () => {
    if (windowTitle) {
      // ── the ОКНО ФАЙЛОВ (the event's qualification tests / the post's
      // media collection — the same window the test files button opens) ──
      if (topWindow === 'files' && filesTarget) {
        return (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
            <div className="max-w-2xl mx-auto flex flex-col gap-2">
              <p className="text-sm font-bold text-muted-foreground px-1 truncate">{filesTarget.title}</p>
              {filesTarget.kind === 'event' && (
                (filesTarget.tests || []).length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-10">{t('smmEventTestsNone')}</p>
                  : (filesTarget.tests || []).map(tt => (
                    <div key={tt.id} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
                      <span className="w-10 h-10 rounded-xl bg-[#DFF3E8] flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5 text-cta" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{tt.title}</p>
                        <p className="text-xs text-muted-foreground">{t('smmTestQuestions', { n: tt.questions ?? 0 })}</p>
                      </div>
                    </div>
                  ))
              )}
              {filesTarget.kind === 'post' && (
                (filesTarget.media || []).length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-10">{t('smmProfileNothing')}</p>
                  : (filesTarget.media || []).map((m, i) => (
                    m.type === 'image' ? (
                      <button key={i} type="button" onClick={() => setImgPreview(mediaSrc(m.url))} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3 text-left hover:border-black/30 transition-colors">
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
          </div>
        );
      }
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
                      {profileData.posts.map(p => renderCard({ kind: 'post', ...p } as AnyItem, false, 'feed'))}
                    </>
                  )}
                  {profileData.events.length > 0 && (
                    <>
                      <h3 className="text-sm font-bold text-muted-foreground px-1">{t('smmEvents')}</h3>
                      {profileData.events.map(e => renderCard({ kind: 'event', ...e } as AnyItem, false, 'feed'))}
                    </>
                  )}
                  {profileData.posts.length === 0 && profileData.events.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('smmProfileNothing')}</p>
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
            {requests.map(r => (
              <RequestRow key={r.id} kindLabel={r.kind === 'application' ? t('smmApplication') : t('smmInvitation')}
                title={r.eventTitle} sub={r.kind === 'application' ? `${t('smmPostRole')}: ${r.roleName}` : `${r.counterpartyName} · ${r.roleName}`}
                status={r.status} score={r.kind === 'application' ? `${r.score}/${r.totalQuestions}` : (r.estimate != null ? `${t('smmEstimate')}: ${fmtMoney(r.estimate)}` : undefined)}
                onWithdraw={() => withdraw(r)} withdrawLabel={t('smmRequestWithdraw')} t={t} />
            ))}
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
      const emptyTitle = isSpecialist
        ? (personal ? t('smmMyPosts') : t('smmEvents'))
        : (personal ? t('smmMyEvents') : t('smmSpecialists'));
      const emptyDesc = isSpecialist
        ? (personal ? t('smmPostEmpty') : t('smmEventEmpty'))
        : (personal ? t('smmEventEmpty') : t('smmSpecialistsEmpty'));
      return (
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Card className="rounded-4xl border-dashed border-black/30 bg-white">
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
          <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto h-full">
            {gridRows.map((row, ri) => (
              <div key={ri} className={`grid ${gridPerRow === 1 ? 'grid-cols-1' : gridPerRow === 2 ? 'grid-cols-2' : gridPerRow === 4 ? 'grid-cols-4' : gridPerRow === 5 ? 'grid-cols-5' : 'grid-cols-3'} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {row.map(it => renderCard(it, it.id === activeCardId, 'grid'))}
              </div>
            ))}
          </div>
        </div>
      );
    }
    // feed
    return (
      <div ref={feedRef} onScroll={onFeedScroll} className="flex-1 min-h-0 overflow-y-auto snap-y snap-mandatory overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filtered.map(it => (
          <div key={it.id} className="snap-start snap-always h-full w-full flex items-center justify-center px-3 py-2">
            {renderCard(it, it.id === activeCardId, 'feed')}
          </div>
        ))}
      </div>
    );
  };

  const plusHidden = topWindow === 'bookmarks' || topWindow === 'profile' || topWindow === 'files';
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
                onClick={() => { if (openChatId) useSmmStore.setState({ openChatId: null }); else useSmmStore.setState({ topWindow: 'none' }); }}
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
              onClick={() => setPage('profile')}
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

      {/* ── BAR 1: the context action (Подать заявку / Пригласить / Изменить) ── */}
      {barAction && (
        <div className="desktop-dock desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-3">
            <Button onClick={barAction.fn} disabled={'disabled' in barAction && barAction.disabled} className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-cta hover:bg-cta/90 text-white">
              {barAction.label}
            </Button>
          </div>
        </div>
      )}

      {/* ── DOCK: личная библиотека | публичная библиотека ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2">
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

      {/* ── THE SECOND BOTTOM PANEL: СММ специалист | Заказчик ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-black/10">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => switchMode('specialist')}
              title={t('smmModeHintSpecialist')} aria-label={t('smmSpecialist')}
              className={`min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 rounded-full border-2 text-[11px] sm:text-[13px] lg:text-sm font-semibold transition-colors ${isSpecialist ? 'bg-primary hover:bg-primary/90 text-white border-primary shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}>
              <Star className={`w-4 h-4 shrink-0 ${isSpecialist ? 'fill-current' : ''}`} />
              <span className="min-w-0 truncate">{t('smmSpecialist')}</span>
            </button>
            <button type="button" onClick={() => switchMode('customer')}
              title={t('smmModeHintCustomer')} aria-label={t('smmCustomer')}
              className={`min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 rounded-full border-2 text-[11px] sm:text-[13px] lg:text-sm font-semibold transition-colors ${!isSpecialist ? 'bg-primary hover:bg-primary/90 text-white border-primary shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}>
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span className="min-w-0 truncate">{t('smmCustomer')}</span>
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
      {/* «Обсудить с ИИ» — the SAME panel the test cards open */}
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
      />
      <SmmToast />
    </div>
  );
}

// Lightweight toast: listens to the local 'smm-toast' event
function SmmToast() {
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
