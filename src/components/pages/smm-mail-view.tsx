'use client';

import React from 'react';
import {
  ArrowLeft, Banknote, Briefcase, CalendarClock, CheckCircle2, Compass,
  FileText, Inbox, Library, Loader2, Megaphone, Pencil, Search, Send, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import LangButton from '@/components/lang-button';
import SmmRoleButton from '@/components/smm-role-button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';
import { tUI, type Lang } from '@/lib/i18n';
import { SmmCustomerDock, SmmSpecialistDock } from '@/components/pages/smm-roles-view-dock';

/**
 * SMM MAIL — «Почта», the shared requests hub for BOTH account kinds. It
 * replaces the specialist-only invitations page: the bottom dock button
 * «Приглашения» becomes «Почта». The page carries the uniform top panel
 * (back · «Изменить» · search · language · ACCOUNT SWITCH · profile) and
 * TWO bottom panels — the page's own sub-dock ABOVE the main dock with the
 * two page buttons «Принятые запросы» | «Отправленные запросы», exactly the
 * pattern the brief describes.
 *
 * Boxes (role-aware):
 *   received — the specialist sees the customers' INVITATIONS (accept/decline),
 *              the customer sees the specialists' APPLICATIONS to their events;
 *   sent     — the specialist tracks their applications, the customer their
 *              invitations. In «Изменить» edit mode every still-pending sent
 *              request can be re-edited (message) or withdrawn entirely.
 */

type Seg = 'received' | 'sent';

export interface SmmMailViewProps {
  user: { id: string; name: string; email: string; image?: string | null } | null;
  myAvatar: string | null;
  mySmmRole: 'customer' | 'specialist';
  goHome: () => void;
  onOpenProfilePage: () => void;
  onCycleLang: () => void;
  onSwitchRole: () => void;
  // The uniform page-tab docks (customer: Мероприятия | Личные роли |
  // Общие роли | Почта; specialist: the four library/requests tabs)
  gotoEvents: () => void;
  gotoRoles: (scope: 'mine' | 'public') => void;
  gotoLibrary: (scope: 'mine' | 'discover') => void;
  gotoInbox: () => void;
  gotoRequests: () => void;
  // Tap an event name on a card → the events page focused on that event
  onOpenEvent?: (eventId: string) => void;
}

export default function SmmMailView({
  user, myAvatar, mySmmRole, goHome, onOpenProfilePage, onCycleLang, onSwitchRole,
  gotoEvents, gotoRoles, gotoLibrary, gotoInbox, gotoRequests, onOpenEvent,
}: SmmMailViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const [seg, setSeg] = React.useState<Seg>('received');
  const [invites, setInvites] = React.useState<any[]>([]);
  const [apps, setApps] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  // «Изменить» edit mode — pending SENT requests become editable/withdrawable
  const [editMode, setEditMode] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState('');
  const [withdrawId, setWithdrawId] = React.useState<string | null>(null);
  // Search over the current box (event / role / counterparty names)
  const [searchMounted, setSearchMounted] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [inv, ap] = await Promise.all([
        mySmmRole === 'specialist' ? api.getSmmInvitations('inbox') : api.getSmmApplications('inbox'),
        mySmmRole === 'specialist' ? api.getSmmApplications('sent') : api.getSmmInvitations('sent'),
      ]);
      setInvites(mySmmRole === 'specialist' ? inv : ap); // customer's received = applications
      setApps(mySmmRole === 'specialist' ? ap : inv);    // customer's sent = invitations
    } catch { /* transient */ }
    setLoading(false);
  }, [mySmmRole]);

  React.useEffect(() => { void load(); }, [load]);

  const respondInv = async (id: string, action: 'accept' | 'decline') => {
    setBusy(true);
    try {
      await api.respondSmmInvitation(id, action);
      await load();
    } catch { /* transient */ }
    setBusy(false);
  };
  const respondApp = async (id: string, action: 'accept' | 'decline') => {
    setBusy(true);
    try {
      await api.respondSmmApplication(id, action);
      await load();
    } catch { /* transient */ }
    setBusy(false);
  };

  const saveMessage = async (kind: 'invitation' | 'application', id: string) => {
    setBusy(true);
    try {
      if (kind === 'invitation') await api.updateSmmInvitation(id, editText);
      else await api.updateSmmApplication(id, editText);
      setInvites(prev => prev.map(x => (x.id === id ? { ...x, message: editText } : x)));
      setApps(prev => prev.map(x => (x.id === id ? { ...x, message: editText } : x)));
      setEditingId(null);
      // toast-less inline feedback: the badge re-renders from state
    } catch { /* transient */ }
    setBusy(false);
  };

  const doWithdraw = async () => {
    if (!withdrawId) return;
    setBusy(true);
    try {
      // withdrawId carries the kind prefix to hit the right endpoint
      const [kind, id] = withdrawId.split(':') as ['invitation' | 'application', string];
      if (kind === 'invitation') await api.withdrawSmmInvitation(id);
      else await api.withdrawSmmApplication(id);
      setInvites(prev => prev.filter(x => x.id !== id));
      setApps(prev => prev.filter(x => x.id !== id));
    } catch { /* transient */ }
    setWithdrawId(null);
    setBusy(false);
  };

  const statusBadge = (status: string) => (
    <Badge className={`rounded-full shrink-0 ${status === 'accepted' ? 'bg-emerald-500' : status === 'declined' ? 'bg-red-500' : 'bg-amber-500'}`}>{t(`smmStatus_${status}`)}</Badge>
  );

  const matches = (x: any) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [x.event?.title, x.role?.name, x.customer?.name, x.specialist?.name, x.message]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  };

  const received = (mySmmRole === 'specialist' ? invites : apps).filter(matches);
  const sent = (mySmmRole === 'specialist' ? apps : invites).filter(matches);
  const pendingN = (mySmmRole === 'specialist' ? invites : apps).filter(x => x.status === 'pending').length;
  const userInitials = (user?.name || '?').trim().slice(0, 2).toUpperCase() || '?';

  const sentCard = (x: any) => {
    const kind: 'invitation' | 'application' = mySmmRole === 'customer' ? 'invitation' : 'application';
    const editable = editMode && x.status === 'pending';
    const counterparty = mySmmRole === 'customer' ? x.specialist?.name : x.customer?.name;
    return (
      <Card key={x.id} className="rounded-4xl border border-black/10 bg-white overflow-hidden">
        <CardContent className="p-5 space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-primary" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm truncate">{x.event?.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {t('smmRoleN')}: {x.role?.name}{counterparty ? ` · ${counterparty}` : ''}
              </p>
            </div>
            {statusBadge(x.status)}
          </div>
          {editingId === x.id ? (
            <div className="space-y-2">
              <Textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)} rows={3} maxLength={8000} className="rounded-2xl border-black/15 bg-white" placeholder={t('smmRoleBriefPlaceholder')} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void saveMessage(kind, x.id)} disabled={busy} className="flex-1 rounded-full bg-cta hover:bg-cta/90 text-white">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> {t('save')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditText(''); }} disabled={busy} className="flex-1 rounded-full">{t('cancel')}</Button>
              </div>
            </div>
          ) : (
            (x.message || x.role?.brief) && (
              <div className="rounded-xl bg-muted/50 p-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{t('smmRoleBriefTemplate')}</p>
                <p className="text-xs whitespace-pre-wrap line-clamp-4">{x.message || x.role?.brief}</p>
              </div>
            )
          )}
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {x.role?.payment && <span className="inline-flex items-center gap-1"><Banknote className="w-3 h-3" />{x.role.payment}</span>}
            {x.role?.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{x.role.deadline}</span>}
          </div>
          {editable && editingId !== x.id && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => { setEditingId(x.id); setEditText(x.message || ''); }} disabled={busy} className="flex-1 rounded-full">
                <Pencil className="w-4 h-4 mr-1" /> {t('gEdit')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setWithdrawId(`${kind}:${x.id}`)} disabled={busy} className="rounded-full border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0">
                <Trash2 className="w-4 h-4 mr-1" /> {t('smmWithdraw')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const receivedCard = (x: any) => {
    const isInvitation = mySmmRole === 'specialist';
    const from = isInvitation ? x.customer : x.specialist;
    return (
      <Card key={x.id} className="rounded-4xl border border-black bg-white overflow-hidden">
        <CardContent className="p-5 space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="w-9 h-9 rounded-xl bg-cta flex items-center justify-center shrink-0">
              {isInvitation ? <Megaphone className="w-4 h-4 text-white" /> : <UserPlus className="w-4 h-4 text-white" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm truncate">
                {x.event?.title && onOpenEvent ? (
                  <button type="button" onClick={() => onOpenEvent(x.eventId)} className="hover:underline text-left">{x.event.title}</button>
                ) : x.event?.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {t('smmRoleN')}: {x.role?.name}{from?.name ? ` · ${from.name}` : ''}
              </p>
            </div>
            {statusBadge(x.status)}
          </div>
          {(x.message || x.role?.brief) && (
            <div className="rounded-xl bg-muted/50 p-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{t('smmRoleBriefTemplate')}</p>
              <p className="text-xs whitespace-pre-wrap line-clamp-4">{x.message || x.role?.brief}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {x.role?.payment && <span className="inline-flex items-center gap-1"><Banknote className="w-3 h-3" />{x.role.payment}</span>}
            {x.role?.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{x.role.deadline}</span>}
          </div>
          {x.status === 'pending' && (
            <div className="flex gap-2 pt-1">
              {isInvitation ? (
                <>
                  <Button size="sm" onClick={() => void respondInv(x.id, 'accept')} disabled={busy} className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-600/90">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> {t('smmAccept')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void respondInv(x.id, 'decline')} disabled={busy} className="flex-1 rounded-full">
                    <X className="w-4 h-4 mr-1" /> {t('smmDecline')}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => void respondApp(x.id, 'accept')} disabled={busy} className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-600/90">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> {t('smmAccept')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void respondApp(x.id, 'decline')} disabled={busy} className="flex-1 rounded-full">
                    <X className="w-4 h-4 mr-1" /> {t('smmDecline')}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const dockBtn = 'min-w-0 flex items-center justify-center gap-1.5 h-9 lg:h-10 px-1 [@media(min-width:420px)]:px-2 rounded-full border-2 text-[11px] [@media(min-width:420px)]:text-xs sm:text-[13px] lg:text-sm font-semibold transition-colors';

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* ── TOP PANEL — the uniform 56px contract: back · «Изменить» · search ·
          language · ACCOUNT SWITCH · profile. No «+»: nothing is created in
          the mail. ── */}
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
            {/* «Изменить» — the returned edit toggle: in edit mode the pending
            SENT requests reveal edit / withdraw actions. */}
            <Button
              variant="outline"
              onClick={() => setEditMode(v => !v)}
              className={`rounded-full shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 lg:h-10 lg:text-sm ${editMode ? 'bg-cta hover:bg-cta/90 text-white border-cta' : 'border-black'}`}
              title={t('smmEditMailHint')}
              aria-label={t('editTest')}
            >
              <Pencil className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">{editMode ? t('editModeOn') : t('editTest')}</span>
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
            <LangButton lang={lang as Lang} onChange={onCycleLang} className="border-black px-2 sm:px-3" />
            <SmmRoleButton role={mySmmRole} onSwitch={onSwitchRole} className="border-black px-2 sm:px-3" />
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

      {/* ── CONTENT ── */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="max-w-2xl lg:max-w-3xl w-full mx-auto px-4 py-5 space-y-4">
          {editMode && (
            <p className="text-xs text-muted-foreground text-center">{t('smmEditMailHint')}</p>
          )}
          {loading && <p className="text-sm text-muted-foreground text-center py-10">{t('loading')}</p>}

          {!loading && seg === 'received' && (
            <div className="space-y-3">
              {received.length === 0 && (
                <Card className="rounded-4xl border border-black bg-white">
                  <CardContent className="p-8 text-center space-y-3">
                    <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center"><Inbox className="w-7 h-7 text-muted-foreground" /></div>
                    <p className="font-bold">{t('smmMailReceivedEmpty')}</p>
                    <p className="text-sm text-muted-foreground">{t('smmMailReceivedHint')}</p>
                  </CardContent>
                </Card>
              )}
              {received.map((x: any) => receivedCard(x))}
            </div>
          )}

          {!loading && seg === 'sent' && (
            <div className="space-y-3">
              {sent.length === 0 && (
                <Card className="rounded-4xl border border-black bg-white">
                  <CardContent className="p-8 text-center space-y-3">
                    <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center"><Send className="w-7 h-7 text-muted-foreground" /></div>
                    <p className="font-bold">{t('smmMailSentEmpty')}</p>
                    <p className="text-sm text-muted-foreground">{t('smmMailSentHint')}</p>
                  </CardContent>
                </Card>
              )}
              {sent.map((x: any) => sentCard(x))}
            </div>
          )}

          {busy && <Loader2 className="w-4 h-4 animate-spin mx-auto" />}
        </div>
      </main>

      {/* ── THE MAIL SUB-DOCK — the NEW bottom panel that appears ON TOP of
      the current one: two page buttons, «Принятые запросы» | «Отправленные
      запросы» ── */}
      <div className="desktop-dock-raised shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 pb-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSeg('received')} className={`${dockBtn} ${seg === 'received' ? 'bg-cta text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`} title={t('smmSegReceived')}>
              <Inbox className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('smmSegReceived')}{pendingN > 0 && seg !== 'received' ? ` (${pendingN})` : ''}</span>
            </button>
            <button type="button" onClick={() => setSeg('sent')} className={`${dockBtn} ${seg === 'sent' ? 'bg-cta text-white border-cta shadow-md' : 'border-black bg-white hover:bg-muted/50'}`} title={t('smmSegSent')}>
              <Send className="w-4 h-4 shrink-0 [@media(max-width:479px)]:hidden" />
              <span className="min-w-0 truncate">{t('smmSegSent')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN DOCK — the page-tab dock every page carries (one tap = one
          page): the customer's Мероприятия | Личные роли | Общие роли |
          Почта (this page, active) — the specialist gets the library/requests
          tabs (this page ≈ «Принятые запросы») ── */}
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-3 sm:px-4 pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          {mySmmRole === 'customer' ? (
            <SmmCustomerDock
              lang={lang}
              active="mail"
              gotoEvents={gotoEvents}
              gotoRoles={gotoRoles}
              gotoMail={() => { /* already here */ }}
            />
          ) : (
            <SmmSpecialistDock
              lang={lang}
              active="inbox"
              gotoLibrary={gotoLibrary}
              gotoInbox={() => { /* already here */ }}
              gotoRequests={gotoRequests}
            />
          )}
        </div>
      </div>

      <AlertDialog open={!!withdrawId} onOpenChange={() => setWithdrawId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('smmWithdrawQ')}</AlertDialogTitle>
            <AlertDialogDescription>{t('smmWithdrawWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doWithdraw} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('smmWithdraw')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
