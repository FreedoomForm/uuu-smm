'use client';

import React from 'react';
import LangButton from '@/components/lang-button';
import { AttachmentItem } from '@/components/attachment-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { trOption, trText, tUI } from '@/lib/i18n';
import { ArrowLeft, LayoutGrid, MessageSquare, Paperclip, Pencil, Play, RefreshCw, Rows3, Search, ShieldCheck, Users } from 'lucide-react';
import { testBackgroundCss } from '@/lib/test-bg';
import { TranslatingPill } from '@/components/shared-bits';
import MathText from '@/components/math-text';
import { useTakeStore } from '@/stores/take-store';
import { useSmmStore } from '@/stores/smm-store';
import { useNavStore } from '@/stores/nav-store';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useSessionStore } from '@/stores/session-store';
import { useProfileStore } from '@/stores/profile-store';
import { OverlayPanels } from './overlay-panels';
import { ReviewCard } from './review-card';
import { buildSheetOptions, makeSwitchSheet } from './sheet-config';
import type { TakeTestViewProps } from '../take-test-view';

// ---------------------------------------------------------------------------
// RESULTS-VIEW — the completed-test screen: the score card, the review list
// of every question (correct/wrong + explanations + Ask-AI), the header with
// its own search, and the shared panel cluster (AI tutor / group chat /
// Edit-Test sheet / attached-files sheet). The View switcher re-lays the
// review list out (feed list / library grid / shelf rows). Previously the
// `showResult` branch of take-test-view.tsx.
// ---------------------------------------------------------------------------

export function ResultsView({
  goHome,
  openChat,
  closeChat,
  openGroupChat,
  closeGroupChat,
  selectChatThread,
  sendChatMessage,
  sendGroupMessage,
  openUserLibrary,
  startEditTestInTake,
  handleSaveTest,
  cycleDashView,
  openStartTest,
  editorBody,
  chatEndRef,
  groupEndRef,
}: TakeTestViewProps) {
  const sessionUser = useSessionStore(s => s.user);
  const hydratedUser = useSessionStore(s => s.hydratedUser);
  const lang = useSessionStore(s => s.lang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  const effectiveUser = sessionUser || hydratedUser;
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const myBgStyle = useProfileStore(s => s.myBgStyle);
  const libNarrow = useDashboardStore(s => s.libNarrow);
  const dashView = useNavStore(s => s.dashView);
  const chatOpen = useNavStore(s => s.chatOpen);
  const setChatOpen = useNavStore(s => s.setChatOpen);
  const filesOpen = useNavStore(s => s.filesOpen);
  const setFilesOpen = useNavStore(s => s.setFilesOpen);
  const groupOpen = useNavStore(s => s.groupOpen);
  const setGroupOpen = useNavStore(s => s.setGroupOpen);
  const editOpen = useNavStore(s => s.editOpen);
  const setEditOpen = useNavStore(s => s.setEditOpen);
  const currentTest = useTakeStore(s => s.currentTest);
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  const answers = useTakeStore(s => s.answers);
  const autoTranslating = useTakeStore(s => s.autoTranslating);
  const resSearch = useTakeStore(s => s.resSearch);
  const setResSearch = useTakeStore(s => s.setResSearch);
  const resHighlightIdx = useTakeStore(s => s.resHighlightIdx);
  const setResHighlightIdx = useTakeStore(s => s.setResHighlightIdx);

  const score = shuffledQuestions.filter(q => answers[q.id || ''] === q.correctAnswer).length;
  const pct = Math.round((score / shuffledQuestions.length) * 100);

  // ── SMM ЗАЯВКА MODE — the compact results screen: the score card + the
  // «правильные ответы не показываются» note; NO review list, NO AI/chat/
  // edit windows — only the top panel and the bottom bar (the apply page
  // collects the scores of every test of the event, then confirms).
  const smmHideAnswers = useTakeStore(s => s.smmHideAnswers);
  const curSmmTestId = currentTest?.id || null;
  React.useEffect(() => {
    if (!smmHideAnswers || !curSmmTestId) return;
    useSmmStore.setState((s: any) => ({
      applyResults: { ...s.applyResults, [curSmmTestId]: { score, total: shuffledQuestions.length } },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smmHideAnswers, curSmmTestId, score, shuffledQuestions.length]);
  if (smmHideAnswers) {
    return (
      <div className="min-h-screen bg-background screen-enter flex flex-col" style={myBgStyle ? { background: testBackgroundCss(myBgStyle) } : undefined}>
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 lg:h-16 flex flex-nowrap items-center justify-between gap-1 sm:gap-2">
            <div className="flex items-center gap-1 min-w-0 shrink">
              <Button variant="ghost" size="sm" onClick={goHome} className="rounded-full shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-3"><ArrowLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">{t('back')}</span></Button>
              <h1 className="text-base sm:text-lg font-bold truncate">{t('testResults')}</h1>
            </div>
            <LangButton lang={lang} onChange={cycleLang} className="border-black px-1.5 sm:px-3 shrink-0" />
          </div>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 pt-8 pb-40">
          <Card className="rounded-4xl border border-black bg-white overflow-hidden max-w-xl mx-auto">
            <div className={`h-2 ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} />
            <CardContent className="p-8 text-center">
              <div className={`w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white ${
                pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
              }`}>
                {pct}%
              </div>
              <h2 className="text-2xl font-bold mb-1">{score} / {shuffledQuestions.length}</h2>
              <p className="text-sm text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" /> {t('smmResultHidden')}
              </p>
            </CardContent>
          </Card>
        </main>
        <div className="desktop-dock fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
          <div className="max-w-7xl mx-auto px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <Button onClick={goHome} className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90">
              {t('smmApplyTestDone')} — {t('back')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Results header search: filter the review questions by text or option
  // content; selecting a result scrolls to that question card and highlights it.
  const rlc = resSearch.trim().toLowerCase();
  const rResults = rlc ? shuffledQuestions
    .map((q: any, qIdx: number) => ({ q, qIdx }))
    .filter(({ q }) =>
      trText(q, lang).toLowerCase().includes(rlc) ||
      ['A', 'B', 'C', 'D', 'E'].some(L => (trOption(q, L, lang) || '').toLowerCase().includes(rlc))
    )
    .slice(0, 12) : [];
  const resSearchDropdown = !rlc ? null : (
    <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-2xl border border-black/10 shadow-xl max-h-72 overflow-y-auto text-left">
      {rResults.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{t('noResults')}</p>
      ) : rResults.map(({ q, qIdx }) => (
        <button
          key={q.id || qIdx}
          type="button"
          onClick={() => { jumpToResultQuestion(qIdx); setResSearch(''); }}
          className="w-full text-left px-3 py-2.5 hover:bg-muted/50 border-b border-black/5 last:border-0 flex items-start gap-2"
        >
          <Badge variant="secondary" className="rounded-full shrink-0">{qIdx + 1}</Badge>
          <span className="text-sm line-clamp-2"><MathText text={trText(q, lang)} /></span>
        </button>
      ))}
    </div>
  );
  const jumpToResultQuestion = (idx: number) => {
    const el = typeof document !== 'undefined' ? document.getElementById(`result-q-${idx}`) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setResHighlightIdx(idx);
    window.setTimeout(() => setResHighlightIdx(prev => (prev === idx ? null : prev)), 2400);
  };

  // Bottom-sheet window switcher (Attached Files / AI Tutor / Test Chat / Edit Test)
  const sheetOptions = buildSheetOptions({
    filesCount: currentTest?.attachments?.length || 0,
    filesOpen, chatOpen, groupOpen, editOpen,
    filesLabel: t('attachedFiles', { n: currentTest?.attachments?.length || 0 }),
    aiLabel: t('aiTutor'),
    groupLabel: t('testChat'),
    editLabel: t('editTest'),
  });
  const switchSheet = makeSwitchSheet({
    setFilesOpen, setChatOpen, setGroupOpen, setEditOpen,
    openAi: () => openChat(shuffledQuestions[0]?.id || '', answers[shuffledQuestions[0]?.id || '']),
    startEdit: startEditTestInTake,
  });

  return (
    <div className="min-h-screen bg-background screen-enter" style={myBgStyle ? { background: testBackgroundCss(myBgStyle) } : undefined}>
      <TranslatingPill show={autoTranslating} label={t('translating')} />
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        {/* ONE row on EVERY viewport (flex-nowrap): buttons compress to
            icon-only pills on narrow screens; the search input shrinks.
            FIXED h-14 — the uniform 56px top-panel contract (same as every
            other page, every viewport, every state). */}
        <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 lg:h-16 flex flex-nowrap items-center justify-between gap-1 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink">
            <Button variant="ghost" size="sm" onClick={goHome} className="rounded-full shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-3"><ArrowLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">{t('back')}</span></Button>
            {(currentTest?.attachments?.length || 0) > 0 ? (
              <Button
                variant={filesOpen ? 'default' : 'outline'}
                size="sm"
                onClick={() => { const next = !filesOpen; setFilesOpen(next); if (next) { setGroupOpen(false); setEditOpen(false); if (chatOpen) closeChat(); } }}
                className={`h-8 px-1.5 sm:px-3 gap-1 shrink-0 ${filesOpen ? 'bg-cta hover:bg-cta/90 text-white border-cta' : ''}`}
              >
                <Paperclip className="w-4 h-4" />
                <span className="hidden sm:inline">{t('files', { n: currentTest!.attachments!.length })}</span>
                <span className="sm:hidden">{currentTest!.attachments!.length}</span>
              </Button>
            ) : (
              <h1 className="text-base sm:text-lg font-bold truncate">{t('testResults')}</h1>
            )}
          </div>
          <div className="flex-1 min-w-0 sm:max-w-sm relative mx-0.5 sm:mx-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={resSearch}
              onChange={e => setResSearch(e.target.value)}
              placeholder={t('searchQuestions')}
              className="h-8 sm:h-9 rounded-full pl-9 bg-white border-black/15 text-xs sm:text-sm"
            />
            {resSearchDropdown}
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
            {/* View switcher — the review list follows the selected view:
            TikTok feed → the regular vertical list; Library → review cards
            in a grid; Shelf → one full-width card per row. NO navigation. */}
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
            <LangButton lang={lang} onChange={cycleLang} className="border-black px-1.5 sm:px-3" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setChatOpen(true); setFilesOpen(false); setGroupOpen(false); setEditOpen(false); openChat(shuffledQuestions[0]?.id || '', answers[shuffledQuestions[0]?.id || '']); }}
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
              title={t('chatWithTook')}
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
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 pt-8 pb-32">
        <div className={`flex gap-6 ${chatOpen || groupOpen ? 'flex-col lg:flex-row' : ''}`}>
          <div className="flex-1 min-w-0 space-y-6">
            <Card className="rounded-4xl border border-black bg-white overflow-hidden">
              <div className={`h-2 ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} />
              <CardContent className="p-8 text-center">
                <div className={`w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white ${
                  pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
                }`}>
                  {pct}%
                </div>
                <h2 className="text-2xl font-bold mb-1">{score} / {shuffledQuestions.length}</h2>
                <p className="text-muted-foreground mb-4">
                  {pct >= 70 ? t('excellent') : pct >= 40 ? t('goodEffort') : t('keepPracticing')}
                </p>
                <Progress value={pct} className="h-3" />
              </CardContent>
            </Card>

            <h3 className="text-lg font-semibold">{t('reviewAnswers')}</h3>
            {/* The View button applies to the review list too: library → the
            same review cards in a grid, shelf → one full-width card per row. */}
            <div className={dashView === 'library' || dashView === 'shelf'
              ? `grid ${dashView === 'shelf' ? 'grid-cols-1' : (libNarrow ? 'grid-cols-2' : 'grid-cols-3')} gap-2 sm:gap-3 items-start`
              : 'space-y-6'}>
              {shuffledQuestions.map((q, idx) => (
                <ReviewCard
                  key={idx}
                  q={q}
                  idx={idx}
                  selected={answers[q.id || ''] || ''}
                  isHighlight={resHighlightIdx === idx}
                  openChat={openChat}
                />
              ))}
            </div>
          </div>

          <OverlayPanels
            aiSubtitle={t('askAboutAny')}
            groupSubtitle={t('everyoneTook')}
            showFilesSidePanel={false}
            sheetOptions={sheetOptions}
            onSwitchSheet={switchSheet}
            attachments={(currentTest?.attachments || []) as AttachmentItem[]}
            currentTestTitle={currentTest?.title}
            currentTestId={currentTest?.id}
            currentUserId={effectiveUser?.id}
            editorBody={editorBody}
            closeChat={closeChat}
            closeGroupChat={closeGroupChat}
            selectChatThread={selectChatThread}
            sendChatMessage={sendChatMessage}
            sendGroupMessage={sendGroupMessage}
            openUserLibrary={openUserLibrary}
            handleSaveTest={handleSaveTest}
            chatEndRef={chatEndRef}
            groupEndRef={groupEndRef}
          />
        </div>
      </main>

      {/* Bottom action bar — fixed to the screen edge on phones; a floating
          dock pill on desktop (the desktop-dock class re-anchors it). */}
      <div className="desktop-dock fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-7xl mx-auto px-4 pt-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Button onClick={() => openStartTest(currentTest!)} className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90">
            <RefreshCw className="w-4 h-4 mr-2" /> {t('retryTest')}
          </Button>
        </div>
      </div>
    </div>
  );
}
