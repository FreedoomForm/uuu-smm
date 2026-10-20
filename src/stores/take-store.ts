import { makeStore } from '@/stores/make-store';
import type { Question, Test, Attempt } from '@/lib/app-types';
import type { SavedTestProgress } from '@/lib/test-progress';

// ---------------------------------------------------------------------------
// TAKE store — the running test session: the test on screen, the shuffled
// question list, the answer/reveal/explanation maps, the start parameters
// (shared by the dashboard feed cards and the Start Test screen) and the
// header-search states of the taking / results screens.
// Previously ~20 loose useState hooks inside app-root.tsx.
// ---------------------------------------------------------------------------

interface TakeData {
  // The full test payload currently open (start / take / results / edit sheet)
  currentTest: Test | null;
  currentAttempt: Attempt | null;
  // The exact shuffled & sliced question list the user is answering
  shuffledQuestions: Question[];
  currentQuestionIdx: number;
  answers: Record<string, string>;
  showResult: boolean;
  // SMM заявка flow: the results screen hides correct answers and returns
  // to the apply page instead of the dashboard
  smmHideAnswers: boolean;
  // Randomization chosen at test START (Start Test page / dashboard cards),
  // not in the editor
  startRandomizeQ: boolean;
  startRandomizeO: boolean;
  // Number of questions the session runs with (counter + slider on the card)
  selectedQuestionCount: number;
  practiceMode: boolean;
  // Start Test: attached files section — collapsed by default, expandable
  startFilesExpanded: boolean;
  // Practice-mode reveals + AI explanations per question id
  revealedAnswers: Record<string, boolean>;
  explanations: Record<string, string>;
  loadingExplanations: boolean;
  // Take-test bottom drum: one-line question strip + tap-to-type jump
  drumInputMode: boolean;
  // "Continue Test" snapshot found for the current test (start screen swap)
  savedProgress: SavedTestProgress | null;
  // Take-test header search: filters the questions of the running test.
  qSearch: string;
  qSearchOpen: boolean;
  // Results-page header search: filters the review questions
  resSearch: string;
  resHighlightIdx: number | null;
  // On-the-fly question translation progress pill
  autoTranslating: boolean;
}

const INITIAL: TakeData = {
  currentTest: null,
  currentAttempt: null,
  shuffledQuestions: [],
  currentQuestionIdx: 0,
  answers: {},
  showResult: false,
  smmHideAnswers: false,
  startRandomizeQ: true,
  startRandomizeO: true,
  selectedQuestionCount: 0,
  practiceMode: false,
  startFilesExpanded: false,
  revealedAnswers: {},
  explanations: {},
  loadingExplanations: false,
  drumInputMode: false,
  savedProgress: null,
  qSearch: '',
  qSearchOpen: false,
  resSearch: '',
  resHighlightIdx: null,
  autoTranslating: false,
};

export const useTakeStore = makeStore(INITIAL);

// Fresh, hook-free read for the long async session flows (start/continue/submit)
export const takeNow = () => useTakeStore.getState();

/**
 * Tear down the running session: every answer/reveal/explanation and the
 * question list die, the start parameters return to their defaults.
 * Used by logout / account deletion and the test-completion cleanup.
 */
export function resetTakeSession() {
  useTakeStore.setState({
    ...INITIAL,
    shuffledQuestions: [],
    answers: {},
    revealedAnswers: {},
    explanations: {},
    savedProgress: null,
  });
}
