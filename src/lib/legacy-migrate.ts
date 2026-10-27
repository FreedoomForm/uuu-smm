'use client';

// ---------------------------------------------------------------------------
// ZERO-ON-DEVICE migration + cleanup.
//
// Older app versions stored user data in localStorage. This module runs once
// per boot AFTER the session user is known: it UPLOADS whatever valuable data
// still sits on the device into the database (saved test progress, AI-tutor
// threads, interface language), then WIPES every app-related key so the
// phone keeps nothing. Idempotent — safe to run on every boot.
// ---------------------------------------------------------------------------

const PROGRESS_PREFIX = 'chemtest_progress_v1';
const LEGACY_KEYS = [
  'chemtest_user', // old localStorage session (now: httpOnly cookie + DB)
  'chemtest_cache_profile_v1', // profile snapshot (now: /api/me)
  'chemtest_cache_feed_v1', // legacy feed snapshot (now: DB + in-memory query cache)
  'chemtest_cache_attempts_v1', // attempts boot cache (now: /api/attempts)
  'chemtest-qtrans-v1', // translation cache (now: shared DB TranslationCache)
  'chemtest-lang', // interface language (now: User.lang in the DB)
];

export interface LocalMigrationResult {
  /** Language found on the device (pre-DB era) — the boot may adopt it. */
  localLang: string | null;
}

/**
 * Instant (synchronous) read of the pre-DB interface-language choice, made
 * BEFORE the background migration runs so the first paint already speaks
 * the user's language.
 */
export function readLegacyLang(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const lang = localStorage.getItem('chemtest-lang');
    return lang === 'ru' || lang === 'uz' || lang === 'en' ? lang : null;
  } catch {
    return null;
  }
}

function lsRemove(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

export async function migrateLocalToServer(
  userId: string,
  api: {
    saveProgress: (testId: string, data: unknown) => Promise<unknown>;
    saveAiThread: (id: string | null, testId: string, title: string, messages: unknown[]) => Promise<unknown>;
  }
): Promise<LocalMigrationResult> {
  const result: LocalMigrationResult = { localLang: null };
  if (typeof window === 'undefined') return result;

  // -- 1. Interface language (adopted by the boot if the DB never set one) --
  try {
    const lang = localStorage.getItem('chemtest-lang');
    if (lang === 'ru' || lang === 'uz' || lang === 'en') result.localLang = lang;
  } catch {}

  // -- 2. Saved test progress ("Continue Test") → SavedProgress table --
  try {
    const toMigrate: { key: string; testId: string; payload: unknown }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${PROGRESS_PREFIX}:`)) continue;
      // Migrate the CURRENT user's rows; rows of other accounts just die.
      if (!key.startsWith(`${PROGRESS_PREFIX}:${userId}:`)) { lsRemove(key); continue; }
      const testId = key.slice(`${PROGRESS_PREFIX}:${userId}:`.length);
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && parsed.v === 1 && testId) {
          toMigrate.push({ key, testId, payload: parsed });
        } else {
          lsRemove(key);
        }
      } catch { lsRemove(key); }
    }
    for (const item of toMigrate) {
      // Sequential + independent: one huge/failing row must not stop the rest.
      await api.saveProgress(item.testId, item.payload).catch(() => {});
      lsRemove(item.key);
    }
  } catch {}

  // -- 3. AI-tutor threads → AiThread table --
  try {
    const threadKey = `ai_threads_${userId}`;
    const raw = localStorage.getItem(threadKey);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, { title?: string; messages?: unknown[] }>;
      if (map && typeof map === 'object') {
        for (const [testId, th] of Object.entries(map)) {
          if (!testId || !th || !Array.isArray(th.messages) || th.messages.length === 0) continue;
          // null id → the server mints the thread id for the migrated row
          await api.saveAiThread(null, testId, String(th.title || ''), th.messages).catch(() => {});
        }
      }
      lsRemove(threadKey);
    }
    // Threads of other accounts on this device are wiped too.
    const staleThreads: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ai_threads_') && key !== threadKey) staleThreads.push(key);
    }
    staleThreads.forEach(lsRemove);
  } catch {}

  // -- 4. Wipe every legacy key — the phone keeps NOTHING --
  LEGACY_KEYS.forEach(lsRemove);
  // Per-user React Query feed snapshots (chemtest_rq_v1_<uid>) — any prefix match dies.
  try {
    const rqKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('chemtest_rq_v1_')) rqKeys.push(key);
    }
    rqKeys.forEach(lsRemove);
  } catch {}
  // Legacy client-set SSR marker cookie — the server session cookie replaced it.
  try { document.cookie = 'uuu_authed=; Max-Age=0; path=/'; } catch {}

  return result;
}
