/**
 * Shared app-wide domain types — moved out of src/app/page.tsx so the
 * extracted page-view components (src/components/pages/*) can import them
 * without circular imports. Runtime-free (types only).
 */

// 'guest-boot' — the anonymous share-link landing: the visitor opened
// ?test=<id> without a session; the app boots that one test into the taking
// screen while this splash is up. Guests can reach NOTHING else.
// 'landing' — the public marketing home (ТУРИЗМ × SMM: the idea, the 4
// pillars, the CTA) — the FIRST screen every guest sees instead of the old
// login card. 'map' — the public photo-spots map (guests welcome; authed
// users get it INSIDE the main page via the top-panel icon). The old
// 'tools'/'catalog' pages are gone (ИИ-агент / личная-публичная библиотека).
export type Page = 'auth' | 'landing' | 'map' | 'dashboard' | 'create-test' | 'edit-test' | 'start-test' | 'take-test' | 'history' | 'profile' | 'guest-boot' | 'smm-event-editor' | 'smm-post-editor' | 'smm-apply' | 'smm-invite';

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

// The «Прикреплённые файлы» row of the SMM editors — the SAME shape the
// test attachments keep (title/type/url/size + the Telegram storage ref)
export interface SmmAttachmentT {
  title: string;
  type: 'audio' | 'video' | 'pdf' | 'image' | 'embed' | 'link';
  url: string;
  size?: number | null;
  tgMessageId?: number | null;
}

// ПОСТ — the specialist's card about their work for ONE role
export interface SmmPostT {
  id: string;
  specialistId: string;
  roleId: string;
  description: string;
  media?: SmmPostMedia[] | null;
  attachments?: SmmAttachmentT[] | null;
  coverColor?: string | null;
  coverIcon?: string | null;
  // АВТОПОСТ: the system created this post in the личная библиотека right
  // after a deal completed (both sides confirmed)
  autoGenerated?: boolean;
  // «Публичная» — published to the specialist's profile (private posts and
  // автопосты stay in the personal library until this flips)
  isPublic?: boolean;
  // version linkage: «Изменить» on somebody else's post creates a private
  // VERSION of the original (parentId = the source) in MY library
  parentId?: string | null;
  versionName?: string | null;
  createdAt: string;
  role?: { id: string; name: string; pricePerK?: number | null; pricePerDay?: number | null } | null;
  specialist?: { id: string; name: string; image?: string | null } | null;
}

// МЕРОПРИЯТИЕ (= ЗАКАЗ на бирже услуг) — the customer's order: the 4 facts
// instead of questions. category = the service category of the exchange;
// barter = what the executor receives in exchange (blogger tours).
export type SmmCategory = 'instagram' | 'reels' | 'hotel-review' | 'photo' | 'content-plan' | 'blogger-tour' | 'other';

export interface SmmEventT {
  id: string;
  customerId: string;
  title: string;
  summary: string;
  brief?: string;
  category?: SmmCategory;
  barter?: string;
  format: 'online' | 'offline';
  platform: string;
  location: string;
  timeAt: string;
  // бюджет на одного SMM-специалиста (текстом: «500 000 сум», «бартер»…)
  budget: string;
  testIds: string[];
  attachments?: SmmAttachmentT[] | null;
  coverColor?: string | null;
  coverIcon?: string | null;
  isPublic: boolean;
  // version linkage: «Изменить» on somebody else's мероприятие creates a
  // private VERSION of the original (parentId = the source) in MY library —
  // it lands in the личная библиотека, never in the community feed
  parentId?: string | null;
  versionName?: string | null;
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
  reviewsCount?: number;
  orders: number;
  roles: SmmRoleT[];
  premium?: boolean;
}

// КАТАЛОГ КОМПАНИЙ — the customer side of the catalog
export interface SmmCompanyT {
  id: string;
  name: string;
  image?: string | null;
  premium: boolean;
  companyName: string;
  companyType: string;
  city: string;
  headline: string;
  openOrders: number;
  rating?: number;
  reviewsCount?: number;
  filled: boolean;
}

// ФОТО-СПОТ — one pin on the public map
export interface PhotoSpotT {
  id: string;
  authorId: string;
  title: string;
  description: string;
  lat: string;
  lng: string;
  place: string;
  bestTime: string;
  angleTips: string;
  media?: { url: string; type: string; title?: string }[] | null;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  author?: { id: string; name: string; image?: string | null; smmPremium?: boolean } | null;
}

// ОКНО ПРОФИЛЯ (opened by tapping an author on any SMM card): the identity
// (specialist 4 params when roles exist) + their posts + their public events.
export interface SmmProfileT {
  user: {
    id: string;
    name: string;
    image?: string | null;
    rating: number;
    orders: number;
    mode?: string | null;
    premium?: boolean;
    companyName?: string;
    companyType?: string;
    companyCity?: string;
    headline?: string;
    roles: SmmRoleT[];
  };
  posts: SmmPostT[];
  events: SmmEventT[];
  // Отзывы (Mercur model): real average + the recent ones
  reviewAgg?: { avg: number | null; count: number };
  reviews?: SmmReviewT[];
}

// ИИ-АГЕНТ: the parsed ТЗ of a future заказ (the agent sheet turns it into
// a real SmmEvent with one tap)
export interface AgentEventTzT {
  title: string;
  summary: string;
  brief: string;
  category: string;
  platform: string;
  format: string;
  deadline: string;
  budget: string;
  restrictions: string;
}

// A row of «Мои запросы»: a sent заявка or приглашение
export interface SmmRequestRowT {
  id: string;
  kind: 'application' | 'invitation';
  status: string;
  createdAt: string;
  score?: number;
  totalQuestions?: number;
  // Заявка без теста: the link to the ad post/video the specialist attached
  proofUrl?: string;
  proofNote?: string;
  estimate?: number | null;
  // Deal lifecycle (Mercur model): both-side completion + my review
  completedByCustomer?: boolean;
  completedBySpecialist?: boolean;
  myReview?: { rating: number; comment: string } | null;
  eventId: string;
  eventTitle: string;
  roleId: string;
  roleName: string;
  counterpartyName: string;
  // The chat page needs the real peer id (open their profile / direct chat)
  counterpartyId?: string;
  // 'sent' = my own request (withdrawable), 'incoming' = arrived for me
  direction?: 'sent' | 'incoming';
}

// ЧЕК-ЛИСТ СДАЧИ — one delivery slot on an accepted deal (see the service)
export interface SmmChecklistItemT {
  idx: number;
  label: string;
  desc: string;
  value: string;
  valueKind: 'link' | 'file';
  status: 'pending' | 'submitted' | 'approved' | 'declined';
  note: string;
  updatedAt: string;
}

// СОС-тикет in the админ-панель (kind: "sos" | "deal-complete" | "deal-cancel")
export interface SmmTicketT {
  id: string;
  status: 'open' | 'accepted' | 'closed';
  kind?: string;
  eventTitle: string;
  peerNames: string;
  reason: string;
  chatId: string;
  dealType: string;
  dealId: string;
  createdById?: string;
  createdByName: string;
  adminName: string;
  createdAt: string;
}

// ── CHAT META — the live deal state a direct chat renders (see getChatMeta):
// the invitations the chat's ПРИГЛАШЕНИЕ#<id> messages bind their buttons to,
// the active deal (the finish/cancel bar) and the pending admin request.
export interface SmmChatInvitationT {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed' | string;
  estimate: number | null;
  eventId: string;
  eventTitle: string;
  eventFormat?: string;
  roleId: string;
  roleName: string;
  customerId: string;
  specialistId: string;
  createdAt?: string;
}

export interface SmmChatDealT {
  dealType: 'application' | 'invitation';
  dealId: string;
  status: string;
  completedByCustomer: boolean;
  completedBySpecialist: boolean;
  eventTitle: string;
  roleName: string;
}

export interface SmmChatMetaT {
  invitations: SmmChatInvitationT[];
  deal: SmmChatDealT | null;
  adminTicket: { id: string; kind: string; status: string } | null;
}

export interface SmmAdminDataT {
  tickets: SmmTicketT[];
  users: { id: string; name: string; email: string; smmRole: string; isBlocked: boolean; isAdmin: boolean; createdAt: string }[];
}

// The admin's two ticket LIBRARIES (the marketplace docks): pool = every
// OPEN ticket (the ПУБЛИЧНАЯ library all admins share), mine = the tickets
// THIS admin accepted (the ЛИЧНАЯ library — removed from everyone's pool).
export interface SmmTicketPoolT {
  pool: SmmTicketT[];
  mine: SmmTicketT[];
}

// A review received on the profile («Отзывы» block)
export interface SmmReviewT {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  authorName: string;
  authorImage?: string | null;
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
