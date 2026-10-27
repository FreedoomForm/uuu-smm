'use client';

import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperClass } from 'swiper';
import { Button } from '@/components/ui/button';
import { tUI } from '@/lib/i18n';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { GLASS_TILE } from '@/components/shared-bits';
import { useTakeStore } from '@/stores/take-store';
import { useSessionStore } from '@/stores/session-store';
import { goToQuestion } from './take-actions';

// ---------------------------------------------------------------------------
// TAKE-BOTTOM-BAR — the navigation footer of the taking screen, permanently
// glued to the bottom edge: the glass arrows, the question DRUM (horizontal
// Swiper — centered strip, tap-to-slide, drag-scrub, magnifier lens via
// watchSlidesProgress; tapping the current pill opens the jump-to-number
// input) and the submit button on the last question. Previously inlined in
// take-test-view.tsx.
// ---------------------------------------------------------------------------

export function TakeBottomBar({
  submitTest,
}: {
  submitTest: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const loading = useSessionStore(s => s.loading);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  const currentQuestionIdx = useTakeStore(s => s.currentQuestionIdx);
  const answers = useTakeStore(s => s.answers);
  const practiceMode = useTakeStore(s => s.practiceMode);
  const revealedAnswers = useTakeStore(s => s.revealedAnswers);
  const drumInputMode = useTakeStore(s => s.drumInputMode);
  const setDrumInputMode = useTakeStore(s => s.setDrumInputMode);
  const answeredCount = Object.keys(answers).length;

  // The jump-to-number input is UNCONTROLLED (read via ref on submit): typing
  // must not re-render the take-test tree — a controlled value re-rendered
  // EVERY question slide (KaTeX-heavy) on each keystroke, which made typing
  // feel slow/buggy.
  const numInputRef = React.useRef<HTMLInputElement>(null);
  const drumSwiperRef = React.useRef<SwiperClass | null>(null);

  // The drum strip drives the same index — remounts (typing mode) re-center
  // through initialSlide, everything else through this effect.
  React.useEffect(() => {
    const sw = drumSwiperRef.current;
    if (!sw) return;
    const target = Math.min(Math.max(0, currentQuestionIdx), Math.max(0, shuffledQuestions.length - 1));
    if (sw.activeIndex !== target) sw.slideTo(target, 260);
  }, [currentQuestionIdx, shuffledQuestions]);

  const jumpToQuestion = (raw: string) => {
    const digits = (raw || '').replace(/[^0-9]/g, '');
    const n = digits ? parseInt(digits, 10) : NaN;
    if (!Number.isNaN(n) && n >= 1 && n <= shuffledQuestions.length) goToQuestion(n - 1);
    setDrumInputMode(false);
    if (numInputRef.current) numInputRef.current.value = '';
  };

  // The bottom drum: horizontal Swiper — centered strip, tap-to-slide,
  // drag-scrub, and the magnifier lens reproduced via watchSlidesProgress
  // (distance from center in slide widths -> the old 1..0 falloff curve).
  const applyDrumMagnify = (sw: SwiperClass) => {
    const radiusPx = Math.max(110, sw.width * 0.3);
    for (const slide of sw.slides) {
      const distPx = Math.abs(slide.progress || 0) * 56; // w-14 pills
      const f = Math.max(0, 1 - (distPx / radiusPx) ** 2);
      const num = (slide.firstElementChild?.firstElementChild || slide.firstElementChild) as HTMLElement | null;
      if (num) {
        num.style.transform = `scale(${(0.5 + 0.5 * f).toFixed(3)})`;
        num.style.opacity = (0.25 + 0.75 * f).toFixed(3);
      }
    }
  };
  const drumSwiperParams = {
    slidesPerView: 'auto' as const,
    centeredSlides: true,
    spaceBetween: 0,
    speed: 260,
    slideToClickedSlide: true,
    watchSlidesProgress: true,
    grabCursor: false,
    initialSlide: Math.min(Math.max(0, currentQuestionIdx), Math.max(0, shuffledQuestions.length - 1)),
  };
  const onDrumSlideChange = (sw: SwiperClass) => {
    const next = sw.activeIndex;
    if (next !== currentQuestionIdx && next >= 0 && next < shuffledQuestions.length) goToQuestion(next);
  };

  return (
    <div className="desktop-dock desktop-dock-wide shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
      <div
        className="max-w-7xl mx-auto px-4 lg:px-6 pt-2 lg:pt-2.5"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2">
          {/* Glass arrows — same tile as the number lens (w-14, rounded-xl,
              same border/gradient/shadows); h-14 aligns edges with the lens. */}
          <button
            type="button"
            onClick={() => goToQuestion(Math.max(0, currentQuestionIdx - 1))}
            disabled={currentQuestionIdx === 0}
            aria-label="Previous question"
            className={`w-14 h-14 shrink-0 flex items-center justify-center text-foreground transition-transform active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${GLASS_TILE}`}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>

          {drumInputMode ? (
            <form
              onSubmit={e => { e.preventDefault(); jumpToQuestion(numInputRef.current?.value || ''); }}
              className="relative flex-1 min-w-0 h-16"
            >
              {/* Typing mode keeps the bar's look EXACTLY as in drum mode: the
                  input occupies the current pill's slot (w-14, centered) and the
                  same glass lens stays on top — no oval pill swap. The number
                  color also mirrors the current pill (cta when answered). */}
              <input
                ref={numInputRef}
                autoFocus
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                enterKeyHint="go"
                defaultValue={String(currentQuestionIdx + 1)}
                onFocus={e => e.currentTarget.select()}
                placeholder={`1–${shuffledQuestions.length}`}
                aria-label={t('numQuestions')}
                className={`absolute inset-y-1 left-1/2 -translate-x-1/2 w-14 bg-transparent border-0 outline-none text-center text-2xl font-extrabold tabular-nums caret-black/40 placeholder:text-base placeholder:font-semibold placeholder:text-muted-foreground/60 ${
                  answers[shuffledQuestions[currentQuestionIdx]?.id || ''] ? 'text-cta' : 'text-foreground'
                }`}
              />
              {/* Glass window — identical lens to drum mode */}
              <div className={`pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-14 ${GLASS_TILE}`} />
            </form>
          ) : (
            <div className="relative flex-1 min-w-0 h-16">
              <Swiper
                {...drumSwiperParams}
                className="drum-swiper h-full w-full"
                onSwiper={(sw) => { drumSwiperRef.current = sw; applyDrumMagnify(sw); }}
                onAfterInit={(sw) => applyDrumMagnify(sw)}
                onProgress={(sw) => applyDrumMagnify(sw)}
                onSlideChange={onDrumSlideChange}
              >
                {shuffledQuestions.map((q, idx) => {
                  const qIdNav = q.id || '';
                  const isAnswered = !!answers[qIdNav];
                  const isRevealedNav = practiceMode && revealedAnswers[qIdNav];
                  const isCurrent = idx === currentQuestionIdx;
                  const isCorrectAnswer = isRevealedNav && answers[qIdNav] === q.correctAnswer;
                  const isWrongAnswer = isRevealedNav && answers[qIdNav] && answers[qIdNav] !== q.correctAnswer;

                  return (
                    <SwiperSlide key={idx} className="!h-full !w-14">
                      <button
                        type="button"
                        data-current={isCurrent}
                        onClick={() => {
                          if (isCurrent) {
                            setDrumInputMode(true); // input pre-fills via defaultValue on mount
                          }
                          // other pills: Swiper's slideToClickedSlide slides
                          // there and the commit flows through onDrumSlideChange
                        }}
                        title={isCurrent ? t('tapToType') : t('goToQuestion', { n: idx + 1 })}
                        className="w-14 h-full flex items-center justify-center"
                      >
                        <span
                          className={`text-2xl font-bold tabular-nums leading-none select-none transition-colors ${
                            isCorrectAnswer ? 'text-emerald-500' :
                            isWrongAnswer ? 'text-red-500' :
                            isCurrent ? (isAnswered ? 'text-cta font-extrabold' : 'text-foreground font-extrabold') :
                            isAnswered ? 'text-cta/70' : 'text-muted-foreground/50'
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </button>
                    </SwiperSlide>
                  );
                })}
              </Swiper>
              {/* Glass window — the current number sits under the lens */}
              <div className={`pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-14 ${GLASS_TILE}`} />
            </div>
          )}

          {currentQuestionIdx === shuffledQuestions.length - 1 ? (
            <Button
              onClick={submitTest}
              disabled={loading || answeredCount < shuffledQuestions.length}
              className="rounded-full bg-primary hover:bg-primary/90 shrink-0 h-9 lg:h-12 lg:px-7 lg:text-base"
            >
              {loading ? t('submitting') : t('submitTest')}
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => goToQuestion(Math.min(shuffledQuestions.length - 1, currentQuestionIdx + 1))}
              aria-label="Next question"
              className={`w-14 h-14 shrink-0 flex items-center justify-center text-foreground transition-transform active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${GLASS_TILE}`}
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
