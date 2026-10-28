'use client';

// ---------------------------------------------------------------------------
// SMM FLOWS — the two request screens styled like the test-taking page
// (same 56px top-panel contract, card feed, bottom action bar):
//
//   SmmApplyView  («Подать заявку», the specialist): NO qualification tests
//     anymore — the specialist attaches a LINK to their ad post/video
//     (Instagram / TikTok / YouTube / Telegram — the platform the order's
//     ТЗ names). The link lands in the заявка AND in the direct chat with
//     the customer (the chat during the task execution stays).
//
//   SmmInviteView («Пригласить на мероприятие», the customer): the chosen
//     ROLE card + the chosen EVENT card + the estimated amount, then the
//     bottom bar «Подтвердить отправку запроса».
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { adUrlOk, normalizeAdUrl } from '@/lib/ad-url';
import { tUI } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session-store';
import { useNavStore } from '@/stores/nav-store';
import { useSmmStore } from '@/stores/smm-store';
import { Check, Link2, Loader2, MapPin, Users } from 'lucide-react';
import { EditorShell } from './smm-editors';
import type { SmmEventT, SmmPostT } from '@/lib/app-types';

function useT() {
  const lang = useSessionStore(s => s.lang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  const t = (key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars);
  return { t, lang, cycleLang };
}

// The platform the ТЗ names — the hint under the link input. The event's
// `platform` field is the direct source; the биржа category fills the gap.
function platformHint(ev: SmmEventT | null): string {
  if (!ev) return '';
  const p = (ev as any).platform as string || '';
  if (p) return p.charAt(0).toUpperCase() + p.slice(1);
  switch ((ev as any).category) {
    case 'instagram': return 'Instagram';
    case 'reels': return 'Instagram Reels';
    case 'hotel-review': return 'Instagram / YouTube';
    case 'photo': return 'Instagram';
    case 'content-plan': return 'Instagram / Telegram';
    case 'blogger-tour': return 'Instagram Reels / TikTok';
    default: return 'Instagram';
  }
}

// ── ЗАЯВКА (the specialist applies) ─────────────────────────────────────────

export function SmmApplyView() {
  const { t, lang, cycleLang } = useT();
  const setPage = useNavStore(s => s.setPage);
  const applyCtx = useSmmStore(s => s.applyCtx);
  const [event, setEvent] = useState<SmmEventT | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // ЗАЯВКА БЕЗ ТЕСТА: the ad link (required) + an optional comment
  const [proofUrl, setProofUrl] = useState('');
  const [proofNote, setProofNote] = useState('');
  // ── ВЫБОР ПОСТА: the заявка carries the post the specialist picks — its
  // «Ожидаемые результаты» cards become the customer's task list on accept.
  const [myPosts, setMyPosts] = useState<SmmPostT[]>([]);
  const [postId, setPostId] = useState<string | null>(null);

  const back = () => {
    useSmmStore.setState({ applyCtx: null });
    setPage('dashboard');
  };

  useEffect(() => {
    if (!applyCtx) { setPage('dashboard'); return; }
    let alive = true;
    setLoading(true);
    api.getEvent(applyCtx.eventId).then((res: any) => {
      if (!alive) return;
      setEvent(res?.event || null);
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    // the post picker data: the specialist's own posts (one per role) —
    // the first post pre-picks itself so the button never sits dead
    api.getPosts('mine').then((r: any) => {
      if (!alive) return;
      const items: SmmPostT[] = r.items || [];
      setMyPosts(items);
      const pre = items.find(p => p.roleId === applyCtx.roleId) || items[0] || null;
      setPostId(pre?.id || null);
    }).catch(() => { if (alive) setMyPosts([]); });
    return () => { alive = false; };
  }, [applyCtx, setPage]);

  const pickedPost = useMemo(() => myPosts.find(p => p.id === postId) || null, [myPosts, postId]);

  // The link is normalized (t.me/…, instagram.com/…, @handle all work) and
  // the send button is NEVER silently dead: an invalid link now always gives
  // feedback — the toast + the inline hint under the input (27.10 fix).
  // With a ПОСТ picked the link turns OPTIONAL — the post itself is the
  // заявка's proof of work.
  const linkOk = adUrlOk(proofUrl);

  const confirm = async () => {
    if (!applyCtx) return;
    if (myPosts.length > 0 && !pickedPost) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmPickPost') })); return; }
    if (!pickedPost && !linkOk) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmApplyNeedLink') })); return; }
    setSending(true);
    try {
      await api.createApplication({
        eventId: applyCtx.eventId,
        roleId: pickedPost?.roleId || applyCtx.roleId,
        postId: pickedPost?.id || undefined,
        proofUrl: proofUrl.trim() ? normalizeAdUrl(proofUrl) : '',
        proofNote: proofNote.trim(),
      });
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmApplySent') }));
      useSmmStore.setState((s: any) => ({ applyCtx: null, refreshNonce: (s.refreshNonce || 0) + 1 }));
      setPage('dashboard');
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message || 'Error' }));
    } finally {
      setSending(false);
    }
  };

  const plat = useMemo(() => platformHint(event), [event]);

  return (
    <EditorShell title={t('smmApplyTitle')} onBack={back} lang={lang} cycleLang={cycleLang}
      saveLabel={t('smmApplyConfirm')}
      onSave={() => { void confirm(); }}
      saving={sending}>
      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-10"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>
      ) : (
        <>
          {event && (
            <Card className="rounded-4xl border border-black bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">{t('smmEvent')}</p>
                <p className="text-lg font-bold">{event.title}</p>
                <div className="flex flex-wrap gap-1.5 mt-2 text-xs text-muted-foreground">
                  {event.format === 'offline' && event.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {event.location}</span>}
                  {event.timeAt && <span>· {event.timeAt}</span>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── ВЫБОР ПОСТА: the заявка carries the picked post — the card
          list shows every own post (role name + description + the result
          cards count); the picked post's cards become the customer's tasks */}
          <Card className="rounded-4xl border border-black bg-white">
            <CardContent className="p-4 space-y-2.5">
              <div>
                <Label className="text-sm font-bold">{t('smmPickPost')}</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t('smmPickPostHint')}</p>
              </div>
              {myPosts.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">{t('smmApplyNeedRole')}</p>
              )}
              <div className="flex flex-col gap-1.5">
                {myPosts.map(p => {
                  const active = p.id === postId;
                  const taskN = Array.isArray((p as any).tasks) ? (p as any).tasks.length : 0;
                  return (
                    <button key={p.id} type="button" onClick={() => setPostId(p.id)}
                      className={`w-full text-left rounded-2xl border-2 p-3 transition-colors ${active ? 'border-cta bg-[#FFF7ED]' : 'border-black/15 bg-white hover:border-black/40'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-cta bg-cta' : 'border-black/25 bg-white'}`}>
                          {active && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="text-sm font-bold truncate">{p.role?.name || t('smmPost')}</span>
                        {taskN > 0 && (
                          <span className="ml-auto shrink-0 h-5 px-1.5 rounded-full bg-cta text-white text-[10px] font-bold flex items-center justify-center">{taskN}</span>
                        )}
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── THE AD LINK — the заявка's core (no tests anymore): the
          specialist proves their work with a link to a REAL post/video that
          contains the ad; the platform follows the order's ТЗ. With a ПОСТ
          picked the link turns OPTIONAL. */}
          <Card className="rounded-4xl border-2 border-cta bg-white">
            <CardContent className="p-4 space-y-3">
              <div>
                <Label className="text-sm font-bold flex items-center gap-1.5"><Link2 className="w-4 h-4 text-cta" /> {pickedPost ? t('smmApplyLinkOptional') : t('smmApplyLink')}</Label>
                <p className="text-[11px] text-muted-foreground mt-1">{t('smmApplyLinkHint')}</p>
              </div>
              <Input
                value={proofUrl}
                onChange={e => setProofUrl(e.target.value)}
                placeholder={t('smmApplyLinkPh')}
                inputMode="url"
                className="h-11 rounded-2xl border-black/20 bg-white text-sm"
              />
              {proofUrl.trim() !== '' && !linkOk && (
                <p className="text-xs font-bold text-red-500">{t('smmApplyLinkBad')}</p>
              )}
              <div>
                <Label className="text-sm font-bold">{t('smmApplyNote')}</Label>
                <Textarea
                  value={proofNote}
                  onChange={e => setProofNote(e.target.value)}
                  placeholder={t('smmApplyNotePh')}
                  maxLength={1000}
                  className="rounded-2xl border-black/20 bg-white min-h-16"
                />
              </div>
              {plat && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold">{plat}</span> · {t('smmApplyLinkHint')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* монетизация MVP: the commission is shown BEFORE the send — no
          surprises after the deal (billing comes later; today it is info-only) */}
          <p className="text-[11px] text-muted-foreground text-center px-4">{t('commissionNote')}</p>
        </>
      )}
    </EditorShell>
  );
}

// ── ПРИГЛАШЕНИЕ (the customer invites) ──────────────────────────────────────

export function SmmInviteView() {
  const { t, lang, cycleLang } = useT();
  const setPage = useNavStore(s => s.setPage);
  const inviteCtx = useSmmStore(s => s.inviteCtx);
  const [sending, setSending] = useState(false);
  // «Выбрать другую роль» mode: the chat's cancel flow lands here with the
  // specialist's role CHIPS and no pre-picked role — confirm waits for a pick.
  const [pickedRoleId, setPickedRoleId] = useState<string | null>(inviteCtx?.roleId || null);
  // ── ВЫБОР МЕРОПРИЯТИЯ: the окно выбора мероприятия — the customer picks
  // which of THEIR events the invitation is sent for (the picked event is
  // used in the chat's ПРИГЛАШЕНИЕ# message).
  const [myEvents, setMyEvents] = useState<SmmEventT[]>([]);
  const [pickedEventId, setPickedEventId] = useState<string | null>(inviteCtx?.eventId || null);
  useEffect(() => {
    api.getEvents('mine').then((r: any) => {
      const items: SmmEventT[] = r.items || [];
      setMyEvents(items);
      // heal a stale pick (deleted event / old session) — the first own event
      setPickedEventId(cur => (cur && items.some(e => e.id === cur) ? cur : (items[0]?.id || null)));
    }).catch(() => setMyEvents([]));
  }, []);
  const pickedEvent = useMemo(
    () => myEvents.find(e => e.id === pickedEventId) || myEvents.find(e => e.id === inviteCtx?.eventId) || null,
    [myEvents, pickedEventId, inviteCtx?.eventId]
  );
  const roleChips = inviteCtx?.roles && inviteCtx.roles.length > 1 ? inviteCtx.roles : null;
  const pickedRole = roleChips?.find(r => r.id === pickedRoleId) || null;
  const effFormat: 'online' | 'offline' = (pickedEvent?.format || inviteCtx?.eventFormat || 'online') === 'offline' ? 'offline' : 'online';
  const estimate = pickedRole
    ? (effFormat === 'online' ? pickedRole.pricePerK : pickedRole.pricePerDay)
    : (inviteCtx ? (effFormat === 'online' ? inviteCtx.pricePerK : inviteCtx.pricePerDay) : null);

  const back = () => {
    useSmmStore.setState({ inviteCtx: null });
    setPage('dashboard');
  };

  if (!inviteCtx) {
    return (
      <EditorShell title={t('smmInviteTitle')} onBack={back} lang={lang} cycleLang={cycleLang}
        saveLabel={t('smmInviteConfirm')} onSave={() => setPage('dashboard')} saving={false} saveDisabled>
        <p className="text-sm text-muted-foreground text-center py-10">—</p>
      </EditorShell>
    );
  }

  const confirm = async () => {
    if (roleChips && !pickedRoleId) return;
    const evId = pickedEvent?.id || inviteCtx.eventId;
    if (!evId) return;
    setSending(true);
    try {
      await api.createInvitation({
        specialistId: inviteCtx.specialistId,
        eventId: evId,
        roleId: pickedRoleId || inviteCtx.roleId,
        estimate,
      });
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmInviteSent') }));
      useSmmStore.setState((s: any) => ({ inviteCtx: null, refreshNonce: (s.refreshNonce || 0) + 1 }));
      setPage('dashboard');
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message || 'Error' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <EditorShell title={t('smmInviteTitle')} onBack={back} lang={lang} cycleLang={cycleLang}
      saveLabel={t('smmInviteConfirm')} onSave={confirm} saving={sending} saveDisabled={sending || (roleChips ? !pickedRoleId : !inviteCtx.roleId)}>
      {/* ── ОКНО ВЫБОРА МЕРОПРИЯТИЯ: the customer's own events — the picked
      event is the one the chat's ПРИГЛАШЕНИЕ message carries */}
      <Card className="rounded-4xl border border-black bg-white">
        <CardContent className="p-4 space-y-2.5">
          <div>
            <Label className="text-sm font-bold">{t('smmInvitePickEvent')}</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t('smmTasksHintEvent')}</p>
          </div>
          {myEvents.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">{t('smmInviteNoEvent')}</p>
          )}
          <div className="flex flex-col gap-1.5">
            {myEvents.map(ev => {
              const active = ev.id === pickedEvent?.id;
              return (
                <button key={ev.id} type="button" onClick={() => setPickedEventId(ev.id)}
                  className={`w-full text-left rounded-2xl border-2 p-3 transition-colors ${active ? 'border-cta bg-[#FFF7ED]' : 'border-black/15 bg-white hover:border-black/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-cta bg-cta' : 'border-black/25 bg-white'}`}>
                      {active && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="text-sm font-bold truncate">{ev.title}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-muted-foreground">
                    {ev.format === 'offline' && ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.location}</span>}
                    {ev.timeAt && <span>· {ev.timeAt}</span>}
                    {Number((ev as any).peopleRequired) > 0 && (
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t('smmPeopleRequired')}: {(ev as any).peopleRequired}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {/* THE ROLE CHIPS («Выбрать другую роль»): switch the role the invite
      is sent for — the confirm sends the picked role */}
      {roleChips && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-muted-foreground uppercase">{t('smmInvitePickRole')}</p>
          <div className="flex flex-wrap gap-1.5">
            {roleChips.map(r => (
              <button key={r.id} type="button" onClick={() => setPickedRoleId(r.id)}
                className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-colors ${pickedRoleId === r.id ? 'bg-cta text-white border-cta' : 'border-black bg-white hover:bg-muted/50'}`}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* the chosen ROLE card (created by the specialist) — name + specialist
      only: the price lines are GONE (the user's cut) */}
      <Card className="rounded-4xl border border-black bg-white overflow-hidden">
        <div className="h-2 bg-[#FFE3D6]" />
        <CardContent className="p-4">
          <p className="text-[11px] font-bold text-muted-foreground uppercase">{t('smmPostRole')}</p>
          <p className="text-lg font-bold">{pickedRole ? pickedRole.name : inviteCtx.roleName || '—'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{inviteCtx.specialistName}</p>
        </CardContent>
      </Card>
    </EditorShell>
  );
}
