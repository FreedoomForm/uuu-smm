// ---------------------------------------------------------------------------
// Translate service — the free machine-translation relay used by the client
// (qtrans.ts) to translate questions on the fly.
//
// Provider chain, tried in order (no API keys needed):
//   1. clients5.google.com (Chrome dictionary endpoint) — batched, fast;
//   2. translate.googleapis.com (gtx) — per-text fallback;
//   3. api.mymemory.translated.net — per-text last resort.
//
// On top of the provider chain the service keeps two upstream-shielding
// layers (the relay is free and shared — every saved call counts):
//
//   * LRU+TTL CACHE — warm instances answer repeat strings from memory, so
//     N visitors of the same untranslated test cost ONE upstream pass, not N;
//   * SINGLE-FLIGHT — concurrent requests asking for the same string share
//     one upstream call instead of hammering the providers in parallel.
//
// On total failure the ORIGINAL texts are returned so the UI can fall back
// to the source language instead of breaking. The endpoint stays public
// (anonymous test viewers translate too) and is rate-limited per IP.
// ---------------------------------------------------------------------------

import { translateSchema } from "@/server/schemas";
import type { z } from "zod";
import { db } from "@/lib/db";

const LANGS = new Set(["en", "ru", "uz"]);
const MAX_STRINGS = 500;
const MAX_STRING_CHARS = 6000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Translation cache (in-memory, per warm instance)
// ---------------------------------------------------------------------------

const CACHE_CAP = 8000; // max cached strings (~2 MB heap worst case)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { v: string; t: number }>();

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // LRU touch: re-insert to move the entry to the eviction-safe tail
  cache.delete(key);
  cache.set(key, hit);
  return hit.v;
}

function cacheSet(key: string, value: string) {
  if (cache.size >= CACHE_CAP) {
    // Evict the least-recently-used head (Map iterates insertion order)
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { v: value, t: Date.now() });
}

const stringKey = (to: string, source: string) => `${to}|${source}`;

// ---------------------------------------------------------------------------
// Layer 1.5: DATABASE translation cache (TranslationCache table) — replaces
// the old client-side localStorage cache. Shared by every visitor, survives
// restarts, and keeps the free relay healthy across cold instances.
// All DB touches are best-effort: a hiccup must never break the relay.
// ---------------------------------------------------------------------------

function dbHash(source: string): string {
  // Same scheme the client cache used (fnv1a + length) — old device caches
  // migrated through /api/translate stay collision-compatible.
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + "_" + source.length.toString(36);
}

async function dbGetMany(to: string, sources: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!sources.length) return out;
  try {
    const hashes = [...new Set(sources.map(dbHash))];
    const rows = await db.translationCache.findMany({
      where: { lang: to, hash: { in: hashes } },
      select: { hash: true, text: true },
    });
    const byHash = new Map(rows.map(r => [r.hash, r.text]));
    for (const s of sources) {
      const v = byHash.get(dbHash(s));
      if (typeof v === "string") out.set(s, v);
    }
  } catch {
    // DB hiccup — fall through to the providers
  }
  return out;
}

async function dbPutMany(to: string, pairs: Map<string, string>): Promise<void> {
  if (!pairs.size) return;
  try {
    // The Map dedupes within the batch; the unique(hash,lang) constraint
    // guards against races across instances.
    await db.translationCache.createMany({
      data: [...pairs.entries()].map(([source, text]) => ({
        hash: dbHash(source),
        lang: to,
        text,
      })),
      skipDuplicates: true,
    });
  } catch {
    // best-effort — the in-memory cache still serves this instance
  }
}

// ---------------------------------------------------------------------------
// Single-flight registry: concurrent identical strings share one upstream call
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<(string | null)[]>>();

/** Translate a small chunk (≤40 strings) through the provider chain. */
async function translateChunk(texts: string[], to: string): Promise<(string | null)[]> {
  let result = await googleClients5(texts, to);
  if (!result) result = await googleGtx(texts, to);
  if (!result) result = await myMemory(texts, to);
  if (!result || result.length !== texts.length) return texts.map(() => null);
  return result.map((t) => (typeof t === "string" && t.trim() ? t : null));
}

/**
 * Translate `work` (non-empty, cache-miss) strings with cache + single-flight
 * + sequential upstream chunking. Returns the same number of entries; a null
 * means "upstream failed for this string" (caller falls back to the source).
 */
async function translateMisses(work: string[], to: string): Promise<(string | null)[]> {
  const CHUNK = 40; // mirrors the clients5 URL-size batching
  const out: (string | null)[] = new Array(work.length).fill(null);

  for (let start = 0; start < work.length; start += CHUNK) {
    const slice = work.slice(start, start + CHUNK);
    // Single-flight: every string gets ONE shared promise across all
    // concurrent requests; the chunk runs only if no identical chunk is
    // already upstream. Keyed by (to, chunk-content) so overlapping requests
    // coalesce and non-overlapping ones still translate their own tail.
    const chunkKey = stringKey(to, JSON.stringify(slice));
    let chunkPromise = inflight.get(chunkKey);
    if (!chunkPromise) {
      chunkPromise = translateChunk(slice, to).finally(() => {
        // microtask-delayed teardown: same-tick requesters can still join
        setTimeout(() => inflight.delete(chunkKey), 0);
      });
      inflight.set(chunkKey, chunkPromise);
    }
    const chunkResult = await chunkPromise;
    chunkResult.forEach((v, i) => {
      out[start + i] = v;
      if (v) cacheSet(stringKey(to, slice[i]), v);
    });
  }
  return out;
}

async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(ms),
    cache: "no-store",
  });
}

/** Provider 1: batched via repeated q params. */
async function googleClients5(texts: string[], to: string): Promise<string[] | null> {
  try {
    const out: string[] = [];
    // Chunk so the request URL stays well below server limits
    let batch: string[] = [];
    let encoded = 0;
    const flush = async () => {
      if (!batch.length) return;
      const qs = batch.map((q) => `q=${encodeURIComponent(q)}`).join("&");
      const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${to}&${qs}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`clients5 ${res.status}`);
      const data = await res.json();
      // Expected: [["перевод","en"], ...] — one entry per q
      if (!Array.isArray(data)) throw new Error("clients5 bad shape");
      for (const item of data) {
        if (Array.isArray(item) && typeof item[0] === "string") out.push(item[0]);
        else if (typeof item === "string") out.push(item);
        else out.push("");
      }
      batch = [];
      encoded = 0;
    };
    for (const t of texts) {
      const enc = encodeURIComponent(t).length;
      if (batch.length >= 40 || (batch.length > 0 && encoded + enc > 3600)) await flush();
      batch.push(t);
      encoded += enc;
    }
    await flush();
    return out.length === texts.length ? out : null;
  } catch {
    return null;
  }
}

/** Provider 2: classic gtx endpoint, one request per text. */
async function googleGtx(texts: string[], to: string): Promise<string[] | null> {
  const out: string[] = [];
  try {
    for (const t of texts) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(t)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`gtx ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("gtx bad shape");
      out.push(
        data[0]
          .map((seg: unknown[]) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
          .join("")
      );
    }
    return out;
  } catch {
    return null;
  }
}

/** Provider 3: MyMemory (autodetect source), one request per text. */
async function myMemory(texts: string[], to: string): Promise<string[] | null> {
  const out: string[] = [];
  try {
    for (const t of texts) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t.slice(0, 500))}&langpair=Autodetect|${to}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`mymemory ${res.status}`);
      const data = await res.json();
      const tr = data?.responseData?.translatedText;
      if (typeof tr !== "string" || !tr) throw new Error("mymemory empty");
      out.push(tr);
    }
    return out;
  } catch {
    return null;
  }
}

export async function translateTexts(
  input: z.infer<typeof translateSchema>,
  rawTexts: unknown
) {
  // Preserve the old lenient clamping: over-limit lists are truncated, junk
  // entries become "" (kept positionally) rather than failing the request.
  void LANGS;
  void rawTexts;
  const clean = input.texts
    .slice(0, MAX_STRINGS)
    .map((t) => (typeof t === "string" ? t.slice(0, MAX_STRING_CHARS) : ""));

  // Drop empty strings from translation (they translate to noise) but keep order
  const placeholders = new Map<number, string>(); // index -> original ''
  const work: string[] = [];
  const workIdx: number[] = [];
  clean.forEach((t, i) => {
    if (t.trim()) {
      work.push(t);
      workIdx.push(i);
    } else placeholders.set(i, "");
  });

  // Layer 1: serve everything the in-memory cache already knows. Even when
  // every string hits, identical repeat requests never reach the providers.
  const missWork: string[] = [];
  const missAt: number[] = [];
  const served = new Map<number, string>(); // work-position -> translation
  work.forEach((t, w) => {
    const hit = cacheGet(stringKey(input.to, t));
    if (typeof hit === "string") served.set(w, hit);
    else {
      missWork.push(t);
      missAt.push(w);
    }
  });

  // Layer 1.5: serve the misses from the shared DATABASE cache (this is what
  // used to live in each visitor's localStorage — now it belongs to us).
  let upstreamWork = missWork;
  let upstreamAt = missAt;
  if (missWork.length) {
    const dbHits = await dbGetMany(input.to, missWork);
    if (dbHits.size) {
      upstreamWork = [];
      upstreamAt = [];
      missWork.forEach((t, m) => {
        const v = dbHits.get(t);
        if (typeof v === "string") {
          served.set(missAt[m], v);
          cacheSet(stringKey(input.to, t), v); // warm the in-memory layer too
        } else {
          upstreamWork.push(t);
          upstreamAt.push(missAt[m]);
        }
      });
    }
  }

  // Layer 2: single-flight batched upstream pass for the remaining misses
  let ok = true;
  if (upstreamWork.length) {
    const missResult = await translateMisses(upstreamWork, input.to);
    const fresh = new Map<string, string>();
    missResult.forEach((v, m) => {
      if (typeof v === "string") {
        served.set(upstreamAt[m], v);
        fresh.set(upstreamWork[m], v);
      } else ok = false; // genuine upstream failure for this string
    });
    if (fresh.size) {
      void dbPutMany(input.to, fresh); // persist for every future visitor
    }
  }

  const final: string[] = new Array(clean.length).fill("");
  // positional join (work order == clean order for non-empty entries)
  let w = 0;
  for (let i = 0; i < clean.length; i++) {
    if (placeholders.has(i)) continue;
    const translated = served.get(w);
    // fallback to the original on failure so the UI keeps the source text
    final[i] = translated ?? clean[i];
    w++;
  }
  return { translations: final, ok };
}
