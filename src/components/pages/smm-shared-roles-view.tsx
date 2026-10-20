'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, Banknote, Briefcase, CalendarClock, ChevronDown, ChevronUp, ClipboardList, Compass,
  LayoutGrid, Library, Link2, Loader2, Mail, MessageCircle, Pencil, Play, Plus, Rows3,
  Search, Trash2, Users, X,
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
import { CreatorStrip } from '@/components/shared-bits';
import { smmCoverColor } from '@/lib/smm-client';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';

/**
 * SMM SHARED ROLES — «Общие роли», the community library where people share
 * role (ТЗ) task templates. The dock button every account kind gets. Same
 * uniform panels as every main page; cards carry the same ladder as the
 * rest: Chat (the template's own group chat) → Share link (?role=) →
 * «В моё мероприятие» (a customer copies the template into one of their
 * events) → Edit / Delete (the author only).
 */

type ViewKind = 'tiktok' | 'library' | 'shelf';

export interface SmmSharedRolesViewProps {
  user: { id: string; name: string; email: string; image?: string | null } | null;
  myAvatar: string | null;
  mySmmRole: 'customer' | 'specialist';
  goHome: () => void;
  onOpenProfilePage: () => void;
  onCycleLang: () => void;
  onSwitchRole: () => void;
  // The uniform main dock routers (role-dependent first button)
  onGotoMyRoles: () => void;
  onGotoMail: () => void;
  onGotoLibraryMine: () => void;
  onGotoLibraryDiscover: () => void;
  // Copy-into-my-event chat/files hooks (app-root windows)
  onChatTemplate: (tpl: any) => void;
  focusRoleId?: string | null;
  // The deep-link seed (?role=<id>): prepend the fetched template so the
  // feed can slide to it before/without the list load.
  seedTemplate?: any;
}

export default function SmmSharedRolesView({
  user, myAvatar, mySmmRole, goHome, onOpenProfilePage, onCycleLang, onSwitchRole,
  onGotoMyRoles, onGotoMail, onGotoLibraryMine, onGotoLibraryDiscover,
  onChatTemplate, focusRoleId, seedTemplate,
}: SmmSharedRolesViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [templates, setTemplates] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [viewKind, setViewKind] = React.useState<ViewKind>('tiktok');
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [editMode, setEditMode] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [deleteTplId, setDeleteTplId] = React.useState<string | null>(null);
  const swiperRef = React.useRef<SwiperClass | null>(null);

  // Create / edit template sheet
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingTpl, setEditingTpl] = React.useState<any>(null);
  const [form, setForm] = React.useState({ name: '', brief: '', payment: '', deadline: '' });

  // «В моё мероприятие» — the event picker for the use-template flow
  const [useTpl, setUseTpl] = React.useState<any>(null);
  const [myEvents, setMyEvents] = React.useState<any[]>([]);
  const [pickedEventId, setPickedEventId] = React.useState<string | null>(null);

  // Search
  const [searchMounted, setSearchMounted] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getSharedSmmRoles();
      // The deep-linked template joins the list even when the page's fetch
      // has not picked it up yet (or the load failed transiently).
      const base = r || [];
      const merged = seedTemplate && !base.some((x: any) => x.id === seedTemplate.id)
        ? [seedTemplate, ...base]
        : base;
      setTemplates(merged);
    } catch {
      setTemplates(seedTemplate ? [seedTemplate] : []);
    }
    setLoading(false);
  }, [seedTemplate]);

  React.useEffect(() => { void load(); }, [load]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((r: any) =>
      [r.name, r.brief, r.author?.name, r.payment, r.deadline].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [templates, query]);

  const tiktokMode = viewKind === 'tiktok';
  const len = visible.length;
  const curTpl = tiktokMode ? visible[Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))] : null;

  React.useEffect(() => {
    if (!focusRoleId || viewKind !== 'tiktok') return;
    const idx = visible.findIndex((r: any) => r.id === focusRoleId);
    if (idx >= 0) {
      setActiveIdx(idx);
      const tt = setTimeout(() => swiperRef.current?.slideTo(idx, 0), 60);
      return () => clearTimeout(tt);
    }
  }, [focusRoleId, visible.length, viewKind]);

  const cycleView = () => {
    const order: ViewKind[] = ['tiktok', 'library', 'shelf'];
    setViewKind(order[(order.indexOf(viewKind) + 1) % order.length]);
  };
  const jump = (i: number) => {
    setActiveIdx(Math.max(0, Math.min(i, Math.max(0, len - 1))));
    if (swiperRef.current) swiperRef.current.slideTo(Math.max(0, Math.min(i, Math.max(0, len - 1))));
  };

  const shareLink = async (tpl: any) => {
    const url = `${window.location.origin}/?role=${tpl.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch { /* clipboard denied — the URL is still shown by nothing */ }
  };

  const openCreateSheet = () => {
    setEditingTpl(null);
    setForm({ name: '', brief: '', payment: '', deadline: '' });
    setSheetOpen(true);
  };
  const openEditSheet = (tpl: any) => {
    setEditingTpl(tpl);
    setForm({ name: tpl.name || '', brief: tpl.brief || '', payment: tpl.payment || '', deadline: tpl.deadline || '' });
    setSheetOpen(true);
  };
  const saveTemplate = async () => {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    try {
      if (editingTpl) await api.updateSmmSharedRole(editingTpl.id, form);
      else await api.createSmmSharedRole(form);
      setSheetOpen(false);
      await load();
    } catch { /* transient */ }
    setBusy(false);
  };
  const doDelete = async () => {
    if (!deleteTplId) return;
    setBusy(true);
    try {
      await api.deleteSmmSharedRole(deleteTplId);
      setTemplates(prev => prev.filter(x => x.id !== deleteTplId));
    } catch { /* transient */ }
    setDeleteTplId(null);
    setBusy(false);
  };

  const openUseSheet = async (tpl: any) => {
    setUseTpl(tpl);
    setPickedEventId(null);
    try { const ev = await api.getMySmmEvents(); setMyEvents(ev || []); setPickedEventId(ev?.[0]?.id || null); } catch { /* transient */ }
  };
  const confirmUse = async () => {
    if (!useTpl || !pickedEventId || busy) return;
    setBusy(true);
    try {
      await api.useSmmSharedRole(useTpl.id, pickedEventId);
      setUseTpl(null);
    } catch { /* transient */ }
    setBusy(false);
  };

  const tplCallbacks = (tpl: any) => ({
    tpl,
    isOwn: !!tpl.isOwn,
    onOpenProfile: undefined as undefined | (() => void),
    onChat: () => onChatTemplate(tpl),
    onShare: () => void shareLink(tpl),
    onUse: mySmmRole === 'customer' ? () => void openUseSheet(tpl) : undefined,
    onEdit: tpl.isOwn ? () => openEditSheet(tpl) : undefined,
    onDelete: tpl.isOwn ? () => setDeleteTplId(tpl.id) : undefined,
  });

  const userInitials = (user?.name || '?').trim().slice(0, 2).toUpperCase() || '?';
  const gridColsClass = viewKind === 'shelf' ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
  const dockBtn = 'min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors';

  const slideFor = (tpl: any) => {
    const cb = tplCallbacks(tpl);
    const btn = 'shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors';
    return (
      <SwiperSlide key={tpl.id} className="relative !h-full overflow-hidden" style={{ backgroundColor: smmCoverColor(tpl.id) }}>
        <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
          <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
            <CreatorStrip
              name={tpl.author?.name || ''}
              creatorId={tpl.author?.id}
              image={tpl.author?.image || null}
              bookmarked={false}
              onToggleBookmark={() => {}}
              addLabel={t('bookmarkAdd')}
              removeLabel={t('bookmarkRemove')}
              addShort={t('bookmarkAddShort')}
              removeShort={t('bookmarkRemoveShort')}
              onOpenProfile={cb.onOpenProfile}
              openLabel={t('openProfile')}
              title={tpl.name}
            />
            <div className="rounded-3xl border-2 border-black/10 bg-white/85 backdrop-blur px-4 py-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {t('smmSharedRolesTitle')}
                {tpl.isOwn && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">{t('smmMyRolesTitle')}</span>
                )}
              </div>
              <p className="text-sm font-bold leading-snug">{tpl.name}</p>
              {tpl.brief && <p className="text-xs whitespace-pre-wrap line-clamp-4">{tpl.brief}</p>}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {tpl.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><CalendarClock className="w-3 h-3" />{tpl.deadline}</span>}
                {tpl.payment && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Banknote className="w-3 h-3" />{tpl.payment}</span>}
              </div>
            </div>

            {!editMode ? (
              <>
                <button type="button" onClick={cb.onChat} className={btn}>
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('chat')}</span>
                  <ChevronUp className="w-4 h-4 ml-auto shrink-0 rotate-90" />
                </button>
                <button type="button" onClick={cb.onShare} className={btn}>
                  <Link2 className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('shareLinkBtn')}</span>
                </button>
                {cb.onUse && (
                  <button type="button" onClick={cb.onUse} className={btn}>
                    <ClipboardList className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-sm">{t('smmUseTemplate')}</span>
                  </button>
                )}
                {cb.onEdit && (
                  <button type="button" onClick={cb.onEdit} className={btn}>
                    <Pencil className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-sm">{t('gEdit')}</span>
                  </button>
                )}
                {cb.onDelete && (
                  <button type="button" onClick={cb.onDelete} className={`${btn} text-destructive`}>
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-sm">{t('delete')}</span>
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center">{t('editModeOn')}</p>
            )}
          </div>
        </div>
      </SwiperSlide>
    );
  };

  const gridFor = (tpl: any) => {
    const cb = tplCallbacks(tpl);
    const ladderBtn = 'h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1';
    return (
      <div key={tpl.id} className="h-full min-h-0 flex flex-col rounded-2xl border border-black/15 bg-white p-2 sm:p-3 lg:p-4 overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left">
        <CreatorStrip
          compact
          name={tpl.author?.name || ''}
          creatorId={tpl.author?.id}
          image={tpl.author?.image || null}
          bookmarked={false}
          onToggleBookmark={() => {}}
          addLabel={t('bookmarkAdd')}
          removeLabel={t('bookmarkRemove')}
          addShort={t('bookmarkAddShort')}
          removeShort={t('bookmarkRemoveShort')}
          onOpenProfile={cb.onOpenProfile}
          openLabel={t('openProfile')}
          title={tpl.name}
        />
        <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2 mt-1">{tpl.name}</p>
        {tpl.brief && <p className="text-[13px] sm:text-sm text-muted-foreground leading-snug line-clamp-2 mt-0.5">{tpl.brief}</p>}
        <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
          {tpl.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><CalendarClock className="w-2.5 h-2.5" />{tpl.deadline}</span>}
          {tpl.payment && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><Banknote className="w-2.5 h-2.5" />{tpl.payment}</span>}
        </div>
        <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
          <Button size="sm" variant="outline" onClick={() => cb.onChat()} title={t('chatWithAll')} aria-label={t('chatWithAll')} className={ladderBtn}>
            <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => cb.onShare()} title={t('shareLinkBtn')} aria-label={t('shareLinkBtn')} className={ladderBtn}>
            <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
          </Button>
          {cb.onUse && (
            <Button size="sm" variant="outline" onClick={() => cb.onUse!()} title={t('smmUseTemplate')} aria-label={t('smmUseTemplate')} className={ladderBtn}>
              <ClipboardList className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmUseTemplate')}</span>
            </Button>
          )}
          {cb.onEdit && (
            <Button size="sm" variant="outline" onClick={() => cb.onEdit!()} title={t('smmEditTemplateTitle')} aria-label={t('smmEditTemplateTitle')} className={ladderBtn}>
              <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
            </Button>
          )}
          {cb.onDelete && (
            <Button size="sm" variant="outline" onClick={() => cb.onDelete!()} title={t('delete')} aria-label={t('delete')} className={`${ladderBtn} text-destructive`}>
              <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('delete')}</span>
            </Button>
          )}
        </div>
      </div>
    );
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
            <Button onClick={openCreateSheet} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmCreateTemplateTitle')}>
              <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmCreateTemplateTitle')}</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditMode(v => !v)}
              className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm ${editMode ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
              title={t('smmEditTemplateTitle')}
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
            <SmmRoleButton role={mySmmRole} onSwitch={onSwitchRole} className="border-black px-2 sm:px-3" />
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
                <Users className="w-7 h-7 text-white" />
              </div>
              <p className="font-bold">{t('smmSharedEmpty')}</p>
              <p className="text-sm text-muted-foreground">{t('smmSharedEmptyHint')}</p>
              <Button onClick={openCreateSheet} className="rounded-full bg-cta hover:bg-cta/90 text-white">
                <Plus className="w-4 h-4 mr-1" /> {t('smmCreateTemplateTitle')}
              </Button>
            </CardContent>
          </Card>
        </main>
      ) : tiktokMode ? (
        <main className="relative flex-1 min-h-0 min-w-0">
          <Swiper
            {...{
              direction: 'vertical' as const,
              modules: [Mousewheel],
              slidesPerView: 1,
              spaceBetween: 0,
              speed: 320,
              resistanceRatio: 0,
              touchReleaseOnEdges: true,
              longSwipesRatio: 0.35,
              mousewheel: { forceToAxis: true, sensitivity: 1, thresholdDelta: 12, thresholdTime: 250, releaseOnEdges: false },
            }}
            className="feed-swiper h-full screen-enter"
            initialSlide={Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))}
            onSwiper={sw => { swiperRef.current = sw; }}
            onSlideChange={sw => setActiveIdx(sw.activeIndex)}
          >
            <div className="hidden lg:flex flex-col gap-2 absolute right-5 top-1/2 -translate-y-1/2 z-30">
              <button type="button" onClick={() => swiperRef.current?.slidePrev()} disabled={activeIdx <= 0} className="w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center disabled:opacity-30" aria-label={t('feedPrev')}><ChevronUp className="w-5 h-5" /></button>
              <button type="button" onClick={() => swiperRef.current?.slideNext()} disabled={activeIdx >= len - 1} className="w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center disabled:opacity-30" aria-label={t('feedNext')}><ChevronDown className="w-5 h-5" /></button>
            </div>
            {visible.map((tpl: any) => slideFor(tpl))}
          </Swiper>
        </main>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-full flex flex-col">
            <div className="flex-1 min-h-0 pt-2 sm:pt-3">
              <div className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {visible.map((tpl: any) => gridFor(tpl))}
              </div>
            </div>
            <div aria-hidden="true" className="hidden lg:block h-28 shrink-0" />
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR ── */}
      {tiktokMode && len > 0 && (
        <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2">
            <Button
              onClick={() => (editMode && curTpl && curTpl.isOwn ? openEditSheet(curTpl) : openCreateSheet())}
              disabled={loading}
              className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
            >
              {editMode
                ? <><Pencil className="w-4 h-4 mr-2 shrink-0" /> {t('smmEditTemplateTitle')}</>
                : <><Plus className="w-4 h-4 mr-2 shrink-0" /> {t('smmCreateTemplateTitle')}</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── MAIN DOCK — the uniform 4 buttons; «Общие роли» is active ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="grid grid-cols-4 gap-2">
            {mySmmRole === 'customer' ? (
              <button type="button" onClick={onGotoMyRoles} title={t('smmMyRolesTitle')} aria-label={t('smmMyRolesTitle')} className={`${dockBtn} border-black bg-white hover:bg-muted/50`}>
                <Briefcase className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
                <span className="min-w-0 truncate">{t('smmMyRolesTitle')}</span>
              </button>
            ) : (
              <button type="button" onClick={onGotoMail} title={t('smmMailTitle')} aria-label={t('smmMailTitle')} className={`${dockBtn} border-black bg-white hover:bg-muted/50`}>
                <Mail className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
                <span className="min-w-0 truncate">{t('smmMailTitle')}</span>
              </button>
            )}
            <button type="button" disabled title={t('smmSharedRolesTitle')} aria-label={t('smmSharedRolesTitle')} className={`${dockBtn} bg-cta text-white border-cta shadow-md`}>
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

      {/* ── TEMPLATE FORM SHEET (create / edit) ── */}
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
                <span className="w-7 h-7 rounded-lg bg-cta flex items-center justify-center shrink-0"><Users className="w-4 h-4 text-white" /></span>
                <p className="font-bold text-sm truncate">{editingTpl ? t('smmEditTemplateTitle') : t('smmCreateTemplateTitle')}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setSheetOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
          }
          body={
            <div className="px-4 py-4">
              <div className="max-w-3xl mx-auto space-y-3">
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
              <Button onClick={saveTemplate} disabled={busy || !form.name.trim()} className="flex-1 rounded-full bg-primary hover:bg-primary/90">
                {busy ? t('loading') : <><Plus className="w-4 h-4 mr-1" /> {t('save')}</>}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)} className="rounded-full">{t('cancel')}</Button>
            </div>
          }
        />
      )}

      {/* ── USE-TEMPLATE SHEET — copy into one of MY events (customer) ── */}
      {useTpl && (
        <ResizableSheetFrame
          open={!!useTpl}
          onClose={() => setUseTpl(null)}
          initialVh={0.6}
          minVh={0.3}
          maxW="max-w-xl"
          header={
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-cta flex items-center justify-center shrink-0"><ClipboardList className="w-4 h-4 text-white" /></span>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{t('smmUseTemplate')}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{useTpl.name}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setUseTpl(null)}><X className="w-4 h-4" /></Button>
            </div>
          }
          body={
            <div className="px-4 py-4">
              <div className="max-w-xl mx-auto space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('smmPickEvent')}</p>
                {myEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('smmNoEventsForRole')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {myEvents.map((ev: any) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setPickedEventId(ev.id)}
                        className={`w-full text-left px-3 py-2 rounded-2xl border-2 text-sm font-semibold truncate transition-colors ${pickedEventId === ev.id ? 'bg-cta text-white border-cta' : 'border-black/15 bg-white hover:bg-muted/50'}`}
                      >
                        {ev.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          }
          footer={
            <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <Button onClick={confirmUse} disabled={busy || !pickedEventId} className="flex-1 rounded-full bg-primary hover:bg-primary/90">
                {busy ? t('loading') : t('smmUseTemplate')}
              </Button>
              <Button variant="outline" onClick={() => setUseTpl(null)} className="rounded-full">{t('cancel')}</Button>
            </div>
          }
        />
      )}

      <AlertDialog open={!!deleteTplId} onOpenChange={() => setDeleteTplId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('smmTemplateDeleted')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
