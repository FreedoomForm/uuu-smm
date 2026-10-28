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
import { CreatorStrip, tagHash } from '@/components/shared-bits';
import { eventPlatformIcon, eventPlatformLabel, fmtMoney, mapEmbedUrl, mediaSrc } from './smm-bits';
import { CalendarClock, ChevronRight, ClipboardList, Bot, Briefcase, Film, Globe, Handshake, LayoutGrid, Link2, MapPin, Megaphone, MessageCircle, Paperclip, Pencil, Sparkles, Star, Trash2, Users, Wallet } from 'lucide-react';
import type { SmmEventT, SmmPostT, SmmSpecialistT } from '@/lib/app-types';

export type CardVariant = 'grid' | 'shelf' | 'slide' | 'feed';

export interface CardCtx {
  t: (key: string, vars?: Record<string, string | number>) => string;
  myId: string;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenProfile?: () => void;
  onChat: () => void;
  onShare: () => void;
  onDelete: () => void;
  // «Изменить» — provided ONLY for OWN мероприятие/пост cards rendered in the
  // личная библиотека (the parent decides); when absent the button never
  // renders, so the публичная библиотека stays read-only.
  onEdit?: () => void;
  onOpen: () => void;
  // «Обсудить с ИИ» — the same AI discussion the test cards open
  onAi: () => void;
  aiActive: boolean;
  // «Прикреплённые файлы (N)» — the event's qualification tests / the post's
  // media collection (the card renders the button when ITS count > 0)
  onFiles: () => void;
  // «Опубликовать в общую библиотеку» / «Опубликовать только тем, у кого
  // есть ссылка» — the PUBLISH PAIR on OWN мероприятие/пост cards in the
  // личная библиотека: the active mode LITS its button and every tap copies
  // the matching link (the link IS the access for the second mode).
  isPublic?: boolean;
  onPubPublic?: () => void;
  onPubLink?: () => void;
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

const LADDER_BTN = 'h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1';
// The AI button wears the test card's active look when its window is open
const LADDER_AI_ACTIVE = 'border-primary bg-[#FFE8DE]';
// The PUBLISH PAIR's lit state — the chosen visibility mode «загорается»
const LADDER_PUB_ACTIVE = 'border-cta bg-cta text-white hover:bg-cta/90 hover:text-white';

// ── THE FEED CARD ANATOMY — byte-for-byte the test feed card's: the title
// lives on the colour SPINE (the narrow left band), the content column
// (шапка + specifics + ladder) sits to the right. The card FILLS THE WHOLE
// AREA between the panels: h-full (full height) AND w-full (full width —
// without it the card was a narrow content-sized pill floating in the
// middle, exactly what the tests feed never does). max-w-md caps tablets,
// lg recenters the wider floating card on the desktop.
const FEED_SHELL = 'h-full min-h-0 w-full max-w-md mx-auto lg:max-w-4xl lg:w-full flex rounded-2xl border bg-white overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left cursor-pointer';
// THE SHELF CARD — byte-for-byte the test SHELF card's shell: ONE card per
// row, the horizontal spine layout (title on the colour band), capped and
// centered on the desktop exactly like the tests shelf (lg:max-w-4xl).
const SHELF_SHELL = 'h-full min-h-0 lg:max-w-4xl lg:w-full lg:mx-auto flex rounded-2xl border bg-white overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left cursor-pointer';
const FEED_SPINE = 'w-20 sm:w-36 lg:w-44 shrink-0 h-full flex items-center justify-center p-2 text-center';
const FEED_SPINE_TITLE = 'text-xs sm:text-base font-bold text-cta leading-snug line-clamp-3';
const FEED_CONTENT = 'flex-1 min-w-0 flex flex-col p-2 sm:p-3 lg:p-4';
// The same pastel spine palette the test cards pick from (coverBgFor).
const SPINE_PALETTE = ['bg-[#E3EEFF]', 'bg-[#DFF3E8]', 'bg-[#FFF0D9]', 'bg-[#FCE8F2]'];

// ── THE FEED SLIDE ANATOMY — byte-for-byte the tests feed slide: NO white
// card shell. The slide itself wears the cover colour and the content is a
// transparent centered column: the шапка (author + bookmark + TITLE inside,
// the way the tests feed moved the title into the strip) → ONE white
// scrollable content card (data-inner-scroll + swiper-no-swiping: its wheel
// and touch stay native, the Swiper never starts a drag from inside) → the
// full-width rounded-2xl border-2 ladder rows — the exact tests feed ladder.
function SlideBtn({ onClick, icon, label, tone, disabled }: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: 'ai' | 'danger' | 'pub';
  disabled?: boolean;
}) {
  const toneCls = tone === 'ai'
    ? 'border-primary bg-[#FFE8DE]'
    : tone === 'danger'
      ? 'border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive'
      : tone === 'pub'
        ? 'border-cta bg-cta text-white hover:bg-cta/90'
        : 'border-black bg-white hover:bg-muted/50';
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      className={`shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left transition-colors disabled:opacity-60 ${toneCls}`}
    >
      {icon}
      <span className="font-semibold text-sm truncate">{label}</span>
      <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
    </button>
  );
}

function SlideCard({ ctx, name, creatorId, image, title, children, ladder }: {
  ctx: CardCtx; name: string; creatorId?: string | null; image?: string | null;
  title?: string; children: React.ReactNode; ladder: React.ReactNode;
}) {
  return (
    <div role="button" tabIndex={0} onClick={ctx.onOpen}
      className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
      <CreatorStrip
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
        title={title}
      />
      <div
        data-inner-scroll
        onClick={e => e.stopPropagation()}
        className="swiper-no-swiping flex-1 min-h-0 rounded-2xl border border-black bg-white p-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {ladder}
    </div>
  );
}

// The FEED SLIDE's full-bleed background — the same pastel palette the spines
// pick from; the SLIDE ITSELF wears the colour (exactly what the tests feed
// slide does: SwiperSlide carries the cover style, the content sits on it).
const SMM_SLIDE_COLORS = ['#E3EEFF', '#DFF3E8', '#FFF0D9', '#FCE8F2'];
export function smmSlideBgFor(it: { kind: string; id: string; name?: string; coverColor?: string | null }): React.CSSProperties {
  if (it.coverColor) return { backgroundColor: it.coverColor };
  if (it.kind === 'event') return { backgroundColor: '#E3EEFF' };
  if (it.kind === 'post') return { backgroundColor: '#DFF3E8' };
  return { backgroundColor: SMM_SLIDE_COLORS[tagHash(it.id || it.name || '?') % SMM_SLIDE_COLORS.length] };
}

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

export function EventFacts({ event, t, compact, feed }: { event: SmmEventT; t: CardCtx['t']; compact?: boolean; feed?: boolean }) {
  const chip = 'flex items-center gap-1.5 rounded-full bg-white/90 border border-black/10 px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-black/80 shadow-sm';
  // БИРЖА УСЛУГ: the category chip (the i18n key pattern: cat + PascalCase)
  const catKey = (() => {
    switch (event.category) {
      case 'instagram': return 'catInstagram';
      case 'reels': return 'catReels';
      case 'hotel-review': return 'catHotelReview';
      case 'photo': return 'catPhoto';
      case 'content-plan': return 'catContentPlan';
      case 'blogger-tour': return 'catBloggerTour';
      default: return '';
    }
  })();
  const catLabel = catKey ? t(catKey) : '';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {catLabel && (
          <span className={`${chip} ${event.category === 'blogger-tour' ? 'border-cta/50 bg-[#FFF7ED] text-cta' : ''}`}>
            {event.category === 'blogger-tour' ? <Megaphone className="w-3.5 h-3.5 shrink-0" /> : <Briefcase className="w-3.5 h-3.5 text-cta shrink-0" />} {catLabel}
          </span>
        )}
        {event.category === 'blogger-tour' && (event as any).barter && (
          <span className={`${chip} border-cta/50 bg-[#FFF7ED] text-cta`}>
            <Handshake className="w-3.5 h-3.5 shrink-0" /> {t('barterBadge')}: {(event as any).barter}
          </span>
        )}
        {/* БЮДЖЕТ НА ОДНОГО СПЕЦИАЛИСТА — the order's payment line (text:
        «500 000 сум», «бартер», «договорная»…) */}
        {(event as any).budget && (
          <span className={`${chip} border-cta/40 bg-[#FFF7ED]`}>
            <Wallet className="w-3.5 h-3.5 text-cta shrink-0" /> {t('smmBudgetPer')}: {(event as any).budget}
          </span>
        )}
        {/* СКОЛЬКО ЛЮДЕЙ: the card shows how many specialists are accepted
        already and how many slots remain (peopleRequired − accepted) */}
        {Number((event as any).peopleRequired) > 0 && (() => {
          const need = Number((event as any).peopleRequired) || 1;
          const acc = Number((event as any).acceptedCount) || 0;
          return (
            <span className={`${chip} ${acc >= need ? 'border-cta/50 bg-[#DFF3E8]' : ''}`}>
              <Users className="w-3.5 h-3.5 text-cta shrink-0" /> {t('smmPeopleChip', { a: Math.min(acc, need), l: Math.max(0, need - acc) })}
            </span>
          );
        })()}
        <span className={chip}>
          {event.format === 'online'
            ? <>{eventPlatformIcon(event.platform, 'w-3.5 h-3.5')} {t('smmFormatOnline')} · {eventPlatformLabel(event.platform, t)}</>
            : <><MapPin className="w-3.5 h-3.5 text-cta shrink-0" /> {t('smmFormatOffline')}</>}
        </span>
        {event.timeAt && (
          <span className={chip}><CalendarClock className="w-3.5 h-3.5 text-cta shrink-0" /> {event.timeAt}</span>
        )}
      </div>
      {/* The offline map — the feed (and window) cards carry the live map;
      grid cards stay compact like the test grid cards (the chips above keep
      the факт visible). The feed spine layout keeps the map shorter so the
      whole card fits the snap page. */}
      {!compact && event.format === 'offline' && event.location && (
        <div className="rounded-2xl overflow-hidden border border-black/10 bg-white">
          <iframe
            src={mapEmbedUrl(event.location)}
            title={t('smmEventLocation')}
            loading="lazy"
            className={`w-full ${feed ? 'h-16 sm:h-24' : 'h-28 sm:h-36'} border-0 pointer-events-none`}
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
  // the publish pair renders only when BOTH handlers arrived (they always
  // travel together from the ctx builder)
  const pubPair = own && !event.parentId && !!ctx.onPubPublic && !!ctx.onPubLink;
  const bgStyle = event.coverColor ? { backgroundColor: event.coverColor } : undefined;
  const bgClass = event.coverColor ? '' : 'bg-[#E3EEFF]';
  const showRolePicker = !own && ctx.myRoles.length > 0;
  // The role-less specialist sees WHY there is no picker: their own role is
  // born in the post editor — the «Подать заявку» bar button leads there.
  const noRoleHint = !own && ctx.myRoles.length === 0 && (
    <p className="shrink-0 text-[11px] font-semibold text-muted-foreground">{ctx.t('smmApplyNeedRole')}</p>
  );
  const rolePicker = showRolePicker && (
    <div className="shrink-0" onClick={e => e.stopPropagation()}>
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
  );
  const ladder = (
    <div className="card-ladder shrink-0 pt-1.5 flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" onClick={ctx.onAi} title={t('aiDiscuss')} className={`${LADDER_BTN} ${ctx.aiActive ? LADDER_AI_ACTIVE : ''}`}>
        <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.onChat} title={t('chatWithAll')} className={LADDER_BTN}>
        <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.onFiles} title={t('attachedFiles', { n: (event.tests || []).length + ((event.attachments || []).length) })} className={LADDER_BTN}>
        <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
      </Button>
      {/* THE PUBLISH PAIR — an OWN карточка in the личная библиотека:
      «Опубликовать в общую библиотеку» / «Опубликовать только тем, у кого
      есть ссылка». The chosen mode LITS its button and EVERY tap copies the
      matching link. A VERSION (a copy of somebody's заказ) keeps the plain
      «Ссылка» — the server coerces a version's isPublic to false anyway. */}
      {pubPair ? (
        <>
          <Button size="sm" variant="outline" onClick={ctx.onPubPublic} title={t('smmPubPublic')} className={`${LADDER_BTN} ${ctx.isPublic ? LADDER_PUB_ACTIVE : ''}`}>
            <Globe className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmPubPublicBtn')}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={ctx.onPubLink} title={t('smmPubLink')} className={`${LADDER_BTN} ${ctx.isPublic ? '' : LADDER_PUB_ACTIVE}`}>
            <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmPubLinkBtn')}</span>
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={ctx.onShare} title={t('smmShareCopied')} className={LADDER_BTN}>
          <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmCopyLink')}</span>
        </Button>
      )}
      {ctx.onEdit && (
        <Button size="sm" variant="outline" onClick={ctx.onEdit} title={t('editTest')} className={LADDER_BTN}>
          <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={ctx.onDelete} title={t('smmEventDeleted')} className={`${LADDER_BTN} border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive`}>
        <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gDelete')}</span>
      </Button>
    </div>
  );
  // the cover photo (the editor's «Фото обложки») — the spine and the slide
  // wear it INSTEAD of the pastel colour when present
  const eventCoverImg = (event as any).coverUrl ? mediaSrc((event as any).coverUrl) : null;
  // the SPINE layout serves both the feed window cards AND the shelf cards —
  // the same horizontal anatomy the test cards keep in both modes (the shell
  // differs: the feed caps tablets at max-w-md, the shelf uses the test
  // shelf's lg:max-w-4xl cap straight away).
  const isSpine = variant === 'feed' || variant === 'shelf';
  if (variant === 'slide') {
    /* SLIDE — the tests feed slide anatomy: the content sits DIRECTLY on the
    slide's cover colour (no white shell): the шапка with the title inside →
    ONE white scrollable content card → the full-width rounded-2xl ladder. */
    const slideLadder = (
      <>
        <SlideBtn onClick={ctx.onAi} icon={<Bot className="w-4 h-4 shrink-0" />} label={t('aiDiscuss')} tone={ctx.aiActive ? 'ai' : undefined} />
        <SlideBtn onClick={ctx.onChat} icon={<MessageCircle className="w-4 h-4 shrink-0" />} label={t('gChat')} />
        <SlideBtn onClick={ctx.onFiles} icon={<Paperclip className="w-4 h-4 shrink-0" />} label={t('attachedFiles', { n: (event.tests || []).length + ((event.attachments || []).length) })} />
        {pubPair ? (
          <>
            <SlideBtn onClick={ctx.onPubPublic!} icon={<Globe className="w-4 h-4 shrink-0 text-cta" />} label={t('smmPubPublic')} tone={ctx.isPublic ? 'pub' : undefined} />
            <SlideBtn onClick={ctx.onPubLink!} icon={<Link2 className="w-4 h-4 shrink-0 text-cta" />} label={t('smmPubLink')} tone={ctx.isPublic ? undefined : 'pub'} />
          </>
        ) : (
          <SlideBtn onClick={ctx.onShare} icon={<Link2 className="w-4 h-4 shrink-0 text-cta" />} label={t('smmCopyLink')} />
        )}
        {ctx.onEdit && <SlideBtn onClick={ctx.onEdit} icon={<Pencil className="w-4 h-4 shrink-0" />} label={t('gEdit')} />}
        <SlideBtn onClick={ctx.onDelete} icon={<Trash2 className="w-4 h-4 shrink-0" />} label={t('gDelete')} tone="danger" />
      </>
    );
    return (
      <SlideCard
        ctx={ctx}
        name={event.customer?.name || ''}
        creatorId={event.customerId}
        image={event.customer?.image}
        title={event.title}
        ladder={slideLadder}
      >
        {eventCoverImg && (
          <div className="rounded-2xl overflow-hidden border border-black/10 shrink-0">
            <img src={eventCoverImg} alt="" className="w-full h-28 sm:h-36 object-cover" />
          </div>
        )}
        <EventFacts event={event} t={t} feed />
        {event.summary && <p className="mt-1.5 text-[11px] sm:text-xs text-muted-foreground line-clamp-2">{event.summary}</p>}
        {rolePicker}
        {noRoleHint}
      </SlideCard>
    );
  }
  if (isSpine) {
    /* FEED / SHELF — the test feed card's SPINE anatomy: the title lives on
    the colour spine (the narrow left band), the content column (шапка +
    факты + лестница) sits to the right — the same layout, widths and
    paddings the test cards keep in the shelf mode and the windows. */
    const SHELL = variant === 'feed' ? FEED_SHELL : SHELF_SHELL;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={ctx.onOpen}
        className={`${SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'}`}
      >
        <div style={bgStyle} className={`${bgClass} ${FEED_SPINE} ${eventCoverImg ? '!p-0 relative overflow-hidden' : ''}`}>
          {eventCoverImg ? (
            <img src={eventCoverImg} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <p className={FEED_SPINE_TITLE}>{event.title}</p>
          )}
        </div>
        <div className={FEED_CONTENT}>
          <CardHeader ctx={ctx} name={event.customer?.name || ''} creatorId={event.customerId} image={event.customer?.image} compact />
          <div className="flex-1 min-h-0 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="shrink-0"><EventFacts event={event} t={t} feed /></div>
            {event.summary && <p className="mt-1.5 text-[11px] sm:text-xs text-muted-foreground line-clamp-2">{event.summary}</p>}
            {rolePicker}
            {noRoleHint}
          </div>
          {ladder}
        </div>
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={ctx.onOpen}
      className={`${CARD_SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'}`}
    >
      {/* THE STANDARD CARD HEADER — the same шапка every card wears */}
      <CardHeader ctx={ctx} name={event.customer?.name || ''} creatorId={event.customerId} image={event.customer?.image} compact />
      {/* grid: the plain bold title — the same line the test grid cards wear */}
      <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2">{event.title}</p>
      {/* the 4 FACTS */}
      <div className="mt-2 shrink-0">
        <EventFacts event={event} t={t} compact />
      </div>
      {event.summary && <p className="mt-2 text-xs sm:text-sm text-muted-foreground line-clamp-2">{event.summary}</p>}
      {rolePicker}
      {noRoleHint}
      {ladder}
    </div>
  );
}

// ── ПОСТ ────────────────────────────────────────────────────────────────────

export function SmmPostCardView({ post, variant, ctx }: { post: SmmPostT; variant: CardVariant; ctx: CardCtx }) {
  const { t, myId } = ctx;
  const own = post.specialistId === myId;
  // the publish pair renders only when BOTH handlers arrived (they always
  // travel together from the ctx builder)
  const pubPair = own && !post.parentId && !!ctx.onPubPublic && !!ctx.onPubLink;
  const bgStyle = post.coverColor ? { backgroundColor: post.coverColor } : undefined;
  const bgClass = post.coverColor ? '' : 'bg-[#DFF3E8]';
  const media = (post.media || []) as { url: string; type: string }[];
  const first = media[0];
  const title = post.role?.name || t('smmPost');
  const ladder = (
    <div className="card-ladder shrink-0 pt-1.5 flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" onClick={ctx.onAi} title={t('aiDiscuss')} className={`${LADDER_BTN} ${ctx.aiActive ? LADDER_AI_ACTIVE : ''}`}>
        <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.onChat} title={t('chatWithAll')} className={LADDER_BTN}>
        <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.onFiles} title={t('attachedFiles', { n: media.length + ((post.attachments || []).length) })} className={LADDER_BTN}>
        <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
      </Button>
      {/* THE PUBLISH PAIR — the SAME pair the заказ card keeps, on the
      specialist's own пост in the личная библиотека (a VERSION keeps the
      plain «Ссылка» — the server coerces its isPublic to false). */}
      {pubPair ? (
        <>
          <Button size="sm" variant="outline" onClick={ctx.onPubPublic} title={t('smmPubPublic')} className={`${LADDER_BTN} ${ctx.isPublic ? LADDER_PUB_ACTIVE : ''}`}>
            <Globe className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmPubPublicBtn')}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={ctx.onPubLink} title={t('smmPubLink')} className={`${LADDER_BTN} ${ctx.isPublic ? '' : LADDER_PUB_ACTIVE}`}>
            <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmPubLinkBtn')}</span>
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={ctx.onShare} title={t('smmShareCopied')} className={LADDER_BTN}>
          <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmCopyLink')}</span>
        </Button>
      )}
      {ctx.onEdit && (
        <Button size="sm" variant="outline" onClick={ctx.onEdit} title={t('smmPostEdit')} className={LADDER_BTN}>
          <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={ctx.onDelete} title={t('smmPostDeleted')} className={`${LADDER_BTN} border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive`}>
        <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gDelete')}</span>
      </Button>
    </div>
  );
  // the АВТОПОСТ badge — the system created this card in the личная
  // библиотека after a completed task (drops once the specialist edits it)
  const autoBadge = post.autoGenerated && (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E8E3FF] border border-black/10 px-2 py-0.5 text-[10px] font-bold text-black/70 shrink-0 self-start">
      <Sparkles className="w-3 h-3 shrink-0" /> {t('smmAutoPost')}
    </span>
  );
  // the cover photo (the editor's «Фото обложки») — the spine/slide wear it
  const postCoverImg = (post as any).coverUrl ? mediaSrc((post as any).coverUrl) : null;
  // the media thumbs — the post's specifics line (the place the test feed
  // card keeps its tags/question-count lines)
  const thumbs = (
    <div className="flex gap-1.5 overflow-x-auto shrink-0" onClick={e => e.stopPropagation()}>
      {media.slice(0, 8).map((m, i) => (
        m.type === 'image' ? (
          <button key={i} type="button" onClick={() => ctx.onImageOpen?.(mediaSrc(m.url))} className="w-12 h-12 rounded-lg overflow-hidden border border-black/10 shrink-0">
            <img src={mediaSrc(m.url)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          </button>
        ) : (
          <span key={i} className="w-12 h-12 rounded-lg bg-[#FFF0D9] text-cta flex items-center justify-center shrink-0"><Film className="w-5 h-5" /></span>
        )
      ))}
      {media.length === 0 && <span className="text-[11px] sm:text-xs text-muted-foreground py-3">{t('smmPost')}</span>}
    </div>
  );
  // the SPINE layout serves both the feed window cards AND the shelf cards —
  // the same horizontal anatomy the test cards keep in both modes.
  const isSpine = variant === 'feed' || variant === 'shelf';
  if (variant === 'slide') {
    /* SLIDE — the tests feed slide anatomy: the content sits DIRECTLY on the
    slide's cover colour (no white shell). */
    const slideLadder = (
      <>
        <SlideBtn onClick={ctx.onAi} icon={<Bot className="w-4 h-4 shrink-0" />} label={t('aiDiscuss')} tone={ctx.aiActive ? 'ai' : undefined} />
        <SlideBtn onClick={ctx.onChat} icon={<MessageCircle className="w-4 h-4 shrink-0" />} label={t('gChat')} />
        <SlideBtn onClick={ctx.onFiles} icon={<Paperclip className="w-4 h-4 shrink-0" />} label={t('attachedFiles', { n: media.length + ((post.attachments || []).length) })} />
        {pubPair ? (
          <>
            <SlideBtn onClick={ctx.onPubPublic!} icon={<Globe className="w-4 h-4 shrink-0 text-cta" />} label={t('smmPubPublic')} tone={ctx.isPublic ? 'pub' : undefined} />
            <SlideBtn onClick={ctx.onPubLink!} icon={<Link2 className="w-4 h-4 shrink-0 text-cta" />} label={t('smmPubLink')} tone={ctx.isPublic ? undefined : 'pub'} />
          </>
        ) : (
          <SlideBtn onClick={ctx.onShare} icon={<Link2 className="w-4 h-4 shrink-0 text-cta" />} label={t('smmCopyLink')} />
        )}
        {ctx.onEdit && <SlideBtn onClick={ctx.onEdit} icon={<Pencil className="w-4 h-4 shrink-0" />} label={t('gEdit')} />}
        <SlideBtn onClick={ctx.onDelete} icon={<Trash2 className="w-4 h-4 shrink-0" />} label={t('gDelete')} tone="danger" />
      </>
    );
    return (
      <SlideCard
        ctx={ctx}
        name={post.specialist?.name || ''}
        creatorId={post.specialistId}
        image={post.specialist?.image}
        title={title}
        ladder={slideLadder}
      >
        {postCoverImg && (
          <div className="rounded-2xl overflow-hidden border border-black/10 shrink-0">
            <img src={postCoverImg} alt="" className="w-full h-28 sm:h-36 object-cover" />
          </div>
        )}
        {autoBadge}
        {thumbs}
        {post.description && <p className="text-[11px] sm:text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{post.description}</p>}
      </SlideCard>
    );
  }
  if (isSpine) {
    /* FEED / SHELF — the test feed card's SPINE anatomy: the role name lives
    on the colour spine, the content column (шапка + media thumbs +
    description + лестница) sits to the right — byte-for-byte the test
    shelf/feed-window layout. */
    const SHELL = variant === 'feed' ? FEED_SHELL : SHELF_SHELL;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={ctx.onOpen}
        className={`${SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'}`}
      >
        <div style={bgStyle} className={`${bgClass} ${FEED_SPINE} ${postCoverImg ? '!p-0 relative overflow-hidden' : ''}`}>
          {postCoverImg ? (
            <img src={postCoverImg} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <p className={FEED_SPINE_TITLE}>{title}</p>
          )}
        </div>
        <div className={FEED_CONTENT}>
          <CardHeader ctx={ctx} name={post.specialist?.name || ''} creatorId={post.specialistId} image={post.specialist?.image} compact />
          <div className="flex-1 min-h-0 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {autoBadge}
            {thumbs}
            {post.description && <p className="mt-1.5 text-[11px] sm:text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{post.description}</p>}
          </div>
          {ladder}
        </div>
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={ctx.onOpen}
      className={`${CARD_SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'}`}
    >
      <CardHeader ctx={ctx} name={post.specialist?.name || ''} creatorId={post.specialistId} image={post.specialist?.image} compact />
      {/* grid: the plain bold title + the compact media band */}
      <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2">{title}</p>
      {autoBadge}
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
        ) : postCoverImg ? (
          <img src={postCoverImg} alt="" className="w-full h-full object-cover" />
        ) : (
          <div style={bgStyle} className={`${bgClass} w-full h-full flex items-center justify-center`}>
            <p className="text-sm font-bold text-cta line-clamp-2 px-2">{title}</p>
          </div>
        )}
      </div>
      {post.description && <p className="mt-2 text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap line-clamp-2">{post.description}</p>}
      {ladder}
    </div>
  );
}

// ── СПЕЦИАЛИСТ ──────────────────────────────────────────────────────────────

export function SmmSpecialistCardView({ sp, variant, ctx }: { sp: SmmSpecialistT; variant: CardVariant; ctx: CardCtx }) {
  const { t } = ctx;
  // the specialist's spine colour — hashed from the id, the same pastel
  // palette the test spines pick from
  const spBg = SPINE_PALETTE[tagHash(sp.id || sp.name || '?') % SPINE_PALETTE.length];
  const ratingLine = (
    <div className="shrink-0 flex items-center gap-2 min-w-0">
      <p className="font-bold leading-snug truncate text-xs sm:text-sm">{sp.name}</p>
      {/* premium profile badge (monetization: premium profiles rank first) */}
      {(sp as any).premium && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 shrink-0">
          <Star className="w-2.5 h-2.5 fill-current" /> {t('premiumBadge')}
        </span>
      )}
      <span className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground shrink-0">
        <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> {sp.rating > 0 ? sp.rating.toFixed(1) : '—'}</span>
        <span>· {t('smmOrders')}: {sp.orders}</span>
      </span>
    </div>
  );
  const rolesPrices = (
    <div className="shrink-0 flex flex-col gap-1">
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
  );
  const eventPicker = (
    <div className="shrink-0 flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
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
  );
  const ladder = (
    <div className="card-ladder shrink-0 pt-1.5 flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" onClick={ctx.onAi} title={t('aiDiscuss')} className={`${LADDER_BTN} ${ctx.aiActive ? LADDER_AI_ACTIVE : ''}`}>
        <Bot className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gAi')}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.onChat} title={t('chatWithAll')} className={LADDER_BTN}>
        <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.onFiles} title={t('gFiles')} className={LADDER_BTN}>
        <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
      </Button>
      {/* СКОПИРОВАТЬ ССЫЛКУ — the specialist card's link button (the customer's
      публичная библиотека): copies the ?specialist=<id> deep link that opens
      THIS specialist's profile window. */}
      <Button size="sm" variant="outline" onClick={ctx.onShare} title={t('smmShareCopied')} className={LADDER_BTN}>
        <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('smmCopyLink')}</span>
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.onDelete} title={t('smmSpecialistDeleted')} className={`${LADDER_BTN} border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive`}>
        <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gDelete')}</span>
      </Button>
    </div>
  );
  // the SPINE layout serves both the feed window cards AND the shelf cards —
  // the same horizontal anatomy the test cards keep in both modes.
  const isSpine = variant === 'feed' || variant === 'shelf';
  if (variant === 'slide') {
    /* SLIDE — the tests feed slide anatomy: the content sits DIRECTLY on the
    slide's cover colour (no white shell). */
    const slideLadder = (
      <>
        <SlideBtn onClick={ctx.onAi} icon={<Bot className="w-4 h-4 shrink-0" />} label={t('aiDiscuss')} tone={ctx.aiActive ? 'ai' : undefined} />
        <SlideBtn onClick={ctx.onChat} icon={<MessageCircle className="w-4 h-4 shrink-0" />} label={t('gChat')} />
        <SlideBtn onClick={ctx.onFiles} icon={<Paperclip className="w-4 h-4 shrink-0" />} label={t('gFiles')} />
        <SlideBtn onClick={ctx.onShare} icon={<Link2 className="w-4 h-4 shrink-0 text-cta" />} label={t('smmCopyLink')} />
        <SlideBtn onClick={ctx.onDelete} icon={<Trash2 className="w-4 h-4 shrink-0" />} label={t('gDelete')} tone="danger" />
      </>
    );
    return (
      <SlideCard
        ctx={ctx}
        name={sp.name}
        creatorId={sp.id}
        image={sp.image}
        title={sp.name}
        ladder={slideLadder}
      >
        {ratingLine}
        <div className="mt-1.5">{rolesPrices}</div>
        {eventPicker}
      </SlideCard>
    );
  }
  if (isSpine) {
    /* FEED / SHELF — the test feed card's SPINE anatomy: the specialist's
    name on the colour spine, the content column (шапка + rating +
    roles/prices + лестница) sits to the right — the exact test layout. */
    const SHELL = variant === 'feed' ? FEED_SHELL : SHELF_SHELL;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={ctx.onOpen}
        className={`${SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'}`}
      >
        <div className={`${spBg} ${FEED_SPINE}`}>
          <p className={FEED_SPINE_TITLE}>{sp.name}</p>
        </div>
        <div className={FEED_CONTENT}>
          <CardHeader ctx={ctx} name={sp.name} creatorId={sp.id} image={sp.image} compact />
          <div className="flex-1 min-h-0 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ratingLine}
            <div className="mt-1.5">{rolesPrices}</div>
            {eventPicker}
          </div>
          {ladder}
        </div>
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={ctx.onOpen}
      className={`${CARD_SHELL} ${ctx.selected ? 'border-cta ring-2 ring-cta/60' : 'border-black/15'}`}
    >
      <CardHeader ctx={ctx} name={sp.name} creatorId={sp.id} image={sp.image} compact />
      {/* grid: the plain bold name + the rating/orders line — the same title
      line the test grid cards wear under the strip */}
      {ratingLine}
      {/* roles + prices (the 4 params live here: pricePerK + pricePerDay per role) */}
      <div className="mt-2">{rolesPrices}</div>
      {/* the customer's picks: event + role */}
      <div className="mt-2">{eventPicker}</div>
      {ladder}
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

export function RequestRow({
  kindLabel, title, sub, status, score, onWithdraw, withdrawLabel,
  // Deal lifecycle (Mercur model): decisions / completion / reviews
  canDecide, onAccept, onDecline, onComplete, onReview, reviewed,
  confirmations, myConfirmDone, t,
  // ЗАЯВКА БЕЗ ТЕСТА: the ad link IS the заявка's substance — the customer
  // must see it right in the row (it also lands in the direct chat)
  proofUrl,
  // ACCEPTED deal → the chat page (the work talk lives there)
  onOpenChat,
}: {
  kindLabel: string; title: string; sub: string; status: string;
  score?: string; onWithdraw?: () => void; withdrawLabel: string;
  canDecide?: boolean; onAccept?: () => void; onDecline?: () => void;
  onComplete?: () => void; onReview?: () => void; reviewed?: boolean;
  confirmations?: number; myConfirmDone?: boolean; t: CardCtx['t'];
  proofUrl?: string | null;
  onOpenChat?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
      <span className="w-10 h-10 rounded-xl bg-[#DFF3E8] flex items-center justify-center shrink-0">
        <ClipboardList className="w-5 h-5 text-cta" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{kindLabel} · {title}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
        {proofUrl && (
          <a href={proofUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-bold text-cta underline truncate mt-0.5 max-w-full">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('smmProofLink')}: {proofUrl.replace(/^https?:\/\//, '')}</span>
          </a>
        )}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {status === 'pending' ? t('smmStatusPending')
              : status === 'accepted' ? t('smmDealActive')
              : status === 'completed' ? t('smmStatusCompleted')
              : status === 'declined' ? t('smmStatusDeclined')
              : status === 'cancelled' ? t('smmStatusCancelled') : status}
          </Badge>
          {score && <Badge variant="secondary" className="rounded-full text-[10px]">{score}</Badge>}
          {status === 'accepted' && typeof confirmations === 'number' && (
            <Badge variant="secondary" className="rounded-full text-[10px]">{confirmations}/2</Badge>
          )}
          {myReviewBadge(status, myConfirmDone, reviewed, t)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {status === 'pending' && canDecide && onAccept && (
          <Button size="sm" onClick={onAccept} className="h-8 rounded-full text-xs px-3">{t('smmAccept')}</Button>
        )}
        {status === 'pending' && canDecide && onDecline && (
          <Button size="sm" variant="outline" onClick={onDecline} className="h-8 rounded-full border-destructive/50 text-destructive text-xs">{t('smmDecline')}</Button>
        )}
        {status === 'pending' && onWithdraw && !canDecide && (
          <Button size="sm" variant="outline" onClick={onWithdraw} className="h-8 rounded-full border-destructive/50 text-destructive text-xs shrink-0">
            {withdrawLabel}
          </Button>
        )}
        {status === 'accepted' && onOpenChat && (
          <Button size="sm" onClick={onOpenChat} className="h-8 rounded-full text-xs px-3 shrink-0">
            <MessageCircle className="w-3.5 h-3.5" /> {t('smmRequestsChat')}
          </Button>
        )}
        {status === 'accepted' && onComplete && !myConfirmDone && (
          <Button size="sm" onClick={onComplete} className="h-8 rounded-full text-xs px-3">{t('smmDealConfirm')}</Button>
        )}
        {status === 'completed' && onReview && !reviewed && (
          <Button size="sm" onClick={onReview} className="h-8 rounded-full text-xs px-3">
            <Star className="w-3.5 h-3.5" /> {t('smmReviewLeave')}
          </Button>
        )}
      </div>
    </div>
  );
}

function myReviewBadge(status: string, myConfirmDone?: boolean, reviewed = false, t?: CardCtx['t']) {
  if (status === 'accepted' && myConfirmDone && t) {
    return <Badge variant="secondary" className="rounded-full text-[10px]">{t('smmDealConfirmedMine')}</Badge>;
  }
  if (status === 'completed' && reviewed && t) {
    return <Badge variant="secondary" className="rounded-full text-[10px]">★ {t('smmReviewLeft')}</Badge>;
  }
  return null;
}
