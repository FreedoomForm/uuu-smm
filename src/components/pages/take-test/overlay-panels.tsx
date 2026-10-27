'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { AttachmentItem } from '@/components/attachment-utils';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import { SheetHeaderSwitcher } from '@/components/sheet-switcher';
import { Button } from '@/components/ui/button';
import { Pencil, X } from 'lucide-react';
import { tUI } from '@/lib/i18n';
import { useChatStore, newThreadKey } from '@/stores/chat-store';
import { useNavStore } from '@/stores/nav-store';
import { useSessionStore } from '@/stores/session-store';
import { useExitMount } from '@/components/motion';
import type { AiThreadMeta } from '@/components/chat-panels';
import type { SheetOption } from './sheet-config';

// Tiny neutral placeholder shown while a lazily-loaded bottom-sheet panel is
// downloading its chunk — keeps the sheet frame sized.
function SheetLoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-full min-h-[240px]">
      <div className="animate-pulse text-neutral-400 text-sm">…</div>
    </div>
  );
}

const AiChatPanel = dynamic(() => import('@/components/chat-panels').then(m => m.AiChatPanel), { ssr: false, loading: () => <SheetLoadingPlaceholder /> });
const AttachmentsBottomSheet = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsBottomSheet), { ssr: false });
const AttachmentsSidePanel = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsSidePanel), { ssr: false });
const GroupChatPanel = dynamic(() => import('@/components/chat-panels').then(m => m.GroupChatPanel), { ssr: false, loading: () => <SheetLoadingPlaceholder /> });

// ---------------------------------------------------------------------------
// OVERLAY-PANELS — the panel cluster shared by the taking and the results
// screens, rendered inside the screen's flex row: the AI tutor (bottom sheet
// on mobile / side panel on desktop), the group chat, the desktop attached-
// files side panel (taking screen only), the resizable Edit-Test sheet and
// the attached-files bottom sheet. The exit-animation holds (~220ms slide-
// down/fade-out) live here too. Previously duplicated inline in both
// branches of take-test-view.tsx.
// ---------------------------------------------------------------------------

export function OverlayPanels({
  // presentation
  aiSubtitle,
  aiInputPlaceholder,
  groupTitle,
  groupSubtitle,
  groupInputPlaceholder,
  showFilesSidePanel,
  sheetOptions,
  onSwitchSheet,
  attachments,
  currentTestTitle,
  currentTestId,
  currentUserId,
  editorBody,
  // actions (app-root orchestrates the query cache / cross-store flows)
  closeChat,
  closeGroupChat,
  selectChatThread,
  sendChatMessage,
  sendGroupMessage,
  openUserLibrary,
  handleSaveTest,
  // app-root-owned refs
  chatEndRef,
  groupEndRef,
}: {
  aiSubtitle: React.ReactNode;
  aiInputPlaceholder?: string;
  groupTitle?: string;
  groupSubtitle: string;
  groupInputPlaceholder?: string;
  showFilesSidePanel: boolean;
  sheetOptions: SheetOption[];
  onSwitchSheet: (key: string) => void;
  attachments: AttachmentItem[];
  currentTestTitle?: string;
  /** the test being taken — the drawer lists ONLY this test's conversations */
  currentTestId?: string;
  currentUserId?: string;
  editorBody: React.ReactNode;
  closeChat: () => void;
  closeGroupChat: () => void;
  selectChatThread: (threadId: string) => void;
  sendChatMessage: (questionId?: string, existingMessages?: { role: 'user' | 'assistant'; content: string }[], userAnswer?: string, question?: any) => void;
  sendGroupMessage: () => void;
  openUserLibrary: (u: { id: string; name?: string; image?: string | null }) => void;
  handleSaveTest: (fromTake?: boolean) => void;
  chatEndRef: { current: HTMLDivElement | null };
  groupEndRef: { current: HTMLDivElement | null };
}) {
  const lang = useSessionStore(s => s.lang);
  const loading = useSessionStore(s => s.loading);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  // chat store
  const chatMessages = useChatStore(s => s.chatMessages);
  const chatInput = useChatStore(s => s.chatInput);
  const setChatInput = useChatStore(s => s.setChatInput);
  const chatLoading = useChatStore(s => s.chatLoading);
  const chatThreadId = useChatStore(s => s.chatThreadId);
  const chatThreads = useChatStore(s => s.chatThreads);
  const groupMessages = useChatStore(s => s.groupMessages);
  const groupInput = useChatStore(s => s.groupInput);
  const setGroupInput = useChatStore(s => s.setGroupInput);
  const groupSending = useChatStore(s => s.groupSending);
  // nav store
  const chatOpen = useNavStore(s => s.chatOpen);
  const setChatOpen = useNavStore(s => s.setChatOpen);
  const filesOpen = useNavStore(s => s.filesOpen);
  const setFilesOpen = useNavStore(s => s.setFilesOpen);
  const groupOpen = useNavStore(s => s.groupOpen);
  const setGroupOpen = useNavStore(s => s.setGroupOpen);
  const editOpen = useNavStore(s => s.editOpen);
  const setEditOpen = useNavStore(s => s.setEditOpen);
  const chatHistoryOpen = useNavStore(s => s.chatHistoryOpen);
  const setChatHistoryOpen = useNavStore(s => s.setChatHistoryOpen);

  // History drawer entries: the CURRENT test's conversations with at least
  // one message (same derivation as app-root's memo — the ☰ list)
  const aiThreadMetas: AiThreadMeta[] = React.useMemo(() => Object.entries(chatThreads)
    .filter(([id, th]) => th.messages.length > 0 && (!currentTestId || th.testId === currentTestId))
    .map(([id, th]) => ({
      id,
      testId: th.testId,
      title: th.title || 'Test',
      preview: th.messages[th.messages.length - 1]?.content?.slice(0, 90) || '',
      updatedAt: th.updatedAt || 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt), [chatThreads, currentTestId]);

  // «Новый чат» — the top button of the drawer: a fresh conversation about
  // the test being taken; the previous threads stay in the list.
  const startNewChat = React.useCallback(() => {
    setChatHistoryOpen(false);
    const st = useChatStore.getState();
    const tid = currentTestId || st.chatThreads[st.chatThreadId]?.testId;
    if (!tid) return;
    const id = newThreadKey();
    st.setChatThreads(prev => ({ ...prev, [id]: { testId: tid, title: currentTestTitle || 'Test', messages: [], updatedAt: Date.now() } }));
    st.setChatThreadId(id);
    st.setChatMessages([]);
    st.setChatInput('');
  }, [currentTestId, currentTestTitle, setChatHistoryOpen]);

  // Exit-animation holds: when a sheet flag flips to false the panel stays
  // mounted for ~220ms to play its slide-down/fade-out (nothing vanishes).
  // The lazy chunks still load on first open only — the holds just delay
  // unmount AFTER the panel has been shown.
  const chatMounted = useExitMount(chatOpen, 220);
  const groupMounted = useExitMount(groupOpen, 220);
  const filesSideMounted = useExitMount(showFilesSidePanel && filesOpen && !chatOpen && !groupOpen, 220);
  const editMounted = useExitMount(editOpen, 220);

  const sheetSwitcher = { options: sheetOptions, onSelect: onSwitchSheet };

  return (
    <>
      {/* AI Chat Panel — bottom sheet on mobile, side panel on desktop */}
      {chatMounted && (
        <AiChatPanel
          open={chatOpen}
          onClose={closeChat}
          subtitle={aiSubtitle}
          messages={chatMessages}
          loading={chatLoading}
          input={chatInput}
          onInputChange={setChatInput}
          onSend={() => sendChatMessage()}
          endRef={chatEndRef}
          switcher={sheetSwitcher}
          inputPlaceholder={aiInputPlaceholder}
          historyOpen={chatHistoryOpen}
          onToggleHistory={() => setChatHistoryOpen(v => !v)}
          threads={aiThreadMetas}
          activeThreadId={chatThreadId}
          onSelectThread={selectChatThread}
          historyLabel={t('chatHistory')}
          noChatsLabel={t('noChatsYet')}
          onNewChat={startNewChat}
          newChatLabel={t('newChat')}
        />
      )}

      {/* Group chat panel — bottom sheet on mobile, side panel on desktop */}
      {groupMounted && (
        <GroupChatPanel
          open={groupOpen}
          onClose={closeGroupChat}
          title={groupTitle}
          subtitle={groupSubtitle}
          messages={groupMessages}
          currentUserId={currentUserId}
          input={groupInput}
          onInputChange={setGroupInput}
          onSend={sendGroupMessage}
          sending={groupSending}
          endRef={groupEndRef}
          switcher={sheetSwitcher}
          inputPlaceholder={groupInputPlaceholder}
          onOpenProfile={openUserLibrary}
          openProfileLabel={t('openProfile')}
        />
      )}

      {/* Attached files side panel (desktop, taking screen only) */}
      {filesSideMounted && !chatOpen && !groupOpen && showFilesSidePanel && (
        <div className="hidden lg:block animate-in fade-in slide-in-from-right-2 duration-300">
          <AttachmentsSidePanel
            items={attachments}
            onClose={() => setFilesOpen(false)}
            title={t('attachedFiles', { n: attachments.length })}
          />
        </div>
      )}

      {/* Edit Test window — bottom sheet, same chrome as the chat windows;
          its header switcher jumps to Files / AI Tutor / Test Chat and back */}
      {editMounted && (
        <ResizableSheetFrame
          open={editOpen}
          onClose={() => setEditOpen(false)}
          initialVh={0.85}
          minVh={0.4}
          maxW="max-w-3xl"
          header={
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <SheetHeaderSwitcher
                icon={<Pencil className="w-4 h-4 text-white" />}
                title={t('editTest')}
                subtitle={currentTestTitle}
                options={sheetOptions}
                onSelect={onSwitchSheet}
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setEditOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          }
          body={
            <div className="px-4 py-4">
              <div className="max-w-3xl mx-auto space-y-6">
                {editorBody}
              </div>
            </div>
          }
          footer={
            <div className="shrink-0 border-t bg-white/95 backdrop-blur-md px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <Button onClick={() => handleSaveTest(true)} disabled={loading} className="w-full rounded-full bg-primary hover:bg-primary/90">
                {loading ? t('saving') : t('saveTest')}
              </Button>
            </div>
          }
        />
      )}

      {/* Attached files: mobile bottom sheet (launcher hidden — header Files
          button opens it). Fixed overlay: placement in the tree is neutral. */}
      <AttachmentsBottomSheet
        items={attachments}
        open={filesOpen}
        onOpenChange={setFilesOpen}
        switcher={sheetSwitcher}
        hideLauncher
        title={t('attachedFiles', { n: attachments.length })}
      />
    </>
  );
}
