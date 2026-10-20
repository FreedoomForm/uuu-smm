'use client';

import React from 'react';
import { Bell, BookOpen, Briefcase, ClipboardList, Globe, ListOrdered, Send, Users } from 'lucide-react';
import { tUI, type Lang } from '@/lib/i18n';

/**
 * THE BOTTOM PANEL = PAGE TABS. One tap = one page opens. No mode flips,
 * no scope cycling, no sub-docks — every button is a REAL page tab and the
 * active one is filled with the cta color, exactly like the old tests site's
 * very-bottom dock.
 *
 * CUSTOMER DOCK — the customer's four page buttons:
 * Мероприятия | Личные роли | Общие роли | Почта.
 * Shared by the dashboard, the events, roles and mail pages so EVERY main
 * page carries the identical very-bottom panel.
 */
export function SmmCustomerDock({
  lang, active, gotoEvents, gotoRoles, gotoMail,
}: {
  lang: string;
  active: 'events' | 'rolesMine' | 'rolesPublic' | 'mail' | null;
  gotoEvents: () => void;
  gotoRoles: (scope: 'mine' | 'public') => void;
  gotoMail: () => void;
}) {
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang as Lang, key, vars), [lang]);
  const btn = (isActive: boolean) => `min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors ${isActive ? 'bg-cta hover:bg-cta/90 text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={gotoEvents} title={t('smmEventsTitle')} aria-label={t('smmEventsTitle')} className={btn(active === 'events')}>
        <Briefcase className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmEventsTitle')}</span>
      </button>
      <button type="button" onClick={() => gotoRoles('mine')} title={t('smmRolesTitle')} aria-label={t('smmRolesTitle')} className={btn(active === 'rolesMine')}>
        <ClipboardList className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRolesTitle')}</span>
      </button>
      <button type="button" onClick={() => gotoRoles('public')} title={t('smmRolesPublicTitle')} aria-label={t('smmRolesPublicTitle')} className={btn(active === 'rolesPublic')}>
        <Users className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRolesPublicTitle')}</span>
      </button>
      <button type="button" onClick={gotoMail} title={t('smmMailTitle')} aria-label={t('smmMailTitle')} className={btn(active === 'mail')}>
        <Bell className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmMailTitle')}</span>
      </button>
    </div>
  );
}

/**
 * SPECIALIST DOCK — the four page buttons every specialist page renders
 * (the D-spec bottom panel): Личная библиотека | Публичная библиотека |
 * Принятые запросы | Отправленные запросы. The two library buttons open the
 * SAME library page in its two scopes (personal = my bookmarked events,
 * public = the whole open library) — real page tabs, not mode flips.
 */
export function SmmSpecialistDock({
  lang, active, gotoLibrary, gotoInbox, gotoRequests,
}: {
  lang: string;
  active: 'libraryMine' | 'libraryPublic' | 'inbox' | 'requests' | null;
  gotoLibrary: (scope: 'mine' | 'discover') => void;
  gotoInbox: () => void;
  gotoRequests: () => void;
}) {
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang as Lang, key, vars), [lang]);
  const btn = (isActive: boolean) => `min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors ${isActive ? 'bg-cta hover:bg-cta/90 text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => gotoLibrary('mine')} title={t('smmLibPersonalTitle')} aria-label={t('smmLibPersonalTitle')} className={btn(active === 'libraryMine')}>
        <BookOpen className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmLibPersonalTitle')}</span>
      </button>
      <button type="button" onClick={() => gotoLibrary('discover')} title={t('smmLibPublicTitle')} aria-label={t('smmLibPublicTitle')} className={btn(active === 'libraryPublic')}>
        <Globe className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmLibPublicTitle')}</span>
      </button>
      <button type="button" onClick={gotoInbox} title={t('smmRequestsInTitle')} aria-label={t('smmRequestsInTitle')} className={btn(active === 'inbox')}>
        <Send className="w-4 h-4 shrink-0 rotate-180 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRequestsInTitle')}</span>
      </button>
      <button type="button" onClick={gotoRequests} title={t('smmRequestsTitle')} aria-label={t('smmRequestsTitle')} className={btn(active === 'requests')}>
        <ListOrdered className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRequestsTitle')}</span>
      </button>
    </div>
  );
}
