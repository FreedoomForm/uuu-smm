'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, Banknote, Briefcase, CalendarClock, ChevronDown, ChevronUp,
  ClipboardList, Compass, LayoutGrid, Library, Loader2, Paperclip,
  Play, Plus, Rows3, Search, Trash2, Upload, UserPlus, X, Pencil,
} from 'lucide-react';
import LangButton from '@/components/lang-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import SmmEventSlide, { SmmEventGridCard } from '@/components/pages/smm-event-slide';
import { SmmEventsDock } from '@/components/pages/smm-roles-view-dock';
import { api } from '@/lib/api';
import { uploadSmmFile, sniffType } from '@/lib/smm-client';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';

/**
 * SMM EVENTS PAGE — the customer's «Мероприятия» page rebuilt to look EXACTLY
 * like the dashboard page with the SMM specialist cards: the same top panel
 * (back · create · search · view mode · language · profile), the same
 * TikTok-style card feed (event cards instead of specialist cards), the same
 * library / shelf grid views, the same bottom action bar and the same
 * LIBRARY PAGES DOCK (Мероприятия | Личное | Общее — the page's own scopes).
 *
 * Ownership: the edit / share / publish / delete / invite actions work ONLY
 * on the events the customer created themselves (server-enforced too).
 */

type ViewKind = 'tiktok' | 'library' | 'shelf';
type ManageTab = 'roles' | 'apps' | 'invites' | 'files';

export interface SmmEventsViewProps {
  user: { id: string; name: string; email: string; image?: string | null } | null;
  myAvatar: string | null;
  events: any[];
  eventsLoading: boolean;
  pinnedEventIds: string[];
  scope: 'mine' | 'discover';
  onScopeChange: (s: 'mine' | 'discover') => void;
  // Deep links / cross-card jumps: slide the feed to THIS event when set
  focusEventId?: string | null;
  goHome: () => void;
  onCreateEvent: () => void;
  onEditEvent: (ev: any) => void;
  onDeleteEvent: (ev: any) => void;
  onShareEvent: (ev: any) => void;
  onPublicEvent: (ev: any) => void;
  onInvite: (ev: any) => void;
  onChat: (ev: any) => void;
  onFiles: (ev: any) => void;
  onToggleBookmark: (id: string) => void;
  onOpenProfileUser: (u: any) => void;
  onOpenOtherEvent: (o: any) => void;
  onOpenProfilePage: () => void;
  onCycleLang: () => void;
  // The dock's «Личные роли | Общие роли» router
  onGotoRoles?: (scope: 'mine' | 'public') => void;
}

function FeedArrows({ onPrev, onNext, canPrev, canNext, prevLabel, nextLabel }: {
  onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean; prevLabel: string; nextLabel: string;
}) {
  const btn = 'w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center text-foreground hover:bg-white hover:shadow-xl active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none';
  return (
    <div className="hidden lg:flex flex-col gap-2 absolute right-5 top-1/2 -translate-y-1/2 z-30">
      <button type="button" onClick={onPrev} disabled={!canPrev} aria-label={prevLabel} title={prevLabel} className={btn}><ChevronUp className="w-5 h-5" /></button>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label={nextLabel} title={nextLabel} className={btn}><ChevronDown className="w-5 h-5" /></button>
    </div>
  );
}

export default function SmmEventsView({
  user, myAvatar, events, eventsLoading, pinnedEventIds, scope, onScopeChange,
  focusEventId, goHome, onCreateEvent, onEditEvent, onDeleteEvent, onShareEvent, onPublicEvent,
  onInvite, onChat, onFiles, onToggleBookmark, onOpenProfileUser,
  onOpenOtherEvent, onOpenProfilePage, onCycleLang, onGotoRoles,
}: SmmEventsViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [viewKind, setViewKind] = React.useState<ViewKind>('tiktok');
  const [editMode, setEditMode] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchMounted, setSearchMounted] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const swiperRef = React.useRef<SwiperClass | null>(null);

  // ── Manage sheet (roles / applications / invitations / files) ────────────
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [manageEv, setManageEv] = React.useState<any>(null);
  const [tab, setTab] = React.useState<ManageTab>('roles');
  const [busy, setBusy] = React.useState(false);
  const [roles, setRoles] = React.useState<any[]>([]);
  const [apps, setApps] = React.useState<any[]>([]);
  const [invites, setInvites] = React.useState<any[]>([]);
  const [files, setFiles] = React.useState<any[]>([]);
  const [newRole, setNewRole] = React.useState({ name: '', brief: '', payment: '', deadline: '' });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isOwn = React.useCallback((ev: any) => !!user && !!ev && (ev.customerId === user.id || ev.customer?.id === user.id), [user]);

  // The search filters the CURRENT scope locally — title, summary, brief,
  // role names and the customer's name.
  const visibleEvents = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev: any) => {
      const hay = [ev.title, ev.summary, ev.brief, ev.customer?.name, ...(ev.roles || []).map((r: any) => r.name)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [events, query]);

  const tiktokMode = viewKind === 'tiktok';
  const len = visibleEvents.length;
  const curEv = tiktokMode ? visibleEvents[Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))] : null;
  const curIsOwn = curEv ? isOwn(curEv) : false;

  const openManage = async (ev: any) => {
    setManageEv(ev);
    setTab('roles');
    setSheetOpen(true);
    try {
      const detail = await api.getSmmEvent(ev.id);
      setRoles(detail.roles || []);
      setFiles(detail.files || []);
    } catch { /* transient */ }
    try { setApps((await api.getSmmApplications('inbox')).filter((a: any) => a.eventId === ev.id)); } catch { /* transient */ }
    try { setInvites((await api.getSmmInvitations('sent')).filter((i: any) => i.eventId === ev.id)); } catch { /* transient */ }
  };

  const addRole = async () => {
    if (!manageEv || !newRole.name.trim() || busy) return;
    setBusy(true);
    try {
      await api.addSmmRole(manageEv.id, newRole);
      setNewRole({ name: '', brief: '', payment: '', deadline: '' });
      const detail = await api.getSmmEvent(manageEv.id);
      setRoles(detail.roles || []);
    } catch { /* transient */ }
    setBusy(false);
  };

  const removeRole = async (id: string) => {
    if (!manageEv || busy) return;
    setBusy(true);
    try { await api.deleteSmmRole(id); setRoles(prev => prev.filter(r => r.id !== id)); } catch { /* transient */ }
    setBusy(false);
  };

  const addFile = async (f: File) => {
    if (!manageEv || busy) return;
    setBusy(true);
    try {
      const up = await uploadSmmFile(f);
      await api.addSmmFile({ ownerType: 'event', ownerId: manageEv.id, title: f.name, type: sniffType(f), url: up.url, size: up.size ?? null, tgMessageId: up.tgMessageId ?? null });
      const detail = await api.getSmmEvent(manageEv.id);
      setFiles(detail.files || []);
    } catch { /* transient */ }
    setBusy(false);
  };

  const removeFile = async (id: string) => {
    if (!manageEv || busy) return;
    setBusy(true);
    try { await api.deleteSmmFile(id); setFiles(prev => prev.filter(f => f.id !== id)); } catch { /* transient */ }
    setBusy(false);
  };

  const respondApp = async (id: string, action: 'accept' | 'decline') => {
    setBusy(true);
    try {
      await api.respondSmmApplication(id, action);
      setApps(prev => prev.map(a => (a.id === id ? { ...a, status: action === 'accept' ? 'accepted' : 'declined' } : a)));
      if (manageEv) { const detail = await api.getSmmEvent(manageEv.id); setRoles(detail.roles || []); }
    } catch { /* transient */ }
    setBusy(false);
  };

  const cycleView = () => {
    const order: ViewKind[] = ['tiktok', 'library', 'shelf'];
    setViewKind(order[(order.indexOf(viewKind) + 1) % order.length]);
  };

  const jump = (i: number) => {
    setActiveIdx(Math.max(0, Math.min(i, Math.max(0, len - 1))));
    if (swiperRef.current) swiperRef.current.slideTo(Math.max(0, Math.min(i, Math.max(0, len - 1))));
  };

  // A focused event (deep link ?event=, «customer's other events» jump, a
  // freshly created event) slides the TikTok feed straight to its card.
  React.useEffect(() => {
    if (!focusEventId || viewKind !== 'tiktok') return;
    const idx = visibleEvents.findIndex((e: any) => e.id === focusEventId);
    if (idx >= 0) {
      setActiveIdx(idx);
      // The swiper may not be mounted yet on the first paint — retry once.
      const t = setTimeout(() => swiperRef.current?.slideTo(idx, 0), 60);
      return () => clearTimeout(t);
    }
  }, [focusEventId, visibleEvents.length, viewKind]);

  const userInitials = (user?.name || '?').trim().slice(0, 2).toUpperCase() || '?';

  const slideCallbacks = (ev: any) => {
    const own = isOwn(ev);
    return {
      onToggleBookmark: () => onToggleBookmark(ev.id),
      onOpenProfile: ev.customer ? () => onOpenProfileUser(ev.customer) : undefined,
      onChat: () => onChat(ev),
      onFiles: (ev.filesCount || 0) > 0 ? () => onFiles(ev) : undefined,
      ...(own ? {
        onShare: () => onShareEvent(ev),
        onPublic: () => onPublicEvent(ev),
        onManage: () => void openManage(ev),
        onEdit: () => onEditEvent(ev),
        onDelete: () => onDeleteEvent(ev),
      } : {}),
    };
  };

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

  const gridColsClass = viewKind === 'shelf' ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';

  const slideFor = (ev: any) => (
    <SmmEventSlide
      key={ev.id}
      ev={ev}
      pinned={pinnedEventIds.includes(ev.id)}
      isOwner={isOwn(ev)}
      showUnpin
      onOpenOtherEvent={onOpenOtherEvent}
      {...slideCallbacks(ev)}
    />
  );

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL — the same 56px contract and the same buttons the
          dashboard's panel carries (back · create · search · view · lang ·
          profile) ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="relative max-w-7xl mx-auto px-3 sm:px-4 h-14 lg:h-16 flex flex-nowrap items-center justify-between gap-1 sm:gap-2 lg:gap-3">
          {searchMounted && (
            <div className={`absolute inset-0 z-50 bg-white flex items-center gap-2 px-3 sm:px-4 ${searchOpen ? 'animate-in fade-in duration-150' : 'animate-out fade-out pointer-events-none duration-150'}`}>
              <div className="flex-1 min-w-0 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setQuery(''); } }}
                  placeholder={t('searchByTags')}
                  className="h-9 lg:h-10 rounded-full pl-9 bg-white border-black/15 text-sm"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSearchOpen(false); setQuery(''); }} className="shrink-0 h-9 w-9 p-0" aria-label={t('cancel')}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={goHome}
              className="rounded-full shrink-0 border-black lg:h-10 lg:w-10"
              title={t('back')}
              aria-label={t('back')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button onClick={onCreateEvent} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmCreateEvent')}>
              <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmCreateEvent')}</span>
            </Button>
            {/* «Изменить» — the edit-mode toggle: in edit mode the bottom bar
            becomes «Изменить мероприятие» (the test page's exact behavior) */}
            <Button
              variant="outline"
              onClick={() => setEditMode(v => !v)}
              className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm ${editMode ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
              title={t('gEdit')}
              aria-label={t('gEdit')}
            >
              <Pencil className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('gEdit')}</span>
            </Button>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
            <Button
              variant="outline"
              onClick={() => { setSearchMounted(true); setSearchOpen(true); }}
              className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-9 lg:h-10 lg:w-10"
              title={t('searchByTags')}
              aria-label={t('searchByTags')}
            >
              <Search className="w-4 h-4" />
            </Button>
            {/* View button — cycles the same three layouts as the dashboard:
                TikTok feed → Library → Shelf → … */}
            <Button
              variant="outline"
              onClick={cycleView}
              className="rounded-full shrink-0 border-black h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm"
              title={t('viewMode')}
              aria-label={t('viewMode')}
            >
              {viewKind === 'library'
                ? <LayoutGrid className="w-4 h-4 sm:mr-2" />
                : viewKind === 'shelf'
                  ? <Rows3 className="w-4 h-4 sm:mr-2" />
                  : <Play className="w-4 h-4 sm:mr-2" />}
              <span className="hidden sm:inline">
                {viewKind === 'library' ? t('viewLibrary') : viewKind === 'shelf' ? t('viewShelf') : t('viewTikTok')}
              </span>
            </Button>
            <LangButton lang={lang as Lang} onChange={onCycleLang} className="border-black px-2 sm:px-3" />
            <div className="hidden md:block text-right min-w-0">
              <p className="text-sm font-medium truncate max-w-[180px]">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user?.email}</p>
            </div>
            <button
              onClick={onOpenProfilePage}
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

      {/* ── CONTENT — the same three views as the dashboard ── */}
      {len === 0 && (eventsLoading || !user) ? (
        /* FIRST-DATA SKELETON — the same placeholder card the dashboard
        paints while the first feed loads (the sweeping light glint). */
        <main className="flex-1 min-h-0 flex items-center justify-center px-3" aria-hidden="true">
          <div className="skeleton-mirror w-full max-w-md h-[70%] max-h-[560px] rounded-2xl border border-black/10 bg-white p-4 flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="flex-1 w-full rounded-xl" />
            <Skeleton className="h-9 w-2/3 mx-auto rounded-full" />
            <Skeleton className="h-9 w-1/2 mx-auto rounded-full" />
          </div>
        </main>
      ) : len === 0 ? (
        <main className="flex-1 min-h-0 flex items-center justify-center px-4">
          <Card className="rounded-4xl border-dashed border-black/30 bg-white w-full max-w-md">
            <CardContent className="py-12 text-center space-y-3">
              <div className="mx-auto w-14 h-14 bg-cta rounded-2xl flex items-center justify-center shadow-lg">
                {scope === 'mine' ? <Briefcase className="w-7 h-7 text-white" /> : <Compass className="w-7 h-7 text-white" />}
              </div>
              <p className="font-bold">{scope === 'mine' ? t('smmEventsPersonalEmpty') : t('smmEventsDiscoverEmpty')}</p>
              <p className="text-sm text-muted-foreground">{scope === 'mine' ? t('smmEventsPersonalHint') : t('smmEmptyEvents')}</p>
              {scope === 'mine' && (
                <Button onClick={onCreateEvent} className="rounded-full bg-cta hover:bg-cta/90 text-white">
                  <Plus className="w-4 h-4 mr-1" /> {t('smmCreateEvent')}
                </Button>
              )}
            </CardContent>
          </Card>
        </main>
      ) : tiktokMode ? (
        <main className="relative flex-1 min-h-0 min-w-0">
          <Swiper
            key={`events-feed-swiper-${scope}`}
            {...swiperParams}
            className="feed-swiper h-full screen-enter"
            initialSlide={Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))}
            onSwiper={sw => { swiperRef.current = sw; }}
            onSlideChange={sw => setActiveIdx(sw.activeIndex)}
          >
            <FeedArrows
              onPrev={() => swiperRef.current?.slidePrev()}
              onNext={() => swiperRef.current?.slideNext()}
              canPrev={activeIdx > 0}
              canNext={activeIdx < len - 1}
              prevLabel={t('feedPrev')}
              nextLabel={t('feedNext')}
            />
            {visibleEvents.map((ev: any) => slideFor(ev))}
          </Swiper>
        </main>
      ) : (
        /* LIBRARY / SHELF views — the same endless-grid pattern the test
        library uses, drawn with SmmEventGridCard (the same ladder). */
        <div key={`events-grid-${viewKind}-${scope}`} className="flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-full flex flex-col">
            <div className="flex-1 min-h-0 pt-2 sm:pt-3">
              <div className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {visibleEvents.map((ev: any) => (
                  <SmmEventGridCard
                    key={ev.id}
                    ev={ev}
                    pinned={pinnedEventIds.includes(ev.id)}
                    isOwner={isOwn(ev)}
                    {...slideCallbacks(ev)}
                  />
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="hidden lg:block h-28 shrink-0" />
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR — the same 60px bar the dashboard keeps above
          the dock; the customer's main action is «Пригласить специалиста»
          (own events only — a customer never invites onto a foreign event) ── */}
      {tiktokMode && len > 0 && (
        <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2">
            {editMode ? (
              /* Edit mode — the same swap the tests page keeps: the bar's
              main action becomes «Изменить мероприятие» (own events only) */
              <Button
                onClick={() => curEv && curIsOwn && onEditEvent(curEv)}
                disabled={eventsLoading || !curEv || !curIsOwn}
                title={curEv && !curIsOwn ? t('smmOnlyOwnEvents') : undefined}
                className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-cta hover:bg-cta/90 text-white"
              >
                <Pencil className="w-4 h-4 mr-2 shrink-0" /> {t('gEdit')}
              </Button>
            ) : (
              <Button
                onClick={() => curEv && onInvite(curEv)}
                disabled={eventsLoading || !curEv || !curIsOwn}
                title={curEv && !curIsOwn ? t('smmOnlyOwnEvents') : undefined}
                className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
              >
                <UserPlus className="w-4 h-4 mr-2 shrink-0" /> {t('smmInviteSpecialistBtn')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── LIBRARY PAGES DOCK — the same very-bottom panel as every main
          page: «Мероприятия» (this page, active) | «Личные роли» | «Общие
          роли» | the page's own scope toggle (Личное ↔ Общее) ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <SmmEventsDock
            lang={lang}
            activeScope={scope}
            gotoRoles={(rs: 'mine' | 'public') => onGotoRoles?.(rs)}
            toggleScope={() => onScopeChange(scope === 'mine' ? 'discover' : 'mine')}
          />
        </div>
      </div>

      {/* ── MANAGE SHEET — the same resizable window the test editor uses:
          the event's roles (ТЗ templates), incoming applications, sent
          invitations and the attached files ── */}
      {sheetOpen && manageEv && (
        <ResizableSheetFrame
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          initialVh={0.85}
          minVh={0.4}
          maxW="max-w-3xl"
          header={
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-cta flex items-center justify-center shrink-0"><ClipboardList className="w-4 h-4 text-white" /></span>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{manageEv.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{t('smmManageEvent')}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setSheetOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
          }
          body={
            <div className="px-4 py-4">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex gap-1.5 overflow-x-auto">
                  {([
                    ['roles', `${t('smmTabRoles')}${roles.length ? ` (${roles.length})` : ''}`],
                    ['apps', `${t('smmTabApps')}${apps.filter(a => a.status === 'pending').length ? ` (${apps.filter(a => a.status === 'pending').length})` : ''}`],
                    ['invites', t('smmTabInvites')],
                    ['files', `${t('gFiles')}${files.length ? ` (${files.length})` : ''}`],
                  ] as [ManageTab, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      className={`shrink-0 px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-colors ${tab === key ? 'bg-cta text-white border-cta' : 'border-black/15 bg-white hover:bg-muted/50'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'roles' && (
                  <div className="space-y-3">
                    {roles.map(r => (
                      <Card key={r.id} className="rounded-3xl border border-black/10 bg-white">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm">{r.name}</p>
                              {r.brief && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{r.brief}</p>}
                              <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
                                {r.payment && <span className="inline-flex items-center gap-1"><Banknote className="w-3 h-3" />{r.payment}</span>}
                                {r.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{r.deadline}</span>}
                              </div>
                              {(r.assigned || []).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {r.assigned.map((a: any) => (
                                    <Badge key={a.userId} variant="secondary" className="rounded-full text-[11px]">{t('smmAssigned')}: {a.name}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button type="button" onClick={() => removeRole(r.id)} className="text-destructive shrink-0" aria-label={t('delete')}><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <Card className="rounded-3xl border border-black/10 bg-white">
                      <CardContent className="p-4 space-y-2.5">
                        <p className="font-bold text-sm">{t('smmAddRole')}</p>
                        <Input value={newRole.name} onChange={e => setNewRole(r => ({ ...r, name: e.target.value }))} maxLength={120} className="rounded-full border-black/20 bg-white" placeholder={t('smmRoleName')} />
                        <Textarea value={newRole.brief} onChange={e => setNewRole(r => ({ ...r, brief: e.target.value }))} rows={3} maxLength={8000} className="rounded-2xl border-black/15 bg-white" placeholder={t('smmRoleBriefPlaceholder')} />
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={newRole.payment} onChange={e => setNewRole(r => ({ ...r, payment: e.target.value }))} maxLength={120} className="rounded-full border-black/20 bg-white" placeholder={t('smmRolePayment')} />
                          <Input value={newRole.deadline} onChange={e => setNewRole(r => ({ ...r, deadline: e.target.value }))} maxLength={120} className="rounded-full border-black/20 bg-white" placeholder={t('smmRoleDeadline')} />
                        </div>
                        <Button onClick={addRole} disabled={busy || !newRole.name.trim()} className="w-full rounded-full" size="sm">
                          <Plus className="w-4 h-4 mr-1" /> {t('smmAddRole')}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {tab === 'apps' && (
                  <div className="space-y-3">
                    {apps.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{t('smmNoApplications')}</p>}
                    {apps.map(a => (
                      <Card key={a.id} className="rounded-3xl border border-black/10 bg-white">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-cta text-white flex items-center justify-center text-xs font-extrabold shrink-0">{(a.specialist?.name || '?').slice(0, 1).toUpperCase()}</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm truncate">{a.specialist?.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{a.role?.name}</p>
                            </div>
                            <Badge className={`rounded-full shrink-0 ${a.status === 'accepted' ? 'bg-emerald-500' : a.status === 'declined' ? 'bg-red-500' : 'bg-amber-500'}`}>{t(`smmStatus_${a.status}`)}</Badge>
                          </div>
                          {a.message && <p className="text-xs whitespace-pre-wrap rounded-xl bg-muted/50 p-2.5">{a.message}</p>}
                          {a.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => respondApp(a.id, 'accept')} disabled={busy} className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-600/90">{t('smmAccept')}</Button>
                              <Button size="sm" variant="outline" onClick={() => respondApp(a.id, 'decline')} disabled={busy} className="flex-1 rounded-full">{t('smmDecline')}</Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {tab === 'invites' && (
                  <div className="space-y-3">
                    {invites.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{t('smmNoInvitations')}</p>}
                    {invites.map(i => (
                      <Card key={i.id} className="rounded-3xl border border-black/10 bg-white">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <UserPlus className="w-4 h-4 shrink-0 text-cta" />
                            <p className="font-bold text-sm truncate flex-1">{i.specialist?.name}</p>
                            <Badge className={`rounded-full shrink-0 ${i.status === 'accepted' ? 'bg-emerald-500' : i.status === 'declined' ? 'bg-red-500' : 'bg-amber-500'}`}>{t(`smmStatus_${i.status}`)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{t('smmRoleN')}: {i.role?.name}</p>
                          {i.message && <p className="text-xs whitespace-pre-wrap rounded-xl bg-muted/50 p-2.5">{i.message}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {tab === 'files' && (
                  <div className="space-y-3">
                    {files.map(f => (
                      <div key={f.id} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm min-w-0 flex-1 truncate">{f.title}</span>
                        <button type="button" onClick={() => removeFile(f.id)} className="text-destructive shrink-0" aria-label={t('delete')}><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addFile(f); }} />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy} className="rounded-full">
                      <Upload className="w-3.5 h-3.5 mr-1" /> {t('smmUploadFile')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          }
          footer={
            <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <Button variant="outline" onClick={() => onEditEvent(manageEv)} className="flex-1 rounded-full">
                <Pencil className="w-4 h-4 mr-1" /> {t('editTest')}
              </Button>
              <Button variant="outline" onClick={() => onDeleteEvent(manageEv)} disabled={busy} className="rounded-full border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0">
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button onClick={() => setSheetOpen(false)} className="flex-1 rounded-full bg-primary hover:bg-primary/90">
                {t('cancel')}
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
