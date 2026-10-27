'use client';

import React from 'react';
import MathText from '@/components/math-text';
import LangButton from '@/components/lang-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { trOption, trText, tUI } from '@/lib/i18n';
import { Home, LayoutGrid, MessageSquare, Paperclip, Pencil, Play, Rows3, Search, Users, X } from 'lucide-react';
import { useTakeStore } from '@/stores/take-store';
import { useNavStore } from '@/stores/nav-store';
import { useSessionStore } from '@/stores/session-store';
import { clearAiChat } from '@/stores/chat-store';
import { goToQuestion } from './take-actions';

// ---------------------------------------------------------------------------
// TAKE-HEADER — the sticky header of the taking screen: Home + language, the
// question-search overlay (filters THIS test's questions by text or option
// content; a pick jumps straight there), the view switcher, the answered
// counter, the Files toggle and the AI / group-chat / edit buttons, then the
// progress bar. Previously inlined in take-test-view.tsx.
// ---------------------------------------------------------------------------

export function TakeHeader({
  goHome,
  openChat,
  openGroupChat,
  startEditTestInTake,
  cycleDashView,
}: {
  goHome: () => void;
  openChat: (questionId: string, userAnswer?: string, opts?: { force?: boolean }) => void;
  openGroupChat: () => void;
  startEditTestInTake: () => void;
  cycleDashView: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const currentTest = useTakeStore(s => s.currentTest);
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  const currentQuestionIdx = useTakeStore(s => s.currentQuestionIdx);
  const answers = useTakeStore(s => s.answers);
  const qSearch = useTakeStore(s => s.qSearch);
  const setQSearch = useTakeStore(s => s.setQSearch);
  const qSearchOpen = useTakeStore(s => s.qSearchOpen);
  const setQSearchOpen = useTakeStore(s => s.setQSearchOpen);
  const chatOpen = useNavStore(s => s.chatOpen);
  const setChatOpen = useNavStore(s => s.setChatOpen);
  const filesOpen = useNavStore(s => s.filesOpen);
  const setFilesOpen = useNavStore(s => s.setFilesOpen);
  const groupOpen = useNavStore(s => s.groupOpen);
  const setGroupOpen = useNavStore(s => s.setGroupOpen);
  const editOpen = useNavStore(s => s.editOpen);
  const setEditOpen = useNavStore(s => s.setEditOpen);
  const dashView = useNavStore(s => s.dashView);

  const currentQ = shuffledQuestions[currentQuestionIdx];
  const qId = currentQ?.id || '';
  const progressPct = ((currentQuestionIdx + 1) / shuffledQuestions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  // Question search (take-test header): filter this test's questions by text
  // or option content; selecting a result jumps straight to that question.
  const qlc = qSearch.trim().toLowerCase();
  const qResults = qlc ? shuffledQuestions
    .map((q: any, qIdx: number) => ({ q, qIdx }))
    .filter(({ q }) =>
      trText(q, lang).toLowerCase().includes(qlc) ||
      ['A', 'B', 'C', 'D', 'E'].some(L => (trOption(q, L, lang) || '').toLowerCase().includes(qlc))
    )
    .slice(0, 12) : [];
  const qSearchDropdown = !qlc ? null : (
    <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-2xl border border-black/10 shadow-xl max-h-72 overflow-y-auto text-left animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150">
      {qResults.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{t('noResults')}</p>
      ) : qResults.map(({ q, qIdx }) => (
        <button
          key={q.id || qIdx}
          type="button"
          onClick={() => { goToQuestion(qIdx); setQSearch(''); setQSearchOpen(false); }}
          className="w-full text-left px-3 py-2.5 hover:bg-muted/50 border-b border-black/5 last:border-0 flex items-start gap-2"
        >
          <Badge variant="secondary" className="rounded-full shrink-0">{qIdx + 1}</Badge>
          <span className="text-sm line-clamp-2"><MathText text={trText(q, lang)} /></span>
        </button>
      ))}
    </div>
  );

  return (
    <header className="shrink-0 z-50 bg-white/80 backdrop-blur-md border-b">
      {/* FIXED h-14 — the uniform 56px top-panel contract (every page, every
          viewport; 64px from lg up — the desktop header). The row and the
          progress bar share the panel: 32px row + 4px gap + 8px bar = 44px,
          vertically centered. */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 lg:h-16 flex flex-col justify-center gap-1">
        {/* ONE row on EVERY viewport (flex-nowrap): all buttons compress to
            icon-only pills on narrow screens so the panel never wraps onto
            a second row. Search is a BUTTON; tapping it expands an input
            overlay that covers the whole row until dismissed. */}
        <div className="relative flex flex-nowrap items-center justify-between gap-1 sm:gap-2 w-full">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0">
            <Button variant="ghost" size="sm" onClick={goHome} className="shrink-0 h-8 w-8 p-0"><Home className="w-4 h-4" /></Button>
            <LangButton lang={lang} onChange={cycleLang} className="border-black shrink-0 px-1.5 sm:px-3" />
          </div>
          {qSearchOpen && (
            <div className="absolute inset-0 z-50 bg-white flex items-center gap-2 px-1 animate-in fade-in duration-150">
              <div className="flex-1 min-w-0 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  autoFocus
                  value={qSearch}
                  onChange={e => setQSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setQSearchOpen(false); setQSearch(''); } }}
                  placeholder={t('searchQuestions')}
                  className="h-9 rounded-full pl-9 bg-white border-black/15 text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setQSearchOpen(false); setQSearch(''); }}
                className="shrink-0 h-9 w-9 p-0"
                aria-label={t('cancel')}
              >
                <X className="w-4 h-4" />
              </Button>
              {qSearchDropdown}
            </div>
          )}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
            {/* View switcher — cycles the layouts and the QUESTION LIST on
            this page follows the selected view: TikTok feed → the regular
            one-question-per-slide quiz; Library → question cards in a grid;
            Shelf → one full-width question card per row. NO navigation. */}
            <Button
              variant="outline"
              size="sm"
              onClick={cycleDashView}
              className="shrink-0 h-8 w-8 p-0"
              title={t('viewMode')}
              aria-label={t('viewMode')}
            >
              {dashView === 'library'
                ? <LayoutGrid className="w-4 h-4" />
                : dashView === 'shelf'
                  ? <Rows3 className="w-4 h-4" />
                  : <Play className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQSearchOpen(true)}
              className="shrink-0 h-8 w-8 p-0"
              title={t('searchQuestions')}
              aria-label={t('searchQuestions')}
            >
              <Search className="w-4 h-4" />
            </Button>
            <span className="text-xs sm:text-sm text-muted-foreground hidden lg:inline">{t('xOfYAnswered', { n: answeredCount, m: shuffledQuestions.length })}</span>
            {(currentTest?.attachments?.length || 0) > 0 && (
              <Button
                variant={filesOpen ? 'default' : 'outline'}
                size="sm"
                onClick={() => { const next = !filesOpen; setFilesOpen(next); if (next) { setGroupOpen(false); setEditOpen(false); if (chatOpen) { setChatOpen(false); clearAiChat(); } } }}
                className={`h-8 px-1.5 sm:px-3 gap-1 ${filesOpen ? 'bg-cta hover:bg-cta/90 text-white border-cta' : ''}`}
              >
                <Paperclip className="w-4 h-4" />
                <span className="hidden sm:inline">{t('files', { n: currentTest!.attachments!.length })}</span>
                <span className="sm:hidden">{currentTest!.attachments!.length}</span>
              </Button>
            )}
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setChatOpen(true); setFilesOpen(false); setGroupOpen(false); setEditOpen(false); openChat(qId, answers[qId]); }}
                className="shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-3"
                title={t('aiTutor')}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">{t('aiTutor')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={openGroupChat}
                className="shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-3"
                title={t('chatWithAll')}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">{t('chat')}</span>
              </Button>
              <Button
                variant={editOpen ? 'default' : 'outline'}
                size="sm"
                onClick={startEditTestInTake}
                className={`shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-3 ${editOpen ? 'bg-cta hover:bg-cta/90 text-white border-cta' : ''}`}
                title={t('editThisTestTitle')}
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">{t('editTest')}</span>
              </Button>
            </>
          </div>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>
    </header>
  );
}
