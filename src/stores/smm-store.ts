import { makeStore } from '@/stores/make-store';
import type { SmmEventItem, SmmSpecialist } from '@/lib/app-types';

// ---------------------------------------------------------------------------
// SMM store — the «Подать заявку / Пригласить» wizard state and the SMM
// bookmark cache. The wizard runs in the SAME full-screen window the
// question cards used (start-test): a vertical swiper, one slide per stage,
// the bottom panel switches stages / confirms.
//
// Two flows:
//   invite (customer → specialist): event → role → message → review
//   apply   (specialist → event):   role → message → review
// ---------------------------------------------------------------------------

export type SmmWizardMode = 'invite' | 'apply' | 'send';

interface SmmData {
  // Wizard open state + who/what it targets
  wizardMode: SmmWizardMode | null;
  wizardSpecialist: SmmSpecialist | null; // invite target (customer side)
  wizardEvent: SmmEventItem | null;       // apply target (specialist side)
  wizardStep: number;                     // active slide index
  // Selections
  selEventId: string | null;              // invite: the event to attach to
  selRoleId: string | null;               // the role within the event
  wizardMessage: string;                  // unique ТЗ / application text
  wizardBusy: boolean;
  // The customer's own events cache (loaded when the wizard opens)
  myEvents: SmmEventItem[];
  // Invite FROM the events page: the event is preset, the SPECIALIST is
  // picked inside the wizard (an extra «specialist» stage). The candidate
  // list is fetched once when the flow opens.
  invitePickSpecialist: boolean;
  specialistCandidates: SmmSpecialist[];
  // Personal-library pins: target ids per kind (bookmark buttons on cards)
  smmBmSpecialists: string[];
  smmBmEvents: string[];
  smmBmRequests: string[];
  smmBmRoles: string[];
  // SEND mode (specialist → event): my запросы cache + the picked one
  wizardRequests: any[];
  selRequestId: string | null;
  // The «Отправленные запросы» page opens in edit mode via the dashboard's
  // «изменить» button (the button routes here with the toggle on)
  requestsEditMode: boolean;
  // The dock's «Личные роли | Общие роли» presets the roles page scope
  rolesScopeRequest: 'mine' | 'public';
}

const INITIAL: SmmData = {
  wizardMode: null,
  wizardSpecialist: null,
  wizardEvent: null,
  wizardStep: 0,
  selEventId: null,
  selRoleId: null,
  wizardMessage: '',
  wizardBusy: false,
  myEvents: [],
  invitePickSpecialist: false,
  specialistCandidates: [],
  smmBmSpecialists: [],
  smmBmEvents: [],
  smmBmRequests: [],
  smmBmRoles: [],
  wizardRequests: [],
  selRequestId: null,
  requestsEditMode: false,
  rolesScopeRequest: 'mine',
};

export const useSmmStore = makeStore(INITIAL);

// Fresh, hook-free read for handlers with stale closures
export const smmNow = () => useSmmStore.getState();

export function isSmmBookmarked(kind: 'specialist' | 'event' | 'request' | 'role', id: string): boolean {
  const s = smmNow();
  return (kind === 'specialist' ? s.smmBmSpecialists
    : kind === 'event' ? s.smmBmEvents
    : kind === 'request' ? s.smmBmRequests
    : s.smmBmRoles).includes(id);
}
