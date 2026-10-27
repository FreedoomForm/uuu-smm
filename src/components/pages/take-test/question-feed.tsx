'use client';

import React from 'react';
import 'swiper/css';
import 'swiper/css/virtual';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel, Virtual } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import { useTakeStore } from '@/stores/take-store';
import { goToQuestion } from './take-actions';
import { QuestionCard } from './question-card';

// ---------------------------------------------------------------------------
// QUESTION-FEED — the TikTok-style vertical question feed of the taking
// screen. Engine: Swiper (vertical, one slide per view) with VIRTUAL slides —
// only the visible card + a 2-card buffer mounts, so a 300-question test no
// longer renders 300 KaTeX cards (and no longer re-renders them on every
// answer). Swiper owns the gestures (touch physics, mousewheel, momentum —
// all upstream-maintained); what lives here:
//   · index commits flow out through onSlideChange -> goToQuestion
//   · external index changes (drum taps / arrows / jump input / search)
//     drive the swiper through the sync effect — the equality check makes
//     the loop settle immediately
//   · the capture gates keep long cards' native scrolling alive (wheel even
//     chains into the next question at the card's edge, like the old snap
//     container); the ResizeObserver + sync effect keep slides sized
// ---------------------------------------------------------------------------

export function QuestionFeed({
  selectAnswer,
  openChat,
}: {
  selectAnswer: (questionId: string, answer: string) => void;
  openChat: (questionId: string, userAnswer?: string, opts?: { force?: boolean }) => void;
}) {
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  const currentQuestionIdx = useTakeStore(s => s.currentQuestionIdx);

  // Fresh state mirror for the event handlers (no stale closures).
  const takeStateRef = React.useRef({ idx: currentQuestionIdx, count: shuffledQuestions.length });
  takeStateRef.current = { idx: currentQuestionIdx, count: shuffledQuestions.length };
  const takeSwiperRef = React.useRef<SwiperClass | null>(null);
  const takeFeedHostRef = React.useRef<HTMLDivElement | null>(null);

  // External index changes drive the feed swiper; commits flow back through
  // onSlideChange — the equality check makes the loop settle immediately.
  // With virtual slides the DOM holds only the visible window — the full
  // count lives in swiper.virtual.slides (kept in sync by the react wrapper).
  React.useEffect(() => {
    const sw = takeSwiperRef.current;
    if (!sw) return;
    const mountedCount = sw.virtual?.slides?.length ?? sw.slides?.length ?? 0;
    if (mountedCount && mountedCount !== shuffledQuestions.length) sw.update();
    const target = Math.min(Math.max(0, currentQuestionIdx), Math.max(0, shuffledQuestions.length - 1));
    if (sw.activeIndex !== target) sw.slideTo(target, 0);
  }, [shuffledQuestions, currentQuestionIdx]);

  // Keyboard/sheet layout shifts resize the feed host (on-screen keyboard,
  // chat sheets on mobile) — keep the engine's slide bookkeeping in sync.
  React.useEffect(() => {
    const el = takeFeedHostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { takeSwiperRef.current?.update(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Shared engine config: one wheel notch / flick = exactly one full-height
  // question card, zero rubber-banding between cards, no release-to-edges.
  const takeSwiperParams = {
    direction: 'vertical' as const,
    modules: [Mousewheel, Virtual],
    slidesPerView: 1,
    spaceBetween: 0,
    speed: 320,
    resistanceRatio: 0,
    touchReleaseOnEdges: true,
    longSwipesRatio: 0.35,
    mousewheel: { forceToAxis: true, sensitivity: 1, thresholdDelta: 12, thresholdTime: 250, releaseOnEdges: false },
    // Virtual slides: only the visible card + a 2-card buffer mounts.
    virtual: { enabled: true, addSlidesBefore: 2, addSlidesAfter: 2 },
    initialSlide: Math.min(Math.max(0, currentQuestionIdx), Math.max(0, shuffledQuestions.length - 1)),
  };

  // Question feed commit: select the slide Swiper landed on. The ref guard
  // makes redundant commits (our own programmatic slideTo) no-ops.
  const onTakeSlideChange = (sw: SwiperClass) => {
    const { idx, count } = takeStateRef.current;
    const next = sw.activeIndex;
    if (next !== idx && next >= 0 && next < count) goToQuestion(next);
  };

  // Wheel gate (capture): a wheel inside a question card that can still
  // scroll in the wheel direction keeps its NATIVE scrolling — stopped here
  // so the Swiper mousewheel engine never sees it. At the card's edge the
  // event falls through to Swiper = scroll chaining into the next question,
  // exactly like the old snap container.
  const onFeedWheelCapture = (e: React.WheelEvent) => {
    const t = e.target as Element | null;
    const sec = t?.closest?.('section[data-qslide]') as HTMLElement | null;
    if (!sec || sec.scrollHeight <= sec.clientHeight + 1) return;
    const canScroll = e.deltaY > 0
      ? sec.scrollTop + sec.clientHeight < sec.scrollHeight - 1
      : sec.scrollTop > 1;
    if (canScroll) e.stopPropagation();
  };

  // Touch gate: Swiper has no built-in nested-scroll handoff, so at
  // touchstart the card is marked swiper-no-swiping while it can scroll at
  // all — the whole gesture then belongs to the card's native scrolling.
  // Cards that fit the viewport swipe between questions as usual.
  const onFeedTouchStartCapture = (e: React.TouchEvent) => {
    const t = e.target as Element | null;
    const sec = t?.closest?.('section[data-qslide]') as HTMLElement | null;
    if (sec) sec.classList.toggle('swiper-no-swiping', sec.scrollHeight > sec.clientHeight + 1);
  };

  return (
    <div
      ref={takeFeedHostRef}
      onWheelCapture={onFeedWheelCapture}
      onTouchStartCapture={onFeedTouchStartCapture}
      className="relative flex-1 min-w-0 h-full feed-swiper"
    >
      <Swiper
        {...takeSwiperParams}
        className="h-full"
        onSwiper={(sw) => { takeSwiperRef.current = sw; }}
        onSlideChange={onTakeSlideChange}
      >
        {shuffledQuestions.map((q, idx) => (
          <SwiperSlide key={idx} className="!h-full" virtualIndex={idx}>
            <QuestionCard q={q} idx={idx} total={shuffledQuestions.length} selectAnswer={selectAnswer} openChat={openChat} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
