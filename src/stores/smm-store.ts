'use client';

// ---------------------------------------------------------------------------
// SMM store — the mode switcher state (the second bottom panel), the top-panel
// window modes (закладки / чаты), the contextual edit mode and the payloads
// of the two request flows (заявка специалиста / приглашение заказчика).
// Session-scope only: a reload returns to the last saved DB mode (User.smmRole).
// ---------------------------------------------------------------------------

import { makeStore } from '@/stores/make-store';

export type SmmMode = 'specialist' | 'customer';
// The main-window mode the top-panel buttons switch to ('profile' = the
// author window opened by tapping the author strip on any card; 'files' =
// the attached files of ONE card — the event's qualification tests / the
// post's media collection, the same contract the tests files window keeps)
export type SmmTopWindow = 'none' | 'bookmarks' | 'chats' | 'requests' | 'profile' | 'files' | 'card-chat' | 'map' | 'chat' | 'checklist' | 'admin';

// The card whose GROUP chat window is open (topWindow === 'card-chat') —
// the «Чат» button on every card opens everyone's chat about THIS card,
// the same per-card mechanic the test cards keep (openCardGroupChat).
export interface SmmCardChatTarget {
  kind: 'event' | 'post' | 'specialist';
  id: string;
  title: string;
}

// The card whose files window is open (topWindow === 'files'): the card's
// «Прикреплённые файлы» (the SAME attachment shape the test files window
// shows) + the event's qualification tests OR the post's media collection
// (carried at open time — no refetch needed, the card already holds them)
export interface SmmFilesTarget {
  kind: 'event' | 'post';
  id: string;
  title: string;
  tests?: { id: string; title: string; questions?: number }[];
  media?: { url: string; type: string }[];
  files?: { title: string; type: 'audio' | 'video' | 'pdf' | 'image' | 'embed' | 'link'; url: string; size?: number | null }[];
}

// The event whose qualification tests the specialist is taking (заявка flow)
export interface SmmApplyCtx {
  eventId: string;
  roleId: string; // the specialist's own role the application is sent with
  testIds: string[];
}

// The invitation payload the customer confirms on the estimate screen
export interface SmmInviteCtx {
  specialistId: string;
  specialistName: string;
  eventId: string;
  eventTitle: string;
  roleId: string;
  roleName: string;
  pricePerK: number | null;
  pricePerDay: number | null;
  eventFormat: 'online' | 'offline';
  estimate: number | null;
}

// The direct dialog the FULLSCREEN chat window shows (topWindow === 'chat'):
// accepted deal → the customer ↔ specialist page-chat with the same top /
// bottom panels as the main page; tapping the peer opens their profile.
export interface SmmChatPageCtx {
  chatId: string;
  peerId: string;
  peerName: string;
  peerImage?: string | null;
  title?: string; // the deal's event title (the chat header subtitle)
}

// The deal whose checklist window is open (topWindow === 'checklist')
export interface SmmChecklistCtx {
  dealType: 'application' | 'invitation';
  dealId: string;
  eventTitle: string;
  counterpartyName: string;
}

interface SmmData {
  // Active mode from the second bottom panel (persisted to User.smmRole)
  smmMode: SmmMode;
  // Main-window mode driven by the top-panel закладки/чат buttons
  topWindow: SmmTopWindow;
  // Contextual edit mode (the «изменить» top-panel button)
  editMode: boolean;
  // id of the card currently on screen (feed) / selected (grid) — drives the
  // contextual FIRST bottom bar (подать заявку / пригласить на мероприятие)
  activeCardId: string | null;
  // Role the specialist picked on an event card (their OWN role)
  pickedApplyRole: string | null;
  // Event + role the customer picked on a specialist card
  pickedInviteEvent: string | null;
  pickedInviteRole: string | null;
  // Flow payloads
  applyCtx: SmmApplyCtx | null;
  inviteCtx: SmmInviteCtx | null;
  // Bump to refetch the lists after a mutation
  refreshNonce: number;
  // Results of the event's tests passed during the заявка flow
  applyResults: Record<string, { score: number; total: number }>;
  // Open chat (chat window)
  openChatId: string | null;
  // The post/event being edited (null = create mode)
  editingId: string | null;
  // The author whose profile window is open (topWindow === 'profile')
  profileUserId: string | null;
  // The card whose files window is open (topWindow === 'files')
  filesTarget: SmmFilesTarget | null;
  // The card whose group chat window is open (topWindow === 'card-chat')
  cardChat: SmmCardChatTarget | null;
  // The fullscreen chat page context (topWindow === 'chat')
  chatPage: SmmChatPageCtx | null;
  // The deal whose checklist window is open (topWindow === 'checklist')
  checklistCtx: SmmChecklistCtx | null;
}

const INITIAL: SmmData = {
  smmMode: 'specialist',
  topWindow: 'none',
  editMode: false,
  activeCardId: null,
  pickedApplyRole: null,
  pickedInviteEvent: null,
  pickedInviteRole: null,
  applyCtx: null,
  inviteCtx: null,
  refreshNonce: 0,
  openChatId: null,
  editingId: null,
  profileUserId: null,
  filesTarget: null,
  cardChat: null,
  chatPage: null,
  checklistCtx: null,
  applyResults: {},
};

export const useSmmStore = makeStore<SmmData>(INITIAL);

export const smmNow = () => useSmmStore.getState();

export function bumpRefresh() {
  useSmmStore.setState((s: SmmData) => ({ refreshNonce: s.refreshNonce + 1 }));
}
