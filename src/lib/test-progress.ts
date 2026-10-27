/**
 * Saved test progress ("Continue Test") — DATABASE persistence of the
 * full in-test state per user+test: the exact shuffled question order,
 * answers, practice reveals and position, plus the open attempt. A reload
 * (or leaving and coming back, ON ANY DEVICE) then offers "Continue Test"
 * instead of starting over. Cleared on submit.
 *
 * ZERO-ON-DEVICE: the snapshot lives in the SavedProgress table (previously
 * `chemtest_progress_v1:<uid>:<testId>` in localStorage). This module keeps
 * only a session-scope in-memory cache so repeat reads never hit the wire,
 * debounces writes (1.2s trailing) and flushes pending saves on page hide.
 */
import type { Attempt, Question } from '@/lib/app-types';
import { api } from '@/lib/api';

export interface SavedTestProgress {
  v: 1;
  testId: string;
  savedAt: number;
  attempt: Attempt | null;
  currentQuestionIdx: number;
  answers: Record<string, string>;
  practiceMode: boolean;
  revealedAnswers: Record<string, boolean>;
  shuffledQuestions: Question[];
}

const SAVE_DEBOUNCE_MS = 1_200;
const progressCache = new Map<string, SavedTestProgress | null>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const progressKey = (userId: string, testId: string) => `${userId || 'anon'}:${testId}`;

/** Shape-validate a payload coming from the network before caching it. */
function sanitize(raw: unknown, testId: string): SavedTestProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as SavedTestProgress;
  if (p.v !== 1 || p.testId !== testId || !Array.isArray(p.shuffledQuestions) || p.shuffledQuestions.length === 0) return null;
  if (!p.answers || typeof p.answers !== 'object') p.answers = {};
  if (!p.revealedAnswers || typeof p.revealedAnswers !== 'object') p.revealedAnswers = {};
  return p;
}

/** Load the saved progress for a test (memory first, then the DB). */
export async function readTestProgress(userId: string, testId: string): Promise<SavedTestProgress | null> {
  const key = progressKey(userId, testId);
  if (progressCache.has(key)) return progressCache.get(key)!;
  try {
    const res = await api.getProgress(testId);
    const p = sanitize(res?.progress, testId);
    progressCache.set(key, p);
    return p;
  } catch {
    // Network hiccup — no saved progress shown this session round.
    progressCache.set(key, null);
    return null;
  }
}

/** Persist the snapshot in the DB (debounced) + the in-memory cache (instant). */
export function writeTestProgress(userId: string, p: SavedTestProgress) {
  const key = progressKey(userId, p.testId);
  progressCache.set(key, p);
  const prev = saveTimers.get(key);
  if (prev) clearTimeout(prev);
  saveTimers.set(key, setTimeout(() => {
    saveTimers.delete(key);
    api.saveProgress(p.testId, p).catch(() => {
      // Offline / hiccup — the in-memory copy still covers this session.
    });
  }, SAVE_DEBOUNCE_MS));
}

/** Drop the snapshot (called on submit) — from the DB and the memory cache. */
export function clearTestProgress(userId: string, testId: string) {
  const key = progressKey(userId, testId);
  progressCache.set(key, null);
  const prev = saveTimers.get(key);
  if (prev) { clearTimeout(prev); saveTimers.delete(key); }
  api.deleteProgress(testId).catch(() => {});
}

/** Flush every debounced write immediately (page hide / app switch). */
export function flushPendingProgress() {
  for (const [, timer] of saveTimers) clearTimeout(timer);
  saveTimers.clear();
  // The cache holds the latest snapshots — persist all dirty entries.
  for (const [key, p] of progressCache) {
    if (p) api.saveProgress(p.testId, p).catch(() => {});
  }
}

let flushBound = false;
export function bindProgressFlush() {
  if (flushBound || typeof window === 'undefined') return;
  flushBound = true;
  window.addEventListener('pagehide', flushPendingProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingProgress();
  });
}

export const countAnsweredProgress = (p: SavedTestProgress | null) =>
  p ? Object.keys(p.answers || {}).filter(k => k && p.answers[k]).length : 0;
