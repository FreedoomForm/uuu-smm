'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, Banknote, Bot, Briefcase, CalendarClock, CheckCircle2, ChevronDown, ChevronRight,
  ChevronUp, ClipboardList, Compass, Download, LayoutGrid, Library, Link2, MessageCircle,
  Pencil, Play, Plus, Rows3, Search, ShieldAlert, Trash2, Users, X, Landmark,
} from 'lucide-react';
import LangButton from '@/components/lang-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CreatorStrip } from '@/components/shared-bits';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';
import { SmmCustomerDock } from '@/components/pages/smm-roles-view-dock';

/**
 * SMM ROLES PAGE — the customer's «Личные роли» (обзор своих ролей across all
 * their events) + «Общие роли» (public role task templates people share).
 * The dashboard's twin: the same 56px top panel (back · create · edit-mode ·
 * search · view · lang · profile), the same TikTok-style card feed (ROLE
 * cards), the same library / shelf grid views, the same bottom action bar and
 * the same LIBRARY PAGES DOCK — the customer's four page buttons:
 * Личные роли | Общие роли | Личное | Общее.
 *
 * Every card carries the SAME ladder as every other SMM card: профиль +
 * закладки + имя in the creator strip, then Чат → ИИ чат → (own: Поделиться →
 * Общая библиотека → Изменить → Удалить) / (foreign public: Взять шаблон).
 */

type ViewKind = 'tiktok' | 'library' | 'shelf';

export interface SmmRolesViewProps {
  user: { id: string; name: string; email: string } | null;
  myAvatar: string | null;
  roles: any[];
  loading: boolean;
  scope: 'mine' | 'public';
  onScopeChange: (s: 'mine' | 'public') => void;
  myEvents: any[]; // for «Взять шаблон» event picking (client dialog)
  goHome: () => void;
  onCreateEvent: () => void;
  onEditRole: (role: any) => void;
  onDeleteRole: (role: any) => void;
  onShareRole: (role: any) => void;
  onAttachRole: (role: any, eventId: string) => void;
  onOpenEvent: (ev: any) => void;
  onChat: (role: any) => void;
  onAiChat: (role: any) => void;
  onToggleBookmark: (id: string) => void;
  onOpenProfileUser: (u: any) => void;
  onOpenProfilePage: () => void;
  onCycleLang: () => void;
  // The dock's page tabs router: Мероприятия + Почта (the roles tabs switch
  // the scope of THIS page via onScopeChange)
  gotoEvents: () => void;
  gotoMail: () => void;
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

export default function SmmRolesView({
  user, myAvatar, roles, loading, scope, onScopeChange, myEvents,
  goHome, onCreateEvent, onEditRole, onDeleteRole, onShareRole, onAttachRole,
  onOpenEvent, onChat, onAiChat, onToggleBookmark, onOpenProfileUser,
  onOpenProfilePage, onCycleLang, gotoEvents, gotoMail,
}: SmmRolesViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [viewKind, setViewKind] = React.useState<ViewKind>('tiktok');
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchMounted, setSearchMounted] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [editMode, setEditMode] = React.useState(false);
  // «Взять шаблон» — the event picker: a public role template lands in one
  // of MY events as a fresh role (the template itself stays shared)
  const [attachRole, setAttachRole] = React.useState<any | null>(null);
  const swiperRef = React.useRef<SwiperClass | null>(null);

  const isOwn = React.useCallback((role: any) => {
    if (!user || !role) return false;
    if (role.authorId === user.id || role.author?.id === user.id) return true;
    if (role.event?.customerId === user.id) return true;
    return false;
  }, [user]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r: any) => {
      const hay = [r.name, r.brief, r.payment, r.deadline, r.event?.title, r.author?.name]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [roles, query]);

  const tiktokMode = viewKind === 'tiktok';
  const len = visible.length;
  const curRole = tiktokMode ? visible[Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))] : null;
  const curIsOwn = curRole ? isOwn(curRole) : false;

  const cycleView = () => {
    const order: ViewKind[] = ['tiktok', 'library', 'shelf'];
    setViewKind(order[(order.indexOf(viewKind) + 1) % order.length]);
  };

  const jump = (i: number) => {
    setActiveIdx(Math.max(0, Math.min(i, Math.max(0, len - 1))));
    if (swiperRef.current) swiperRef.current.slideTo(Math.max(0, Math.min(i, Math.max(0, len - 1))));
  };

  const userInitials = (user?.name || '?').trim().slice(0, 2).toUpperCase() || '?';

  const slideCallbacks = (role: any) => {
    const own = isOwn(role);
    return {
      pinned: false,
      onToggleBookmark: () => onToggleBookmark(role.id),
      onOpenProfile: role.author ? () => onOpenProfileUser(role.author) : undefined,
      onChat: () => onChat(role),
      onAiChat: () => onAiChat(role),
      ...(own ? {
        onShare: () => onShareRole(role),
        onEdit: () => onEditRole(role),
        onDelete: () => onDeleteRole(role),
      } : {
        onAttach: () => setAttachRole(role),
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

  const slideFor = (role: any) => (
    <SmmRoleSlide
      key={role.id}
      role={role}
      isOwner={isOwn(role)}
      editMode={editMode}
      onOpenEvent={onOpenEvent}
      {...slideCallbacks(role)}
    />
  );

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL — the same 56px contract ── */}
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
            {/* «+» — the customer's create action: the EVENT editor (a role
            lives inside an event) */}
            <Button onClick={onCreateEvent} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmCreateEvent')}>
              <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmCreateEvent')}</span>
            </Button>
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

      {/* ── SCOPE SEGMENT — «Личные роли» | «Общие роли» ── */}
      <div className="shrink-0 z-30 bg-background/95 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex gap-2">
          <button type="button" onClick={() => { if (scope !== 'mine') onScopeChange('mine'); }} className={`min-w-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border-2 text-xs sm:text-[13px] font-semibold transition-colors ${scope === 'mine' ? 'bg-primary text-white border-primary shadow-md' : 'border-black/15 bg-white hover:bg-muted/50'}`}>
            <ClipboardList className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{t('smmRolesTitle')}</span>
          </button>
          <button type="button" onClick={() => { if (scope !== 'public') onScopeChange('public'); }} className={`min-w-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border-2 text-xs sm:text-[13px] font-semibold transition-colors ${scope === 'public' ? 'bg-primary text-white border-primary shadow-md' : 'border-black/15 bg-white hover:bg-muted/50'}`}>
            <Compass className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{t('smmRolesPublicTitle')}</span>
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
                {scope === 'mine' ? <ClipboardList className="w-7 h-7 text-white" /> : <Compass className="w-7 h-7 text-white" />}
              </div>
              <p className="font-bold">{scope === 'mine' ? t('smmRolesMineEmpty') : t('smmRolesPublicEmpty')}</p>
              <p className="text-sm text-muted-foreground">{scope === 'mine' ? t('smmRolesMineHint') : t('smmPublicRolesHint')}</p>
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
            key={`roles-feed-swiper-${scope}`}
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
            {visible.map((role: any) => slideFor(role))}
          </Swiper>
        </main>
      ) : (
        <div key={`roles-grid-${viewKind}-${scope}`} className="flex-1 min-h-0 overflow-y-auto overscroll-contain screen-enter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-full flex flex-col">
            <div className="flex-1 min-h-0 pt-2 sm:pt-3">
              <div className={`grid ${gridColsClass} gap-2 sm:gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4`}>
                {visible.map((role: any) => (
                  <SmmRoleGridCard
                    key={role.id}
                    role={role}
                    isOwner={isOwn(role)}
                    {...slideCallbacks(role)}
                    onOpen={() => { setViewKind('tiktok'); jump(Math.max(0, visible.findIndex((x: any) => x.id === role.id))); }}
                  />
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="hidden lg:block h-28 shrink-0" />
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR — edit mode: «Изменить роль»; normal: open the
          current role's event (its management window) ── */}
      {tiktokMode && len > 0 && (
        <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2">
            {editMode ? (
              <Button
                onClick={() => curRole && curIsOwn && onEditRole(curRole)}
                disabled={!curRole || !curIsOwn}
                className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-cta hover:bg-cta/90 text-white"
              >
                <Pencil className="w-4 h-4 mr-2 shrink-0" /> {t('gEdit')}
              </Button>
            ) : (
              <Button
                onClick={() => curRole && curRole.event && onOpenEvent(curRole.event)}
                disabled={!curRole || !curRole.event}
                className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
              >
                <Briefcase className="w-4 h-4 mr-2 shrink-0" /> {t('smmOpenEvent')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── LIBRARY PAGES DOCK — the customer's four page buttons ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <SmmCustomerDock
            lang={lang}
            active={scope === 'mine' ? 'rolesMine' : 'rolesPublic'}
            gotoEvents={gotoEvents}
            gotoRoles={s => onScopeChange(s)}
            gotoMail={gotoMail}
          />
        </div>
      </div>

      {/* ── ATTACH DIALOG — «Взять шаблон»: pick which of MY events gets
      this public role template ── */}
      {attachRole && (
        <div className="fixed inset-0 z-[80] bg-black/55 flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl screen-enter">
            <div className="flex items-start gap-3 mb-3">
              <span className="w-10 h-10 rounded-2xl bg-cta text-white flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold leading-tight">{t('smmTakeTemplate')}</h3>
                <p className="text-xs text-muted-foreground truncate">{attachRole.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{t('smmPickEventForTemplate')}</p>
            {myEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('smmNoEventsYet')}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {myEvents.map((ev: any) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => { const r = attachRole; setAttachRole(null); onAttachRole(r, ev.id); }}
                    className="w-full text-left p-3 rounded-2xl border-2 border-black/10 bg-white hover:bg-muted/50 transition-all"
                  >
                    <p className="font-semibold text-sm truncate">{ev.title}</p>
                    <p className="text-[11px] text-muted-foreground">{t('smmRolesN', { n: (ev.roles || []).length })}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setAttachRole(null)} className="rounded-full">{t('cancel')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SMM ROLE SLIDE — the ONE TikTok-style card for a ROLE (ТЗ): the same ladder
// every SMM card keeps (профиль · закладки · имя, then Чат → ИИ чат → …).
// ---------------------------------------------------------------------------
export function SmmRoleSlide({
  role, isOwner, editMode = false, pinned = false,
  onToggleBookmark, onOpenProfile, onChat, onAiChat,
  onShare, onEdit, onDelete, onAttach, onOpenEvent, children,
}: {
  role: any;
  isOwner: boolean;
  editMode?: boolean;
  pinned?: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onAiChat: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAttach?: () => void;
  onOpenEvent?: (ev: any) => void;
  children?: React.ReactNode;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const pendingApps = role.pendingApplications || 0;
  const btn = 'shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors';

  return (
    <SwiperSlide className="relative !h-full overflow-hidden bg-white">
      <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
        <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
          <CreatorStrip
            name={role.author?.name || role.event?.customer?.name || ''}
            creatorId={role.author?.id}
            image={role.author?.image || null}
            bookmarked={pinned}
            onToggleBookmark={onToggleBookmark}
            addLabel={t('bookmarkAdd')}
            removeLabel={t('bookmarkRemove')}
            addShort={t('bookmarkAddShort')}
            removeShort={t('bookmarkRemoveShort')}
            onOpenProfile={onOpenProfile}
            openLabel={t('openProfile')}
            title={role.name}
          />
          <div className="rounded-3xl border-2 border-black/10 bg-white/85 backdrop-blur px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <ClipboardList className="w-3.5 h-3.5" />
              {role.event ? t('smmRoleInEvent') : t('smmRoleTemplate')}
              {isOwner && (
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${role.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {role.isPublic ? <Users className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {role.isPublic ? t('smmEventPublicBadge') : t('smmEventLinkOnlyBadge')}
                </span>
              )}
            </div>
            <p className="text-base font-bold leading-snug">{role.name}</p>
            {role.brief && <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-5">{role.brief}</p>}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {role.payment && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Banknote className="w-3 h-3" />{role.payment}</span>}
              {role.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><CalendarClock className="w-3 h-3" />{role.deadline}</span>}
              {pendingApps > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-semibold">{t('smmAppsN', { n: pendingApps })}</span>}
            </div>
            {role.event && (
              <button
                type="button"
                onClick={() => onOpenEvent?.(role.event)}
                className="flex items-center gap-1.5 text-xs w-full text-left rounded-xl bg-muted/50 px-2.5 py-2 hover:bg-muted transition-colors"
              >
                {role.event.kind === 'government' ? <Landmark className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Briefcase className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="font-semibold truncate">{role.event.title}</span>
                <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>

          {!editMode && (
            <>
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
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{role.isPublic ? t('smmUnshareRoleTpl') : t('smmShareRoleTpl')}</span>
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
              {!isOwner && onAttach && (
                <button type="button" onClick={onAttach} className={btn}>
                  <Download className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('smmTakeTemplate')}</span>
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

// The compact grid card (library / shelf views) for the SAME role.
export function SmmRoleGridCard({
  role, isOwner, onToggleBookmark, onOpenProfile, onChat, onAiChat,
  onShare, onEdit, onDelete, onAttach, onOpen,
}: {
  role: any;
  isOwner: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onAiChat: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAttach?: () => void;
  onOpen?: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const pendingApps = role.pendingApplications || 0;
  const ladderBtn = 'h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen?.(); }}
      className="h-full min-h-0 flex flex-col rounded-2xl border border-black/15 bg-white p-2 sm:p-3 lg:p-4 overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left cursor-pointer"
    >
      <CreatorStrip
        compact
        name={role.author?.name || role.event?.customer?.name || ''}
        creatorId={role.author?.id}
        image={role.author?.image || null}
        bookmarked={false}
        onToggleBookmark={onToggleBookmark}
        addLabel={t('bookmarkAdd')}
        removeLabel={t('bookmarkRemove')}
        addShort={t('bookmarkAddShort')}
        removeShort={t('bookmarkRemoveShort')}
        onOpenProfile={onOpenProfile}
        openLabel={t('openProfile')}
        title={role.name}
      />
      <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <ClipboardList className="w-3 h-3" />
        {role.event ? t('smmRoleInEvent') : t('smmRoleTemplate')}
        {isOwner && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 normal-case ${role.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
            {role.isPublic ? <Users className="w-2.5 h-2.5" /> : <Link2 className="w-2.5 h-2.5" />}
            {role.isPublic ? t('smmEventPublicBadge') : t('smmEventLinkOnlyBadge')}
          </span>
        )}
      </div>
      <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2 mt-0.5">{role.name}</p>
      {role.brief && <p className="text-[13px] sm:text-sm text-muted-foreground leading-snug line-clamp-2 mt-0.5">{role.brief}</p>}
      <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
        {role.payment && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><Banknote className="w-2.5 h-2.5" />{role.payment}</span>}
        {role.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><CalendarClock className="w-2.5 h-2.5" />{role.deadline}</span>}
        {pendingApps > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 font-semibold">{t('smmAppsN', { n: pendingApps })}</span>}
      </div>
      <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onChat(); }} title={t('chatWithAll')} aria-label={t('chatWithAll')} className={ladderBtn}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onAiChat(); }} title={t('smmAiChat')} aria-label={t('smmAiChat')} className={ladderBtn}>
          <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmAiChat')}</span>
        </Button>
        {isOwner && onShare && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onShare(); }} title={role.isPublic ? t('smmUnshareRoleTpl') : t('smmShareRoleTpl')} aria-label={role.isPublic ? t('smmUnshareRoleTpl') : t('smmShareRoleTpl')} className={ladderBtn}>
            <Users className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{role.isPublic ? t('smmUnshareRoleTpl') : t('smmShareRoleTpl')}</span>
          </Button>
        )}
        {isOwner && onEdit && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onEdit(); }} title={t('gEdit')} aria-label={t('gEdit')} className={ladderBtn}>
            <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
          </Button>
        )}
        {!isOwner && onAttach && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onAttach(); }} title={t('smmTakeTemplate')} aria-label={t('smmTakeTemplate')} className={ladderBtn}>
            <Download className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmTakeTemplate')}</span>
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
