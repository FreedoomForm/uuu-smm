'use client';

import React from 'react';
import 'swiper/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { smmCoverColor } from '@/lib/smm-client';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

/**
 * FILL THE ЗАПРОС — the test-taking page's twin: the same 56px header with
 * the progress bar, the same vertical TikTok-style swiper, one card per
 * slide — but instead of test cards there are STEP CARDS (each step's title
 * + hint + a big textarea for the specialist's answer). The bottom bar
 * walks the steps and saves the answers.
 */

export interface SmmRequestFillViewProps {
  request: any | null; // the запрос being filled (with steps[])
  busy: boolean;
  onAnswerChange: (stepId: string, answer: string) => void;
  onSaveAnswers: () => void;
  goHome: () => void;
}

export default function SmmRequestFillView({
  request, busy, onAnswerChange, onSaveAnswers, goHome,
}: SmmRequestFillViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const swiperRef = React.useRef<SwiperClass | null>(null);
  const [activeIdx, setActiveIdx] = React.useState(0);

  const steps: any[] = request?.steps || [];
  const len = steps.length;
  const filled = steps.filter((s: any) => (s.answer || '').trim()).length;
  const progressPct = len ? ((activeIdx + 1) / len) * 100 : 0;
  const cur = steps[Math.min(Math.max(0, activeIdx), Math.max(0, len - 1))];
  const isLast = activeIdx >= len - 1;

  const goPrev = () => swiperRef.current?.slidePrev();
  const goNext = () => swiperRef.current?.slideNext();

  if (!request) {
    return (
      <div className="min-h-screen bg-background screen-enter flex items-center justify-center px-4">
        <Card className="rounded-4xl border border-black bg-white max-w-md w-full">
          <CardContent className="py-10 text-center space-y-3">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="font-bold">{t('smmNoRequestsYet')}</p>
            <Button onClick={goHome} className="rounded-full bg-cta hover:bg-cta/90 text-white">{t('back')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter"
      style={{ backgroundColor: request.coverColor || smmCoverColor(request.id) }}
    >
      {/* ── TOP PANEL — the taking screen's twin: back · title · progress ── */}
      <header className="shrink-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 lg:h-16 flex flex-col justify-center gap-1">
          <div className="flex flex-nowrap items-center justify-between gap-1 sm:gap-2 w-full">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0">
              <Button variant="ghost" size="sm" onClick={goHome} className="shrink-0 h-8 w-8 p-0" title={t('back')} aria-label={t('back')}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <span className="font-bold text-sm sm:text-base truncate max-w-[45vw]">{request.title}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
              <span className="text-xs sm:text-sm text-muted-foreground hidden lg:inline">{t('smmFillXofY', { n: filled, m: len })}</span>
              <Badge variant="secondary" className="rounded-full shrink-0">{t('smmFillStepOf', { n: Math.min(activeIdx + 1, len || 1), m: len })}</Badge>
            </div>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      </header>

      {/* ── THE STEP CARDS — the question feed's twin: one step per slide ── */}
      {len === 0 ? (
        <main className="flex-1 min-h-0 flex items-center justify-center px-4">
          <Card className="rounded-4xl border-dashed border-black/30 bg-white w-full max-w-md">
            <CardContent className="py-12 text-center space-y-3">
              <div className="mx-auto w-14 h-14 bg-cta rounded-2xl flex items-center justify-center shadow-lg">
                <FileText className="w-7 h-7 text-white" />
              </div>
              <p className="font-bold">{t('smmFillEmptyHint')}</p>
              <Button onClick={goHome} variant="outline" className="rounded-full">{t('back')}</Button>
            </CardContent>
          </Card>
        </main>
      ) : (
        <main className="relative flex-1 min-h-0 min-w-0">
          <Swiper
            direction="vertical"
            modules={[Mousewheel]}
            slidesPerView={1}
            spaceBetween={0}
            speed={320}
            resistanceRatio={0}
            touchReleaseOnEdges={true}
            longSwipesRatio={0.35}
            mousewheel={{ forceToAxis: true, sensitivity: 1, thresholdDelta: 12, thresholdTime: 250, releaseOnEdges: false }}
            className="feed-swiper h-full screen-enter"
            onSwiper={sw => { swiperRef.current = sw; }}
            onSlideChange={sw => setActiveIdx(sw.activeIndex)}
          >
            {steps.map((s: any, idx: number) => (
              <SwiperSlide key={s.id} className="relative !h-full overflow-hidden">
                <section className="relative h-full w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="min-h-full flex flex-col px-4 py-4 lg:py-6 lg:pb-28">
                    <div className="max-w-3xl w-full mx-auto my-auto">
                      <Card className="rounded-4xl border border-black bg-white shadow-lg">
                        <CardContent className="p-5 sm:p-6 space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-sm rounded-full">{t('smmFillStepOf', { n: idx + 1, m: len })}</Badge>
                            {(s.answer || '').trim() && (
                              <Badge className="rounded-full bg-emerald-100 text-emerald-700 border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> {t('smmFillSaved')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-lg font-medium">{s.title || t('smmFillStepOf', { n: idx + 1, m: len })}</p>
                          {s.hint && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.hint}</p>}
                          <Textarea
                            value={s.answer || ''}
                            onChange={e => onAnswerChange(s.id, e.target.value)}
                            rows={7}
                            maxLength={20000}
                            placeholder={t('smmFillAnswerPlaceholder')}
                            className="rounded-2xl border-black/15 bg-white text-[15px]"
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </section>
              </SwiperSlide>
            ))}
          </Swiper>
          {/* Desktop arrows — the same feed arrows the events feed keeps */}
          <div className="hidden lg:flex flex-col gap-2 absolute right-5 top-1/2 -translate-y-1/2 z-30">
            <button
              type="button"
              onClick={goPrev}
              disabled={activeIdx === 0}
              aria-label={t('feedPrev')}
              title={t('feedPrev')}
              className="w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center text-foreground hover:bg-white hover:shadow-xl active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={isLast}
              aria-label={t('feedNext')}
              title={t('feedNext')}
              className="w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-lg flex items-center justify-center text-foreground hover:bg-white hover:shadow-xl active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </main>
      )}

      {/* ── BOTTOM BAR — the taking screen's twin: Prev | Next, and on the
          last slide (or when everything is filled) — Save answers ── */}
      {len > 0 && (
        <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-2xl mx-auto px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={activeIdx === 0}
                className="rounded-full shrink-0"
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              {isLast || filled === len ? (
                <Button
                  onClick={onSaveAnswers}
                  disabled={busy}
                  className="flex-1 min-w-0 h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('smmFillSaveAnswers')}</span></>}
                </Button>
              ) : (
                <Button
                  onClick={goNext}
                  className="flex-1 min-w-0 h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
                >
                  <Send className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('smmNext')}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
