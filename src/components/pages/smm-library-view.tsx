'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, BookOpen, ChevronDown, ChevronUp, Globe, LayoutGrid, Library,
  Play, Plus, Pencil, Rows3, Search, Send, X,
} from 'lucide-react';
import LangButton from '@/components/lang-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import SmmEventSlide, { SmmEventGridCard } from '@/components/pages/smm-event-slide';
import { SmmSpecialistDock } from '@/components/pages/smm-roles-view-dock';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';

/**
 * SMM LIBRARY PAGE — the SPECIALIST's «Личная / Публичная библиотека» (the
 * events-page twin). Two scopes driven by the dock's two library tabs:
 *   mine     → the specialist's BOOKMARKED events (закладки мероприятий) —
 *              every card carries «Отправить запрос» so a запрос goes out
 *              straight from the library;
 *   discover → the whole open library (every public event) to browse and
 *              bookmark.
 * The same 56px top panel as every specialist page (назад · + · изменить ·
 * поиск · вид · язык · профиль), the same TikTok / library / shelf views with
 * EVENT cards, the same bottom action bar and the same specialist dock.
 */

type ViewKind = 'tiktok' | 'library' | 'shelf';

export interface SmmLibraryViewProps {
  user: { id: string; name: string; email: string } | null;
  myAvatar: string | null;
  events: any[];
  loading: boolean;
  scope: 'mine' | 'discover';
  pinnedEventIds: string[];
  focusEventId?: string | null;
  goHome: () => void;
  // The specialist's «+» creates a ЗАПРОС (the D-spec top-panel behavior)
  onCreateRequest: () => void;
  // «Изменить» routes to «Отправленные запросы» with its edit mode on —
  // изменить changes MY запросы, not the library events
  onEditRequests: () => void;
  onSendRequest: (ev: any) => void;
  onChat: (ev: any) => void;
  onAiChat: (ev: any) => void;
  onToggleBookmark: (id: string) => void;
  onOpenProfileUser: (u: any) => void;
  onOpenOtherEvent: (o: any) => void;
  onOpenProfilePage: () => void;
  onCycleLang: () => void;
  // The dock's page router: the OTHER library tab (scope switch), inbox, requests
  gotoLibrary: (scope: 'mine' | 'discover') => void;
  gotoInbox: () => void;
  gotoRequests: () => void;
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

export default function SmmLibraryView({
  user, myAvatar, events, loading, scope, pinnedEventIds, focusEventId,
  goHome, onCreateRequest, onEditRequests, onSendRequest, onChat, onAiChat,
  onToggleBookmark, onOpenProfileUser, onOpenOtherEvent, onOpenProfilePage,
  onCycleLang, gotoLibrary, gotoInbox, gotoRequests,
}: SmmLibraryViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [viewKind, setViewKind] = React.useState<ViewKind>('tiktok');
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [searchMounted, setSearchMounted] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const swiperRef = React.useRef<SwiperClass | null>(null);

  // The search filters the CURRENT scope locally — title, summary, brief and
  // the author's name.
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev: any) => {
      const hay = [ev.title, ev.summary, ev.brief, ev.customer?.name]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [events, query]);

  const tiktokMode = viewKind === 'tiktok';
  const len = visible.length;
  const curEv = tiktokMode ? visible[Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))] : null;

  const cycleView = () => {
    const order: ViewKind[] = ['tiktok', 'library', 'shelf'];
    setViewKind(order[(order.indexOf(viewKind) + 1) % order.length]);
  };

  const jump = (i: number) => {
    setActiveIdx(Math.max(0, Math.min(i, Math.max(0, len - 1))));
    if (swiperRef.current) swiperRef.current.slideTo(Math.max(0, Math.min(i, Math.max(0, len - 1))));
  };

  // A focused event (a fresh bookmark, a deep link) slides the feed to its card
  React.useEffect(() => {
    if (!focusEventId || viewKind !== 'tiktok') return;
    const idx = visible.findIndex((e: any) => e.id === focusEventId);
    if (idx >= 0) {
      setActiveIdx(idx);
      const t2 = setTimeout(() => swiperRef.current?.slideTo(idx, 0), 60);
      return () => clearTimeout(t2);
    }
  }, [focusEventId, visible.length, viewKind]);

  const userInitials = (user?.name || '?').trim().slice(0, 2).toUpperCase() || '?';

  const slideCallbacks = (ev: any) => ({
    onToggleBookmark: () => onToggleBookmark(ev.id),
    onOpenProfile: ev.customer ? () => onOpenProfileUser(ev.customer) : undefined,
    onChat: () => onChat(ev),
    onSend: () => onSendRequest(ev),
  });

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

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL — the same 56px contract and the same buttons every
          specialist page carries: назад · + · изменить · поиск · вид ·
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
            {/* «+» — the specialist's create action: the ЗАПРОС editor */}
            <Button onClick={onCreateRequest} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmNewRequest')}>
              <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmNewRequest')}</span>
            </Button>
            {/* «Изменить» — routes to «Отправленные запросы» in edit mode:
                изменить changes MY запросы */}
            <Button
              variant="outline"
              onClick={onEditRequests}
              className="rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm border-black"
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

      {/* ── CONTENT — the same three views as every card page ── */}
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
                {scope === 'mine' ? <BookOpen className="w-7 h-7 text-white" /> : <Globe className="w-7 h-7 text-white" />}
              </div>
              <p className="font-bold">{scope === 'mine' ? t('smmLibPersonalEmpty') : t('smmLibPublicEmpty')}</p>
              <p className="text-sm text-muted-foreground">{scope === 'mine' ? t('smmLibPersonalHint') : t('smmLibPublicHint')}</p>
            </CardContent>
          </Card>
        </main>
      ) : tiktokMode ? (
        <main className="relative flex-1 min-h-0 min-w-0">
          <Swiper
            key={`library-feed-swiper-${scope}`}
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
            {visible.map((ev: any) => (
              <SmmEventSlide
                key={ev.id}
                ev={ev}
                pinned={pinnedEventIds.includes(ev.id)}
                isOwner={false}
                onOpenOtherEvent={onOpenOtherEvent}
                {...slideCallbacks(ev)}
              />
            ))}
          </Swiper>
        </main>
      ) : (
        <div key={`library-grid-${viewKind}-${scope}`} className="flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-full flex flex-col">
            <div className="flex-1 min-h-0 pt-2 sm:pt-3">
              <div className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {visible.map((ev: any) => (
                  <SmmEventGridCard
                    key={ev.id}
                    ev={ev}
                    pinned={pinnedEventIds.includes(ev.id)}
                    isOwner={false}
                    {...slideCallbacks(ev)}
                    onOpen={() => { jump(Math.max(0, visible.findIndex((x: any) => x.id === ev.id))); setViewKind('tiktok'); }}
                  />
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="hidden lg:block h-28 shrink-0" />
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR — the same 60px bar every feed page keeps above
          the dock: «Отправить запрос» on the event on screen. ── */}
      {tiktokMode && len > 0 && (
        <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2 flex gap-2">
            <Button
              onClick={() => curEv && onSendRequest(curEv)}
              disabled={!curEv}
              title={t('smmSendRequestBtn')}
              className="flex-1 min-w-0 h-9 lg:h-11 lg:text-base rounded-full bg-cta hover:bg-cta/90 text-white"
            >
              <Send className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('smmSendRequestBtn')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* ── LIBRARY PAGES DOCK — the specialist's four page tabs ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <SmmSpecialistDock
            lang={lang}
            active={scope === 'mine' ? 'libraryMine' : 'libraryPublic'}
            gotoLibrary={gotoLibrary}
            gotoInbox={gotoInbox}
            gotoRequests={gotoRequests}
          />
        </div>
      </div>
    </div>
  );
}
