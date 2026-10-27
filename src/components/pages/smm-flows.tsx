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
import { tUI } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session-store';
import { useNavStore } from '@/stores/nav-store';
import { useSmmStore } from '@/stores/smm-store';
import { Link2, Loader2, MapPin, Star } from 'lucide-react';
import { EditorShell } from './smm-editors';
import { fmtMoney } from './smm-bits';
import type { SmmEventT } from '@/lib/app-types';

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
    return () => { alive = false; };
  }, [applyCtx, setPage]);

  const linkOk = /^https?:\/\/\S+\.\S+/i.test(proofUrl.trim());

  const confirm = async () => {
    if (!applyCtx) return;
    if (!linkOk) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmApplyNeedLink') })); return; }
    setSending(true);
    try {
      await api.createApplication({
        eventId: applyCtx.eventId,
        roleId: applyCtx.roleId,
        proofUrl: proofUrl.trim(),
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
      saving={sending} saveDisabled={sending || !linkOk}>
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
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {event.format === 'online' ? t('smmFormatOnline') : event.location || t('smmFormatOffline')}</span>
                  {event.timeAt && <span>· {event.timeAt}</span>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── THE AD LINK — the заявка's core (no tests anymore): the
          specialist proves their work with a link to a REAL post/video that
          contains the ad; the platform follows the order's ТЗ ── */}
          <Card className="rounded-4xl border-2 border-cta bg-white">
            <CardContent className="p-4 space-y-3">
              <div>
                <Label className="text-sm font-bold flex items-center gap-1.5"><Link2 className="w-4 h-4 text-cta" /> {t('smmApplyLink')}</Label>
                <p className="text-[11px] text-muted-foreground mt-1">{t('smmApplyLinkHint')}</p>
              </div>
              <Input
                value={proofUrl}
                onChange={e => setProofUrl(e.target.value)}
                placeholder={t('smmApplyLinkPh')}
                inputMode="url"
                className="h-11 rounded-2xl border-black/20 bg-white text-sm"
              />
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

  const estimate = inviteCtx.eventFormat === 'online' ? inviteCtx.pricePerK : inviteCtx.pricePerDay;

  const confirm = async () => {
    setSending(true);
    try {
      await api.createInvitation({
        specialistId: inviteCtx.specialistId,
        eventId: inviteCtx.eventId,
        roleId: inviteCtx.roleId,
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
      saveLabel={t('smmInviteConfirm')} onSave={confirm} saving={sending} saveDisabled={sending}>
      {/* the chosen ROLE card (created by the specialist) */}
      <Card className="rounded-4xl border border-black bg-white overflow-hidden">
        <div className="h-2 bg-[#FFE3D6]" />
        <CardContent className="p-4">
          <p className="text-[11px] font-bold text-muted-foreground uppercase">{t('smmPostRole')}</p>
          <p className="text-lg font-bold">{inviteCtx.roleName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{inviteCtx.specialistName}</p>
          <div className="flex flex-col gap-1 mt-2 text-xs">
            {inviteCtx.pricePerK != null && (
              <p className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500" /> {t('smmEstimateOnline')}: {fmtMoney(inviteCtx.pricePerK)}</p>
            )}
            {inviteCtx.pricePerDay != null && (
              <p className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500" /> {t('smmEstimateOffline')}: {fmtMoney(inviteCtx.pricePerDay)}</p>
            )}
          </div>
        </CardContent>
      </Card>
      {/* the chosen EVENT card (created by the customer) */}
      <Card className="rounded-4xl border border-black bg-white overflow-hidden">
        <div className="h-2 bg-[#E3EEFF]" />
        <CardContent className="p-4">
          <p className="text-[11px] font-bold text-muted-foreground uppercase">{t('smmEvent')}</p>
          <p className="text-lg font-bold">{inviteCtx.eventTitle}</p>
        </CardContent>
      </Card>
      {/* the estimate */}
      <Card className="rounded-4xl border-2 border-cta bg-white">
        <CardContent className="p-4 text-center">
          <p className="text-sm font-bold">{t('smmEstimate')}</p>
          <p className="text-3xl font-extrabold text-cta mt-1">{estimate != null ? fmtMoney(estimate) : '—'}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {inviteCtx.eventFormat === 'online' ? t('smmEstimateOnline') : t('smmEstimateOffline')}
          </p>
        </CardContent>
      </Card>
      {/* монетизация MVP: the commission line — info-only today, billed when
      the platform-side payments land */}
      <p className="text-[11px] text-muted-foreground text-center px-4">{t('commissionNote')}</p>
    </EditorShell>
  );
}
