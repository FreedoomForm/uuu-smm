'use client';

import { Lang } from '@/lib/i18n';

/**
 * On-the-fly question translation.
 *
 * Tests whose questions have no stored translation for the selected interface
 * language (e.g. a test created by a user, or an old "Continue test" snapshot
 * saved before translations existed) are translated here via /api/translate,
 * cached in the session memory (and in OUR DATABASE — TranslationCache
 * table) and merged into the React state by the caller.
 *
 * Markdown images ![alt](src) and inline $...$ math are protected with
 * placeholders so the translator can't mangle them; if a placeholder is lost
 * in translation the protected fragment is appended after the text instead
 * (MathText renders images fine anywhere in the string).
 */

export interface QTranslationsV {
  text?: string;
  options?: Record<string, string>;
  explanation?: string;
}

export interface TranslatableQuestion {
  id?: string;
  text: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  optionE?: string | null;
  explanation?: string | null;
  translations?: Record<string, QTranslationsV> | null;
}

const memoryCache = new Map<string, string>();

// ---------- in-memory session cache (server DB holds the persistent copy) ----------

const cacheKey = (to: Lang, source: string) => `${to}|${source}`;

// ---------- placeholder protection ----------

const IMG_RE = /!\[[^\]]*\]\([^)\s]+\)/g;
const MATH_RE = /\$[^$\n]+\$/g;

/** Replace protected fragments with tokens the MT engine keeps intact. */
function protect(text: string): { safe: string; frags: string[] } {
  const frags: string[] = [];
  const safe = text.replace(IMG_RE, m => {
    const i = frags.push(m) - 1;
    return ` IMG${i}TOKEN `;
  }).replace(MATH_RE, m => {
    const i = frags.push(m) - 1;
    return ` MATH${i}TOKEN `;
  });
  return { safe, frags };
}

/** Restore tokens; append any fragment the translator lost to the end. */
function restore(text: string, frags: string[]): string {
  let out = text.replace(/ ?(IMG|MATH)(\d+)TOKEN ?/g, (_m, _k, n) => ` ${frags[Number(n)] ?? ''} `);
  const missing = frags.filter((f, i) => !out.includes(f));
  if (missing.length) {
    out = `${out}\n\n${missing.join('\n\n')}`;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

// ---------- batched + debounced translation queue ----------
//
// The naive implementation fired one POST per question (7 strings) with 4
// concurrent workers: entering a 78-question test launched ~78 requests in a
// couple of seconds and ran straight into the 30/min rate limit (429 flood).
//
// The queue instead collects strings for a short debounce window, sends them
// in large sequential batches (≤380 strings ≈ 2 requests for that same test),
// deduplicates identical in-flight strings, backs off exponentially on
// failure/429 and gives up after a few attempts (caller falls back to the
// source text — same contract as before, just without the flood).

const DEBOUNCE_MS = 250; // collect strings this long before the first send
const BATCH_MAX = 380; // server accepts 500; keep headroom
const BATCH_CHARS = 28000; // encoded-size headroom per request
const BACKOFF_START = 1500;
const BACKOFF_MAX = 30000;
const MAX_ATTEMPTS = 5; // per batch; then resolve nulls (caller falls back)

interface Deferred {
  promise: Promise<string | null>;
  resolve: (v: string | null) => void;
}

interface PendingEntry {
  source: string;
  deferred: Deferred;
}

interface LangQueue {
  pending: Map<string, PendingEntry>; // cacheKey(to, source) -> entry
  timer: ReturnType<typeof setTimeout> | null;
  draining: boolean;
  backoffMs: number;
}

const queues = new Map<Lang, LangQueue>();
// Same string asked twice while in flight shares one deferred — and one wire copy.
const inflight = new Map<string, Deferred>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeDeferred(): Deferred {
  let resolve!: (v: string | null) => void;
  const promise = new Promise<string | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function langQueue(to: Lang): LangQueue {
  let q = queues.get(to);
  if (!q) {
    q = { pending: new Map(), timer: null, draining: false, backoffMs: 0 };
    queues.set(to, q);
  }
  return q;
}

/** Enqueue one string; resolves with the translation (null = failed this run). */
function enqueueTranslation(to: Lang, source: string): Promise<string | null> {
  const key = cacheKey(to, source);
  const existing = inflight.get(key);
  if (existing) return existing.promise;

  const deferred = makeDeferred();
  inflight.set(key, deferred);
  const q = langQueue(to);
  q.pending.set(key, { source, deferred });
  if (!q.timer && !q.draining) {
    q.timer = setTimeout(() => {
      q.timer = null;
      void drain(q, to);
    }, DEBOUNCE_MS);
  }
  return deferred.promise;
}

/** Send pending strings in large sequential batches; retry failures with backoff. */
async function drain(q: LangQueue, to: Lang) {
  if (q.draining) return;
  q.draining = true;
  try {
    while (q.pending.size) {
      if (q.backoffMs) await sleep(q.backoffMs);

      // Take one batch (string count + encoded-size caps)
      const batch: { key: string; source: string; deferred: Deferred }[] = [];
      let chars = 0;
      for (const [key, entry] of q.pending) {
        const enc = encodeURIComponent(entry.source).length;
        if (batch.length >= BATCH_MAX || (batch.length > 0 && chars + enc > BATCH_CHARS)) break;
        batch.push({ key, source: entry.source, deferred: entry.deferred });
        chars += enc;
        q.pending.delete(key);
      }

      let ok = false;
      let attempts = 1;
      while (!ok && attempts <= MAX_ATTEMPTS) {
        if (attempts > 1) await sleep(q.backoffMs);
        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: batch.map((b) => b.source), to }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            const trs: string[] = Array.isArray(data?.translations) ? data.translations : [];
            // body.ok === false means upstream provider failure — retry, and
            // never cache identity translations of the fallback originals.
            if (trs.length === batch.length && data?.ok !== false) {
              ok = true;
              batch.forEach((b, j) => {
                const tr = typeof trs[j] === 'string' && trs[j].trim() ? trs[j].trim() : null;
                b.deferred.resolve(tr);
                inflight.delete(b.key);
                if (tr) memoryCache.set(cacheKey(to, b.source), tr);
              });
            }
          }
        } catch {
          // network error — fall through to the retry path
        }
        if (!ok) {
          q.backoffMs = q.backoffMs ? Math.min(q.backoffMs * 2, BACKOFF_MAX) : BACKOFF_START;
          attempts++;
        }
      }

      if (!ok) {
        // Gave up after MAX_ATTEMPTS: resolve nulls so callers fall back to
        // the source text (old failure contract) instead of waiting forever.
        batch.forEach((b) => {
          b.deferred.resolve(null);
          inflight.delete(b.key);
        });
      } else {
        q.backoffMs = 0;
      }
    }
  } finally {
    q.draining = false;
    if (q.pending.size && !q.timer) {
      // Strings arrived while the last batch was in the air
      q.timer = setTimeout(() => {
        q.timer = null;
        void drain(q, to);
      }, DEBOUNCE_MS);
    }
  }
}

// ---------- translation ----------

/** Translate a list of strings, consulting the in-memory cache first (the
 * persistent copy of every translation lives in our DATABASE, shared across
 * devices and visitors — nothing is cached on the phone). */
export async function translateStrings(texts: string[], to: Lang): Promise<(string | null)[]> {
  const result: (string | null)[] = new Array(texts.length).fill(null);
  const missingIdx: number[] = [];
  const missing: string[] = [];

  texts.forEach((t, i) => {
    if (!t || !t.trim()) { result[i] = ''; return; }
    const hit = memoryCache.get(cacheKey(to, t));
    if (typeof hit === 'string' && hit) result[i] = hit;
    else { missingIdx.push(i); missing.push(t); }
  });

  if (missing.length) {
    // The queue batches these across ALL concurrent callers of this module —
    // N questions joining within the debounce window share one request.
    const settled = await Promise.all(missing.map((src) => enqueueTranslation(to, src)));
    settled.forEach((v, j) => {
      result[missingIdx[j]] = v;
    });
  }

  return result;
}

/** Build the translated {text, options, explanation} for ONE question. */
export async function translateQuestion(q: TranslatableQuestion, to: Lang): Promise<QTranslationsV | null> {
  const letters = ['A', 'B', 'C', 'D', 'E'] as const;
  const optionTexts = letters.map(L => (q as unknown as Record<string, unknown>)[`option${L}`]).map(v => (typeof v === 'string' ? v : ''));

  const protectedText = protect(q.text);
  const protectedOpts = optionTexts.map(t => (t ? protect(t) : null));
  const protectedExpl = q.explanation ? protect(q.explanation) : null;

  const strings = [
    protectedText.safe,
    ...protectedOpts.map(p => (p ? p.safe : '')),
    protectedExpl ? protectedExpl.safe : '',
  ].map(s => s.trim());

  const translated = await translateStrings(strings, to);

  const text = translated[0] ? restore(translated[0], protectedText.frags) : undefined;
  const options: Record<string, string> = {};
  protectedOpts.forEach((p, i) => {
    const tr = translated[i + 1];
    const original = optionTexts[i];
    if (!original) return;
    const restored = tr ? restore(tr, p!.frags) : null;
    if (restored) options[letters[i]] = restored;
  });
  const explanation = translated[6] && protectedExpl ? restore(translated[6], protectedExpl.frags) : undefined;

  if (!text && !Object.keys(options).length && !explanation) return null;
  return { ...(text ? { text } : {}), ...(Object.keys(options).length ? { options } : {}), ...(explanation ? { explanation } : {}) };
}

/**
 * Translate every question that lacks a stored translation for `to`.
 * All questions join the shared debounced queue at once (the queue — not a
 * worker pool — is the throttle now), so a whole test travels in a couple of
 * large batched requests instead of one request per question. Returns a map
 * keyed by question id; `onOne` fires as each question's strings settle.
 */
export async function autoTranslateQuestions(
  questions: TranslatableQuestion[],
  to: Lang,
  onOne?: (id: string, tr: QTranslationsV) => void,
): Promise<Map<string, QTranslationsV>> {
  const out = new Map<string, QTranslationsV>();
  const queue = questions.filter(q => q.text && q.id && !q.translations?.[to]);

  await Promise.all(queue.map(async q => {
    try {
      const tr = await translateQuestion(q, to);
      if (tr && q.id) {
        out.set(q.id, tr);
        onOne?.(q.id, tr);
      }
    } catch {
      // single-question failure is non-fatal
    }
  }));
  return out;
}
