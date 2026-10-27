import { makeStore } from '@/stores/make-store';
import type { Question } from '@/lib/app-types';
import type { AttachmentItem } from '@/components/attachment-utils';

// ---------------------------------------------------------------------------
// EDITOR store — the create/edit test form: title, description, tags, cover,
// randomization, questions, attachments and the collapsible section states.
// One `reset()` returns the form to its pristine "new test" shape.
// Previously ~20 loose useState hooks inside app-root.tsx.
// ---------------------------------------------------------------------------

export const EMPTY_QUESTION: Question = {
  text: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctAnswer: 'A',
};

interface EditorData {
  testTitle: string;
  testDescription: string;
  // Tags: chips + autocomplete from the global tag dictionary
  testTags: string[];
  tagInput: string;
  allTags: string[];
  tagsOpen: boolean;
  // Cover customization: '' = auto (derived from tags/topic)
  testCoverIcon: string;
  testCoverColor: string;
  // Randomization of the SAVED test (editor toggle)
  randomizeQ: boolean;
  randomizeO: boolean;
  questions: Question[];
  // Set while the editor is bound to an existing test (edit mode)
  editingTestId: string | null;
  // True when the bound test is a VERSION of another test (parentId set).
  // A version can never be public (server-enforced) — the editor hides its
  // «make public / private» publication selector for versions entirely.
  editingTestIsVersion: boolean;
  // The bound test's version name (null = not named yet → the naming dialog
  // appears on the first save). Filled by openEditTest / startEditTestInTake.
  editingVersionName: string | null;
  // Dashboard "Edit Test" mode: when ON, clicking a test opens it in the editor
  editMode: boolean;
  formAttachments: AttachmentItem[];
  // Publication variant of the test — saved WITH the test and applies to the
  // test AND its attached files: false = only people with the link can open,
  // true = the whole community sees it in their feed.
  testIsPublic: boolean;
  // Attached Files collapse in the editor — same behavior as on the test card.
  // All editor sections start collapsed — the page opens as a compact list of
  // one-line cards.
  editorFilesExpanded: boolean;
  editorInfoExpanded: boolean;
  editorCoverExpanded: boolean;
  editorQuestionsExpanded: boolean;
  // Question/option photo upload progress marker (`q-<idx>` / `o-<idx>-<L>`)
  photoBusy: string;
}

const INITIAL: EditorData = {
  testTitle: '',
  testDescription: '',
  testTags: [],
  tagInput: '',
  allTags: [],
  tagsOpen: false,
  testCoverIcon: '',
  testCoverColor: '',
  randomizeQ: true,
  randomizeO: true,
  questions: [EMPTY_QUESTION],
  editingTestId: null,
  editingTestIsVersion: false,
  editingVersionName: null,
  editMode: false,
  formAttachments: [],
  testIsPublic: true,
  editorFilesExpanded: false,
  editorInfoExpanded: false,
  editorCoverExpanded: false,
  editorQuestionsExpanded: false,
  photoBusy: '',
};

export const useEditorStore = makeStore(INITIAL);

// Fresh, hook-free read for long-running handlers (save/edit flows)
export const editorNow = () => useEditorStore.getState();

/** Pristine "new test" data with FRESH nested arrays/objects (no shared refs). */
function freshEditor(): EditorData {
  return {
    ...INITIAL,
    questions: [{ ...EMPTY_QUESTION }],
    testTags: [],
    formAttachments: [],
  };
}

/** Return every form field to its pristine "new test" shape. */
export function resetTestForm() {
  useEditorStore.setState(freshEditor());
}
