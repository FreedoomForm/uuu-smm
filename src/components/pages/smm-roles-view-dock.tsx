'use client';

import React from 'react';
import { Briefcase, ClipboardList, Compass, Library, Users } from 'lucide-react';
import { tUI, type Lang } from '@/lib/i18n';

/**
 * SMM CUSTOMER DOCK — the four page buttons every customer page renders:
 * Личные роли | Общие роли | Личное | Общее. `active` marks the current
 * page (cta fill). Shared by the dashboard and the roles pages so EVERY
 * main page carries the identical very-bottom panel.
 */
export function SmmCustomerDock({
  lang, active, gotoLibrary, gotoEvents, gotoRoles,
}: {
  lang: string;
  active: 'roles' | 'rolesPublic' | 'library' | 'public';
  gotoLibrary: (discover: boolean) => void;
  gotoEvents: () => void;
  gotoRoles: (scope: 'mine' | 'public') => void;
}) {
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang as Lang, key, vars), [lang]);
  const btn = (isActive: boolean) => `min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors ${isActive ? 'bg-cta hover:bg-cta/90 text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => gotoRoles('mine')} title={t('smmRolesTitle')} aria-label={t('smmRolesTitle')} className={btn(active === 'roles')}>
        <ClipboardList className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRolesTitle')}</span>
      </button>
      <button type="button" onClick={() => gotoRoles('public')} title={t('smmRolesPublicTitle')} aria-label={t('smmRolesPublicTitle')} className={btn(active === 'rolesPublic')}>
        <Users className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRolesPublicTitle')}</span>
      </button>
      <button type="button" onClick={() => gotoLibrary(false)} title={`${t('modeMine')} · ${t('modeMineHint')}`} aria-label={t('modeMine')} className={btn(active === 'library')}>
        <Library className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('modeMine')}</span>
      </button>
      <button type="button" onClick={() => gotoLibrary(true)} title={`${t('modeDiscover')} · ${t('modeDiscoverHint')}`} aria-label={t('modeDiscover')} className={btn(active === 'public')}>
        <Compass className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('modeDiscover')}</span>
      </button>
    </div>
  );
}

/**
 * SMM EVENTS DOCK — the events page's variant: «Мероприятия» is the page
 * itself (always active), the roles pages are the neighbors, and the fourth
 * button cycles the page's own scope (Личное ↔ Общее).
 */
export function SmmEventsDock({
  lang, activeScope, gotoRoles, toggleScope,
}: {
  lang: string;
  activeScope: 'mine' | 'discover';
  gotoRoles: (scope: 'mine' | 'public') => void;
  toggleScope: () => void;
}) {
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang as Lang, key, vars), [lang]);
  const btn = (isActive: boolean) => `min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors ${isActive ? 'bg-cta text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled title={t('smmEventsTitle')} aria-label={t('smmEventsTitle')} className={btn(true)}>
        <Briefcase className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmEventsTitle')}</span>
      </button>
      <button type="button" onClick={() => gotoRoles('mine')} title={t('smmRolesTitle')} aria-label={t('smmRolesTitle')} className={btn(false)}>
        <ClipboardList className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRolesTitle')}</span>
      </button>
      <button type="button" onClick={() => gotoRoles('public')} title={t('smmRolesPublicTitle')} aria-label={t('smmRolesPublicTitle')} className={btn(false)}>
        <Users className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
        <span className="min-w-0 truncate">{t('smmRolesPublicTitle')}</span>
      </button>
      <button
        type="button"
        onClick={toggleScope}
        title={activeScope === 'mine' ? t('modeDiscover') : t('modeMine')}
        aria-label={activeScope === 'mine' ? t('modeDiscover') : t('modeMine')}
        className={btn(false)}
      >
        {activeScope === 'mine'
          ? <Library className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
          : <Compass className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />}
        <span className="min-w-0 truncate">{activeScope === 'mine' ? t('modeMine') : t('modeDiscover')}</span>
      </button>
    </div>
  );
}
