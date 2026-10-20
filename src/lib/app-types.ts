/**
 * Shared app-wide domain types — moved out of src/app/page.tsx so the
 * extracted page-view components (src/components/pages/*) can import them
 * without circular imports. Runtime-free (types only).
 */

// 'guest-boot' — the anonymous share-link landing: the visitor opened
// ?test=<id> without a session; the app boots that one test into the taking
// screen while this splash is up. Guests can reach NOTHING else.
export type Page = 'auth' | 'dashboard' | 'create-test' | 'edit-test' | 'start-test' | 'take-test' | 'history' | 'profile' | 'guest-boot' | 'smm-event-editor' | 'smm-post-editor' | 'smm-apply' | 'smm-invite';

export interface Question {
  id?: string;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE?: string | null;
  correctAnswer: string;
  explanation?: string | null;
  translations?: Record<string, { text?: string; options?: Record<string, string>; explanation?: string }> | null;
  // Question photo — lives in the Telegram channel as tg:<file_id> (or a small
  // data: URL when the bot is not connected); imageMsgId tracks the channel post
  imageUrl?: string | null;
  imageMsgId?: number | null;
  // Per-option photos: { A: { u: 'tg:...', m: 123 }, C: {...} }
  optionImages?: Record<string, { u: string; m?: number | null }> | null;
  orderNum?: number;
}

export interface Attachment {
  id: string;
  testId: string;
  title: string;
  type: 'audio' | 'video' | 'pdf' | 'image' | 'embed' | 'link';
  url: string;
  size?: number | null;
  orderNum: number;
}

export interface Test {
  id: string;
  title: string;
  description: string;
  topic: string;
  creatorId: string;
  creator?: { id: string; name: string; image?: string | null };
  isPublic: boolean;
  // Version tree: parentId != null → this test is a VERSION (a copy of
  // somebody's test). Versions never appear in the community library.
  parentId?: string | null;
  // How many questions/answers this version changes vs its direct parent
  // (server-computed at every save). Drives the share-link button's two
  // states on the card: passive until changedCount >= 2.
  changedCount?: number;
  // The version's own NAME from the naming dialog (first save / first
  // share-by-link). null = not named yet. Shown in the version tree.
  versionName?: string | null;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  tags?: string[];
  coverIcon?: string | null;
  coverColor?: string | null;
  hasCoverImage?: boolean;
  questions: Question[];
  attachments?: Attachment[];
  _count?: { questions: number; attempts: number; attachments?: number };
  createdAt: string;
}

// One node of the version tree (see GET /api/tests/[id]/tree). The creator
// of a non-root node is the user who made this version — the apple photo.
// The node carries everything the FULL test cards need (library/shelf grid
// renders one version per cell through the same card code as the regular
// tests): tags for the cover palette, _count.attachments for the paperclip.
export interface TreeNode {
  id: string;
  title: string;
  description: string;
  topic: string;
  coverIcon?: string | null;
  coverColor?: string | null;
  parentId: string | null;
  rootId: string | null;
  changedCount?: number;
  // The version's own name from the naming dialog (null = not named yet)
  versionName?: string | null;
  createdAt: string;
  creatorId: string;
  creator: { id: string; name: string; image?: string | null };
  tags?: string[];
  _count?: { questions: number; attachments?: number };
}

// A note about a test (the alternative to a trivial fork)
export interface TestNote {
  id: string;
  testId: string;
  userId: string;
  text: string;
  createdAt: string;
  user?: { id: string; name: string; image?: string | null };
}

// The AI test passport readout (see GET /api/tests/[id]/metrics).
// difficulty/crossSubject/quality are graded by the AI at test-creation time
// ("под капотом"); timesTaken/recordScore/avgScore are live site metrics;
// userKnows is the viewer's personal topic score (null for guests).
export interface TestMetricsData {
  difficulty: number;
  crossSubject: number;
  quality: number;
  summary: string | null;
  genSource: string; // "ai" | "heuristic"
  timesTaken: number;
  recordScore: number | null;
  avgScore: number | null;
  userKnows: number | null;
  questions: number;
}

// Per-test group chat message (see /api/tests/[id]/chat)
export interface GroupMessage {
  id: string;
  testId: string;
  userId: string;
  userName: string;
  userImage?: string | null;
  text: string;
  createdAt: string;
}

export interface Attempt {
  id: string;
  testId: string;
  userId: string;
  score: number;
  totalQuestions: number;
  completed: boolean;
  startedAt: string;
  completedAt?: string;
  test?: { id: string; title: string; topic: string };
}

// ── SMM MODES (the second bottom panel) ────────────────────────────────────

// One media entry of a post: tg:/data:/https: URL (served like attachments)
export interface SmmPostMedia {
  url: string;
  type: 'video' | 'image';
  title?: string;
}

// ПОСТ — the specialist's card about their work for ONE role
export interface SmmPostT {
  id: string;
  specialistId: string;
  roleId: string;
  description: string;
  media?: SmmPostMedia[] | null;
  coverColor?: string | null;
  coverIcon?: string | null;
  createdAt: string;
  role?: { id: string; name: string; pricePerK?: number | null; pricePerDay?: number | null } | null;
  specialist?: { id: string; name: string; image?: string | null } | null;
}

// МЕРОПРИЯТИЕ — the customer's event: the 4 facts instead of questions
export interface SmmEventT {
  id: string;
  customerId: string;
  title: string;
  summary: string;
  brief?: string;
  format: 'online' | 'offline';
  platform: string;
  location: string;
  timeAt: string;
  testIds: string[];
  coverColor?: string | null;
  coverIcon?: string | null;
  isPublic: boolean;
  createdAt: string;
  customer?: { id: string; name: string; image?: string | null } | null;
  tests?: { id: string; title: string; _count?: { questions: number } }[];
}

// РОЛЬ специалиста — the price list line on their card
export interface SmmRoleT {
  id: string;
  name: string;
  pricePerK?: number | null;
  pricePerDay?: number | null;
  ownerId?: string | null;
  createdAt?: string;
}

// КАРТОЧКА СПЕЦИАЛИСТА (the customer's публичная библиотека)
export interface SmmSpecialistT {
  id: string;
  name: string;
  image?: string | null;
  rating: number;
  orders: number;
  roles: SmmRoleT[];
}

// A row of «Мои запросы»: a sent заявка or приглашение
export interface SmmRequestRowT {
  id: string;
  kind: 'application' | 'invitation';
  status: string;
  createdAt: string;
  score?: number;
  totalQuestions?: number;
  estimate?: number | null;
  eventId: string;
  eventTitle: string;
  roleId: string;
  roleName: string;
  counterpartyName: string;
}

// A row of the закладки window
export interface SmmBookmarkRowT {
  id: string;
  targetType: 'event' | 'specialist' | 'post';
  targetId: string;
  createdAt: string;
  event?: SmmEventT | null;
  specialist?: SmmSpecialistT | null;
  post?: SmmPostT | null;
}

// A chat card + a message
export interface SmmChatT {
  id: string;
  kind: 'group' | 'direct';
  title: string;
  ownerId?: string | null;
  lastMessageAt: string;
  lastMessage?: string | null;
  peer?: { id: string; name: string; image?: string | null } | null;
}

export interface SmmChatMessageT {
  id: string;
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  kind?: 'text' | 'system';
  createdAt: string;
}
