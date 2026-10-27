import { makeStore } from '@/stores/make-store';
import type { Question, GroupMessage } from '@/lib/app-types';

// ---------------------------------------------------------------------------
// CHAT store — the per-test AI tutor conversations (MANY threads per test —
// the «Новый чат» button spawns fresh ones; threads persisted per user in the
// DATABASE, AiThread table) and the per-test group chat panel.
// Previously ~15 loose useState hooks inside app-root.tsx.
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Keyed by THREAD id (not test id!) — one test may own many conversations. */
export interface ChatThread {
  testId: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

/** Fresh client-side thread key (the server keeps it when free). */
export function newThreadKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* older browsers */ }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ChatData {
  // AI tutor sheet
  chatMessages: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  // The question the chat was opened on ('' = free-form tutor chat)
  chatQuestionId: string;
  chatUserAnswer: string;
  chatQuestionObj: Question | null;
  // the ACTIVE thread id (a key of chatThreads, '' = none yet)
  chatThreadId: string;
  chatThreads: Record<string, ChatThread>;
  // AI tutor sheet
  groupMessages: GroupMessage[];
  groupInput: string;
  groupSending: boolean;
}

const INITIAL: ChatData = {
  chatMessages: [],
  chatInput: '',
  chatLoading: false,
  chatQuestionId: '',
  chatUserAnswer: '',
  chatQuestionObj: null,
  chatThreadId: '',
  chatThreads: {},
  groupMessages: [],
  groupInput: '',
  groupSending: false,
};

export const useChatStore = makeStore(INITIAL);

// Fresh, hook-free read for the async send flows
export const chatNow = () => useChatStore.getState();

/** Close the AI tutor sheet and drop the visible conversation (scope switch). */
export function clearAiChat() {
  useChatStore.setState({
    chatMessages: [],
    chatQuestionId: '',
    chatQuestionObj: null,
    chatThreadId: '',
  });
}
