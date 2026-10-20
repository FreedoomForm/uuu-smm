'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, Bot, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardList,
  Compass, LayoutGrid, Library, Link2, ListOrdered, Loader2, MessageCircle, Pencil,
  Play, Plus, Rows3, Search, Send, Trash2, Users, X, Download,
} from 'lucide-react';
import LangButton from '@/components/lang-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CreatorStrip } from '@/components/shared-bits';
import { SmmSpecialistDock } from '@/components/pages/smm-roles-view-dock';
import { smmCoverColor } from '@/lib/smm-client';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';

/**
 * SMM REQUESTS PAGE — «Отправленные запросы» + «Общие шаблоны». The dashboard's
 * twin: the same 56px top panel (back · create · edit-mode · search · view ·
 * lang · profile), the same TikTok-style card feed (REQUEST cards instead of
 * event cards), the same library / shelf grid views, the same bottom action
 * bar and the same LIBRARY PAGES DOCK — the specialist's four page buttons:
 * Личная библиотека | Публичная библиотека | Принятые запросы | Отправленные
 * запросы (this page, active).
 *
 * Every card carries the SAME ladder as every other SMM card: профиль +
 * закладки + имя in the creator strip, then Чат → ИИ чат → (own: Ссылка →
 * Общая библиотека → Изменить → Удалить) / (foreign public: Взять шаблон).
 */

type ViewKind = 'tiktok' | 'library' | 'shelf';

export interface SmmRequestsViewProps {
  user: { id: string; name: string; email: string } | null;
  myAvatar: string | null;
  requests: any[];
  loading: boolean;
  scope: 'mine' | 'public';
  onScopeChange: (s: 'mine' | 'public') => void;
  pinnedRequestIds: string[];
  focusRequestId?: string | null;
  goHome: () => void;
  onCreateRequest: () => void;
  onEditRequest: (rq: any) => void;
  onDeleteRequest: (rq: any) => void;
  onShareRequest: (rq: any) => void;
  onPublicRequest: (rq: any) => void;
  onTakeTemplate: (rq: any) => void;
  onFillRequest: (rq: any) => void;
  onSendRequest: (rq: any) => void;
  onChat: (rq: any) => void;
  onAiChat: (rq: any) => void;
  onToggleBookmark: (id: string) => void;
  onOpenProfileUser: (u: any) => void;
  onOpenProfilePage: () => void;
  onCycleLang: () => void;
  // The dock's page router: personal/public library + the requests pages
  gotoLibrary: (scope: 'mine' | 'discover') => void;
  gotoInbox: () => void;
  // The dashboard's «изменить» button routes here with the edit mode ON
  initialEditMode?: boolean;
  onInitialEditConsumed?: () => void;
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

export default function SmmRequestsView({
  user, myAvatar, requests, loading, scope, onScopeChange, pinnedRequestIds, focusRequestId,
  goHome, onCreateRequest, onEditRequest, onDeleteRequest, onShareRequest, onPublicRequest,
  onTakeTemplate, onFillRequest, onSendRequest, onChat, onAiChat, onToggleBookmark,
  onOpenProfileUser, onOpenProfilePage, onCycleLang, gotoLibrary, gotoInbox,
  initialEditMode = false, onInitialEditConsumed,
}: SmmRequestsViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [viewKind, setViewKind] = React.useState<ViewKind>('tiktok');
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchMounted, setSearchMounted] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [editMode, setEditMode] = React.useState(initialEditMode);
  // Consume the routed edit-mode flag once (the dashboard's «изменить»)
  React.useEffect(() => {
    if (initialEditMode && onInitialEditConsumed) onInitialEditConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const swiperRef = React.useRef<SwiperClass | null>(null);

  const isOwn = React.useCallback((rq: any) => !!user && !!rq && (rq.specialistId === user.id || rq.specialist?.id === user.id), [user]);

  // The search filters the CURRENT scope locally — title, summary, step texts
  // and the author's name.
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((rq: any) => {
      const hay = [rq.title, rq.summary, rq.specialist?.name, ...(rq.steps || []).map((s: any) => `${s.title} ${s.hint} ${s.answer}`)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [requests, query]);

  const tiktokMode = viewKind === 'tiktok';
  const len = visible.length;
  const curRq = tiktokMode ? visible[Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))] : null;
  const curIsOwn = curRq ? isOwn(curRq) : false;
  const filledN = (rq: any) => (rq.steps || []).filter((s: any) => (s.answer || '').trim()).length;

  const cycleView = () => {
    const order: ViewKind[] = ['tiktok', 'library', 'shelf'];
    setViewKind(order[(order.indexOf(viewKind) + 1) % order.length]);
  };

  const jump = (i: number) => {
    setActiveIdx(Math.max(0, Math.min(i, Math.max(0, len - 1))));
    if (swiperRef.current) swiperRef.current.slideTo(Math.max(0, Math.min(i, Math.max(0, len - 1))));
  };

  // A focused запрос (a freshly created/edited one) slides the feed to its card
  React.useEffect(() => {
    if (!focusRequestId || viewKind !== 'tiktok') return;
    const idx = visible.findIndex((e: any) => e.id === focusRequestId);
    if (idx >= 0) {
      setActiveIdx(idx);
      const t2 = setTimeout(() => swiperRef.current?.slideTo(idx, 0), 60);
      return () => clearTimeout(t2);
    }
  }, [focusRequestId, visible.length, viewKind]);

  const userInitials = (user?.name || '?').trim().slice(0, 2).toUpperCase() || '?';

  const slideCallbacks = (rq: any) => {
    const own = isOwn(rq);
    return {
      pinned: pinnedRequestIds.includes(rq.id),
      onToggleBookmark: () => onToggleBookmark(rq.id),
      onOpenProfile: rq.specialist ? () => onOpenProfileUser(rq.specialist) : undefined,
      onChat: () => onChat(rq),
      onAiChat: () => onAiChat(rq),
      ...(own ? {
        onShare: () => onShareRequest(rq),
        onPublic: () => onPublicRequest(rq),
        onEdit: () => onEditRequest(rq),
        onDelete: () => onDeleteRequest(rq),
      } : {
        onTake: () => onTakeTemplate(rq),
      }),
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

  const slideFor = (rq: any) => (
    <SmmRequestSlide
      key={rq.id}
      rq={rq}
      isOwner={isOwn(rq)}
      editMode={editMode}
      {...slideCallbacks(rq)}
    />
  );

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL — the same 56px contract and the same buttons the
          dashboard's panel carries: назад · + · изменить · поиск · вид ·
          язык · профиль ── */}
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
            {/* «+» — the specialist's create action: the ЗАПРОС editor (the
            test editor's twin) */}
            <Button onClick={onCreateRequest} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmNewRequest')}>
              <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmNewRequest')}</span>
            </Button>
            {/* «Изменить» — the edit-mode toggle: reveals the edit ladder on
            MY request cards and swaps the bottom bar to «Изменить запрос» */}
            <Button
              variant="outline"
              onClick={() => setEditMode(v => !v)}
              className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm ${editMode ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
              title={t('smmEditRequestTitle')}
              aria-label={t('smmEditRequestTitle')}
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

      {/* ── SCOPE SEGMENT — «Мои запросы» | «Общие шаблоны» ── */}
      <div className="shrink-0 z-30 bg-background/95 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex gap-2">
          <button type="button" onClick={() => { if (scope !== 'mine') onScopeChange('mine'); }} className={`min-w-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border-2 text-xs sm:text-[13px] font-semibold transition-colors ${scope === 'mine' ? 'bg-primary text-white border-primary shadow-md' : 'border-black/15 bg-white hover:bg-muted/50'}`}>
            <ListOrdered className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{t('smmRequestsPersonalEmpty')}</span>
          </button>
          <button type="button" onClick={() => { if (scope !== 'public') onScopeChange('public'); }} className={`min-w-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border-2 text-xs sm:text-[13px] font-semibold transition-colors ${scope === 'public' ? 'bg-primary text-white border-primary shadow-md' : 'border-black/15 bg-white hover:bg-muted/50'}`}>
            <Compass className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{t('modeDiscover')}</span>
          </button>
        </div>
      </div>

      {/* ── CONTENT — the same three views as the dashboard ── */}
      {len === 0 && (loading || !user) ? (
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
                {scope === 'mine' ? <ListOrdered className="w-7 h-7 text-white" /> : <Compass className="w-7 h-7 text-white" />}
              </div>
              <p className="font-bold">{scope === 'mine' ? t('smmRequestsMineEmpty') : t('smmRequestsPublicEmpty')}</p>
              <p className="text-sm text-muted-foreground">{scope === 'mine' ? t('smmRequestsMineHint') : t('smmRequestsPublicHint')}</p>
              {scope === 'mine' && (
                <Button onClick={onCreateRequest} className="rounded-full bg-cta hover:bg-cta/90 text-white">
                  <Plus className="w-4 h-4 mr-1" /> {t('smmNewRequest')}
                </Button>
              )}
            </CardContent>
          </Card>
        </main>
      ) : tiktokMode ? (
        <main className="relative flex-1 min-h-0 min-w-0">
          <Swiper
            key={`requests-feed-swiper-${scope}`}
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
            {visible.map((rq: any) => slideFor(rq))}
          </Swiper>
        </main>
      ) : (
        <div key={`requests-grid-${viewKind}-${scope}`} className="flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-full flex flex-col">
            <div className="flex-1 min-h-0 pt-2 sm:pt-3">
              <div className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {visible.map((rq: any) => (
                  <SmmRequestGridCard
                    key={rq.id}
                    rq={rq}
                    isOwner={isOwn(rq)}
                    {...slideCallbacks(rq)}
                    onOpen={() => { jump(Math.max(0, visible.findIndex((x: any) => x.id === rq.id))); setViewKind('tiktok'); }}
                  />
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="hidden lg:block h-28 shrink-0" />
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR — the same 60px bar the dashboard keeps above
          the dock. Normal: «Заполнить запрос» (the current card's steps);
          edit mode: «Изменить этот запрос». ── */}
      {tiktokMode && len > 0 && (
        <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2 flex gap-2">
            {editMode ? (
              <Button
                onClick={() => curRq && curIsOwn && onEditRequest(curRq)}
                disabled={!curRq || !curIsOwn}
                title={curRq && !curIsOwn ? t('smmOnlyOwnEvents') : undefined}
                className="flex-1 min-w-0 h-9 lg:h-11 lg:text-base rounded-full bg-cta hover:bg-cta/90 text-white"
              >
                <Pencil className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('smmEditThisRequest')}</span>
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => curRq && onFillRequest(curRq)}
                  disabled={!curRq || !curIsOwn || !(curRq.steps || []).length}
                  title={curRq && !(curRq.steps || []).length ? t('smmFillEmptyHint') : undefined}
                  className="flex-1 min-w-0 h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
                >
                  <ClipboardList className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('smmFillThisRequest')}</span>
                </Button>
                <Button
                  onClick={() => curRq && onSendRequest(curRq)}
                  disabled={!curRq || !curIsOwn}
                  title={t('smmSendRequestBtn')}
                  className="shrink-0 h-9 lg:h-11 px-4 rounded-full bg-cta hover:bg-cta/90 text-white"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── LIBRARY PAGES DOCK — the specialist's four page buttons ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <SmmSpecialistDock
            lang={lang}
            active="requests"
            gotoLibrary={gotoLibrary}
            gotoInbox={gotoInbox}
            gotoRequests={() => { /* already here */ }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SMM REQUEST SLIDE — the ONE TikTok-style card for a ЗАПРОС. The same ladder
// every SMM card keeps (the user's rule: identical cards everywhere): профиль
// + закладки + имя in the creator strip, then Чат → ИИ чат → (own: Ссылка →
// Общая библиотека → Изменить → Удалить) / (foreign public: Взять шаблон).
// (The SmmSpecialistDock lives in smm-roles-view-dock.tsx — every specialist
// page imports the SAME dock from there.)
// ---------------------------------------------------------------------------
export interface SmmRequestSlideProps {
  rq: any;
  isOwner: boolean;
  pinned?: boolean;
  editMode?: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onAiChat: () => void;
  onShare?: () => void;
  onPublic?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onTake?: () => void;
  onSend?: () => void;
  onFill?: () => void;
  children?: React.ReactNode;
}

export function SmmRequestSlide({
  rq, isOwner, pinned = false, editMode = false,
  onToggleBookmark, onOpenProfile, onChat, onAiChat,
  onShare, onPublic, onEdit, onDelete, onTake, onSend, onFill, children,
}: SmmRequestSlideProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const steps: any[] = rq.steps || [];
  const filled = steps.filter((s: any) => (s.answer || '').trim()).length;
  const btn = 'shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors';

  return (
    <SwiperSlide className="relative !h-full overflow-hidden" style={{ backgroundColor: rq.coverColor || smmCoverColor(rq.id) }}>
      <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
        <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
          <CreatorStrip
            name={rq.specialist?.name || ''}
            creatorId={rq.specialist?.id}
            image={rq.specialist?.image || null}
            bookmarked={pinned}
            onToggleBookmark={onToggleBookmark}
            addLabel={t('bookmarkAdd')}
            removeLabel={t('bookmarkRemove')}
            addShort={t('bookmarkAddShort')}
            removeShort={t('bookmarkRemoveShort')}
            onOpenProfile={onOpenProfile}
            openLabel={t('openProfile')}
            title={rq.title}
          />
          <div className="rounded-3xl border-2 border-black/10 bg-white/85 backdrop-blur px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <ListOrdered className="w-3.5 h-3.5" />
              {t('smmRequestInformation')}
              {isOwner && (
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${rq.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {rq.isPublic ? <Users className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {rq.isPublic ? t('smmEventPublicBadge') : t('smmEventLinkOnlyBadge')}
                </span>
              )}
            </div>
            {rq.summary && <p className="text-sm font-semibold leading-snug line-clamp-3">{rq.summary}</p>}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {steps.length > 0
                ? <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">{t('smmStepsN', { n: steps.length })}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><CheckCircle2 className="w-3 h-3" />{t('smmFilledN', { n: filled, m: steps.length })}</span>
                  </>
                : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-semibold">{t('smmNoStepsBadge')}</span>}
            </div>
            {steps.length > 0 && (
              <div className="space-y-1">
                {steps.slice(0, 4).map((s: any, i: number) => (
                  <div key={s.id} className="flex items-center gap-1.5 text-xs">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${(s.answer || '').trim() ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                    <span className={`font-semibold truncate ${(s.answer || '').trim() ? '' : 'text-muted-foreground'}`}>{s.title}</span>
                  </div>
                ))}
                {steps.length > 4 && <p className="text-[11px] text-muted-foreground">{t('smmStepsN', { n: steps.length })}</p>}
              </div>
            )}
            {(rq.applications || []).length > 0 && (
              <div className="space-y-1 border-t border-black/5 pt-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('smmSentTo')}</p>
                {(rq.applications || []).slice(0, 4).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-1.5 text-xs">
                    <Send className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-semibold truncate">{a.event?.title}</span>
                    <Badge className={`ml-auto rounded-full shrink-0 text-[9px] px-1.5 py-0 ${a.status === 'accepted' ? 'bg-emerald-500' : a.status === 'declined' ? 'bg-red-500' : 'bg-amber-500'}`}>{t(`smmStatus_${a.status}`)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!editMode && (
            <>
              {/* The universal ladder — the same buttons every SMM card keeps */}
              <button type="button" onClick={onChat} className={btn}>
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{t('gChat')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              <button type="button" onClick={onAiChat} className={btn}>
                <Bot className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{t('smmAiChat')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              {isOwner && onShare && (
                <button type="button" onClick={onShare} className={btn}>
                  <Link2 className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('gShare')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {isOwner && onPublic && (
                <button type="button" onClick={onPublic} className={btn}>
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{rq.isPublic ? t('smmMakeLinkOnly') : t('smmMakePublicBtn')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {isOwner && onFill && (
                <button type="button" onClick={onFill} className={btn}>
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('smmFillThisRequest')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {isOwner && onEdit && (
                <button type="button" onClick={onEdit} className={btn}>
                  <Pencil className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('gEdit')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {!isOwner && onTake && (
                <button type="button" onClick={onTake} className={btn}>
                  <Download className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('smmAttachToMyEvent')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {isOwner && onDelete && (
                <button type="button" onClick={onDelete} className={`${btn} text-destructive`}>
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('delete')}</span>
                </button>
              )}
            </>
          )}
          {editMode && (
            <p className="text-xs text-muted-foreground text-center">{t('editModeOn')}</p>
          )}
          {children}
        </div>
      </div>
    </SwiperSlide>
  );
}

// The compact grid card (library / shelf views) for the SAME запрос — mirrors
// the event grid card: creator strip, title, summary and the ladder.
export function SmmRequestGridCard({
  rq, pinned, isOwner, onToggleBookmark, onOpenProfile, onChat, onAiChat,
  onShare, onPublic, onEdit, onDelete, onTake, onOpen,
}: {
  rq: any;
  pinned?: boolean;
  isOwner: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onAiChat: () => void;
  onShare?: () => void;
  onPublic?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onTake?: () => void;
  onOpen?: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const steps: any[] = rq.steps || [];
  const filled = steps.filter((s: any) => (s.answer || '').trim()).length;
  const ladderBtn = 'h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen?.(); }}
      className="h-full min-h-0 flex flex-col rounded-2xl border border-black/15 bg-white p-2 sm:p-3 lg:p-4 overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left cursor-pointer"
      style={{ backgroundColor: rq.coverColor || undefined }}
    >
      <CreatorStrip
        compact
        name={rq.specialist?.name || ''}
        creatorId={rq.specialist?.id}
        image={rq.specialist?.image || null}
        bookmarked={!!pinned}
        onToggleBookmark={onToggleBookmark}
        addLabel={t('bookmarkAdd')}
        removeLabel={t('bookmarkRemove')}
        addShort={t('bookmarkAddShort')}
        removeShort={t('bookmarkRemoveShort')}
        onOpenProfile={onOpenProfile}
        openLabel={t('openProfile')}
        title={rq.title}
      />
      <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <ListOrdered className="w-3 h-3" />
        {t('smmRequestInformation')}
        {isOwner && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 normal-case ${rq.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
            {rq.isPublic ? <Users className="w-2.5 h-2.5" /> : <Link2 className="w-2.5 h-2.5" />}
            {rq.isPublic ? t('smmEventPublicBadge') : t('smmEventLinkOnlyBadge')}
          </span>
        )}
      </div>
      {rq.summary && <p className="text-[13px] sm:text-sm lg:text-[15px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{rq.summary}</p>}
      <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
        {steps.length > 0
          ? <>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">{t('smmStepsN', { n: steps.length })}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><CheckCircle2 className="w-2.5 h-2.5" />{t('smmFilledN', { n: filled, m: steps.length })}</span>
            </>
          : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 font-semibold">{t('smmNoStepsBadge')}</span>}
      </div>
      {/* ONE BUTTON PER LEVEL — the same ladder the test grid cards keep */}
      <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onChat(); }} title={t('chatWithAll')} aria-label={t('chatWithAll')} className={ladderBtn}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onAiChat(); }} title={t('smmAiChat')} aria-label={t('smmAiChat')} className={ladderBtn}>
          <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmAiChat')}</span>
        </Button>
        {isOwner && onShare && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onShare(); }} title={t('gShare')} aria-label={t('gShare')} className={ladderBtn}>
            <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
          </Button>
        )}
        {isOwner && onPublic && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onPublic(); }} title={rq.isPublic ? t('smmMakeLinkOnly') : t('smmMakePublicBtn')} aria-label={rq.isPublic ? t('smmMakeLinkOnly') : t('smmMakePublicBtn')} className={ladderBtn}>
            <Users className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{rq.isPublic ? t('smmMakeLinkOnly') : t('gPublic')}</span>
          </Button>
        )}
        {isOwner && onEdit && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onEdit(); }} title={t('gEdit')} aria-label={t('gEdit')} className={ladderBtn}>
            <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
          </Button>
        )}
        {!isOwner && onTake && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onTake(); }} title={t('smmAttachToMyEvent')} aria-label={t('smmAttachToMyEvent')} className={ladderBtn}>
            <Download className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmAttachToMyEvent')}</span>
          </Button>
        )}
        {isOwner && onDelete && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onDelete(); }} title={t('delete')} aria-label={t('delete')} className={`${ladderBtn} text-destructive`}>
            <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('delete')}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
