import type { ReactNode } from 'react';
import { MessageSquare, Paperclip, Pencil, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// SHEET-CONFIG — the bottom-sheet window switcher of the take-test screen
// (Attached Files / AI Tutor / Test Chat / Edit Test). Both the taking and
// the results screens used to build the same option array + the same switch
// logic inline; the only branch difference was WHICH question's thread the
// AI-tutor entry opens — now an injected openAi() callback.
// ---------------------------------------------------------------------------

export interface SheetOption {
  key: 'files' | 'ai' | 'group' | 'edit';
  label: string;
  icon: ReactNode;
  active: boolean;
}

/** The option list, verbatim from the old inline `sheetOptions`. */
export function buildSheetOptions(o: {
  filesCount: number;
  filesOpen: boolean;
  chatOpen: boolean;
  groupOpen: boolean;
  editOpen: boolean;
  filesLabel: string;
  aiLabel: string;
  groupLabel: string;
  editLabel: string;
}): SheetOption[] {
  return [
    ...(o.filesCount > 0 ? [{
      key: 'files' as const,
      label: o.filesLabel,
      icon: <Paperclip className="w-3.5 h-3.5" />,
      active: o.filesOpen,
    }] : []),
    { key: 'ai', label: o.aiLabel, icon: <MessageSquare className="w-3.5 h-3.5" />, active: o.chatOpen },
    { key: 'group', label: o.groupLabel, icon: <Users className="w-3.5 h-3.5" />, active: o.groupOpen },
    { key: 'edit', label: o.editLabel, icon: <Pencil className="w-3.5 h-3.5" />, active: o.editOpen },
  ];
}

/**
 * The switcher handler, verbatim from the old inline `switchSheet`. The only
 * branch difference was the AI-tutor case: which question's thread to open
 * (current question while taking, first question on results) — `openAi`.
 */
export function makeSwitchSheet(o: {
  setFilesOpen: (v: boolean) => void;
  setChatOpen: (v: boolean) => void;
  setGroupOpen: (v: boolean) => void;
  setEditOpen: (v: boolean) => void;
  openAi: () => void;
  startEdit: () => void;
}) {
  return (key: string) => {
    if (key === 'files') {
      o.setFilesOpen(true);
      o.setChatOpen(false);
      o.setGroupOpen(false);
      o.setEditOpen(false);
    } else if (key === 'ai') {
      o.setFilesOpen(false);
      o.setGroupOpen(false);
      o.setEditOpen(false);
      o.openAi();
    } else if (key === 'group') {
      o.setFilesOpen(false);
      o.setChatOpen(false);
      o.setGroupOpen(true);
      o.setEditOpen(false);
    } else if (key === 'edit') {
      o.setFilesOpen(false);
      o.setChatOpen(false);
      o.setGroupOpen(false);
      o.startEdit();
    }
  };
}
