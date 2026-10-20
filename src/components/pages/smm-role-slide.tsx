'use client';

import React from 'react';
import { SwiperSlide } from 'swiper/react';
import {
  Banknote, Building2, CalendarClock, ChevronRight, ClipboardList, Landmark,
  Link2, MessageCircle, Paperclip, Pencil, ShieldAlert, Trash2, UserPlus, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreatorStrip } from '@/components/shared-bits';
import { smmCoverColor } from '@/lib/smm-client';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

/**
 * SMM ROLE SLIDE — the ONE TikTok-style card for a personal ROLE («Личные
 * роли», the customer's own ТЗ across their events). The visual twin of the
 * event card: same ladder, one button per line — Chat (event chat) → Files
 * (event files) → Share link (?event=) → Publish/Unpublish to «Общие роли» →
 * Manage (the event's manage sheet) → Edit → Delete. All roles on this page
 * are the viewer's OWN — the full owner ladder always renders.
 */

export interface SmmRoleSlideProps {
  role: any;
  // The parent EVENT is pinned in the personal library (bookmark follows the event)
  eventPinned: boolean;
  editMode?: boolean;
  onToggleEventBookmark: () => void;
  onOpenEvent: () => void;
  onChat: () => void;
  onFiles?: () => void;
  onShare: () => void;
  onPublishToggle: () => void;
  onManage: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function SmmRoleSlide({
  role, eventPinned, editMode = false,
  onToggleEventBookmark, onOpenEvent, onChat, onFiles, onShare, onPublishToggle, onManage, onEdit, onDelete,
}: SmmRoleSlideProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const ev = role.event || {};
  const btn = 'shrink-0 w-full flex items-center gap-1.5 rounded-2xl border-2 border-black bg-white px-3 py-1.5 [@media(max-height:700px)]:py-1 text-left hover:bg-muted/50 transition-colors';
  return (
    <SwiperSlide className="relative !h-full overflow-hidden" style={{ backgroundColor: ev.coverColor || smmCoverColor(role.eventId || role.id) }}>
      <div className="h-full w-full flex flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:py-6 lg:pb-40 min-h-0">
        <div className="w-full max-w-md lg:max-w-3xl flex flex-col gap-2.5 sm:gap-4 [@media(max-height:700px)]:gap-1.5 min-h-0">
          {/* The strip presents the parent EVENT (photo-less, title + the event's pin) */}
          <CreatorStrip
            name={ev.title || ''}
            creatorId={role.eventId}
            image={null}
            bookmarked={eventPinned}
            onToggleBookmark={onToggleEventBookmark}
            addLabel={t('bookmarkAdd')}
            removeLabel={t('bookmarkRemove')}
            addShort={t('bookmarkAddShort')}
            removeShort={t('bookmarkRemoveShort')}
            onOpenProfile={onOpenEvent}
            openLabel={t('smmManageEvent')}
            title={role.name}
          />
          <div className="rounded-3xl border-2 border-black/10 bg-white/85 backdrop-blur px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {ev.kind === 'government' ? <Landmark className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
              <button type="button" onClick={onOpenEvent} className="truncate hover:underline">{ev.title}</button>
              {/* Publication state — the role's ТЗ template in «Общие роли» */}
              <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${role.sharedRoleId ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                <Users className="w-3 h-3" />
                {role.sharedRoleId ? t('smmSharedRolesTitle') : t('smmMyRolesTitle')}
              </span>
            </div>
            <p className="text-sm font-bold leading-snug">{role.name}</p>
            {ev.summary && <p className="text-xs text-muted-foreground line-clamp-2">{ev.summary}</p>}
            {role.brief && <p className="text-xs whitespace-pre-wrap line-clamp-4">{role.brief}</p>}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {role.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><CalendarClock className="w-3 h-3" />{role.deadline}</span>}
              {role.payment && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Banknote className="w-3 h-3" />{role.payment}</span>}
              {(role.pendingApplications || 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-semibold">{t('smmAppsN', { n: role.pendingApplications })}</span>}
            </div>
            {(role.assigned || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {role.assigned.map((a: any) => (
                  <Badge key={a.userId} variant="secondary" className="rounded-full text-[11px]">{t('smmAssigned')}: {a.name}</Badge>
                ))}
              </div>
            )}
          </div>

          {!editMode ? (
            <>
              <button type="button" onClick={onChat} className={btn}>
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{t('chat')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              {onFiles && (
                <button type="button" onClick={onFiles} className={btn}>
                  <Paperclip className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('gFiles')}</span>
                  <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                </button>
              )}
              <button type="button" onClick={onShare} className={btn}>
                <Link2 className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{t('shareLinkBtn')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              <button type="button" onClick={onPublishToggle} className={btn}>
                <Users className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{role.sharedRoleId ? t('smmUnpublishRole') : t('smmPublishRole')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              <button type="button" onClick={onManage} className={btn}>
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{(role.pendingApplications || 0) > 0 ? t('smmAppsN', { n: role.pendingApplications }) : t('smmManageEvent')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              <button type="button" onClick={onEdit} className={btn}>
                <Pencil className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{t('gEdit')}</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
              </button>
              <button type="button" onClick={onDelete} className={`${btn} text-destructive`}>
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{t('delete')}</span>
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center">{t('editModeOn')}</p>
          )}
        </div>
      </div>
    </SwiperSlide>
  );
}

// The compact grid card (library / shelf views) for the SAME role — mirrors
// the event grid card's one-per-line ladder.
export function SmmRoleGridCard({
  role, eventPinned, onToggleEventBookmark, onOpenEvent, onChat, onFiles,
  onShare, onPublishToggle, onManage, onEdit, onDelete,
}: {
  role: any;
  eventPinned: boolean;
  onToggleEventBookmark: () => void;
  onOpenEvent: () => void;
  onChat: () => void;
  onFiles?: () => void;
  onShare: () => void;
  onPublishToggle: () => void;
  onManage: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const ev = role.event || {};
  const ladderBtn = 'h-7 rounded-full border-black text-[10px] sm:text-[11px] lg:h-9 lg:text-xs px-1.5 justify-start gap-1 has-[>svg]:px-1';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenEvent}
      onKeyDown={e => { if (e.key === 'Enter') onOpenEvent(); }}
      className="h-full min-h-0 flex flex-col rounded-2xl border border-black/15 bg-white p-2 sm:p-3 lg:p-4 overflow-hidden hover:border-black/40 active:scale-[0.99] transition-all text-left cursor-pointer"
    >
      <CreatorStrip
        compact
        name={ev.title || ''}
        creatorId={role.eventId}
        image={null}
        bookmarked={eventPinned}
        onToggleBookmark={onToggleEventBookmark}
        addLabel={t('bookmarkAdd')}
        removeLabel={t('bookmarkRemove')}
        addShort={t('bookmarkAddShort')}
        removeShort={t('bookmarkRemoveShort')}
        onOpenProfile={onOpenEvent}
        openLabel={t('smmManageEvent')}
        title={role.name}
      />
      <p className="text-[13px] sm:text-sm lg:text-[15px] font-bold leading-snug line-clamp-2 mt-1">{role.name}</p>
      {role.brief && <p className="text-[13px] sm:text-sm text-muted-foreground leading-snug line-clamp-2 mt-0.5">{role.brief}</p>}
      <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
        {ev.kind === 'government'
          ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><Landmark className="w-2.5 h-2.5" />{t('smmKindGovernment')}</span>
          : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><Building2 className="w-2.5 h-2.5" />{t('smmKindBusiness')}</span>}
        {role.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><CalendarClock className="w-2.5 h-2.5" />{role.deadline}</span>}
        {role.payment && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><Banknote className="w-2.5 h-2.5" />{role.payment}</span>}
        {(role.pendingApplications || 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 font-semibold">{t('smmAppsN', { n: role.pendingApplications })}</span>}
        {role.sharedRoleId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 font-semibold"><Users className="w-2.5 h-2.5" />{t('smmSharedRolesTitle')}</span>
        )}
      </div>
      {/* ONE BUTTON PER LEVEL — the same ladder the event grid cards keep */}
      <div className="card-ladder mt-auto pt-1.5 flex flex-col gap-0.5">
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onChat(); }} title={t('chatWithAll')} aria-label={t('chatWithAll')} className={ladderBtn}>
          <MessageCircle className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gChat')}</span>
        </Button>
        {onFiles && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onFiles(); }} title={t('gFiles')} aria-label={t('gFiles')} className={ladderBtn}>
            <Paperclip className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gFiles')}</span>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onShare(); }} title={t('shareLinkBtn')} aria-label={t('shareLinkBtn')} className={ladderBtn}>
          <Link2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gShare')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onPublishToggle(); }} title={role.sharedRoleId ? t('smmUnpublishRole') : t('smmPublishRole')} aria-label={role.sharedRoleId ? t('smmUnpublishRole') : t('smmPublishRole')} className={ladderBtn}>
          <Users className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{role.sharedRoleId ? t('smmUnpublishRole') : t('gPublic')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onManage(); }} title={t('smmManageEvent')} aria-label={t('smmManageEvent')} className={ladderBtn}>
          <ClipboardList className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{(role.pendingApplications || 0) > 0 ? t('smmAppsN', { n: role.pendingApplications }) : t('smmManageEvent')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onEdit(); }} title={t('smmEditRoleTitle')} aria-label={t('smmEditRoleTitle')} className={ladderBtn}>
          <Pencil className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('gEdit')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onDelete(); }} title={t('delete')} aria-label={t('delete')} className={`${ladderBtn} text-destructive`}>
          <Trash2 className="size-3 lg:size-3.5 shrink-0" /> <span className="truncate">{t('delete')}</span>
        </Button>
      </div>
    </div>
  );
}
