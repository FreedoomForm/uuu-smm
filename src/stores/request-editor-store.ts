import { makeStore } from '@/stores/make-store';

// ---------------------------------------------------------------------------
// REQUEST EDITOR store — the create/edit ЗАПРОС form (the specialist's
// analogue of the test editor): title, summary, cover color, publication
// variant and the STEPS (the analogue of the question list — each step
// becomes a card on the filling screen). One `resetRequestForm()` returns
// the form to its pristine "new request" shape.
// ---------------------------------------------------------------------------

export interface RequestStepDraft {
  // Local drafts in create mode have a temp id ("local-*"); edit mode works
  // against real SmmRequestStep ids.
  id: string;
  title: string;
  hint: string;
  answer: string;
}

interface RequestEditorData {
  rqTitle: string;
  rqSummary: string;
  rqCoverColor: string;
  // Publication variant — the SAME semantics as the test's: false = only
  // people with the link, true = the public templates library.
  rqIsPublic: boolean;
  steps: RequestStepDraft[];
  // Set while the editor is bound to an existing запрос (edit mode)
  editingRequestId: string | null;
  // Section collapse states — all sections start collapsed, the page opens
  // as a compact list of one-line cards (the test editor's behavior)
  rqInfoExpanded: boolean;
  rqCoverExpanded: boolean;
  rqStepsExpanded: boolean;
}

const INITIAL: RequestEditorData = {
  rqTitle: '',
  rqSummary: '',
  rqCoverColor: '',
  rqIsPublic: true,
  steps: [],
  editingRequestId: null,
  rqInfoExpanded: false,
  rqCoverExpanded: false,
  rqStepsExpanded: false,
};

export const useRequestEditorStore = makeStore(INITIAL);

// Fresh, hook-free read for long-running handlers (save/edit flows)
export const requestEditorNow = () => useRequestEditorStore.getState();

function freshRequestEditor(): RequestEditorData {
  return { ...INITIAL, steps: [] };
}

/** Return every form field to its pristine "new request" shape. */
export function resetRequestForm() {
  useRequestEditorStore.setState(freshRequestEditor());
}

export const EMPTY_STEP: RequestStepDraft = {
  id: '', title: '', hint: '', answer: '',
};
