'use client';

// ---------------------------------------------------------------------------
// SMM FLOWS — the two request screens styled like the test-taking page
// (same 56px top-panel contract, card feed, bottom action bar):
//
//   SmmApplyView  («Подать заявку», the specialist): the event's
//     qualification tests as cards — pass each one through the regular
//     take-test flow (results NEVER show correct answers), then the bottom
//     bar «Подтвердить отправку» sends the заявка; the score lands in the
//     chat with the customer.
//
//   SmmInviteView («Пригласить на мероприятие», the customer): the chosen
//     ROLE card + the chosen EVENT card + the estimated amount, then the
//     bottom bar «Подтвердить отправку запроса».
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { tUI } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session-store';
import { useNavStore } from '@/stores/nav-store';
import { useSmmStore } from '@/stores/smm-store';
import { useTakeStore } from '@/stores/take-store';
import { ArrowLeft, Check, ClipboardList, Loader2, MapPin, Play, Star } from 'lucide-react';
import { EditorShell } from './smm-editors';
import { fmtMoney } from './smm-bits';
import type { SmmEventT } from '@/lib/app-types';

function useT() {
  const lang = useSessionStore(s => s.lang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  const t = (key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars);
  return { t, lang, cycleLang };
}

// ── ЗАЯВКА (the specialist applies) ─────────────────────────────────────────

export function SmmApplyView() {
  const { t, lang, cycleLang } = useT();
  const setPage = useNavStore(s => s.setPage);
  const applyCtx = useSmmStore(s => s.applyCtx);
  const applyResults = useSmmStore(s => s.applyResults);
  const [event, setEvent] = useState<SmmEventT | null>(null);
  const [tests, setTests] = useState<{ id: string; title: string; q: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const back = () => {
    useSmmStore.setState({ applyCtx: null });
    useTakeStore.setState({ smmHideAnswers: false });
    setPage('dashboard');
  };

  useEffect(() => {
    if (!applyCtx) { setPage('dashboard'); return; }
    let alive = true;
    setLoading(true);
    Promise.all([
      api.getEvent(applyCtx.eventId).catch(() => null),
      ...applyCtx.testIds.map(id => api.getTest(id).catch(() => null)),
    ]).then((res: any[]) => {
      if (!alive) return;
      const ev = res[0]?.event || null;
      setEvent(ev);
      setTests(res.slice(1).filter(Boolean).map((tt: any) => ({
        id: tt.id, title: tt.title, q: tt.questions?.length ?? tt._count?.questions ?? 0,
      })));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [applyCtx, setPage]);

  const resultsOf = (id: string) => applyResults[id] || null;
  const allDone = tests.length === 0 || tests.every(x => resultsOf(x.id));
  const totalScore = useMemo(() => tests.reduce((acc, x) => acc + (resultsOf(x.id)?.score || 0), 0), [tests, applyResults]);
  const totalQ = useMemo(() => tests.reduce((acc, x) => acc + (resultsOf(x.id)?.total || x.q || 0), 0), [tests, applyResults]);

  const passTest = (testId: string) => {
    // open the regular take-test flow with the hidden-answers results screen
    useTakeStore.setState({ smmHideAnswers: true });
    void (async () => {
      const fullTest = await api.getTest(testId);
      useTakeStore.setState({
        currentTest: fullTest,
        shuffledQuestions: fullTest.questions,
        answers: {},
        showResult: false,
        currentQuestionIdx: 0,
        revealedAnswers: {},
        explanations: {},
        selectedQuestionCount: fullTest.questions.length,
        currentAttempt: null,
        savedProgress: null,
      });
      try {
        const attempt = await api.createAttempt(fullTest.id, fullTest.questions.length);
        useTakeStore.setState({ currentAttempt: attempt as any });
      } catch { /* ignore */ }
      setPage('take-test');
    })().catch(() => { useTakeStore.setState({ smmHideAnswers: false }); setPage('smm-apply'); });
  };

  const confirm = async () => {
    if (!applyCtx) return;
    setSending(true);
    try {
      await api.createApplication({
        eventId: applyCtx.eventId,
        roleId: applyCtx.roleId,
        score: totalScore,
        totalQuestions: totalQ,
      });
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmApplySent') }));
      useSmmStore.setState((s: any) => ({ applyCtx: null, applyResults: {}, refreshNonce: (s.refreshNonce || 0) + 1 }));
      useTakeStore.setState({ smmHideAnswers: false });
      setPage('dashboard');
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message || 'Error' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <EditorShell title={t('smmApplyTitle')} onBack={back} lang={lang} cycleLang={cycleLang}
      saveLabel={allDone ? t('smmApplyConfirm') : t('smmApplyPassTest')}
      onSave={() => { if (allDone) void confirm(); }}
      saving={sending} saveDisabled={!allDone || sending}>
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
          {tests.length === 0 ? (
            <Card className="rounded-4xl border-dashed border-black/30 bg-white">
              <CardContent className="py-8 text-center">
                <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">{t('smmEventTestsNone')}</p>
              </CardContent>
            </Card>
          ) : (
            tests.map(x => {
              const r = resultsOf(x.id);
              return (
                <Card key={x.id} className="rounded-4xl border border-black bg-white overflow-hidden">
                  <div className="h-2 bg-[#DFF3E8]" />
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className="w-11 h-11 rounded-2xl bg-[#FFF0D9] text-cta flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{x.title}</p>
                      <p className="text-xs text-muted-foreground">{x.q} Q</p>
                    </div>
                    {r ? (
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Badge2 score={`${r.score}/${r.total}`} />
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => passTest(x.id)} className="h-9 rounded-full bg-primary hover:bg-primary/90 shrink-0">
                        <Play className="w-4 h-4 mr-1" /> {t('smmApplyPassTest')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
          {allDone && tests.length > 0 && (
            <Card className="rounded-4xl border-2 border-cta bg-white">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-bold">{t('smmApplyAllDone')}</p>
                <p className="text-3xl font-extrabold text-cta mt-1">{totalScore} / {totalQ}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{t('smmResultHidden')}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </EditorShell>
  );
}

function Badge2({ score }: { score: string }) {
  return (
    <span className="rounded-full bg-[#DFF3E8] border border-black/10 px-2.5 py-1 text-xs font-bold text-black/70 flex items-center gap-1">
      <Check className="w-3.5 h-3.5 text-emerald-600" /> {score}
    </span>
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
    </EditorShell>
  );
}
