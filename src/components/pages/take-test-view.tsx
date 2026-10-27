'use client';

import { useTakeStore } from '@/stores/take-store';
import { ResultsView } from './take-test/results-view';
import { TakeActive } from './take-test/take-active';

/**
 * TAKE TEST + RESULTS screens — the orchestrator. The state lives in the
 * zustand domain stores and is consumed directly by the sub-components in
 * ./take-test/ (header, question feed/grid, bottom drum, panel cluster,
 * results view); app-root keeps only the ACTION handlers (they orchestrate
 * the query cache and cross-store flows) and passes them straight through.
 *
 *   ./take-test/take-actions.ts      — goToQuestion: cross-store navigation
 *   ./take-test/take-header.tsx      — sticky header + question search
 *   ./take-test/question-feed.tsx    — Swiper Virtual vertical question feed
 *   ./take-test/question-card.tsx    — one question of the feed
 *   ./take-test/question-grid.tsx    — Library/Shelf answerable grid
 *   ./take-test/take-bottom-bar.tsx  — arrows + question drum + submit
 *   ./take-test/overlay-panels.tsx   — AI tutor / group chat / files / edit
 *   ./take-test/sheet-config.tsx     — the bottom-sheet window switcher
 *   ./take-test/results-view.tsx     — the completed-test screen
 *   ./take-test/review-card.tsx      — one question of the review list
 */
export interface TakeTestViewProps {
  // ── Action handlers (app-root orchestrates queries / cross-store flows) ──
  goHome: () => void;
  openChat: (questionId: string, userAnswer?: string, opts?: { force?: boolean }) => void;
  closeChat: () => void;
  openGroupChat: () => void;
  closeGroupChat: () => void;
  selectChatThread: (testId: string) => void;
  sendChatMessage: (questionId?: string, existingMessages?: { role: 'user' | 'assistant'; content: string }[], userAnswer?: string, question?: Question | null) => void;
  sendGroupMessage: () => void;
  openUserLibrary: (u: { id: string; name?: string; image?: string | null }) => void;
  startEditTestInTake: () => void;
  selectAnswer: (questionId: string, answer: string) => void;
  submitTest: () => void;
  openStartTest: (test: Test) => void;
  handleSaveTest: (fromTake?: boolean) => void;
  cycleDashView: () => void;
  // ── Editor sheet body + chat DOM refs owned by app-root ──────────────────
  editorBody: React.ReactNode;
  chatEndRef: { current: HTMLDivElement | null };
  groupEndRef: { current: HTMLDivElement | null };
}

import type { Question, Test } from '@/lib/app-types';

export default function TakeTestView(props: TakeTestViewProps) {
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  const showResult = useTakeStore(s => s.showResult);
  // app-root only mounts this view when a session is running
  if (shuffledQuestions.length === 0) return null;
  return showResult
    ? <ResultsView {...props} />
    : <TakeActive {...props} />;
}
