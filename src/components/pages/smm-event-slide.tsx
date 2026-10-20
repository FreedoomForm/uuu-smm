'use client';

import React from 'react';
import { SwiperSlide } from 'swiper/react';
import {
  Banknote, Bot, BookmarkX, Building2, CalendarClock, CheckCircle2, ClipboardList,
  Landmark, Link2, MapPin, MessageCircle, Paperclip, Pencil, Send, ShieldAlert, Trash2,
  UserPlus, Users, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreatorStrip } from '@/components/shared-bits';
import { smmCoverColor } from '@/lib/smm-client';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

/**
 * SMM EVENT SLIDE — the ONE TikTok-style card for an EVENT, shared by the
 * dashboard's events feed (the specialist's side) and the customer's
 * «Мероприятия» page, so both sides see the IDENTICAL card. The card carries
 * the same ladder as the test cards (one button per line): Chat → Files →
 * Share link → Public toggle → Manage (applications) → Edit → Unpin → Delete.
 * The owner-only actions render only for the event's own customer — a
 * customer can never edit/invite on somebody else's event.
 */

export interface SmmEventSlideProps {
  ev: any;
  pinned: boolean;
  // The viewer owns this event (customerId === my id) — the full owner ladder
  isOwner: boolean;
  editMode?: boolean;
  // Personal-scope cards show the unpin button for pinned (bookmarked) ones
  showUnpin?: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onAiDiscuss?: () => void;
  // «Отправить запрос» — the specialist sends one of their запросы to this
  // event (the wizard opens in the send mode). Rendered on the cards the
  // specialist sees (the bookmarks library + the discover feed).
  onSend?: () => void;
  onFiles?: () => void;
  onShare?: () => void;
  onPublic?: () => void;
  onManage?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpenOtherEvent?: (other: any) => void;
  // Extra content under the ladder (e.g. the guest CTA)
  children?: React.ReactNode;
}

export default function SmmEventSlide({
  ev, pinned, isOwner, editMode = false, showUnpin = false,
  onToggleBookmark, onOpenProfile, onChat, onAiDiscuss, onSend, onFiles,
  onShare, onPublic, onManage, onEdit, onDelete,
  onOpenOtherEvent, children,
}: SmmEventSlideProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const pendingApps = ev.pendingApplications || 0;
  const btn = 'shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors';

  return (
    <SwiperSlide className="relative !h-full overflow-hidden" style={{ backgroundColor: ev.coverColor || smmCoverColor(ev.id) }}>
      <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
        <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
          <CreatorStrip
            name={ev.customer?.name || ''}
            creatorId={ev.customer?.id}
            image={ev.customer?.image || null}
            bookmarked={pinned}
            onToggleBookmark={onToggleBookmark}
            addLabel={t('bookmarkAdd')}
            removeLabel={t('bookmarkRemove')}
            addShort={t('bookmarkAddShort')}
            removeShort={t('bookmarkRemoveShort')}
            onOpenProfile={onOpenProfile}
            openLabel={t('openProfile')}
            title={ev.title}
          />
          <div className="rounded-3xl border-2 border-black/10 bg-white/85 backdrop-blur px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {ev.kind === 'government' ? <Landmark className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
              {ev.kind === 'government' ? t('smmKindGovernment') : t('smmKindBusiness')}
              {/* Publication state — the same share semantics the test cards
              carry: «В общей библиотеке» vs «Только по ссылке». */}
              {isOwner && (
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${ev.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {ev.isPublic ? <Users className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {ev.isPublic ? t('smmEventPublicBadge') : t('smmEventLinkOnlyBadge')}
                </span>
              )}
            </div>
            {ev.summary && <p className="text-sm font-semibold leading-snug line-clamp-3">{ev.summary}</p>}
            {ev.brief && <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{ev.brief}</p>}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {ev.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><CalendarClock className="w-3 h-3" />{ev.deadline}</span>}
              {ev.budget && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Banknote className="w-3 h-3" />{ev.budget}</span>}
              {ev.restrictions && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><ShieldAlert className="w-3 h-3" />{ev.restrictions}</span>}
            </div>
            {(ev.roles || []).length > 0 && (
              <div className="space-y-1">
                {(ev.roles || []).slice(0, 3).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-1.5 text-xs">
                    <UserPlus className="w-3 h-3 text-cta shrink-0" />
                    <span className="font-semibold truncate">{r.name}</span>
                    {r.payment && <span className="text-muted-foreground truncate">· {r.payment}</span>}
                  </div>
                ))}
                {(ev.roles || []).length > 3 && <p className="text-[11px] text-muted-foreground">{t('smmRolesN', { n: (ev.roles || []).length })}</p>}
              </div>
            )}
            {(ev.customerOtherEvents || []).length > 0 && (
              <div className="space-y-1 border-t border-black/5 pt-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('smmOtherEvents')}</p>
                {(ev.customerOtherEvents || []).map((o: any) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onOpenOtherEvent?.(o)}
                    className="flex items-center gap-1.5 text-xs w-full text-left hover:opacity-70 transition-opacity"
                  >
                    <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-semibold truncate">{o.title}</span>
                    <span className="text-muted-foreground shrink-0">· {t('smmRolesN', { n: o.rolesCount })}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!editMode && (
            <>
              <button type="button" onClick={onChat} className={btn}>
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{t('gChat')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              {onAiDiscuss && (
                <button type="button" onClick={onAiDiscuss} className={btn}>
                  <Bot className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('smmAiChat')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {onSend && !isOwner && (
                <button type="button" onClick={onSend} className={btn}>
                  <Send className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('smmSendRequestBtn')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {(ev.filesCount || 0) > 0 && onFiles && (
                <button type="button" onClick={onFiles} className={btn}>
                  <Paperclip className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('attachedFiles', { n: ev.filesCount })}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {/* OWNER ladder — share / public / manage / edit / delete, the
              exact neighbours the test card keeps. Never rendered for
              somebody else's event (a customer edits only their own). */}
              {isOwner && onShare && (
                <button type="button" onClick={onShare} className={btn}>
                  <Link2 className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('shareLinkBtn')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {isOwner && onPublic && (
                <button type="button" onClick={onPublic} className={btn}>
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{ev.isPublic ? t('smmMakeLinkOnly') : t('smmMakePublicBtn')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              {isOwner && onManage && (
                <button type="button" onClick={onManage} className={btn}>
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">
                    {pendingApps > 0 ? t('smmAppsN', { n: pendingApps }) : t('smmManageEvent')}
                  </span>
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
              {isOwner && onDelete && (
                <button type="button" onClick={onDelete} className={`${btn} text-destructive`}>
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('delete')}</span>
                </button>
              )}
              {showUnpin && pinned && !isOwner && (
                <button type="button" onClick={onToggleBookmark} className={btn}>
                  <BookmarkX className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('unpinBtn')}</span>
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

// A compact grid card (library / shelf views) for the SAME event — mirrors
// the test grid card: creator strip, title, summary and a one-per-line
// action ladder. Shared by the dashboard's SMM grids and the events page.
export function SmmEventGridCard({
  ev, pinned, isOwner, onToggleBookmark, onOpenProfile, onChat, onAiDiscuss, onSend, onFiles,
  onShare, onPublic, onManage, onEdit, onDelete, onOpen,
}: {
  ev: any;
  pinned: boolean;
  isOwner: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onAiDiscuss?: () => void;
  onSend?: () => void;
  onFiles?: () => void;
  onShare?: () => void;
  onPublic?: () => void;
  onManage?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  // Open the card's event (its own detail window) — the grid card's "body tap"
  onOpen?: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const pendingApps = ev.pendingApplications || 0;
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
        name={ev.customer?.name || ''}
        creatorId={ev.customer?.id}
        image={ev.customer?.image || null}
        bookmarked={pinned}
        onToggleBookmark={onToggleBookmark}
        addLabel={t('bookmarkAdd')}
        removeLabel={t('bookmarkRemove')}
        addShort={t('bookmarkAddShort')}
        removeShort={t('bookmarkRemoveShort')}
        onOpenProfile={onOpenProfile}
        openLabel={t('openProfile')}
        title={ev.title}
      />
      <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {ev.kind === 'government' ? <Landmark className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
        {ev.kind === 'government' ? t('smmKindGovernment') : t('smmKindBusiness')}
        {isOwner && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 normal-case ${ev.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
            {ev.isPublic ? <Users className="w-2.5 h-2.5" /> : <Link2 className="w-2.5 h-2.5" />}
            {ev.isPublic ? t('smmEventPublicBadge') : t('smmEventLinkOnlyBadge')}
          </span>
        )}
      </div>
      {ev.summary && <p className="text-[13px] sm:text-sm lg:text-[15px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{ev.summary}</p>}
      <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">{t('smmRolesN', { n: (ev.roles || []).length })}</span>
        {ev.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><CalendarClock className="w-2.5 h-2.5" />{ev.deadline}</span>}
        {ev.budget && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><Banknote className="w-2.5 h-2.5" />{ev.budget}</span>}
        {pendingApps > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 font-semibold">{t('smmAppsN', { n: pendingApps })}</span>}
      </div>
      {/* ONE BUTTON PER LEVEL — the same ladder the test grid cards keep */}
      <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onChat(); }} title={t('chatWithAll')} aria-label={t('chatWithAll')} className={ladderBtn}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
        {onAiDiscuss && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onAiDiscuss(); }} title={t('smmAiChat')} aria-label={t('smmAiChat')} className={ladderBtn}>
            <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmAiChat')}</span>
          </Button>
        )}
        {onSend && !isOwner && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onSend(); }} title={t('smmSendRequestBtn')} aria-label={t('smmSendRequestBtn')} className={ladderBtn}>
            <Send className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmSendRequestBtn')}</span>
          </Button>
        )}
        {(ev.filesCount || 0) > 0 && onFiles && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onFiles(); }} title={t('attachedFiles', { n: ev.filesCount })} aria-label={t('attachedFiles', { n: ev.filesCount })} className={ladderBtn}>
            <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
          </Button>
        )}
        {isOwner && onShare && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onShare(); }} title={t('shareLinkBtn')} aria-label={t('shareLinkBtn')} className={ladderBtn}>
            <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
          </Button>
        )}
        {isOwner && onPublic && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onPublic(); }} title={ev.isPublic ? t('smmMakeLinkOnly') : t('smmMakePublicBtn')} aria-label={ev.isPublic ? t('smmMakeLinkOnly') : t('smmMakePublicBtn')} className={ladderBtn}>
            <Users className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{ev.isPublic ? t('smmMakeLinkOnly') : t('gPublic')}</span>
          </Button>
        )}
        {isOwner && onManage && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onManage(); }} title={t('smmManageEvent')} aria-label={t('smmManageEvent')} className={ladderBtn}>
            <ClipboardList className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{pendingApps > 0 ? t('smmAppsN', { n: pendingApps }) : t('smmManageEvent')}</span>
          </Button>
        )}
        {isOwner && onEdit && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onEdit(); }} title={t('editTest')} aria-label={t('editTest')} className={ladderBtn}>
            <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
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

// The compact grid card (library / shelf views) for a SPECIALIST — the same
// ladder pattern: AI discuss → Chat → Files → Invite. Used by the dashboard's
// SMM grids (the customer browses specialists in the grid views too).
export function SmmSpecialistGridCard({
  sp, pinned, onToggleBookmark, onOpenProfile, onAiDiscuss, onChat, onFiles, onInvite,
}: {
  sp: any;
  pinned: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onAiDiscuss?: () => void;
  onChat: () => void;
  onFiles?: () => void;
  onInvite?: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const ladderBtn = 'h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1';
  return (
    <div className="h-full min-h-0 flex flex-col rounded-2xl border border-black/15 bg-white p-2 sm:p-3 lg:p-4 overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left">
      <CreatorStrip
        compact
        name={sp.name}
        creatorId={sp.id}
        image={sp.image || null}
        bookmarked={pinned}
        onToggleBookmark={onToggleBookmark}
        addLabel={t('bookmarkAdd')}
        removeLabel={t('bookmarkRemove')}
        addShort={t('bookmarkAddShort')}
        removeShort={t('bookmarkRemoveShort')}
        onOpenProfile={onOpenProfile}
        openLabel={t('openProfile')}
        title={sp.name}
      />
      {sp.headline && <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2 mt-1">{sp.headline}</p>}
      {sp.resume && <p className="text-[13px] sm:text-sm text-muted-foreground leading-snug line-clamp-2 mt-0.5">{sp.resume}</p>}
      <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
        {sp.city && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><MapPin className="w-2.5 h-2.5" />{sp.city}</span>}
        {sp.rate && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><Banknote className="w-2.5 h-2.5" />{sp.rate}</span>}
        {sp.ready !== false && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 font-semibold"><CheckCircle2 className="w-2.5 h-2.5" />{t('smmReadyToWork')}</span>}
      </div>
      <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
        {onAiDiscuss && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onAiDiscuss(); }} title={t('aiDiscuss')} aria-label={t('aiDiscuss')} className={ladderBtn}>
            <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onChat(); }} title={t('chatWithAll')} aria-label={t('chatWithAll')} className={ladderBtn}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
        {(sp.filesCount || 0) > 0 && onFiles && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onFiles(); }} title={t('attachedFiles', { n: sp.filesCount })} aria-label={t('attachedFiles', { n: sp.filesCount })} className={ladderBtn}>
            <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
          </Button>
        )}
        {onInvite && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onInvite(); }} title={t('smmInviteBtn')} aria-label={t('smmInviteBtn')} className={ladderBtn}>
            <UserPlus className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmInviteBtn')}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
