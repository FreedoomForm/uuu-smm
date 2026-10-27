/**
 * GUEST TEST-TAKING — the anonymous share-link flow.
 *
 * Anyone who opens a test link (?test=<id>) without a session can TAKE that
 * test: the link boots straight into the taking screen (first question on
 * screen) and nothing else of the app is reachable. While they answer, the
 * full in-test snapshot (shuffled order, answers, position, practice reveals)
 * is mirrored to LOCALSTORAGE (guests have no account, so the DB progress API
 * is out of reach).
 *
 * The moment the visitor registers or logs in, the snapshot is migrated into
 * the account (SavedProgress table through the normal test-progress module)
 * and the taking screen restores at the exact saved position — "continue
 * from where you stopped".
 */

import type { SavedTestProgress } from '@/lib/test-progress';

/** localStorage key holding the test id of the guest session in flight. */
const TAKE_KEY = 'uuu_guest_take';
/** localStorage key prefix for the per-test guest snapshot. */
const SNAP_PREFIX = 'uuu_guest_progress:';

const hasWindow = () => typeof window !== 'undefined';

/** Shape-validate a snapshot read back from localStorage. */
function sanitize(raw: unknown, testId: string): SavedTestProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as SavedTestProgress;
  if (p.v !== 1 || p.testId !== testId || !Array.isArray(p.shuffledQuestions) || p.shuffledQuestions.length === 0) return null;
  if (!p.answers || typeof p.answers !== 'object') p.answers = {};
  if (!p.revealedAnswers || typeof p.revealedAnswers !== 'object') p.revealedAnswers = {};
  return p;
}

/** The test id of the guest session currently in flight (null outside guests). */
export function getGuestTakeTestId(): string | null {
  if (!hasWindow()) return null;
  try { return window.localStorage.getItem(TAKE_KEY); } catch { return null; }
}

/** Mark / clear the guest session. Cleared on submit and after auth-migration. */
export function setGuestTakeTestId(id: string | null) {
  if (!hasWindow()) return;
  try {
    if (id) window.localStorage.setItem(TAKE_KEY, id);
    else window.localStorage.removeItem(TAKE_KEY);
  } catch { /* private mode — the session just won't survive a reload */ }
}

/** Read the guest snapshot saved for a test (null when none / corrupt). */
export function readGuestSnapshot(testId: string): SavedTestProgress | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(SNAP_PREFIX + testId);
    return sanitize(raw ? JSON.parse(raw) : null, testId);
  } catch { return null; }
}

/** Persist the guest snapshot (called on the same debounced cadence as the DB writer). */
export function writeGuestSnapshot(p: SavedTestProgress) {
  if (!hasWindow()) return;
  try { window.localStorage.setItem(SNAP_PREFIX + p.testId, JSON.stringify(p)); } catch { /* quota / private mode */ }
}

/** Drop the guest snapshot — the test was submitted (or migrated to an account). */
export function clearGuestSnapshot(testId: string) {
  if (!hasWindow()) return;
  try { window.localStorage.removeItem(SNAP_PREFIX + testId); } catch { /* ignore */ }
}
