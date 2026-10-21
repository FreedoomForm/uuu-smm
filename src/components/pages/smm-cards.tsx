'use client';

// ---------------------------------------------------------------------------
// SMM CARDS — the three card types of the mode-switcher marketplace, drawn
// with the EXACT SAME anatomy as the test cards of the tests site:
//   THE STANDARD CARD HEADER (CreatorStrip — the author's photo in a white
//   ring + the big bookmark toggle; tapping the photo opens the author's
//   profile window) → the title → the card's specifics → the ONE-BUTTON-PER-
//   LEVEL LADDER (Chat → Share → Edit → Delete, the same relative order the
//   test ladder keeps). Grid cards wear the compact header + the plain bold
//   title; feed cards wear the full header + the cover band title — the same
//   contract the test cards follow in library/tiktok views.
//   * SmmEventCardView      — the 4 FACTS (format, platform/location map,
//                             time) + share/chat/edit/bookmark/delete +
//                             the specialist's role picker + «подать заявку»
//   * SmmPostCardView       — video/photo collection + description per role
//   * SmmSpecialistCardView — rating, orders count, roles+prices, the
//                             event/role pickers + «пригласить на мероприятие»
// Plus the compact rows of the закладки / чаты / запросы windows.
// ---------------------------------------------------------------------------

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreatorStrip } from '@/components/shared-bits';
import { eventPlatformIcon, eventPlatformLabel, fmtMoney, mapEmbedUrl, mediaSrc } from './smm-bits';
import { CalendarClock, ClipboardList, Bot, Film, LayoutGrid, Link2, MapPin, MessageCircle, Pencil, Star, Trash2, Users } from 'lucide-react';
import type { SmmEventT, SmmPostT, SmmSpecialistT } from '@/lib/app-types';

export type CardVariant = 'grid' | 'feed';

export interface CardCtx {
  t: (key: string, vars?: Record<string, string | number>) => string;
  myId: string;
  editMode: boolean;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
  // «Обсудить с ИИ» — the same AI discussion the test cards open
  onAi: () => void;
  aiActive: boolean;
  // «Прикреплённые файлы (N)» — the event's qualification tests / the post's
  // media collection (the card renders the button when ITS count > 0)
  onFiles: () => void;
  // «Опубликовать / Снять с публикации» — OWN мероприятие cards (the same
  // Public level the own test cards keep)
  isPublic?: boolean;
  onPublic?: () => void;
  // event card (specialist side)
  myRoles: { id: string; name: string }[];
  pickedRole: string | null;
  onPickRole: (roleId: string) => void;
  // specialist card (customer side)
  myEvents: { id: string; title: string }[];
  pickedEvent: string | null;
  pickedInvRole: string | null;
  onPickEvent: (eventId: string) => void;
  onPickInvRole: (roleId: string) => void;
  selected: boolean;
  onImageOpen?: (url: string) => void;
}

const LADDER_BTN = 'h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1 w-full';
// The AI button wears the test card's active look when its window is open
const LADDER_AI_ACTIVE = 'border-primary bg-[#FFE8DE]';

// The SAME card header every card of the site wears (tests + SMM): the
// gradient band with the author's photo and the bookmark toggle.
function CardHeader({ ctx, name, creatorId, image, compact }: {
  ctx: CardCtx; name: string; creatorId?: string | null; image?: string | null; compact: boolean;
}) {
  return (
    <CreatorStrip
      compact={compact}
      name={name || '—'}
      creatorId={creatorId}
      image={image || null}
      bookmarked={ctx.bookmarked}
      onToggleBookmark={ctx.onToggleBookmark}
      addLabel={ctx.t('bookmarkAdd')}
      removeLabel={ctx.t('bookmarkRemove')}
      addShort={ctx.t('bookmarkAddShort')}
      removeShort={ctx.t('bookmarkRemoveShort')}
      onOpenProfile={ctx.onOpenProfile}
      openLabel={ctx.t('openProfile')}
    />
  );
}

const CARD_SHELL = 'h-full min-h-0 flex flex-col rounded-2xl border bg-white p-2 sm:p-3 lg:p-4 overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left cursor-pointer';

// ── МЕРОПРИЯТИЕ ─────────────────────────────────────────────────────────────

export function EventFacts({ event, t, compact }: { event: SmmEventT; t: CardCtx['t']; compact?: boolean }) {
  const chip = 'flex items-center gap-1.5 rounded-full bg-white/90 border border-black/10 px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-black/80 shadow-sm';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <span className={chip}>
          {event.format === 'online'
            ? <>{eventPlatformIcon(event.platform, 'w-3.5 h-3.5')} {t('smmFormatOnline')} · {eventPlatformLabel(event.platform, t)}</>
            : <><MapPin className="w-3.5 h-3.5 text-cta shrink-0" /> {t('smmFormatOffline')}</>}
        </span>
        {event.timeAt && (
          <span className={chip}><CalendarClock className="w-3.5 h-3.5 text-cta shrink-0" /> {event.timeAt}</span>
        )}
        {(event.tests?.length || 0) > 0 && (
          <span className={chip}><ClipboardList className="w-3.5 h-3.5 text-cta shrink-0" /> {t('smmEventTests')}: {event.tests!.length}</span>
        )}
      </div>
      {/* The offline map — the feed (and window) cards carry the live map;
      grid cards stay compact like the test grid cards (the chips above keep
      the факт visible). */}
      {!compact && event.format === 'offline' && event.location && (
        <div className="rounded-2xl overflow-hidden border border-black/10 bg-white">
          <iframe
            src={mapEmbedUrl(event.location)}
            title={t('smmEventLocation')}
            loading="lazy"
            className="w-full h-28 sm:h-36 border-0 pointer-events-none"
          />
          <p className="px-2.5 py-1.5 text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-cta" /> <span className="truncate">{event.location}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function SmmEventCardView({ event, variant, ctx }: { event: SmmEventT; variant: CardVariant; ctx: CardCtx }) {
  const { t, myId } = ctx;
  const own = event.customerId === myId;
  const isFeed = variant === 'feed';
  const bgStyle = event.coverColor ? { backgroundColor: event.coverColor } : undefined;
  const bgClass = event.coverColor ? '' : 'bg-[#E3EEFF]';
  const showRolePicker = !own && ctx.myRoles.length > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={ctx.onOpen}
      className={`${CARD_SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'} ${isFeed ? 'lg:max-w-2xl lg:w-full lg:mx-auto' : ''}`}
    >
      {/* THE STANDARD CARD HEADER — the same шапка every card wears */}
      <CardHeader ctx={ctx} name={event.customer?.name || ''} creatorId={event.customerId} image={event.customer?.image} compact={!isFeed} />
      {isFeed ? (
        /* feed: the title lives on the cover band — the same big bold
        text-cta band the test feed cards wear */
        <div className="relative mt-2 shrink-0 overflow-hidden rounded-2xl h-24 sm:h-32">
          <div style={bgStyle} className={`${bgClass} w-full h-full flex items-center justify-center px-3 text-center`}>
            <p className="text-lg sm:text-2xl font-bold text-cta leading-snug line-clamp-2">{event.title}</p>
          </div>
        </div>
      ) : (
        /* grid: the plain bold title — the same line the test grid cards wear */
        <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2">{event.title}</p>
      )}
      {/* the 4 FACTS */}
      <div className="mt-2 shrink-0">
        <EventFacts event={event} t={t} compact={!isFeed} />
      </div>
      {event.summary && <p className={`mt-2 text-xs sm:text-sm text-muted-foreground ${isFeed ? 'line-clamp-3' : 'line-clamp-2'}`}>{event.summary}</p>}
      {/* role picker (the specialist picks THEIR role to apply with) */}
      {showRolePicker && (
        <div className="mt-2 shrink-0" onClick={e => e.stopPropagation()}>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t('smmApplyPickRole')}</p>
          <div className="flex flex-wrap gap-1.5">
            {ctx.myRoles.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => ctx.onPickRole(r.id)}
                className={`h-7 px-2.5 rounded-full border-2 text-[11px] font-bold transition-colors ${ctx.pickedRole === r.id ? 'bg-cta text-white border-cta' : 'bg-white border-black/20 hover:border-black'}`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* ladder — the same one-button-per-level order the test cards keep:
      AI → Chat → Files → Share → Public → Edit → Delete */}
      <div className="card-ladder mt-auto pt-2 flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="outline" onClick={ctx.onAi} title={t('aiDiscuss')} className={`${LADDER_BTN} ${ctx.aiActive ? LADDER_AI_ACTIVE : ''}`}>
          <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={ctx.onChat} title={t('smmTopChats')} className={LADDER_BTN}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
        {(event.tests?.length || 0) > 0 && (
          <Button size="sm" variant="outline" onClick={ctx.onFiles} title={t('smmEventTests')} className={LADDER_BTN}>
            <ClipboardList className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmEventTests')} ({event.tests!.length})</span>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={ctx.onShare} title={t('smmShareCopied')} className={LADDER_BTN}>
          <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
        </Button>
        {own && (
          <Button size="sm" variant="outline" onClick={ctx.onPublic} title={t('makePublic')} className={LADDER_BTN}>
            <Users className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gPublic')}</span>
          </Button>
        )}
        {own && (
          <>
            <Button size="sm" variant="outline" onClick={ctx.onEdit} title={t('smmEventEdit')} className={LADDER_BTN}>
              <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={ctx.onDelete} title={t('smmEventDeleted')} className={`${LADDER_BTN} border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive`}>
              <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gDelete')}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── ПОСТ ────────────────────────────────────────────────────────────────────

export function SmmPostCardView({ post, variant, ctx }: { post: SmmPostT; variant: CardVariant; ctx: CardCtx }) {
  const { t, myId } = ctx;
  const own = post.specialistId === myId;
  const isFeed = variant === 'feed';
  const bgStyle = post.coverColor ? { backgroundColor: post.coverColor } : undefined;
  const bgClass = post.coverColor ? '' : 'bg-[#DFF3E8]';
  const media = (post.media || []) as { url: string; type: string }[];
  const first = media[0];
  const title = post.role?.name || t('smmPost');
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={ctx.onOpen}
      className={`${CARD_SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'} ${isFeed ? 'lg:max-w-2xl lg:w-full lg:mx-auto' : ''}`}
    >
      <CardHeader ctx={ctx} name={post.specialist?.name || ''} creatorId={post.specialistId} image={post.specialist?.image} compact={!isFeed} />
      {isFeed ? (
        /* feed: the cover band carries the first media (or the role name on
        the cover color) — the same band the test feed cards wear */
        <div className="relative mt-2 shrink-0 overflow-hidden rounded-2xl h-32 sm:h-40">
          {first ? (
            first.type === 'video' ? (
              <div style={bgStyle} className={`${bgClass} w-full h-full flex items-center justify-center gap-2`}>
                <Film className="w-8 h-8 text-cta" />
                <p className="text-lg sm:text-2xl font-bold text-cta">{title}</p>
              </div>
            ) : (
              <img src={mediaSrc(first.url)} alt="" className="w-full h-full object-cover" />
            )
          ) : (
            <div style={bgStyle} className={`${bgClass} w-full h-full flex items-center justify-center px-3 text-center`}>
              <p className="text-lg sm:text-2xl font-bold text-cta line-clamp-2">{title}</p>
            </div>
          )}
        </div>
      ) : (
        /* grid: the plain bold title + the compact media band */
        <>
          <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2">{title}</p>
          <div className="relative mt-1.5 shrink-0 overflow-hidden rounded-2xl h-16 sm:h-20">
            {first ? (
              first.type === 'video' ? (
                <div style={bgStyle} className={`${bgClass} w-full h-full flex items-center justify-center gap-2`}>
                  <Film className="w-6 h-6 text-cta" />
                  <p className="text-sm font-bold text-cta">{title}</p>
                </div>
              ) : (
                <img src={mediaSrc(first.url)} alt="" className="w-full h-full object-cover" />
              )
            ) : (
              <div style={bgStyle} className={`${bgClass} w-full h-full flex items-center justify-center`}>
                <p className="text-sm font-bold text-cta line-clamp-2 px-2">{title}</p>
              </div>
            )}
          </div>
        </>
      )}
      {isFeed && media.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto shrink-0" onClick={e => e.stopPropagation()}>
          {media.slice(0, 8).map((m, i) => (
            m.type === 'image' ? (
              <button key={i} type="button" onClick={() => ctx.onImageOpen?.(mediaSrc(m.url))} className="w-12 h-12 rounded-lg overflow-hidden border border-black/10 shrink-0">
                <img src={mediaSrc(m.url)} alt="" className="w-full h-full object-cover" />
              </button>
            ) : (
              <span key={i} className="w-12 h-12 rounded-lg bg-[#FFF0D9] text-cta flex items-center justify-center shrink-0"><Film className="w-5 h-5" /></span>
            )
          ))}
        </div>
      )}
      {post.description && <p className={`mt-2 text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap ${isFeed ? 'line-clamp-6' : 'line-clamp-2'}`}>{post.description}</p>}
      <div className="card-ladder mt-auto pt-2 flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="outline" onClick={ctx.onAi} title={t('aiDiscuss')} className={`${LADDER_BTN} ${ctx.aiActive ? LADDER_AI_ACTIVE : ''}`}>
          <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={ctx.onChat} title={t('smmTopChats')} className={LADDER_BTN}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
        {media.length > 0 && (
          <Button size="sm" variant="outline" onClick={ctx.onFiles} title={t('attachedFiles', { n: media.length })} className={LADDER_BTN}>
            <Film className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('attachedFiles', { n: media.length })}</span>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={ctx.onShare} title={t('smmShareCopied')} className={LADDER_BTN}>
          <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
        </Button>
        {own && (
          <>
            <Button size="sm" variant="outline" onClick={ctx.onEdit} title={t('smmPostEdit')} className={LADDER_BTN}>
              <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={ctx.onDelete} title={t('smmPostDeleted')} className={`${LADDER_BTN} border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive`}>
              <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gDelete')}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── СПЕЦИАЛИСТ ──────────────────────────────────────────────────────────────

export function SmmSpecialistCardView({ sp, variant, ctx }: { sp: SmmSpecialistT; variant: CardVariant; ctx: CardCtx }) {
  const { t } = ctx;
  const isFeed = variant === 'feed';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={ctx.onOpen}
      className={`${CARD_SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'} ${isFeed ? 'lg:max-w-2xl lg:w-full lg:mx-auto' : ''}`}
    >
      <CardHeader ctx={ctx} name={sp.name} creatorId={sp.id} image={sp.image} compact={!isFeed} />
      {/* grid: the plain bold name + the rating/orders line — the same title
      line the test grid cards wear under the strip */}
      <div className="mt-1 shrink-0 flex items-center gap-2 min-w-0">
        <p className={`font-bold leading-snug truncate ${isFeed ? 'text-base sm:text-lg' : 'text-[13px] sm:text-sm lg:text-[15px]'}`}>{sp.name}</p>
        <span className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground shrink-0">
          <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> {sp.rating > 0 ? sp.rating.toFixed(1) : '—'}</span>
          <span>· {t('smmOrders')}: {sp.orders}</span>
        </span>
      </div>
      {/* roles + prices (the 4 params live here: pricePerK + pricePerDay per role) */}
      <div className="mt-2 shrink-0 flex flex-col gap-1">
        <p className="text-[11px] font-semibold text-muted-foreground">{t('smmRolesList')}</p>
        {(sp.roles || []).length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        {(sp.roles || []).map(r => (
          <button
            key={r.id}
            type="button"
            onClick={e => { e.stopPropagation(); ctx.onPickInvRole(r.id); }}
            className={`flex items-center justify-between gap-2 rounded-xl border-2 px-2.5 py-1.5 text-left transition-colors ${ctx.pickedInvRole === r.id ? 'border-cta bg-[#FFF3ED]' : 'border-black/10 hover:border-black/30'}`}
          >
            <span className="text-xs sm:text-sm font-bold truncate">{r.name}</span>
            <span className="text-[10px] sm:text-[11px] text-muted-foreground shrink-0 flex flex-col items-end leading-tight">
              {r.pricePerK != null && <span>{t('smmEstimateOnline')}: {fmtMoney(r.pricePerK)}</span>}
              {r.pricePerDay != null && <span>{t('smmEstimateOffline')}: {fmtMoney(r.pricePerDay)}</span>}
            </span>
          </button>
        ))}
      </div>
      {/* the customer's picks: event + role */}
      <div className="mt-2 shrink-0 flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
        <p className="text-[11px] font-semibold text-muted-foreground">{t('smmInvitePickEvent')}</p>
        <div className="flex flex-wrap gap-1.5">
          {(ctx.myEvents || []).length === 0 && <p className="text-[11px] text-muted-foreground">{t('smmInviteNoEvent')}</p>}
          {(ctx.myEvents || []).map(ev => (
            <button
              key={ev.id}
              type="button"
              onClick={() => ctx.onPickEvent(ev.id)}
              className={`h-7 max-w-[180px] px-2.5 rounded-full border-2 text-[11px] font-bold truncate transition-colors ${ctx.pickedEvent === ev.id ? 'bg-cta text-white border-cta' : 'bg-white border-black/20 hover:border-black'}`}
            >
              {ev.title}
            </button>
          ))}
        </div>
      </div>
      <div className="card-ladder mt-auto pt-2 flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="outline" onClick={ctx.onAi} title={t('aiDiscuss')} className={`${LADDER_BTN} ${ctx.aiActive ? LADDER_AI_ACTIVE : ''}`}>
          <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={ctx.onChat} title={t('smmTopChats')} className={LADDER_BTN}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
      </div>
    </div>
  );
}

// ── Window rows (закладки / чаты / запросы) ─────────────────────────────────

export function BookmarkRow({ label, sub, kind, onOpen, onRemove, t }: {
  label: string; sub: string; kind: 'event' | 'specialist' | 'post';
  onOpen: () => void; onRemove: () => void; t: CardCtx['t'];
}) {
  const icon = kind === 'event' ? <LayoutGrid className="w-5 h-5 text-cta" /> : kind === 'specialist' ? <Users className="w-5 h-5 text-cta" /> : <Film className="w-5 h-5 text-cta" />;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
      <span className="w-10 h-10 rounded-xl bg-[#FFF0D9] flex items-center justify-center shrink-0">{icon}</span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-bold truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </button>
      <Button size="sm" variant="outline" onClick={onRemove} className="h-8 rounded-full border-black/30 text-xs shrink-0">
        <Trash2 className="size-3.5" /> <span className="hidden sm:inline">{t('gUnpin')}</span>
      </Button>
    </div>
  );
}

export function ChatRow({ title, last, active, onClick }: { title: string; last?: string | null; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${active ? 'border-cta bg-[#FFF3ED]' : 'border-black/10 bg-white hover:border-black/30'}`}
    >
      <span className="w-10 h-10 rounded-full bg-cta text-white flex items-center justify-center font-bold shrink-0">{(title || '?').slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold truncate">{title}</span>
        {last && <span className="block text-xs text-muted-foreground truncate">{last}</span>}
      </span>
    </button>
  );
}

export function RequestRow({ kindLabel, title, sub, status, score, onWithdraw, withdrawLabel, t }: {
  kindLabel: string; title: string; sub: string; status: string;
  score?: string; onWithdraw?: () => void; withdrawLabel: string; t: CardCtx['t'];
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
      <span className="w-10 h-10 rounded-xl bg-[#DFF3E8] flex items-center justify-center shrink-0">
        <ClipboardList className="w-5 h-5 text-cta" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{kindLabel} · {title}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <Badge variant="secondary" className="rounded-full text-[10px]">{status === 'pending' ? t('smmStatusPending') : status}</Badge>
          {score && <Badge variant="secondary" className="rounded-full text-[10px]">{score}</Badge>}
        </div>
      </div>
      {onWithdraw && status === 'pending' && (
        <Button size="sm" variant="outline" onClick={onWithdraw} className="h-8 rounded-full border-destructive/50 text-destructive text-xs shrink-0">
          {withdrawLabel}
        </Button>
      )}
    </div>
  );
}
