'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, Banknote, Briefcase, Building2, CalendarClock, CheckCircle2,
  ChevronRight, FileText, ListOrdered, Loader2, Megaphone, MessageSquareMore, ShieldAlert, UserRoundSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useSmmStore } from '@/stores/smm-store';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';
import type { SmmEventItem, SmmRoleItem } from '@/lib/app-types';

// ---------------------------------------------------------------------------
// SMM WIZARD — the SAME full-screen window the question cards used
// (start-test): a vertical swiper with one slide per STAGE, the bottom
// panel switches stages and confirms.
//
//   invite (customer → specialist): Мероприятие → Роль → Сообщение → обзор
//   apply   (specialist → event):   Роль → Сообщение → обзор
//
// The review stage is a run of swipeable cards (like the results page):
// every earlier choice becomes its own card; the bottom button turns into
// «Подтвердить», which sends the invitation / application and returns to
// the feed.
// ---------------------------------------------------------------------------

export interface SmmWizardViewProps {
  goHome: () => void;
  onConfirm: () => void;
  onCreateEvent: () => void; // the «no events yet» CTA → the events manager
}

export default function SmmWizardView({ goHome, onConfirm, onCreateEvent }: SmmWizardViewProps) {
  const wizardMode = useSmmStore(s => s.wizardMode);
  const wizardSpecialist = useSmmStore(s => s.wizardSpecialist);
  const wizardEvent = useSmmStore(s => s.wizardEvent);
  const selEventId = useSmmStore(s => s.selEventId);
  const setSelEventId = useSmmStore(s => s.setSelEventId);
  const selRoleId = useSmmStore(s => s.selRoleId);
  const setSelRoleId = useSmmStore(s => s.setSelRoleId);
  const wizardMessage = useSmmStore(s => s.wizardMessage);
  const setWizardMessage = useSmmStore(s => s.setWizardMessage);
  const wizardBusy = useSmmStore(s => s.wizardBusy);
  const myEvents = useSmmStore(s => s.myEvents);
  const invitePickSpecialist = useSmmStore(s => s.invitePickSpecialist);
  const specialistCandidates = useSmmStore(s => s.specialistCandidates);
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const swRef = React.useRef<SwiperClass | null>(null);
  const [activeIdx, setActiveIdx] = React.useState(0);

  const isInvite = wizardMode === 'invite';
  const isSend = wizardMode === 'send';
  // The role list: the chosen event's roles (invite) or the target's roles (apply/send)
  const srcEvent: SmmEventItem | null = isInvite
    ? (myEvents.find(e => e.id === selEventId) || null)
    : wizardEvent;
  const roles: SmmRoleItem[] = srcEvent?.roles || [];
  // SEND mode: the specialist's запросы (fetched when the wizard opened)
  const wizardRequests = useSmmStore(s => s.wizardRequests);
  const selRequestId = useSmmStore(s => s.selRequestId);
  const setSelRequestId = useSmmStore(s => s.setSelRequestId);
  const selRequest: any = wizardRequests.find(r => r.id === selRequestId) || null;

  // Stage keys — each becomes one slide in the select phase. Invites opened
  // FROM the events page preset the event and add the «specialist» pick
  // stage (the flow is event → role → WHO → message). SEND: запрос → роль →
  // сообщение (the structured application flow).
  const steps: string[] = isInvite
    ? (invitePickSpecialist ? ['event', 'role', 'specialist', 'message'] : ['event', 'role', 'message'])
    : isSend
      ? ['request', 'role', 'message']
      : ['role', 'message'];
  const stepTitles: Record<string, string> = {
    event: t('smmStepEvent'),
    role: t('smmStepRole'),
    specialist: t('smmStepSpecialist'),
    request: t('smmPickRequest'),
    message: t('smmStepMessage'),
  };
  // Review cards — every earlier choice as its own swipeable card
  const reviewCards: string[] = [
    ...(isInvite ? ['event'] : []),
    ...(isSend ? ['request'] : []),
    'role',
    'message',
    isInvite ? 'specialist' : 'customer',
  ];

  const total = steps.length + reviewCards.length;
  const inReview = activeIdx >= steps.length;
  const canNext = (() => {
    const key = steps[Math.min(activeIdx, steps.length - 1)];
    if (key === 'event') return !!selEventId;
    if (key === 'role') return !!selRoleId;
    if (key === 'specialist') return !!wizardSpecialist;
    if (key === 'request') return !!selRequestId;
    return true;
  })();

  if (!wizardMode) return null;

  const selRole = roles.find(r => r.id === selRoleId) || null;
  const selEvent: SmmEventItem | null = isInvite ? srcEvent : wizardEvent;
  const person = isInvite ? wizardSpecialist : (wizardEvent?.customer || null);

  const rowCls = (active: boolean) =>
    `w-full text-left p-3 rounded-2xl border-2 transition-all ${active ? 'border-cta bg-[#FFF0D9] shadow-md' : 'border-black/10 bg-white hover:bg-muted/50'}`;

  const slideHead = (icon: React.ReactNode, title: string, hint: string) => (
    <div className="text-center mb-4">
      <div className="mx-auto w-14 h-14 bg-cta rounded-2xl flex items-center justify-center mb-3 shadow-lg">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{hint}</p>
    </div>
  );

  const renderStep = (key: string) => {
    if (key === 'event') {
      return (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-5">
            {slideHead(<Briefcase className="w-7 h-7 text-white" />, t('smmStepEvent'), t('smmStepEventHint'))}
            {myEvents.length === 0 ? (
              <div className="text-center space-y-3 py-4">
                <p className="text-sm text-muted-foreground">{t('smmNoEventsYet')}</p>
                <Button onClick={onCreateEvent} className="rounded-full bg-cta hover:bg-cta/90 text-white">
                  <Briefcase className="w-4 h-4 mr-2" /> {t('smmCreateEvent')}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto">
                {myEvents.map(ev => (
                  <button key={ev.id} type="button" onClick={() => setSelEventId(ev.id)} className={rowCls(selEventId === ev.id)}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm flex-1 min-w-0 truncate">{ev.title}</span>
                      {selEventId === ev.id && <CheckCircle2 className="w-4 h-4 text-cta shrink-0" />}
                    </div>
                    {ev.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.summary}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">{t('smmRolesN', { n: (ev.roles || []).length })}</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    if (key === 'role') {
      return (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-5">
            {slideHead(<UserRoundSearch className="w-7 h-7 text-white" />, t('smmStepRole'), t('smmStepRoleHint'))}
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('smmNoRolesYet')}</p>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto">
                {roles.map(r => (
                  <button key={r.id} type="button" onClick={() => setSelRoleId(r.id)} className={rowCls(selRoleId === r.id)}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm flex-1 min-w-0 truncate">{r.name}</span>
                      {selRoleId === r.id && <CheckCircle2 className="w-4 h-4 text-cta shrink-0" />}
                    </div>
                    {r.brief && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.brief}</p>}
                    {(r.payment || r.deadline) && (
                      <p className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                        {r.payment && <span className="inline-flex items-center gap-1"><Banknote className="w-3 h-3" />{r.payment}</span>}
                        {r.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{r.deadline}</span>}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    if (key === 'specialist') {
      // The invite-from-event flow: the SPECIALIST is picked here (the
      // candidates come from the general specialists feed).
      return (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-5">
            {slideHead(<Megaphone className="w-7 h-7 text-white" />, t('smmStepSpecialist'), t('smmStepSpecialistHint'))}
            {specialistCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('smmEmptySpecialists')}</p>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto">
                {specialistCandidates.map(sp => (
                  <button key={sp.id} type="button" onClick={() => useSmmStore.getState().setWizardSpecialist(sp)} className={rowCls(wizardSpecialist?.id === sp.id)}>
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-cta text-white flex items-center justify-center text-xs font-extrabold shrink-0">{(sp.name || '?').slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{sp.name}</p>
                        {sp.headline && <p className="text-xs text-muted-foreground truncate">{sp.headline}</p>}
                      </div>
                      {wizardSpecialist?.id === sp.id && <CheckCircle2 className="w-4 h-4 text-cta shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    if (key === 'request') {
      // SEND flow: one of MY запросы is picked (or created right here)
      return (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-5">
            {slideHead(<ListOrdered className="w-7 h-7 text-white" />, t('smmPickRequest'), t('smmPickRequestHint'))}
            {wizardRequests.length === 0 ? (
              <div className="text-center space-y-3 py-4">
                <p className="text-sm text-muted-foreground">{t('smmNoRequestsYet')}</p>
                <p className="text-xs text-muted-foreground">{t('smmNoRequestsHint')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto">
                {wizardRequests.map(rq => {
                  const stps: any[] = rq.steps || [];
                  const filled = stps.filter((s: any) => (s.answer || '').trim()).length;
                  return (
                    <button key={rq.id} type="button" onClick={() => setSelRequestId(rq.id)} className={rowCls(selRequestId === rq.id)}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm flex-1 min-w-0 truncate">{rq.title}</span>
                        {selRequestId === rq.id && <CheckCircle2 className="w-4 h-4 text-cta shrink-0" />}
                      </div>
                      {rq.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rq.summary}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">{t('smmStepsN', { n: stps.length })} · {t('smmFilledN', { n: filled, m: stps.length })}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    // message — «Дополнительные настройки»: the unique ТЗ / application text
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-5">
          {slideHead(<FileText className="w-7 h-7 text-white" />, t('smmStepMessage'), t('smmStepMessageHint'))}
          {selRole?.brief && (
            <div className="rounded-2xl border border-black/10 bg-muted/40 p-3 mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{t('smmRoleBriefTemplate')}</p>
              <p className="text-xs whitespace-pre-wrap line-clamp-4">{selRole.brief}</p>
            </div>
          )}
          <Textarea
            value={wizardMessage}
            onChange={e => setWizardMessage(e.target.value)}
            placeholder={t('smmMessagePlaceholder')}
            rows={6}
            maxLength={8000}
            className="rounded-2xl border-black/15 bg-white text-sm"
          />
        </CardContent>
      </Card>
    );
  };

  // Review cards — one per made choice (the results-page pattern)
  const renderReview = (key: string) => {
    const chip = (icon: React.ReactNode, label: string) => (
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
        {icon} {label}
      </div>
    );
    let body: React.ReactNode = null;
    if (key === 'event') {
      body = selEvent ? (
        <>
          {chip(<Briefcase className="w-3.5 h-3.5" />, t('smmReviewEvent'))}
          <CardTitle className="text-lg">{selEvent.title}</CardTitle>
          {selEvent.summary && <CardDescription className="mt-2 line-clamp-3">{selEvent.summary}</CardDescription>}
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {selEvent.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><CalendarClock className="w-3 h-3" />{selEvent.deadline}</span>}
            {selEvent.budget && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><Banknote className="w-3 h-3" />{selEvent.budget}</span>}
            {selEvent.restrictions && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><ShieldAlert className="w-3 h-3" />{selEvent.restrictions}</span>}
          </div>
        </>
      ) : null;
    } else if (key === 'role') {
      body = selRole ? (
        <>
          {chip(<UserRoundSearch className="w-3.5 h-3.5" />, t('smmReviewRole'))}
          <CardTitle className="text-lg">{selRole.name}</CardTitle>
          {selRole.brief && <CardDescription className="mt-2 whitespace-pre-wrap line-clamp-6">{selRole.brief}</CardDescription>}
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {selRole.payment && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><Banknote className="w-3 h-3" />{selRole.payment}</span>}
            {selRole.deadline && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><CalendarClock className="w-3 h-3" />{selRole.deadline}</span>}
          </div>
        </>
      ) : null;
    } else if (key === 'message') {
      body = (
        <>
          {chip(<FileText className="w-3.5 h-3.5" />, t('smmReviewMessage'))}
          {wizardMessage.trim()
            ? <p className="text-sm whitespace-pre-wrap">{wizardMessage}</p>
            : <p className="text-sm text-muted-foreground">{t('smmNoCustomMessage')}</p>}
        </>
      );
    } else if (key === 'request') {
      const stps: any[] = selRequest?.steps || [];
      body = selRequest ? (
        <>
          {chip(<ListOrdered className="w-3.5 h-3.5" />, t('smmPickRequest'))}
          <CardTitle className="text-lg">{selRequest.title}</CardTitle>
          {selRequest.summary && <CardDescription className="mt-2 line-clamp-3">{selRequest.summary}</CardDescription>}
          {stps.length > 0 && (
            <div className="mt-3 space-y-1">
              {stps.map((s: any, i: number) => (
                <div key={s.id} className="flex items-center gap-1.5 text-xs">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${(s.answer || '').trim() ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                  <span className="font-semibold truncate">{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null;
    } else {
      body = person ? (
        <>
          {chip(isInvite ? <Megaphone className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />, isInvite ? t('smmReviewSpecialist') : t('smmReviewCustomer'))}
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-cta text-white flex items-center justify-center font-extrabold shrink-0">{(person.name || '?').slice(0, 1).toUpperCase()}</span>
            <CardTitle className="text-lg">{person.name}</CardTitle>
          </div>
          {isInvite && (wizardSpecialist?.headline || wizardSpecialist?.city) && (
            <CardDescription className="mt-2">{[wizardSpecialist?.headline, wizardSpecialist?.city].filter(Boolean).join(' · ')}</CardDescription>
          )}
        </>
      ) : null;
    }
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">{body}</CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background screen-enter flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        {/* FIXED h-14 — the uniform 56px top-panel contract */}
        <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 h-14 lg:h-16 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goHome} className="rounded-full"><ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}</Button>
          <h1 className="text-lg font-bold truncate">{isInvite ? t('smmInviteTitle') : isSend ? t('smmSendRequestBtn') : t('smmApplyTitle')}</h1>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <Swiper
          key="smm-wizard-swiper"
          direction="vertical"
          modules={[Mousewheel]}
          mousewheel={{ forceToAxis: true }}
          speed={320}
          className="h-full"
          onSwiper={sw => { swRef.current = sw; }}
          onSlideChange={sw => setActiveIdx(sw.activeIndex)}
        >
          {steps.map(key => (
            <SwiperSlide key={`st-${key}`} className="!h-auto overflow-y-auto">
              <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 pt-6 pb-8">
                {renderStep(key)}
              </div>
            </SwiperSlide>
          ))}
          {reviewCards.map(key => (
            <SwiperSlide key={`rv-${key}`} className="!h-auto overflow-y-auto">
              <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 pt-6 pb-8">
                {renderReview(key)}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </main>

      {/* Bottom panel — stage chips + Next / Confirm (the same fixed dock
      contract as the start-test screen) */}
      <div className="desktop-dock fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div className="max-w-2xl mx-auto px-4 pt-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto">
            {steps.map((key, i) => (
              <button
                key={key}
                type="button"
                onClick={() => swRef.current?.slideTo(i)}
                className={`shrink-0 px-3 py-1 rounded-full border-2 text-xs font-semibold transition-colors ${activeIdx === i ? 'bg-cta text-white border-cta' : activeIdx > i ? 'border-cta/50 text-cta bg-white' : 'border-black/15 bg-white text-muted-foreground'}`}
              >
                {i + 1}. {stepTitles[key]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => swRef.current?.slideTo(steps.length)}
              className={`shrink-0 px-3 py-1 rounded-full border-2 text-xs font-semibold transition-colors ${inReview ? 'bg-cta text-white border-cta' : 'border-black/15 bg-white text-muted-foreground'}`}
            >
              {t('smmReview')}
            </button>
          </div>
          {inReview ? (
            <Button
              onClick={onConfirm}
              disabled={wizardBusy || !selRoleId || (isInvite && !selEventId) || (isSend && !selRequestId)}
              className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
            >
              {wizardBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-2" /> {isInvite ? t('smmConfirmInvite') : isSend ? t('smmConfirmSendRequest') : t('smmConfirmApply')}</>}
            </Button>
          ) : (
            <Button
              onClick={() => swRef.current?.slideNext()}
              disabled={!canNext}
              className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
            >
              {t('smmNext')} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Hidden hint row: how the stage switching works */}
      <div className="sr-only"><MessageSquareMore /> {t('smmWizardHint')}</div>
    </div>
  );
}
