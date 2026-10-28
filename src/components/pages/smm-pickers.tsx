'use client';

// ---------------------------------------------------------------------------
// SMM PICKERS — the two ОКНА ВЫБОРА the bottom-panel buttons open (NO page
// navigation — a floating window over the current view):
//
//   SmmInviteWindow («Пригласить на мероприятие», the customer): the EVENT
//     picker (their own заказы) + the SPECIALIST picker (the invite target —
//     pre-picked from context when the customer came from a specialist's
//     card/profile/chat) + the role chips + the estimate → the
//     ПРИГЛАШЕНИЕ#id message lands in the direct chat.
//
//   SmmApplyWindow («Подать запрос», the specialist): the ORDER picker (the
//     active foreign заказ pre-picked; a chat context lists THE PEER's
//     orders) + the POST picker (their own посты — the picked post's result
//     cards become the customer's task list on accept) + the optional ad
//     link → the ЗАЯВКА#id message lands in the direct chat.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import { api } from '@/lib/api';
import { adUrlOk, normalizeAdUrl } from '@/lib/ad-url';
import { Check, Link2, Loader2, MapPin, Star, Users, X } from 'lucide-react';
import { fmtMoney } from './smm-bits';
import type { SmmEventT, SmmPostT, SmmSpecialistT } from '@/lib/app-types';

export interface PickerSp {
  id: string;
  name: string;
  roles: { id: string; name: string; pricePerK?: number | null; pricePerDay?: number | null }[];
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ── ПРИГЛАШЕНИЕ (the customer picks the event → the invite goes to the chat)
// ────────────────────────────────────────────────────────────────────────────

export function SmmInviteWindow({ open, onClose, t, sp, onSent }: {
  open: boolean;
  onClose: () => void;
  t: TFn;
  // the invite target from the context (specialist card / profile / chat
  // peer); null → the window shows the specialist picker
  sp: PickerSp | null;
  onSent: () => void;
}) {
  const [myEvents, setMyEvents] = useState<SmmEventT[]>([]);
  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [spCtx, setSpCtx] = useState<PickerSp | null>(sp);
  const [pickedSpId, setPickedSpId] = useState<string | null>(sp?.id || null);
  const [spList, setSpList] = useState<SmmSpecialistT[]>([]);
  const [pickedRoleId, setPickedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // (Re)load on every open: fresh заказы + fresh roles of the target — the
  // window never serves a stale pick from the previous open.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setSpCtx(sp);
    setPickedSpId(sp?.id || null);
    setPickedRoleId(null);
    api.getEvents('mine').then((r: any) => {
      if (!alive) return;
      const items: SmmEventT[] = r.items || [];
      setMyEvents(items);
      setPickedEventId(items[0]?.id || null);
    }).catch(() => { if (alive) setMyEvents([]); });
    if (sp?.id) {
      api.getSmmProfile(sp.id).then((p: any) => {
        if (!alive) return;
        const roles = (p?.user?.roles || []).map((r: any) => ({ id: r.id, name: r.name, pricePerK: r.pricePerK ?? null, pricePerDay: r.pricePerDay ?? null }));
        setSpCtx({ id: sp.id, name: p?.user?.name || sp.name, roles });
        setPickedSpId(sp.id);
        setPickedRoleId(roles[0]?.id || null);
      }).catch(() => { if (alive) setSpCtx(sp); }).finally(() => { if (alive) setLoading(false); });
    } else {
      // no target in sight — the specialist picker (the публичная's cards)
      api.getSpecialists().then((r: any) => {
        if (!alive) return;
        setSpList(r.items || []);
      }).catch(() => { if (alive) setSpList([]); }).finally(() => { if (alive) setLoading(false); });
    }
    return () => { alive = false; };
  }, [open, sp]);

  const pickedEvent = useMemo(() => myEvents.find(e => e.id === pickedEventId) || null, [myEvents, pickedEventId]);
  const roles = spCtx?.roles || [];
  const pickedRole = roles.find(r => r.id === pickedRoleId) || null;
  const effFormat: 'online' | 'offline' = pickedEvent?.format === 'offline' ? 'offline' : 'online';
  const estimate = pickedRole ? (effFormat === 'online' ? pickedRole.pricePerK : pickedRole.pricePerDay) : null;

  const pickSp = (s: SmmSpecialistT) => {
    setSpCtx({ id: s.id, name: s.name, roles: (s.roles || []).map(r => ({ id: r.id, name: r.name, pricePerK: r.pricePerK ?? null, pricePerDay: r.pricePerDay ?? null })) });
    setPickedSpId(s.id);
    setPickedRoleId(s.roles?.[0]?.id || null);
  };

  const confirm = async () => {
    if (!spCtx || !pickedEvent || !pickedRole) return;
    setSending(true);
    try {
      await api.createInvitation({ specialistId: spCtx.id, eventId: pickedEvent.id, roleId: pickedRole.id, estimate });
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmInviteSent') }));
      onSent();
      onClose();
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message || 'Error' }));
    } finally {
      setSending(false);
    }
  };

  const ready = !!pickedEvent && !!spCtx && !!pickedRole;

  return (
    <ResizableSheetFrame
      open={open}
      onClose={onClose}
      initialVh={0.85}
      minVh={0.4}
      maxW="max-w-2xl"
      header={
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-2xl bg-cta text-white flex items-center justify-center shrink-0"><Users className="w-4 h-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{t('smmInviteBtn')}</p>
              {spCtx && <p className="text-[11px] text-muted-foreground truncate">{spCtx.name}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onClose} aria-label={t('cancel')}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      }
      body={
        <div className="px-4 py-4">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {loading && <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>}
            {!loading && (
              <>
                {/* ── ВЫБОР МЕРОПРИЯТИЯ (the customer's own заказы) ── */}
                <div className="space-y-2">
                  <div>
                    <Label className="text-sm font-bold">{t('smmInvitePickEvent')}</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('smmTasksHintEvent')}</p>
                  </div>
                  {myEvents.length === 0 && <p className="text-xs text-muted-foreground py-2">{t('smmInviteNoEvent')}</p>}
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
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.format === 'online' ? t('smmFormatOnline') : ev.location || t('smmFormatOffline')}</span>
                            {ev.timeAt && <span>· {ev.timeAt}</span>}
                            {Number((ev as any).peopleRequired) > 0 && (
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t('smmPeopleRequired')}: {(ev as any).peopleRequired}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── СПЕЦИАЛИСТ: the context target, or the picker ── */}
                {!spCtx && (
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">{t('smmPickPickSp')}</Label>
                    {spList.length === 0 && <p className="text-xs text-muted-foreground py-2">{t('smmPickSpEmpty')}</p>}
                    <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                      {spList.map(s => {
                        const active = s.id === pickedSpId;
                        return (
                          <button key={s.id} type="button" onClick={() => pickSp(s)}
                            className={`w-full text-left rounded-2xl border-2 p-3 transition-colors ${active ? 'border-cta bg-[#FFF7ED]' : 'border-black/15 bg-white hover:border-black/40'}`}>
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-cta bg-cta' : 'border-black/25 bg-white'}`}>
                                {active && <Check className="w-3 h-3 text-white" />}
                              </span>
                              <span className="text-sm font-bold truncate">{s.name}</span>
                              <span className="ml-auto shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> {s.rating > 0 ? s.rating.toFixed(1) : '—'}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{(s.roles || []).map(r => r.name).join(' · ') || '—'}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {spCtx && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">{t('smmPickSp')}</p>
                    <div className="rounded-2xl border-2 border-cta bg-[#FFF7ED] p-3">
                      <p className="text-sm font-bold">{spCtx.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {roles.length === 0 && <p className="text-xs text-muted-foreground">{t('smmInviteNoRoles')}</p>}
                        {roles.map(r => (
                          <button key={r.id} type="button" onClick={() => setPickedRoleId(r.id)}
                            className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-colors ${pickedRoleId === r.id ? 'bg-cta text-white border-cta' : 'border-black bg-white hover:bg-muted/50'}`}>
                            {r.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* the estimate — the picked role's price for the event's format */}
                <div className="rounded-4xl border-2 border-cta bg-white p-4 text-center">
                  <p className="text-sm font-bold">{t('smmEstimate')}</p>
                  <p className="text-3xl font-extrabold text-cta mt-1">{estimate != null ? fmtMoney(estimate) : '—'}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{effFormat === 'online' ? t('smmEstimateOnline') : t('smmEstimateOffline')}</p>
                </div>
                <p className="text-[11px] text-muted-foreground text-center px-2">{t('commissionNote')}</p>
              </>
            )}
          </div>
        </div>
      }
      footer={
        <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button onClick={() => { void confirm(); }} disabled={!ready || sending} className="w-full h-10 rounded-full bg-cta hover:bg-cta/90 text-white">
            {sending ? t('sending') : t('smmInviteConfirm')}
          </Button>
        </div>
      }
    />
  );
}

// ── ЗАЯВКА (the specialist picks the post → the заявка goes to the chat) ────

export function SmmApplyWindow({ open, onClose, t, peerId, preEventId, preRoleId, onSent }: {
  open: boolean;
  onClose: () => void;
  t: TFn;
  // the CHAT context: the peer customer — the order picker lists THEIR
  // orders; null → the picker lists the public orders (the active foreign
  // one arrives pre-picked through preEventId)
  peerId: string | null;
  preEventId: string | null;
  // the role picked by the chips on the active заказ card — the matching
  // post (the specialist has one post per role) pre-picks itself
  preRoleId?: string | null;
  onSent: () => void;
}) {
  const [events, setEvents] = useState<SmmEventT[]>([]);
  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [myPosts, setMyPosts] = useState<SmmPostT[]>([]);
  const [pickedPostId, setPickedPostId] = useState<string | null>(null);
  const [fallbackRoleId, setFallbackRoleId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setProofUrl(''); setProofNote('');
    const eventsP = peerId
      ? api.getSmmProfile(peerId).then((p: any) => (p?.events || []) as SmmEventT[]).catch(() => [] as SmmEventT[])
      : api.getEvents('public').then((r: any) => (r.items || []) as SmmEventT[]).catch(() => [] as SmmEventT[]);
    eventsP.then(items => {
      if (!alive) return;
      setEvents(items);
      setPickedEventId((preEventId && items.some(e => e.id === preEventId) ? preEventId : (items[0]?.id || null)));
    });
    Promise.all([
      api.getPosts('mine').then((r: any) => (r.items || []) as SmmPostT[]).catch(() => [] as SmmPostT[]),
      api.getMyRoles().then((r: any) => (r.items || []) as { id: string; name: string }[]).catch(() => []),
    ]).then(([posts, roles]) => {
      if (!alive) return;
      setMyPosts(posts);
      // the card's role chips carry over: the post of THAT role pre-picks
      const pre = (preRoleId && posts.find(p => p.roleId === preRoleId)) || posts[0] || null;
      setPickedPostId(pre?.id || null);
      setFallbackRoleId(roles[0]?.id || null);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, peerId, preEventId]);

  const pickedEvent = useMemo(() => events.find(e => e.id === pickedEventId) || null, [events, pickedEventId]);
  const pickedPost = useMemo(() => myPosts.find(p => p.id === pickedPostId) || null, [myPosts, pickedPostId]);
  // With a ПОСТ picked the link turns OPTIONAL — the post itself is the
  // заявка's proof of work.
  const linkOk = adUrlOk(proofUrl);

  const confirm = async () => {
    if (!pickedEvent) return;
    if (myPosts.length > 0 && !pickedPost) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmPickPost') })); return; }
    if (!pickedPost && !linkOk) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmApplyNeedLink') })); return; }
    const roleId = pickedPost?.roleId || fallbackRoleId;
    if (!roleId) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmApplyNeedRole') })); return; }
    setSending(true);
    try {
      await api.createApplication({
        eventId: pickedEvent.id,
        roleId,
        postId: pickedPost?.id || undefined,
        proofUrl: proofUrl.trim() ? normalizeAdUrl(proofUrl) : '',
        proofNote: proofNote.trim(),
      });
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmApplySent') }));
      onSent();
      onClose();
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message || 'Error' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <ResizableSheetFrame
      open={open}
      onClose={onClose}
      initialVh={0.85}
      minVh={0.4}
      maxW="max-w-2xl"
      header={
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-2xl bg-cta text-white flex items-center justify-center shrink-0"><Link2 className="w-4 h-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{t('smmApplyBtn')}</p>
              {pickedEvent && <p className="text-[11px] text-muted-foreground truncate">{pickedEvent.title}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onClose} aria-label={t('cancel')}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      }
      body={
        <div className="px-4 py-4">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {loading && <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>}
            {!loading && (
              <>
                {/* ── ВЫБОР МЕРОПРИЯТИЯ (public orders / the chat peer's) ── */}
                <div className="space-y-2">
                  <Label className="text-sm font-bold">{t('smmEvent')}</Label>
                  {events.length === 0 && <p className="text-xs text-muted-foreground py-2">{t('smmApplyNoEvents')}</p>}
                  <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                    {events.map(ev => {
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
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.format === 'online' ? t('smmFormatOnline') : ev.location || t('smmFormatOffline')}</span>
                            {ev.timeAt && <span>· {ev.timeAt}</span>}
                            {Number((ev as any).peopleRequired) > 0 && (
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t('smmPeopleRequired')}: {(ev as any).peopleRequired}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── ВЫБОР ПОСТА: the заявка carries the picked post ── */}
                <div className="space-y-2">
                  <div>
                    <Label className="text-sm font-bold">{t('smmPickPost')}</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('smmPickPostHint')}</p>
                  </div>
                  {myPosts.length === 0 && <p className="text-xs text-muted-foreground py-2">{t('smmApplyNeedRole')}</p>}
                  <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                    {myPosts.map(p => {
                      const active = p.id === pickedPost?.id;
                      const taskN = Array.isArray((p as any).tasks) ? (p as any).tasks.length : 0;
                      return (
                        <button key={p.id} type="button" onClick={() => setPickedPostId(p.id)}
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
                </div>

                {/* ── THE AD LINK (optional with a post) + the note ── */}
                <div className="rounded-4xl border-2 border-cta bg-white p-4 space-y-3">
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
                </div>
                <p className="text-[11px] text-muted-foreground text-center px-2">{t('commissionNote')}</p>
              </>
            )}
          </div>
        </div>
      }
      footer={
        <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button onClick={() => { void confirm(); }} disabled={!pickedEvent || sending} className="w-full h-10 rounded-full bg-cta hover:bg-cta/90 text-white">
            {sending ? t('sending') : t('smmApplyConfirm')}
          </Button>
        </div>
      }
    />
  );
}
