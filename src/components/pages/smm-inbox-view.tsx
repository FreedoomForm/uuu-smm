'use client';

import React from 'react';
import {
  ArrowLeft, Banknote, Bell, CalendarClock, CheckCircle2, FileText, Inbox,
  Pencil, Plus, Send, X,
} from 'lucide-react';
import LangButton from '@/components/lang-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';
import { SmmSpecialistDock } from '@/components/pages/smm-roles-view-dock';
import type { SmmApplicationItem, SmmInvitationItem } from '@/lib/app-types';

/**
 * SMM INBOX — «Принятые запросы»: everything the SPECIALIST has RECEIVED.
 * The same 56px top panel as every other specialist page (назад · поиск ·
 * вид · язык · профиль) and the same LIBRARY PAGES DOCK (Личная библиотека |
 * Публичная библиотека | Принятые запросы (active) | Отправленные запросы).
 * Inside: the received invitations (accept → the event gets me for that
 * role) and the statuses of the specialist's own sent запросы.
 */

export interface SmmInboxViewProps {
  goHome: () => void;
  // The dock's page router: personal/public library + the requests pages
  gotoLibrary: (scope: 'mine' | 'discover') => void;
  gotoRequests: () => void;
  // The specialist's «+» opens the ЗАПРОС editor; «изменить» routes to
  // «Отправленные запросы» in edit mode (D-spec top panel)
  onCreateRequest?: () => void;
  onEditRequests?: () => void;
  onCycleLang: () => void;
}

export default function SmmInboxView({ goHome, gotoLibrary, gotoRequests, onCreateRequest, onEditRequests, onCycleLang }: SmmInboxViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const [seg, setSeg] = React.useState<'invites' | 'apps'>('invites');
  const [invites, setInvites] = React.useState<SmmInvitationItem[]>([]);
  const [apps, setApps] = React.useState<SmmApplicationItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [inv, ap] = await Promise.all([api.getSmmInvitations('inbox'), api.getSmmApplications('sent')]);
      setInvites(inv);
      setApps(ap);
    } catch { /* transient */ }
    setLoading(false);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const respondInv = async (id: string, action: 'accept' | 'decline') => {
    setBusy(true);
    try {
      await api.respondSmmInvitation(id, action);
      setInvites(prev => prev.map(i => (i.id === id ? { ...i, status: action === 'accept' ? 'accepted' : 'declined' } : i)));
    } catch { /* transient */ }
    setBusy(false);
  };

  const pendingN = invites.filter(i => i.status === 'pending').length;

  const statusBadge = (status: string) => (
    <Badge className={`rounded-full shrink-0 ${status === 'accepted' ? 'bg-emerald-500' : status === 'declined' ? 'bg-red-500' : 'bg-amber-500'}`}>{t(`smmStatus_${status}`)}</Badge>
  );

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL — the same 56px contract as every specialist page ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="relative max-w-7xl mx-auto px-3 sm:px-4 h-14 lg:h-16 flex flex-nowrap items-center justify-between gap-1 sm:gap-2 lg:gap-3">
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0">
            <Button variant="outline" size="icon" onClick={goHome} className="rounded-full shrink-0 border-black lg:h-10 lg:w-10" title={t('back')} aria-label={t('back')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-base sm:text-lg font-bold truncate">{t('smmRequestsInTitle')}</h1>
            {pendingN > 0 && <Badge className="rounded-full bg-amber-500 shrink-0">{pendingN}</Badge>}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
            {onCreateRequest && (
              <Button onClick={onCreateRequest} className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm" title={t('smmNewRequest')}>
                <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('smmNewRequest')}</span>
              </Button>
            )}
            {onEditRequests && (
              <Button variant="outline" onClick={onEditRequests} className="rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm border-black" title={t('smmEditRequestTitle')} aria-label={t('smmEditRequestTitle')}>
                <Pencil className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{t('gEdit')}</span>
              </Button>
            )}
            <LangButton lang={lang as Lang} onChange={onCycleLang} className="border-black px-2 sm:px-3" />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="max-w-2xl lg:max-w-3xl w-full mx-auto px-4 py-4 pb-16 space-y-4">
          {/* Segment switch — the dock-button style */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSeg('invites')} className={`flex items-center justify-center gap-1.5 h-9 rounded-full border-2 text-xs sm:text-sm font-semibold transition-colors ${seg === 'invites' ? 'bg-cta text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}>
              <Bell className="w-4 h-4 shrink-0" /> {t('smmSegInvites')}
            </button>
            <button type="button" onClick={() => setSeg('apps')} className={`flex items-center justify-center gap-1.5 h-9 rounded-full border-2 text-xs sm:text-sm font-semibold transition-colors ${seg === 'apps' ? 'bg-cta text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`}>
              <Send className="w-4 h-4 shrink-0" /> {t('smmSegMyApps')}
            </button>
          </div>

          {loading && <p className="text-sm text-muted-foreground text-center py-10">{t('loading')}</p>}

          {!loading && seg === 'invites' && (
            <div className="space-y-3">
              {invites.length === 0 && (
                <Card className="rounded-4xl border border-black bg-white">
                  <CardContent className="p-8 text-center space-y-3">
                    <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center"><Inbox className="w-7 h-7 text-muted-foreground" /></div>
                    <p className="font-bold">{t('smmNoInvitations')}</p>
                    <p className="text-sm text-muted-foreground">{t('smmInboxEmptyHint')}</p>
                  </CardContent>
                </Card>
              )}
              {invites.map(i => (
                <Card key={i.id} className="rounded-4xl border border-black bg-white overflow-hidden">
                  <CardContent className="p-5 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className="w-9 h-9 rounded-xl bg-cta flex items-center justify-center shrink-0"><Bell className="w-4 h-4 text-white" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm">{i.event?.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{t('smmRoleN')}: {i.role?.name} · {i.customer?.name}</p>
                      </div>
                      {statusBadge(i.status)}
                    </div>
                    {i.role?.brief && (
                      <div className="rounded-xl bg-muted/50 p-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{t('smmRoleBriefTemplate')}</p>
                        <p className="text-xs whitespace-pre-wrap line-clamp-4">{i.message || i.role.brief}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {i.role?.payment && <span className="inline-flex items-center gap-1"><Banknote className="w-3 h-3" />{i.role.payment}</span>}
                      {i.role?.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{i.role.deadline}</span>}
                    </div>
                    {i.status === 'pending' && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => respondInv(i.id, 'accept')} disabled={busy} className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-600/90">
                          <CheckCircle2 className="w-4 h-4 mr-1" /> {t('smmAccept')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => respondInv(i.id, 'decline')} disabled={busy} className="flex-1 rounded-full">
                          <X className="w-4 h-4 mr-1" /> {t('smmDecline')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && seg === 'apps' && (
            <div className="space-y-3">
              {apps.length === 0 && (
                <Card className="rounded-4xl border border-black bg-white">
                  <CardContent className="p-8 text-center space-y-3">
                    <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center"><Send className="w-7 h-7 text-muted-foreground" /></div>
                    <p className="font-bold">{t('smmNoMyApps')}</p>
                    <p className="text-sm text-muted-foreground">{t('smmMyAppsEmptyHint')}</p>
                  </CardContent>
                </Card>
              )}
              {apps.map(a => (
                <Card key={a.id} className="rounded-4xl border border-black/10 bg-white overflow-hidden">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-primary" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm">{a.event?.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{t('smmRoleN')}: {a.role?.name}{a.request?.title ? ` · ${t('smmPickRequest')}: ${a.request.title}` : ''}</p>
                      </div>
                      {statusBadge(a.status)}
                    </div>
                    {/* The structured запрос's steps — the customer (and the
                    specialist) see the whole step ladder with its answers */}
                    {(a.request?.steps || []).length > 0 && (
                      <div className="rounded-xl bg-muted/50 p-2.5 space-y-1">
                        {(a.request?.steps as any[] | undefined || []).map((s: any, i: number) => (
                          <div key={s.id} className="flex items-start gap-1.5 text-xs">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 ${(s.answer || '').trim() ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold truncate">{s.title}</p>
                              {(s.answer || '').trim() && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap line-clamp-2">{s.answer}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!a.request?.steps?.length && a.message && <p className="text-xs whitespace-pre-wrap rounded-xl bg-muted/50 p-2.5 line-clamp-3">{a.message}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── LIBRARY PAGES DOCK — the specialist's four page buttons ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <SmmSpecialistDock
            lang={lang}
            active="inbox"
            gotoLibrary={gotoLibrary}
            gotoInbox={() => { /* already here */ }}
            gotoRequests={gotoRequests}
          />
        </div>
      </div>
    </div>
  );
}
