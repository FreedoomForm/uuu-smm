'use client';

import React from 'react';
import { Bot, ChevronDown, GitBranch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

/**
 * VERSION-NAME SHEET — the naming dialog for a test's version.
 *
 * It appears the FIRST time a version is created:
 *   • when saving changes to an existing test (the editor save), or
 *   • when pressing "share by link" on a personal test for the first time.
 *
 * The window is a LOOK-ALIKE OF THE CHAT WINDOW (the same ResizableSheetFrame
 * chrome as the register wall: drag bar, backdrop, rounded top, header row
 * with the round chevron button, the bg-cta icon square, the X) with one
 * assistant-style bubble and a name input. The name labels the version in
 * the version tree; Cancel aborts the action that requested the name.
 */
export function VersionNameSheet({
  open,
  mode,
  testTitle,
  value,
  onChange,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  /** 'save' — the naming dialog opened from the editor save; 'share' — from the first share-by-link. */
  mode: 'save' | 'share';
  testTitle: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  if (!open) return null;
  const canSave = !!value.trim();
  return (
    <ResizableSheetFrame
      open={open}
      onClose={onCancel}
      initialVh={0.62}
      minVh={0.35}
      header={
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onCancel}
              aria-label={t('cancel')}
              className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform shrink-0"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-cta rounded-lg flex items-center justify-center shrink-0">
              <GitBranch className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight">{t('versionNameTitle')}</p>
              <p className="text-xs text-muted-foreground leading-tight truncate">{testTitle}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      }
      body={
        <div className="px-4 py-3 space-y-3">
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 bg-cta rounded-lg flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-[#F4F4F5] border border-black/10 rounded-tl-sm">
              {mode === 'save' ? t('versionNameBubbleSave') : t('versionNameBubbleShare')}
            </div>
          </div>
          <div className="pl-9">
            <input
              autoFocus
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && canSave && !busy) onConfirm();
              }}
              placeholder={t('versionNamePh')}
              maxLength={200}
              aria-label={t('versionNameTitle')}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none focus:border-cta transition-colors"
            />
          </div>
        </div>
      }
      footer={
        <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button variant="outline" onClick={onCancel} disabled={busy} className="rounded-full h-10 flex-1">
            {t('cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canSave || busy}
            className="rounded-full h-10 flex-1 bg-cta hover:bg-cta/90 text-white border-cta"
          >
            {t('save')}
          </Button>
        </div>
      }
    />
  );
}
