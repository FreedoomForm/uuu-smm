'use client';

import React from 'react';
import { Bot, ChevronDown, FlaskConical, Loader2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

/**
 * GUEST-FLOW surfaces (anonymous share-link visitors):
 *
 *   GuestBootSplash — full-screen boot while ?test=<id> is fetched for a
 *   no-session visitor; on a dead link it offers the way into the app.
 *
 *   RegisterWallSheet — the registration gate. A anonymous user tapping
 *   Home / AI Tutor / Test Chat / Edit gets a bottom sheet that is a LOOK-
 *   ALIKE OF THE CHAT WINDOW (same ResizableSheetFrame chrome: drag bar,
 *   backdrop, rounded top, header row with the round chevron button, the
 *   bg-cta icon square, the X) with one assistant-style bubble asking to
 *   register — plus Cancel to keep taking the test.
 */

export function GuestBootSplash({ failed, onAuth }: { failed: boolean; onAuth: () => void }) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 screen-enter">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-cta rounded-2xl flex items-center justify-center mb-4 shadow-lg">
          <FlaskConical className="w-8 h-8 text-white" />
        </div>
        {failed ? (
          <>
            <h1 className="text-xl font-bold mb-1">{t('deadLinkTitle')}</h1>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">{t('deadLinkDesc')}</p>
            <Button onClick={onAuth} className="rounded-full h-10 px-6 bg-primary hover:bg-primary/90">
              {t('signUpLink')}
            </Button>
          </>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
        )}
      </div>
    </div>
  );
}

export function RegisterWallSheet({
  open,
  onClose,
  onRegister,
  context,
}: {
  open: boolean;
  onClose: () => void;
  onRegister: () => void;
  /** What the visitor tried to open — tailors the bubble text. */
  context: 'home' | 'chat' | 'edit';
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  if (!open) return null;
  const descKey = context === 'chat' ? 'registerWallDescChat' : context === 'edit' ? 'registerWallDescEdit' : 'registerWallDescHome';
  return (
    <ResizableSheetFrame
      open={open}
      onClose={onClose}
      initialVh={0.62}
      minVh={0.35}
      header={
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              aria-label={t('cancel')}
              className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform shrink-0"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-cta rounded-lg flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight">{t('registerWallTitle')}</p>
              <p className="text-xs text-muted-foreground leading-tight truncate">{t('registerWallSub')}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      }
      body={
        <div className="px-4 py-3">
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 bg-cta rounded-lg flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-[#F4F4F5] border border-black/10 rounded-tl-sm">
              {t(descKey)}
            </div>
          </div>
        </div>
      }
      footer={
        <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button variant="outline" onClick={onClose} className="rounded-full h-10 flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={onRegister} className="rounded-full h-10 flex-1 bg-cta hover:bg-cta/90 text-white border-cta">
            {t('signUpLink')}
          </Button>
        </div>
      }
    />
  );
}
