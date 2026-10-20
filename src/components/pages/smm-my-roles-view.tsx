'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, Briefcase, ChevronDown, ChevronUp, Compass, LayoutGrid, Library, Loader2,
  Mail, Pencil, Play, Plus, Rows3, Search, Trash2, Users, X,
} from 'lucide-react';
import LangButton from '@/components/lang-button';
import SmmRoleButton from '@/components/smm-role-button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import SmmRoleSlide, { SmmRoleGridCard } from '@/components/pages/smm-role-slide';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';

/**
 * SMM MY ROLES — the customer's «Личные роли» page, the dock button that
 * REPLACED «Мероприятия». One flat review of every role (ТЗ) the customer
 * created across their events: the same top panel as the dashboard
 * (back · «+» · «Изменить» · search · view · language · ACCOUNT SWITCH ·
 * profile), the same TikTok feed + library/shelf grids, the same bottom
 * action bar and the uniform main dock.
 *
 * The page's own SUB-DOCK (the "new bottom panel on top of the current one")
 * routes between the customer's three personal hubs: Личные роли |
 * Мероприятия | Почта.
 */

type ViewKind = 'tiktok' | 'library' | 'shelf';

export interface SmmMyRolesViewProps {
  user: { id: string; name: string; email: string; image?: string | null } | null;
  myAvatar: string | null;
  pinnedEventIds: string[];
  goHome: () => void;
  onOpenProfilePage: () => void;
  onCycleLang: () => void;
  onSwitchRole: () => void;
  // The page's own sub-dock + the uniform main dock routers
  onGotoEvents: (focusEventId?: string | null, manage?: boolean) => void;
  onGotoMail: () => void;
  onGotoSharedRoles: () => void;
  onGotoLibraryMine: () => void;
  onGotoLibraryDiscover: () => void;
  // Card actions shared with app-root
  onCreateEvent: () => void;
  onChatEvent: (ev: any) => void;
  onFilesEvent: (ev: any, filesCount: number) => void;
  onShareEventLink: (ev: any) => void;
  onToggleEventBookmark: (eventId: string) => void;
  focusRoleId?: string | null;
}

export default function SmmMyRolesView({
  user, myAvatar, pinnedEventIds, goHome, onOpenProfilePage, onCycleLang, onSwitchRole,
  onGotoEvents, onGotoMail, onGotoSharedRoles, onGotoLibraryMine, onGotoLibraryDiscover,
  onCreateEvent, onChatEvent, onFilesEvent, onShareEventLink, onToggleEventBookmark,
  focusRoleId,
}: SmmMyRolesViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [roles, setRoles] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [viewKind, setViewKind] = React.useState<ViewKind>('tiktok');
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [editMode, setEditMode] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [deleteRoleId, setDeleteRoleId] = React.useState<string | null>(null);
  const swiperRef = React.useRef<SwiperClass | null>(null);

  // Search
  const [searchMounted, setSearchMounted] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  // Role form sheet (add / edit)
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<any>(null);
  const [form, setForm] = React.useState({ name: '', brief: '', payment: '', deadline: '' });
  // Add flow: pick the event first
  const [myEvents, setMyEvents] = React.useState<any[]>([]);
  const [pickedEventId, setPickedEventId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [r, ev] = await Promise.all([api.getMySmmRoles(), api.getMySmmEvents().catch(() => [])]);
      setRoles(r || []);
      setMyEvents(ev || []);
    } catch { /* transient */ }
    setLoading(false);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const visibleRoles = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r: any) =>
      [r.name, r.brief, r.event?.title, r.event?.summary, r.payment, r.deadline]
        .filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [roles, query]);

  const tiktokMode = viewKind === 'tiktok';
  const len = visibleRoles.length;
  const curRole = tiktokMode ? visibleRoles[Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))] : null;

  // A focused role (deep link ?role= on a personal role, a fresh save) slides
  // the feed to its card.
  React.useEffect(() => {
    if (!focusRoleId || viewKind !== 'tiktok') return;
    const idx = visibleRoles.findIndex((r: any) => r.id === focusRoleId);
    if (idx >= 0) {
      setActiveIdx(idx);
      const tt = setTimeout(() => swiperRef.current?.slideTo(idx, 0), 60);
      return () => clearTimeout(tt);
    }
  }, [focusRoleId, visibleRoles.length, viewKind]);

  const cycleView = () => {
    const order: ViewKind[] = ['tiktok', 'library', 'shelf'];
    setViewKind(order[(order.indexOf(viewKind) + 1) % order.length]);
  };
  const jump = (i: number) => {
    setActiveIdx(Math.max(0, Math.min(i, Math.max(0, len - 1))));
    if (swiperRef.current) swiperRef.current.slideTo(Math.max(0, Math.min(i, Math.max(0, len - 1))));
  };

  const openAddSheet = async () => {
    setEditingRole(null);
    setForm({ name: '', brief: '', payment: '', deadline: '' });
    setPickedEventId(myEvents[0]?.id || null);
    if (myEvents.length === 0) {
      try { const ev = await api.getMySmmEvents(); setMyEvents(ev || []); setPickedEventId(ev?.[0]?.id || null); } catch { /* transient */ }
    }
    setSheetOpen(true);
  };
  const openEditSheet = (r: any) => {
    setEditingRole(r);
    setForm({ name: r.name || '', brief: r.brief || '', payment: r.payment || '', deadline: r.deadline || '' });
    setSheetOpen(true);
  };
  const saveRole = async () => {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    try {
      if (editingRole) await api.updateSmmRole(editingRole.id, form);
      else if (pickedEventId) await api.addSmmRole(pickedEventId, form);
      setSheetOpen(false);
      await load();
    } catch { /* transient */ }
    setBusy(false);
  };
  const doDeleteRole = async () => {
    if (!deleteRoleId) return;
    setBusy(true);
    try {
      await api.deleteSmmRole(deleteRoleId);
      setRoles(prev => prev.filter(r => r.id !== deleteRoleId));
    } catch { /* transient */ }
    setDeleteRoleId(null);
    setBusy(false);
  };
  const publishToggle = async (r: any) => {
    if (busy) return;
    setBusy(true);
    try {
      if (r.sharedRoleId) {
        await api.deleteSmmSharedRole(r.sharedRoleId);
        setRoles(prev => prev.map(x => (x.id === r.id ? { ...x, sharedRoleId: null } : x)));
      } else {
        const tpl = await api.createSmmSharedRole({ sourceRoleId: r.id });
        setRoles(prev => prev.map(x => (x.id === r.id ? { ...x, sharedRoleId: tpl.id } : x)));
      }
    } catch { /* transient */ }
    setBusy(false);
  };

  const roleCallbacks = (r: any) => ({
    role: r,
    eventPinned: pinnedEventIds.includes(r.eventId),
    onToggleEventBookmark: () => onToggleEventBookmark(r.eventId),
    onOpenEvent: () => onGotoEvents(r.eventId),
    onChat: () => onChatEvent({ id: r.eventId, title: r.event?.title || '' }),
    onFiles: r.event?.filesCount ? () => onFilesEvent({ id: r.eventId, title: r.event?.title || '' }, r.event.filesCount) : undefined,
    onShare: () => onShareEventLink({ id: r.eventId }),
    onPublishToggle: () => void publishToggle(r),
    onManage: () => onGotoEvents(r.eventId, true),
    onEdit: () => openEditSheet(r),
    onDelete: () => setDeleteRoleId(r.id),
  });

  const userInitials = (user?.name || '?').trim().slice(0, 2).toUpperCase() || '?';
  const gridColsClass = viewKind === 'shelf' ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
  const dockBtn = 'min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors';
  const subBtn = 'min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors';

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

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL — the uniform 56px contract ── */}
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
            <Button onClick={openAddSheet} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmAddRoleBtn')}>
              <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmAddRoleBtn')}</span>
            </Button>
            {/* «Изменить» — the edit toggle: in edit mode the cards collapse to
            the calm state and the bottom bar switches to the role editor. */}
            <Button
              variant="outline"
              onClick={() => setEditMode(v => !v)}
              className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm ${editMode ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
              title={t('smmEditRoleTitle')}
              aria-label={t('editTest')}
            >
              <Pencil className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('editTest')}</span>
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
            <SmmRoleButton role="customer" onSwitch={onSwitchRole} className="border-black px-2 sm:px-3" />
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

      {/* ── CONTENT ── */}
      {len === 0 && loading ? (
        <main className="flex-1 min-h-0 flex items-center justify-center px-3" aria-hidden="true">
          <div className="skeleton-mirror w-full max-w-md h-[70%] max-h-[560px] rounded-2xl border border-black/10 bg-white p-4 flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="flex-1 w-full rounded-xl" />
            <Skeleton className="h-9 w-2/3 mx-auto rounded-full" />
          </div>
        </main>
      ) : len === 0 ? (
        <main className="flex-1 min-h-0 flex items-center justify-center px-4">
          <Card className="rounded-4xl border-dashed border-black/30 bg-white w-full max-w-md">
            <CardContent className="py-12 text-center space-y-3">
              <div className="mx-auto w-14 h-14 bg-cta rounded-2xl flex items-center justify-center shadow-lg">
                <Briefcase className="w-7 h-7 text-white" />
              </div>
              <p className="font-bold">{t('smmMyRolesEmpty')}</p>
              <p className="text-sm text-muted-foreground">{t('smmMyRolesEmptyHint')}</p>
              <Button onClick={myEvents.length ? openAddSheet : onCreateEvent} className="rounded-full bg-cta hover:bg-cta/90 text-white">
                <Plus className="w-4 h-4 mr-1" /> {myEvents.length ? t('smmAddRoleBtn') : t('smmCreateEvent')}
              </Button>
            </CardContent>
          </Card>
        </main>
      ) : tiktokMode ? (
        <main className="relative flex-1 min-h-0 min-w-0">
          <Swiper
            {...swiperParams}
            className="feed-swiper h-full screen-enter"
            initialSlide={Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))}
            onSwiper={sw => { swiperRef.current = sw; }}
            onSlideChange={sw => setActiveIdx(sw.activeIndex)}
          >
            {/* Desktop up/down arrows — the same floating pair the events feed uses */}
            <div className="hidden lg:flex flex-col gap-2 absolute right-5 top-1/2 -translate-y-1/2 z-30">
              <button type="button" onClick={() => swiperRef.current?.slidePrev()} disabled={activeIdx <= 0} className="w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center disabled:opacity-30" aria-label={t('feedPrev')}><ChevronUp className="w-5 h-5" /></button>
              <button type="button" onClick={() => swiperRef.current?.slideNext()} disabled={activeIdx >= len - 1} className="w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center disabled:opacity-30" aria-label={t('feedNext')}><ChevronDown className="w-5 h-5" /></button>
            </div>
            {visibleRoles.map((r: any) => (
              <SmmRoleSlide key={r.id} {...roleCallbacks(r)} editMode={editMode} />
            ))}
          </Swiper>
        </main>
      ) : (
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
          <div className="min-h-full flex flex-col">
            <div className="flex-1 min-h-0 pt-2 sm:pt-3">
              <div className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {visibleRoles.map((r: any) => (
                  <SmmRoleGridCard key={r.id} {...roleCallbacks(r)} />
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="hidden lg:block h-28 shrink-0" />
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR — «Добавить роль» /, in edit mode, the editor
          for the role on screen ── */}
      {tiktokMode && len > 0 && (
        <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2">
            <Button
              onClick={() => (editMode && curRole ? openEditSheet(curRole) : openAddSheet())}
              disabled={loading}
              className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
            >
              {editMode
                ? <><Pencil className="w-4 h-4 mr-2 shrink-0" /> {t('smmEditRoleTitle')}</>
                : <><Plus className="w-4 h-4 mr-2 shrink-0" /> {t('smmAddRoleBtn')}</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── THE PAGE'S SUB-DOCK — the "new bottom panel on top of the current
      one": Личные роли | Мероприятия | Почта (the customer's three hubs) ── */}
      <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2">
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled title={t('smmMyRolesTitle')} aria-label={t('smmMyRolesTitle')} className={`${subBtn} bg-cta text-white border-cta shadow-md`}>
              <Briefcase className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('smmMyRolesTitle')}</span>
            </button>
            <button type="button" onClick={() => onGotoEvents()} title={t('smmEventsTitle')} aria-label={t('smmEventsTitle')} className={`${subBtn} border-black bg-white hover:bg-muted/50`}>
              <Users className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('smmEventsTitle')}</span>
            </button>
            <button type="button" onClick={onGotoMail} title={t('smmMailTitle')} aria-label={t('smmMailTitle')} className={`${subBtn} border-black bg-white hover:bg-muted/50`}>
              <Mail className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('smmMailTitle')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN DOCK — the uniform 4 buttons ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="grid grid-cols-4 gap-2">
            <button type="button" disabled title={t('smmMyRolesTitle')} aria-label={t('smmMyRolesTitle')} className={`${dockBtn} bg-cta text-white border-cta shadow-md`}>
              <Briefcase className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('smmMyRolesTitle')}</span>
            </button>
            <button type="button" onClick={onGotoSharedRoles} title={t('smmSharedRolesTitle')} aria-label={t('smmSharedRolesTitle')} className={`${dockBtn} border-black bg-white hover:bg-muted/50`}>
              <Users className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('smmSharedRolesTitle')}</span>
            </button>
            <button type="button" onClick={onGotoLibraryMine} title={`${t('modeMine')} · ${t('modeMineHint')}`} aria-label={t('modeMine')} className={`${dockBtn} border-black bg-white hover:bg-muted/50`}>
              <Library className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('modeMine')}</span>
            </button>
            <button type="button" onClick={onGotoLibraryDiscover} title={`${t('modeDiscover')} · ${t('modeDiscoverHint')}`} aria-label={t('modeDiscover')} className={`${dockBtn} border-black bg-white hover:bg-muted/50`}>
              <Compass className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('modeDiscover')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── ROLE FORM SHEET (add / edit) ── */}
      {sheetOpen && (
        <ResizableSheetFrame
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          initialVh={0.85}
          minVh={0.4}
          maxW="max-w-3xl"
          header={
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-cta flex items-center justify-center shrink-0"><Briefcase className="w-4 h-4 text-white" /></span>
                <p className="font-bold text-sm truncate">{editingRole ? t('smmEditRoleTitle') : t('smmAddRoleBtn')}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setSheetOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
          }
          body={
            <div className="px-4 py-4">
              <div className="max-w-3xl mx-auto space-y-3">
                {!editingRole && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('smmPickEvent')}</p>
                    {myEvents.length === 0 ? (
                      <Card className="rounded-3xl border-dashed border-black/30 bg-white">
                        <CardContent className="p-4 text-center space-y-2">
                          <p className="text-sm text-muted-foreground">{t('smmNoEventsForRole')}</p>
                          <Button onClick={() => { setSheetOpen(false); onCreateEvent(); }} className="rounded-full bg-cta hover:bg-cta/90 text-white">
                            <Plus className="w-4 h-4 mr-1" /> {t('smmCreateEvent')}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {myEvents.map((ev: any) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setPickedEventId(ev.id)}
                            className={`shrink-0 max-w-[220px] px-3 py-1.5 rounded-full border-2 text-xs font-semibold truncate transition-colors ${pickedEventId === ev.id ? 'bg-cta text-white border-cta' : 'border-black/15 bg-white hover:bg-muted/50'}`}
                          >
                            {ev.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={120} className="rounded-full border-black/20 bg-white" placeholder={t('smmRoleName')} />
                <Textarea value={form.brief} onChange={e => setForm(f => ({ ...f, brief: e.target.value }))} rows={4} maxLength={8000} className="rounded-2xl border-black/15 bg-white" placeholder={t('smmRoleBriefPlaceholder')} />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))} maxLength={120} className="rounded-full border-black/20 bg-white" placeholder={t('smmRolePayment')} />
                  <Input value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} maxLength={120} className="rounded-full border-black/20 bg-white" placeholder={t('smmRoleDeadline')} />
                </div>
              </div>
            </div>
          }
          footer={
            <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <Button
                onClick={saveRole}
                disabled={busy || !form.name.trim() || (!editingRole && !pickedEventId)}
                className="flex-1 rounded-full bg-primary hover:bg-primary/90"
              >
                {busy ? t('loading') : <><Plus className="w-4 h-4 mr-1" /> {editingRole ? t('save') : t('smmAddRoleBtn')}</>}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)} className="rounded-full">{t('cancel')}</Button>
            </div>
          }
        />
      )}

      <AlertDialog open={!!deleteRoleId} onOpenChange={() => setDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('smmDeleteRoleQ')}</AlertDialogTitle>
            <AlertDialogDescription>{t('smmDeleteRoleWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
