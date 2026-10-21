// API helper with auth.
//
// ZERO-ON-DEVICE policy: the user identity is resolved from the httpOnly
// session cookie (server-side DB session) — nothing user-related is ever
// written to localStorage/IndexedDB. The in-memory `currentUser` below is a
// session-scope cache only; the source of truth is GET /api/me.
import type { TestNote, TreeNode } from '@/lib/app-types';

const API_BASE = '/api';

let currentUser: { id: string; email: string; name: string } | null = null;

/** In-memory session cache ONLY — never persisted to the device. */
export function setUser(user: { id: string; email: string; name: string } | null) {
  currentUser = user;
}

export function getUser() {
  return currentUser;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  // Same-origin fetch: the browser attaches the httpOnly session cookie
  // automatically — no identity header, nothing readable by scripts.
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    // For rate limit responses, return the body so callers can handle it
    if (res.status === 429) {
      return { ...error, rateLimited: true };
    }
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  register: (data: { email: string; name: string; password: string }) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  // Destroy the server-side session + clear the httpOnly cookie.
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  // "Who am I?" — resolves the session cookie against the database.
  // Returns null (instead of throwing) for visitors without a live session.
  getSession: async (): Promise<{
    id: string; email: string; name: string; lang?: string; bgStyle?: string; image?: string | null; smmRole?: string; smmRating?: number;
  } | null> => {
    try {
      return await apiFetch('/me');
    } catch {
      return null;
    }
  },

  // Tests
  getTests: (creatorId?: string) =>
    apiFetch(`/tests${creatorId ? `?creatorId=${creatorId}` : ''}`),
  getTest: (id: string) => apiFetch(`/tests/${id}`),
  createTest: (data: any) => apiFetch('/tests', { method: 'POST', body: JSON.stringify(data) }),
  updateTest: (id: string, data: any) => apiFetch(`/tests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTest: (id: string) => apiFetch(`/tests/${id}`, { method: 'DELETE' }),

  // Personalized feed (keyset-paginated, tag-affinity ranked)
  getFeed: (params: { tab?: string; cursor?: string | null; limit?: number; tag?: string | null; q?: string | null; creatorId?: string | null; scope?: 'all' | 'mine' | 'discover' }) => {
    const sp = new URLSearchParams();
    if (params.tab) sp.set('tab', params.tab);
    if (params.cursor) sp.set('cursor', params.cursor);
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.tag) sp.set('tag', params.tag);
    if (params.q) sp.set('q', params.q);
    if (params.creatorId) sp.set('creatorId', params.creatorId);
    if (params.scope && params.scope !== 'all') sp.set('scope', params.scope);
    return apiFetch(`/feed?${sp.toString()}`);
  },
  // Engagement signal: the current feed card stayed on screen
  feedSignal: (testId: string, kind: 'view' | 'skip', ms?: number) =>
    apiFetch('/feed', { method: 'POST', body: JSON.stringify({ testId, kind, ...(ms != null ? { ms } : {}) }) }),

  // Sharing: make the user's own test public ("whole community" option)
  shareTest: (id: string, scope: 'link' | 'community') =>
    apiFetch(`/tests/${id}/share`, { method: 'POST', body: JSON.stringify({ scope }) }),

  // Personal-library bookmarks (the bookmark button lives on the cards in the
  // Discover mode; bookmarked tests appear in the user's library)
  getBookmarks: () => apiFetch('/bookmarks') as Promise<{ ids: string[] }>,
  addBookmark: (testId: string) =>
    apiFetch('/bookmarks', { method: 'POST', body: JSON.stringify({ testId }) }),
  removeBookmark: (testId: string) =>
    apiFetch(`/bookmarks?testId=${encodeURIComponent(testId)}`, { method: 'DELETE' }),

  // "Edit" on somebody else's test: copies it into the requester's library
  // (private, unique name) and returns the full copy to open in the editor
  copyTest: (id: string) =>
    apiFetch(`/tests/${id}/copy`, { method: 'POST' }),

  // The naming dialog: give the test its version name (first save / first
  // share-by-link). Touches only the versionName column — no gates.
  setVersionName: (id: string, versionName: string) =>
    apiFetch(`/tests/${id}/version-name`, { method: 'POST', body: JSON.stringify({ versionName }) }),

  // Version tree: the whole family of a test (trunk + branches), each node
  // with its creator — the "apples" of the tree view are the creators
  getTestTree: (id: string) =>
    apiFetch(`/tests/${id}/tree`) as Promise<{ rootId: string; nodes: TreeNode[] }>,

  // Notes about a test (the alternative to a trivial fork)
  getNotes: (id: string) =>
    apiFetch(`/tests/${id}/notes`) as Promise<{ notes: TestNote[] }>,
  createNote: (id: string, text: string) =>
    apiFetch(`/tests/${id}/notes`, { method: 'POST', body: JSON.stringify({ text }) }) as Promise<TestNote>,

  // Interests (onboarding + settings) — seeds the For You feed
  getInterests: () => apiFetch('/me/interests'),
  saveInterests: (interests: string[]) =>
    apiFetch('/me/interests', { method: 'PUT', body: JSON.stringify({ interests }) }),

  // Profile page — own profile (name, test-taking background, interface
  // language) and account management (logout kills the DB session; deletion
  // is permanent)
  getProfile: () => apiFetch('/me'),
  updateProfile: (data: { name?: string; bgStyle?: string; lang?: string }) =>
    apiFetch('/me', { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: () => apiFetch('/me', { method: 'DELETE' }),

  // Profile photo — raw fetch (FormData must not carry the JSON Content-Type);
  // the picture is stored IN THE TELEGRAM CHANNEL by /api/me/avatar
  uploadAvatar: async (file: Blob) => {
    const fd = new FormData();
    fd.append('file', file, 'avatar.jpg');
    const res = await fetch(`${API_BASE}/me/avatar`, { method: 'POST', body: fd });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    return res.json();
  },

  // Popular tags across public tests (feed filter chips)
  getPopularTags: async (): Promise<{ tag: string; count: number }[]> => {
    const res = await apiFetch('/tags/popular');
    return Array.isArray(res?.tags) ? res.tags : [];
  },

  // Global tag dictionary (autocomplete in the test editor)
  getTags: async (): Promise<string[]> => {
    const res = await apiFetch('/tags');
    return Array.isArray(res?.tags) ? res.tags : [];
  },

  // Per-test group chat (user ↔ user, polled)
  getGroupMessages: (testId: string, after?: string) =>
    apiFetch(`/tests/${testId}/chat${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  sendGroupMessage: (testId: string, text: string) =>
    apiFetch(`/tests/${testId}/chat`, { method: 'POST', body: JSON.stringify({ text }) }),

  // Attempts
  getAttempts: () => apiFetch('/attempts'),
  createAttempt: (testId: string, totalQuestions?: number) => apiFetch('/attempts', { method: 'POST', body: JSON.stringify({ testId, totalQuestions }) }),
  updateAttempt: (id: string, data: any) => apiFetch(`/attempts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Saved in-test progress ("Continue Test") — stored in the DATABASE
  // (previously a localStorage blob of up to 2.5 MB per test).
  getProgress: (testId: string) =>
    apiFetch(`/progress?testId=${encodeURIComponent(testId)}`) as Promise<{ progress: any | null; savedAt: number | null }>,
  saveProgress: (testId: string, data: unknown) =>
    apiFetch('/progress', { method: 'PUT', body: JSON.stringify({ testId, data }) }),
  deleteProgress: (testId: string) =>
    apiFetch(`/progress?testId=${encodeURIComponent(testId)}`, { method: 'DELETE' }),

  // AI-tutor threads (many conversations per test — «Новый чат») — stored in
  // the DATABASE (previously `ai_threads_<uid>` in localStorage). saveAiThread
  // passes the client's thread key (null → the server mints one) and always
  // gets { ok, id } back.
  getAiThreads: () => apiFetch('/ai/threads') as Promise<{ threads: { id: string; testId: string; title: string; messages: any[]; updatedAt: number }[] }>,
  saveAiThread: (id: string | null, testId: string, title: string, messages: unknown[]) =>
    apiFetch('/ai/threads', { method: 'PUT', body: JSON.stringify({ id: id || undefined, testId, title, messages }) }),

  // Explanations
  generateExplanations: (questionIds: string[], lang?: string) =>
    apiFetch('/explain', { method: 'POST', body: JSON.stringify({ questionIds, lang }) }),

  // AI Chat
  // questionContext carries the question EXACTLY as displayed to the student
  // (options may have been shuffled client-side, so DB labels are not enough)
  chat: (
    questionId: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    userAnswer?: string,
    questionContext?: { text: string; options: Record<string, string>; correctAnswer: string; topic: string }
  ) =>
    apiFetch('/chat', { method: 'POST', body: JSON.stringify({ questionId, messages, userAnswer, questionContext }) }),

  // AI chat about the WHOLE TEST («Обсудить с ИИ») — the server holds the
  // full test context (questions + ground-truth answers + passport scores)
  chatAboutTest: (testId: string, messages: { role: 'user' | 'assistant'; content: string }[]) =>
    apiFetch(`/tests/${testId}/ai-chat`, { method: 'POST', body: JSON.stringify({ messages }) }) as Promise<{ response?: string; rateLimited?: boolean; error?: string }>,

  // AI test passport — the x/100 metric cards of the «Обсудить с ИИ» window
  getTestMetrics: (testId: string) =>
    apiFetch(`/tests/${testId}/metrics`) as Promise<import('@/lib/app-types').TestMetricsData>,

  // Attachments (files attached to a test)
  getAttachments: (testId: string) => apiFetch(`/tests/${testId}/attachments`),
  addAttachment: (testId: string, data: { title: string; type: string; url: string; size?: number | null }) =>
    apiFetch(`/tests/${testId}/attachments`, { method: 'POST', body: JSON.stringify(data) }),
  updateAttachment: (id: string, data: { title?: string; type?: string; url?: string; orderNum?: number }) =>
    apiFetch(`/attachments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAttachment: (id: string) => apiFetch(`/attachments/${id}`, { method: 'DELETE' }),

  // Persist on-the-fly question translations (machine-translated in the browser)
  saveTranslations: (testId: string, lang: string, items: { id: string; text?: string; options?: Record<string, string>; explanation?: string }[]) =>
    apiFetch(`/tests/${testId}/translations`, { method: 'POST', body: JSON.stringify({ lang, items }) }),

  // ── SMM MODES (the second bottom panel) ────────────────────────────────
  // Switch the account mode (persisted in User.smmRole)
  setSmmMode: (smmMode: 'specialist' | 'customer') =>
    apiFetch('/me', { method: 'PUT', body: JSON.stringify({ smmRole: smmMode }) }),

  // Posts (the specialist's личная библиотека): video/photo collection +
  // description per role — ONE post per role.
  getPosts: (scope: 'mine' | 'user' = 'mine', userId?: string) =>
    apiFetch(`/smm/posts?scope=${scope}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`) as Promise<{ items: import('@/lib/app-types').SmmPostT[] }>,
  createPost: (data: { roleId?: string; role?: { name: string; pricePerK?: unknown; pricePerDay?: unknown }; description: string; media?: unknown; coverColor?: string | null; coverIcon?: string | null }) =>
    apiFetch('/smm/posts', { method: 'POST', body: JSON.stringify(data) }) as Promise<import('@/lib/app-types').SmmPostT>,
  updatePost: (id: string, data: { description?: string; media?: unknown; roleId?: string; role?: { name: string; pricePerK?: unknown; pricePerDay?: unknown }; coverColor?: string | null; coverIcon?: string | null }) =>
    apiFetch(`/smm/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }) as Promise<import('@/lib/app-types').SmmPostT>,
  deletePost: (id: string) => apiFetch(`/smm/posts/${id}`, { method: 'DELETE' }),

  // Events (the customer's личная библиотека / the specialist's публичная):
  // the 4 facts (format, platform/location, time) + qualification tests.
  getEvents: (scope: 'mine' | 'public' = 'public') =>
    apiFetch(`/smm/events?scope=${scope}`) as Promise<{ items: import('@/lib/app-types').SmmEventT[] }>,
  getEvent: (id: string) => apiFetch(`/smm/events/${id}`) as Promise<{ event: import('@/lib/app-types').SmmEventT }>,
  createEvent: (data: Record<string, unknown>) =>
    apiFetch('/smm/events', { method: 'POST', body: JSON.stringify(data) }) as Promise<import('@/lib/app-types').SmmEventT>,
  updateEvent: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/smm/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }) as Promise<import('@/lib/app-types').SmmEventT>,
  deleteEvent: (id: string) => apiFetch(`/smm/events/${id}`, { method: 'DELETE' }),

  // Specialists (the customer's публичная библиотека): cards with rating,
  // orders count, roles + prices.
  getSpecialists: () =>
    apiFetch('/smm/specialists') as Promise<{ items: import('@/lib/app-types').SmmSpecialistT[] }>,
  getMyRoles: () =>
    apiFetch('/smm/roles') as Promise<{ items: import('@/lib/app-types').SmmRoleT[] }>,
  deleteRole: (id: string) => apiFetch(`/smm/roles/${id}`, { method: 'DELETE' }),

  // Профиль (the author window opened from any card's author strip):
  // identity + the specialist's 4 params + their posts + their public events.
  getSmmProfile: (userId: string) =>
    apiFetch(`/smm/profile?userId=${encodeURIComponent(userId)}`) as Promise<import('@/lib/app-types').SmmProfileT>,

  // «Обсудить с ИИ» on the SMM cards: the AI holds the card's passport
  // (event facts / post + role prices / specialist + roles) server-side.
  smmCardChat: (kind: 'event' | 'post' | 'specialist', id: string, messages: { role: 'user' | 'assistant'; content: string }[]) =>
    apiFetch('/smm/ai-chat', { method: 'POST', body: JSON.stringify({ kind, id, messages }) }) as Promise<{ response?: string; rateLimited?: boolean; error?: string }>,

  // Заявки (the specialist applies to an event with one of their roles)
  getApplications: () =>
    apiFetch('/smm/applications') as Promise<{ items: import('@/lib/app-types').SmmRequestRowT[] }>,
  createApplication: (data: { eventId: string; roleId: string; score: number; totalQuestions: number }) =>
    apiFetch('/smm/applications', { method: 'POST', body: JSON.stringify(data) }),
  deleteApplication: (id: string) => apiFetch(`/smm/applications/${id}`, { method: 'DELETE' }),

  // Приглашения (the customer invites a specialist to an event with a role)
  getInvitations: () =>
    apiFetch('/smm/invitations') as Promise<{ items: import('@/lib/app-types').SmmRequestRowT[] }>,
  createInvitation: (data: { specialistId: string; eventId: string; roleId: string; estimate?: number | null }) =>
    apiFetch('/smm/invitations', { method: 'POST', body: JSON.stringify(data) }),
  deleteInvitation: (id: string) => apiFetch(`/smm/invitations/${id}`, { method: 'DELETE' }),

  // SMM bookmarks (закладки window): events / specialists / posts
  getSmmBookmarks: () =>
    apiFetch('/smm/bookmarks') as Promise<{ items: import('@/lib/app-types').SmmBookmarkRowT[] }>,
  addSmmBookmark: (targetType: 'event' | 'specialist' | 'post', targetId: string) =>
    apiFetch('/smm/bookmarks', { method: 'POST', body: JSON.stringify({ targetType, targetId }) }),
  removeSmmBookmark: (targetType: string, targetId: string) =>
    apiFetch(`/smm/bookmarks?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`, { method: 'DELETE' }),

  // Chats (чат window): group chats + direct dialogs
  getSmmChats: () =>
    apiFetch('/smm/chats') as Promise<{ items: import('@/lib/app-types').SmmChatT[] }>,
  createSmmChat: (title: string, peerId?: string) =>
    apiFetch('/smm/chats', { method: 'POST', body: JSON.stringify({ title, peerId }) }) as Promise<import('@/lib/app-types').SmmChatT>,
  renameSmmChat: (id: string, title: string) =>
    apiFetch(`/smm/chats/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteSmmChat: (id: string) => apiFetch(`/smm/chats/${id}`, { method: 'DELETE' }),
  getSmmChatMessages: (id: string, after?: string) =>
    apiFetch(`/smm/chats/${id}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`) as Promise<{ messages: import('@/lib/app-types').SmmChatMessageT[] }>,
  sendSmmChatMessage: (id: string, text: string) =>
    apiFetch(`/smm/chats/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }) as Promise<import('@/lib/app-types').SmmChatMessageT>,
};
