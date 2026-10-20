/**
 * Shared app-wide domain types — moved out of src/app/page.tsx so the
 * extracted page-view components (src/components/pages/*) can import them
 * without circular imports. Runtime-free (types only).
 */

// 'guest-boot' — the anonymous share-link landing: the visitor opened
// ?test=<id> without a session; the app boots that one test into the taking
// screen while this splash is up. Guests can reach NOTHING else.
// SMM pages: 'smm-mail' (Почта), 'smm-my-roles' (Личные роли), 'smm-shared-roles'
// (Общие роли), 'smm-requests' family (the specialist's structured запросы),
// 'smm-roles' (the roles pages host).
export type Page = 'auth' | 'dashboard' | 'create-test' | 'edit-test' | 'create-event' | 'start-test' | 'take-test' | 'history' | 'profile' | 'guest-boot' | 'smm-events' | 'smm-inbox' | 'smm-wizard' | 'smm-requests' | 'smm-request-editor' | 'smm-request-fill' | 'smm-roles' | 'smm-mail' | 'smm-my-roles' | 'smm-shared-roles' | 'smm-library';

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

// ─── SMM marketplace types ─────────────────────────────────────────────────

export type SmmRole = 'customer' | 'specialist';

export interface SmmSpecialist {
  id: string;
  name: string;
  image?: string | null;
  smmRole?: string;
  headline?: string | null;
  resume?: string | null;
  videoUrl?: string | null;
  city?: string | null;
  rate?: string | null;
  ready?: boolean;
  filesCount?: number;
  createdAt?: string;
}

export interface SmmRoleItem {
  id: string;
  name: string;
  brief?: string | null;
  payment?: string | null;
  deadline?: string | null;
  orderNum?: number;
  assigned?: { userId: string; name: string; image: string | null; source: string }[];
}

export interface SmmEventItem {
  id: string;
  title: string;
  summary?: string | null;
  brief?: string | null;
  deadline?: string | null;
  budget?: string | null;
  restrictions?: string | null;
  kind?: string | null;
  coverColor?: string | null;
  coverIcon?: string | null;
  status?: string | null;
  createdAt?: string;
  customerId?: string;
  customer?: { id: string; name: string; image: string | null } | null;
  // Other public open events of the SAME customer (the brief: the specialist
  // sees who created the event and what else that customer runs)
  customerOtherEvents?: { id: string; title: string; summary?: string | null; kind?: string | null; rolesCount: number }[];
  roles?: SmmRoleItem[];
  filesCount?: number;
  applicationsCount?: number;
  pendingApplications?: number;
  invitationsCount?: number;
  isOwner?: boolean;
  files?: SmmFileItem[];
}

export interface SmmFileItem {
  id: string;
  title: string;
  type?: string | null;
  url: string;
  size?: number | null;
  tgMessageId?: number | null;
  orderNum?: number;
  createdAt?: string;
}

export interface SmmInvitationItem {
  id: string;
  eventId: string;
  roleId: string;
  status: string;
  message?: string | null;
  createdAt: string;
  event?: { id: string; title: string; summary?: string | null; budget?: string | null; deadline?: string | null };
  role?: { id: string; name: string; brief?: string | null; payment?: string | null; deadline?: string | null };
  customer?: { id: string; name: string; image: string | null };
  specialist?: { id: string; name: string; image: string | null };
}

export interface SmmApplicationItem {
  id: string;
  eventId: string;
  roleId: string;
  status: string;
  message?: string | null;
  createdAt: string;
  event?: { id: string; title: string; summary?: string | null; budget?: string | null; deadline?: string | null };
  role?: { id: string; name: string; brief?: string | null; payment?: string | null; deadline?: string | null };
  specialist?: { id: string; name: string; image: string | null };
  // The structured запрос the specialist attached to this application
  request?: { id: string; title: string; summary?: string; steps?: { id: string; title: string; hint?: string; answer?: string }[] } | null;
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
