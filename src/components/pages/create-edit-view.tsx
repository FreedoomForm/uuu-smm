'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/stores/editor-store';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

/**
 * CREATE / EDIT TEST screen — the full-page editor chrome (header + bottom
 * save bar). The form body itself (`editorBody`) is shared with the take-test
 * "Edit Test" sheet and is composed in app-root. The editingTestId/loading
 * come from the stores directly; app-root keeps the save action + goHome.
 */
export interface CreateEditViewProps {
  editorBody: React.ReactNode;
  handleSaveTest: () => void;
  goHome: () => void;
}

export default function CreateEditView({
  editorBody,
  handleSaveTest,
  goHome,
}: CreateEditViewProps) {
  const editingTestId = useEditorStore(s => s.editingTestId);
  const loading = useSessionStore(s => s.loading);
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  return (
    <div className="min-h-screen bg-background screen-enter">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        {/* FIXED h-14 — the uniform 56px top-panel contract (every page, every viewport). */}
        <div className="max-w-4xl mx-auto px-4 h-14 lg:h-16 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goHome} className="rounded-full"><ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}</Button>
          <h1 className="text-lg font-bold">{editingTestId ? t('editTest') : t('createNewTest')}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 pb-32 space-y-6">
        {editorBody}
      </main>

      {/* Bottom action bar — fixed to the screen edge on phones; a floating
          dock pill on desktop (the desktop-dock class re-anchors it). */}
      <div className="desktop-dock fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-4xl mx-auto px-4 pt-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Button onClick={() => handleSaveTest()} disabled={loading} className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90">
            {loading ? t('saving') : editingTestId ? t('save') : t('createTest')}
          </Button>
        </div>
      </div>
    </div>
  );
}
