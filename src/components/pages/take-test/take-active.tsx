'use client';

import React from 'react';
import { AttachmentItem } from '@/components/attachment-utils';
import { testBackgroundCss } from '@/lib/test-bg';
import { TranslatingPill } from '@/components/shared-bits';
import { useTakeStore } from '@/stores/take-store';
import { useNavStore } from '@/stores/nav-store';
import { useSessionStore } from '@/stores/session-store';
import { useProfileStore } from '@/stores/profile-store';
import { useChatStore } from '@/stores/chat-store';
import { tUI } from '@/lib/i18n';
import { TakeHeader } from './take-header';
import { QuestionFeed } from './question-feed';
import { QuestionGrid } from './question-grid';
import { TakeBottomBar } from './take-bottom-bar';
import { OverlayPanels } from './overlay-panels';
import { buildSheetOptions, makeSwitchSheet } from './sheet-config';
import type { TakeTestViewProps } from '../take-test-view';

// ---------------------------------------------------------------------------
// TAKE-ACTIVE — the running-test screen: header (search / progress / panel
// toggles), the questions (TikTok-style virtual feed OR the Library/Shelf
// grid — the View switcher decides), the panel cluster and the bottom
// navigation bar with the question drum. Previously the main branch of
// take-test-view.tsx.
// ---------------------------------------------------------------------------

export function TakeActive({
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
  selectAnswer,
  submitTest,
  handleSaveTest,
  cycleDashView,
  editorBody,
  chatEndRef,
  groupEndRef,
}: TakeTestViewProps) {
  const sessionUser = useSessionStore(s => s.user);
  const hydratedUser = useSessionStore(s => s.hydratedUser);
  const lang = useSessionStore(s => s.lang);
  const effectiveUser = sessionUser || hydratedUser;
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const myBgStyle = useProfileStore(s => s.myBgStyle);
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
  const currentQuestionIdx = useTakeStore(s => s.currentQuestionIdx);
  const answers = useTakeStore(s => s.answers);
  const autoTranslating = useTakeStore(s => s.autoTranslating);
  // AI tutor subtitle: mirrors the answer the chat was opened on
  const chatUserAnswer = useChatStore(s => s.chatUserAnswer);
  const chatQuestionId = useChatStore(s => s.chatQuestionId);

  const currentQ = shuffledQuestions[currentQuestionIdx];
  const qId = currentQ?.id || '';

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
    openAi: () => openChat(qId, answers[qId]),
    startEdit: startEditTestInTake,
  });

  const aiSubtitle = chatUserAnswer ? (
    chatUserAnswer === shuffledQuestions.find(q => q.id === chatQuestionId)?.correctAnswer
      ? t('answeredCorrectly')
      : t('choseX', { a: chatUserAnswer, b: shuffledQuestions.find(q => q.id === chatQuestionId)?.correctAnswer || '' })
  ) : t('askAboutThis');

  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter" style={myBgStyle ? { background: testBackgroundCss(myBgStyle) } : undefined}>
      <TranslatingPill show={autoTranslating} label={t('translating')} />
      <TakeHeader
        goHome={goHome}
        openChat={openChat}
        openGroupChat={openGroupChat}
        startEditTestInTake={startEditTestInTake}
        cycleDashView={cycleDashView}
      />

      <main className="flex-1 min-h-0">
        {/* Question card + Chat/Files side by side (desktop) */}
        <div className={`h-full max-w-7xl mx-auto flex gap-6 ${chatOpen || groupOpen || filesOpen ? 'flex-col lg:flex-row' : ''}`}>
          {/* LIBRARY / SHELF view of the questions — the View button applies to
              the QUESTIONS here; otherwise the TikTok-style virtual feed. */}
          {(dashView === 'library' || dashView === 'shelf') ? (
            <QuestionGrid selectAnswer={selectAnswer} submitTest={submitTest} />
          ) : (
            <QuestionFeed selectAnswer={selectAnswer} openChat={openChat} />
          )}

          <OverlayPanels
            aiSubtitle={aiSubtitle}
            aiInputPlaceholder={t('askFollowUp')}
            groupTitle={t('testChat')}
            groupSubtitle={t('everyoneTaking')}
            groupInputPlaceholder={t('messageGroup')}
            showFilesSidePanel
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

      {/* Bottom navigation bar — flex footer, permanently glued to the bottom edge */}
      <TakeBottomBar submitTest={submitTest} />
    </div>
  );
}
