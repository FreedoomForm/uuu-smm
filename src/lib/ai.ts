/**
 * Unified AI client for the app (chat tutor + explanation generator).
 *
 * Provider chain, tried in order until one answers:
 *   0. Z.ai GLM (open.z.ai platform)   — when ZAI_API_KEY is configured.
 *      GLM-4.5-Flash: fast, multilingual (RU/EN/UZ), OpenAI-compatible REST.
 *      THE DEFAULT tutor engine.
 *   1. Gemini (Google AI Studio API)   — when GEMINI_API_KEY is configured.
 *      This is the same model family that powers "AI Mode" in Google Search.
 *   2. Google AI Mode (direct scrape)  — a no-key best-effort client that asks
 *      https://www.google.com/search?q=...&udm=50 (the AI Mode page) and parses
 *      the answer out of the returned HTML, mirroring
 *      github.com/Adwaith673/-Google-AI-Mode-Direct-Scraper.
 *      Google heavily CAPTCHAs datacenter IPs, so on serverless this usually
 *      fails fast — a circuit breaker skips it for a while after failures.
 *   3. Mistral                          — always-available fallback.
 *
 * Providers 0/1/3: 0 speaks plain REST (OpenAI-compatible), 1 and 3 speak the
 * Vercel AI SDK (github.com/vercel/ai — the standard LLM runtime for Next.js
 * backends) through the official @ai-sdk/google / @ai-sdk/mistral adapters.
 * All providers speak the same message array, so the routes stay unchanged.
 */
import { generateText, type ModelMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';

const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
const ZAI_MODEL = process.env.ZAI_MODEL || 'glm-4.5-flash';
const ZAI_BASE = (process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');
const ZAI_TIMEOUT_MS = 30_000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
// Legacy fallback: this key was committed to the repo historically, so it is
// PUBLIC — rotation is pending (move a fresh key into MISTRAL_API_KEY on the
// host and delete this default).
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'mstrl_naalPY3i3Et7CiwdCYCPFJhONOFzt0qI_13UuG1';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

const GEMINI_TIMEOUT_MS = 30_000;
const MISTRAL_TIMEOUT_MS = 45_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

/** Normalize SDK failures into messages the chain + routes already grep:
 *  rate limits must read "429" / "Too many requests" (the /api/chat mapper).
 *  The SDK wraps attempts in AI_RetryError (no top-level statusCode) — walk
 *  the per-attempt error list to recover the last HTTP status. */
function sdkError(label: string, e: unknown): Error {
  const err = e as {
    message?: string;
    statusCode?: number;
    errors?: Array<{ statusCode?: number; message?: string }>;
  };
  let status = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
  const desc = err?.message || String(e);
  if (status === undefined && Array.isArray(err?.errors)) {
    for (let i = err.errors.length - 1; i >= 0; i--) {
      const inner = err.errors[i];
      if (inner && typeof inner.statusCode === 'number') { status = inner.statusCode; break; }
    }
  }
  if (status === undefined && /rate limit|too many requests/i.test(desc)) status = 429;
  const tag =
    status === 429 ? 'HTTP 429: Too many requests'
    : status ? `HTTP ${status}`
    : 'no response';
  return new Error(`${label}: ${desc} (${tag})`);
}

/** Split the unified message array into the AI SDK's system + core messages. */
function toSdkMessages(options: ChatCompletionOptions): {
  system?: string;
  messages: ModelMessage[];
} {
  const system = options.messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');
  const messages: ModelMessage[] = options.messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }) as ModelMessage);
  return system ? { system, messages } : { messages };
}

/* ------------------------------------------------------------------ */
/* Provider 0 — Z.ai GLM (glm-4.5-flash) via OpenAI-compatible REST    */
/* ------------------------------------------------------------------ */

async function zaiChat(options: ChatCompletionOptions): Promise<string> {
  if (!ZAI_API_KEY) throw new Error('ZAI_NOT_CONFIGURED');
  try {
    const res = await fetch(`${ZAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: options.model || ZAI_MODEL,
        messages: options.messages,
        temperature: options.temperature ?? 0.5,
        max_tokens: options.max_tokens ?? 1600,
        // thinking is ON by default for glm-4.5 — the tutor needs snappy
        // replies, not a hidden reasoning pass.
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(ZAI_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const mapped = new Error(`ZAI_API_ERROR: ${res.status} ${body.slice(0, 300)} (HTTP ${res.status})`);
      if (res.status === 429) {
        (mapped as any).statusCode = 429;
        mapped.message = `ZAI_API_ERROR: HTTP 429: Too many requests`;
      }
      throw mapped;
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content || '';
    if (!text.trim()) throw new Error('ZAI_API_ERROR: empty completion (no response)');
    return text;
  } catch (e: any) {
    if (e?.message?.startsWith('ZAI_API_ERROR')) throw e;
    if (e?.name === 'TimeoutError' || /timeout/i.test(e?.message || '')) {
      throw new Error('ZAI_API_ERROR: timeout (no response)');
    }
    throw new Error(`ZAI_API_ERROR: ${e?.message || e} (no response)`);
  }
}

/* ------------------------------------------------------------------ */
/* Provider 1 — Gemini (Google AI Studio) via @ai-sdk/google           */
/* ------------------------------------------------------------------ */

async function geminiChat(options: ChatCompletionOptions): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_NOT_CONFIGURED');
  const { system, messages } = toSdkMessages(options);
  try {
    const google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
    const { text } = await generateText({
      model: google(GEMINI_MODEL),
      ...(system ? { system } : {}),
      messages,
      temperature: options.temperature ?? 0.5,
      maxOutputTokens: options.max_tokens ?? 1600,
      // The app layers its own rate-limit retry (callAIWithRetry) — SDK
      // internal retries would multiply the user-visible latency.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!text) throw new Error('empty completion');
    return text;
  } catch (e) {
    throw sdkError('GEMINI_API_ERROR', e);
  }
}

/* ------------------------------------------------------------------ */
/* Provider 3 — Mistral via @ai-sdk/mistral                            */
/* ------------------------------------------------------------------ */

async function mistralChat(options: ChatCompletionOptions): Promise<string> {
  const { system, messages } = toSdkMessages(options);
  try {
    const mistral = createMistral({ apiKey: MISTRAL_API_KEY });
    const { text } = await generateText({
      model: mistral(options.model || MISTRAL_MODEL),
      ...(system ? { system } : {}),
      messages,
      temperature: options.temperature ?? 0.5,
      maxOutputTokens: options.max_tokens ?? 800,
      // Same as Gemini: the app's callAIWithRetry owns rate-limit retries.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(MISTRAL_TIMEOUT_MS),
    });
    return text || '';
  } catch (e) {
    throw sdkError('MISTRAL_API_ERROR', e);
  }
}

/* ------------------------------------------------------------------ */
/* Provider 2 — Google AI Mode direct scrape (no API key)              */
/* ------------------------------------------------------------------ */

const AI_MODE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const AI_MODE_TIMEOUT_MS = 9000;

// Circuit breaker: after N consecutive failures skip the scrape for a while —
// datacenter IPs are usually CAPTCHA'd and retrying on every request only
// slows the chat down.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000;
let aiModeFailures = 0;
let aiModeBlockedUntil = 0;

function aiModeUrl(query: string): string {
  const qsubts = Date.now();
  return (
    'https://www.google.com/search?q=' + encodeURIComponent(query) +
    '&sourceid=chrome&ie=UTF-8&udm=50&aep=48&cud=0&qsubts=' + qsubts
  );
}

/** Strip HTML to plain text lines (same spirit as the scraper's BeautifulSoup pass). */
function htmlToLines(html: string): string[] {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

const AI_BLOCK_SELECTORS = [
  /<div[^>]+class="[^"]*(?:ai-response|generated-content|ai-overview|WaaZC|LMRCfc|hgKElc|Cx9mnf|SPZz6b)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
];

/**
 * Pull the AI answer out of an AI Mode page. The initial HTML embeds the
 * answer both as rendered blocks and inside JS data blobs; we try the blocks
 * first, then fall back to scanning decoded JS strings for the answer text.
 */
function extractAiModeAnswer(html: string, question: string): string | null {
  if (/(^|\/)sorry(\/|\?|")|unusual traffic|enablejs/i.test(html.slice(0, 4000))) return null;

  // 1. Rendered answer blocks
  for (const re of AI_BLOCK_SELECTORS) {
    re.lastIndex = 0;
    const blocks = html.match(re) || [];
    for (const b of blocks) {
      const text = htmlToLines(b).join('\n');
      if (text.length > 80 && text.length < 8000) return text;
    }
  }

  // 2. JS data blobs: AI Mode stores the answer text in escaped JSON strings.
  // Look for the longest readable string chunk on the page.
  const strings = html.match(/"[^"\\]{120,2000}"/g) || [];
  const candidates = strings
    .map(s => s.slice(1, -1))
    .filter(s => !/https?:|function\(|var |window\.|\.css|\.js|\{|\}/.test(s))
    .map(s => s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'))
    .filter(s => s.split(/\s+/).length > 15 && /[a-zа-яё\u0400-\u04FF]/i.test(s));
  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length);
    const best = candidates[0];
    if (best.length > 120) return best;
  }

  // 3. Whole-page fallback: question echoed followed by answer lines.
  const lines = htmlToLines(html);
  const qWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const startIdx = lines.findIndex(l => qWords.some(w => l.toLowerCase().includes(w)));
  if (startIdx >= 0) {
    const tail = lines.slice(startIdx + 1).join('\n');
    if (tail.length > 120) return tail.slice(0, 4000);
  }
  return null;
}

/** Collapse a chat into the single question string AI Mode is asked. */
function conversationToQuery(options: ChatCompletionOptions): string {
  const parts: string[] = [];
  for (const m of options.messages) {
    if (m.role === 'system') continue;
    parts.push(m.content);
  }
  return parts.join('\n\n').slice(0, 1800);
}

async function googleAiModeChat(options: ChatCompletionOptions): Promise<string> {
  if (Date.now() < aiModeBlockedUntil) throw new Error('AI_MODE_BREAKER_OPEN');

  const query = conversationToQuery(options);
  const res = await fetch(aiModeUrl(query), {
    headers: {
      'User-Agent': AI_MODE_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
      'Cookie': 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb',
    },
    signal: AbortSignal.timeout(AI_MODE_TIMEOUT_MS),
  });
  const html = await res.text();
  const answer = res.ok ? extractAiModeAnswer(html, query) : null;
  if (!answer) {
    aiModeFailures += 1;
    if (aiModeFailures >= BREAKER_THRESHOLD) {
      aiModeBlockedUntil = Date.now() + BREAKER_COOLDOWN_MS;
      aiModeFailures = 0;
    }
    throw new Error(`AI_MODE_NO_ANSWER (HTTP ${res.status})`);
  }
  aiModeFailures = 0;
  return answer;
}

/* ------------------------------------------------------------------ */
/* Chain                                                               */
/* ------------------------------------------------------------------ */

export type AiEngine = 'zai' | 'gemini' | 'google-ai-mode' | 'mistral';

/**
 * Run the chat through the provider chain. Returns the answer text.
 * Throws only when every provider failed (the routes map that to 5xx).
 */
export async function aiChat(options: ChatCompletionOptions): Promise<{ text: string; engine: AiEngine }> {
  const errors: string[] = [];

  // 0. Z.ai GLM-4.5-Flash — the default tutor engine (fast, RU-native).
  if (ZAI_API_KEY) {
    try {
      const text = await zaiChat(options);
      if (text.trim()) return { text, engine: 'zai' };
    } catch (e: any) {
      errors.push(`zai: ${e?.message || e}`);
    }
  }

  // 1. Gemini — the reliable "Google AI" path when a key is present.
  if (GEMINI_API_KEY) {
    try {
      const text = await geminiChat(options);
      if (text.trim()) return { text, engine: 'gemini' };
    } catch (e: any) {
      errors.push(`gemini: ${e?.message || e}`);
    }
  }

  // 2. Google AI Mode scrape — free, no key; skipped while the breaker is open.
  try {
    const text = await googleAiModeChat(options);
    if (text.trim()) return { text, engine: 'google-ai-mode' };
  } catch (e: any) {
    errors.push(`ai-mode: ${e?.message || e}`);
  }

  // 3. Mistral — proven fallback so the tutor never goes dark.
  const text = await mistralChat(options);
  return { text, engine: 'mistral' };
}

/** Small status probe used by /api/ai/status for deployment diagnostics. */
export function aiStatus() {
  return {
    zai: !!ZAI_API_KEY,
    zaiModel: ZAI_API_KEY ? ZAI_MODEL : null,
    gemini: !!GEMINI_API_KEY,
    geminiModel: GEMINI_API_KEY ? GEMINI_MODEL : null,
    aiModeBreakerOpen: Date.now() < aiModeBlockedUntil,
    mistral: !!MISTRAL_API_KEY,
  };
}
