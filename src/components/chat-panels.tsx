'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, ChevronDown, Menu, MessageSquare, Plus, Send, Users, X } from 'lucide-react';
import MathText from '@/components/math-text';
import { SheetHeaderSwitcher, SheetSwitcher } from '@/components/sheet-switcher';
import { DragHandle, useResizableSheet } from '@/components/resize-sheet';
import { useExitMount } from '@/components/motion';

/**
 * Chat panels (AI Tutor + per-test group chat).
 *
 * Mirrors the "Attached Files" behaviour:
 *  - Mobile / tablet (< lg): slides up from the bottom as a RESIZABLE bottom
 *    sheet (drag the top bar up to full screen, down to close).
 *  - Desktop (>= lg): stays as the side panel card next to the question.
 *
 * The AI panel additionally carries a LEFT HISTORY DRAWER (opened with the
 * ☰ button in the top-left corner): every saved conversation, many threads
 * per test, with a «Новый чат» button on top of the panel.
 */

/* true when viewport >= lg (1024px). Panels only mount after a user click,
   so the lazy initializer is hydration-safe. */
function useIsDesktopLg() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

export interface GroupChatMessage {
  id: string;
  userId: string;
  userName: string;
  // Author's profile photo (tg:/data:/http reference) — rendered as a
  // clickable avatar that opens that user's library.
  userImage?: string | null;
  text: string;
  createdAt: string;
}

/** One entry of the AI chat history drawer — a conversation (many per test). */
export interface AiThreadMeta {
  id: string; // the thread id the drawer selects by
  testId: string; // the test the conversation is about
  title: string;
  preview: string;
  updatedAt: number;
}

/* Typing indicator (three bouncing dots) */
function TypingBubble() {
  return (
    <div className="flex gap-2 items-start">
      <div className="w-7 h-7 bg-cta rounded-lg flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-[#F4F4F5] border border-black/10 rounded-2xl rounded-tl-sm px-3.5 py-3">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI chat history drawer (left panel, ☰ button)                        */
/* ------------------------------------------------------------------ */

function HistoryDrawer({
  open,
  onClose,
  threads,
  activeThreadId,
  onSelect,
  historyLabel,
  noChatsLabel,
  onNewChat,
  newChatLabel,
}: {
  open: boolean;
  onClose: () => void;
  threads: AiThreadMeta[];
  activeThreadId?: string;
  onSelect: (threadId: string) => void;
  historyLabel: string;
  noChatsLabel: string;
  /** the «Новый чат» button at the top of the panel — starts a fresh conversation */
  onNewChat?: () => void;
  newChatLabel?: string;
}) {
  // Stay mounted while the slide-out-left exit animation plays
  const mounted = useExitMount(open, 200);
  if (!mounted) return null;
  return (
    <div className="absolute inset-0 z-30 flex">
      <div className={`absolute inset-0 bg-black/30 ${open ? 'animate-in fade-in duration-200' : 'animate-out fade-out pointer-events-none duration-200'}`} onClick={onClose} />
      {/* RECTANGULAR panel — square corners by design (the user asked for a
          four-sided drawer, no rounded edges). */}
      <div className={`relative h-full w-64 sm:w-72 bg-white border-r-2 border-black/10 shadow-2xl flex flex-col ${open ? 'animate-in slide-in-from-left duration-200' : 'animate-out slide-out-to-left fade-out pointer-events-none duration-200'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <p className="font-bold text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cta" /> {historyLabel}
          </p>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        {/* «Новый чат» — the TOP action of the left panel: starts a fresh
            conversation; the previous threads stay in the list below. */}
        {onNewChat ? (
          <div className="px-3 py-2.5 border-b shrink-0">
            <button
              type="button"
              onClick={onNewChat}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-cta text-white px-3 py-2.5 text-[13px] font-bold shadow-sm hover:bg-cta/90 active:scale-[0.98] transition"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">{newChatLabel || 'New chat'}</span>
            </button>
          </div>
        ) : null}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {threads.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6 px-2">{noChatsLabel}</p>
            )}
            {threads.map(th => {
              const active = th.id === activeThreadId;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => onSelect(th.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-2xl border transition-colors ${
                    active
                      ? 'bg-[#FFE8DE] border-primary/60'
                      : 'bg-white border-black/10 hover:bg-muted/60'
                  }`}
                >
                  <p className="text-[13px] font-bold leading-snug line-clamp-1">{th.title}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{th.preview || '…'}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(th.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/** The ☰ button that opens the history drawer (top-left corner of the AI chat). */
function HistoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label="Chat history"
      className="w-8 h-8 rounded-xl bg-muted hover:bg-black/10 border border-black/10 flex items-center justify-center shrink-0 transition-colors active:scale-90"
    >
      <Menu className="w-4 h-4" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Resizable bottom sheet chrome                                        */
/* ------------------------------------------------------------------ */

function MobileChatSheet({
  onClose,
  icon,
  title,
  subtitle,
  body,
  footer,
  switcher,
  hamburger,
  history,
  exiting,
}: {
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  body: React.ReactNode;
  footer: React.ReactNode;
  switcher?: SheetSwitcher;
  /** When set, a ☰ button appears top-left and opens the AI history drawer. */
  hamburger?: React.ReactNode;
  history?: React.ReactNode;
  /** true while the parent plays its exit animation — swaps enter classes for exit ones. */
  exiting?: boolean;
}) {
  const sheet = useResizableSheet({ initialVh: 0.78, minVh: 0.35, onClose });
  const headerX = onClose;
  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/50 ${exiting ? 'animate-out fade-out pointer-events-none duration-200' : 'animate-in fade-in duration-200'}`} onClick={onClose} />
      <div
        className={`desktop-dialog-panel absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-black/10 flex flex-col ${exiting ? 'animate-out slide-out-to-bottom fade-out pointer-events-none duration-200' : 'animate-in slide-in-from-bottom duration-200'}`}
        style={{ ...sheet.style, maxHeight: '100dvh' }}
      >
        {/* Drag bar — pull up to full screen, pull down to close */}
        <DragHandle handleProps={sheet.handleProps} dragging={sheet.dragging} />
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {hamburger}
            {switcher ? (
              <SheetHeaderSwitcher
                icon={icon}
                title={title}
                subtitle={subtitle}
                options={switcher.options}
                onSelect={switcher.onSelect}
              />
            ) : (
              <>
                <button
                  onClick={headerX}
                  aria-label="Close chat"
                  className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform shrink-0"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
                <div className="w-8 h-8 bg-cta rounded-lg flex items-center justify-center shrink-0">{icon}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight">{title}</p>
                  {subtitle ? <p className="text-xs text-muted-foreground leading-tight truncate">{subtitle}</p> : null}
                </div>
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={headerX}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative flex-1 min-h-0">
          {body}
          {history}
        </div>
        <div
          className="border-t shrink-0 bg-white px-3 py-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI Tutor chat                                                        */
/* ------------------------------------------------------------------ */

export function AiChatPanel({
  open,
  onClose,
  subtitle,
  messages,
  loading,
  input,
  onInputChange,
  onSend,
  endRef,
  switcher,
  inputPlaceholder,
  historyOpen,
  onToggleHistory,
  threads,
  activeThreadId,
  onSelectThread,
  historyLabel,
  noChatsLabel,
  onNewChat,
  newChatLabel,
}: {
  open: boolean;
  onClose: () => void;
  subtitle?: React.ReactNode;
  messages: { role: 'user' | 'assistant'; content: string }[];
  loading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  endRef: React.RefObject<HTMLDivElement | null>;
  switcher?: SheetSwitcher;
  inputPlaceholder?: string;
  historyOpen: boolean;
  onToggleHistory: () => void;
  threads: AiThreadMeta[];
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  historyLabel: string;
  noChatsLabel: string;
  /** «Новый чат» — the top button of the left drawer (starts a fresh thread). */
  onNewChat?: () => void;
  newChatLabel?: string;
}) {
  const isDesktop = useIsDesktopLg();
  // Stay mounted while the exit animation (fade / slide-down) plays
  const mounted = useExitMount(open, 200);
  if (!mounted) return null;
  const exiting = !open;

  const icon = <Bot className="w-4 h-4 text-white" />;

  const historyDrawer = (
    <HistoryDrawer
      open={historyOpen}
      onClose={onToggleHistory}
      threads={threads}
      activeThreadId={activeThreadId}
      onSelect={onSelectThread}
      historyLabel={historyLabel}
      noChatsLabel={noChatsLabel}
      onNewChat={onNewChat}
      newChatLabel={newChatLabel}
    />
  );

  const body = (
    <ScrollArea className="h-full px-4">
      <div className="space-y-3 py-2">
        {messages.length === 0 && loading && <TypingBubble />}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2 items-start ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 bg-cta rounded-lg flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-tr-sm'
                : 'bg-[#F4F4F5] border border-black/10 rounded-tl-sm'
            }`}>
              <MathText text={msg.content} />
            </div>
          </div>
        ))}
        {loading && messages.length > 0 && <TypingBubble />}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );

  const footer = (
    <div className="flex w-full gap-2">
      <Input
        placeholder={inputPlaceholder || 'Ask a follow-up...'}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        disabled={loading}
        className="flex-1 text-sm"
      />
      <Button
        size="sm"
        onClick={onSend}
        disabled={loading || !input.trim()}
        className="rounded-full bg-primary hover:bg-primary/90 shrink-0"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );

  if (isDesktop) {
    return (
      <div className={`w-[420px] shrink-0 ${exiting ? 'animate-out fade-out pointer-events-none duration-200' : 'animate-in fade-in duration-200'}`}>
        <Card className="rounded-4xl border border-black bg-white flex flex-col h-[680px]">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* ☰ — the chat history drawer («Новый чат» lives inside it) */}
                <HistoryButton onClick={onToggleHistory} />
                {switcher ? (
                  <SheetHeaderSwitcher
                    icon={icon}
                    title="AI Tutor"
                    subtitle={subtitle}
                    options={switcher.options}
                    onSelect={switcher.onSelect}
                  />
                ) : (
                  <>
                    <div className="w-8 h-8 bg-cta rounded-lg flex items-center justify-center">{icon}</div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">AI Tutor</CardTitle>
                      {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
                    </div>
                  </>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="relative flex-1 overflow-hidden p-0">
            {body}
            {historyDrawer}
          </CardContent>
          <CardFooter className="pt-3 pb-4 shrink-0">{footer}</CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <MobileChatSheet
      onClose={onClose}
      icon={icon}
      title="AI Tutor"
      subtitle={subtitle}
      body={body}
      footer={footer}
      switcher={switcher}
      hamburger={<HistoryButton onClick={onToggleHistory} />}
      history={historyDrawer}
      exiting={exiting}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Per-test group chat                                                 */
/* ------------------------------------------------------------------ */

export function GroupChatPanel({
  open,
  onClose,
  title,
  subtitle,
  messages,
  currentUserId,
  input,
  onInputChange,
  onSend,
  sending,
  endRef,
  switcher,
  inputPlaceholder,
  onOpenProfile,
  openProfileLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: React.ReactNode;
  messages: GroupChatMessage[];
  currentUserId?: string;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
  switcher?: SheetSwitcher;
  inputPlaceholder?: string;
  // Tapping another user's avatar opens THEIR library (dashboard swap)
  onOpenProfile?: (u: { id: string; name: string; image: string | null }) => void;
  openProfileLabel?: string;
}) {
  const isDesktop = useIsDesktopLg();
  // Stay mounted while the exit animation (fade / slide-down) plays
  const mounted = useExitMount(open, 200);
  if (!mounted) return null;
  const exiting = !open;

  const icon = <Users className="w-4 h-4 text-white" />;

  const body = (
    <ScrollArea className="h-full px-4">
      <div className="space-y-3 py-2">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages yet — say hi to your group!
          </p>
        )}
        {messages.map(msg => {
          const own = msg.userId === currentUserId;
          const initial = (msg.userName || '?').trim().slice(0, 1).toUpperCase() || '?';
          const imgSrc = msg.userImage
            ? (msg.userImage.startsWith('tg:') ? `/api/users/${msg.userId}/avatar`
              : (msg.userImage.startsWith('data:') || msg.userImage.startsWith('http') ? msg.userImage : null))
            : null;
          const avatar = (
            <button
              type="button"
              onClick={() => { if (!own && onOpenProfile) onOpenProfile({ id: msg.userId, name: msg.userName, image: msg.userImage || null }); }}
              title={own ? msg.userName : (openProfileLabel || msg.userName)}
              aria-label={own ? msg.userName : (openProfileLabel || msg.userName)}
              className={`w-8 h-8 rounded-full overflow-hidden bg-cta text-white flex items-center justify-center text-xs font-extrabold shrink-0 ring-2 ring-white shadow ${own ? 'order-2 ml-2 cursor-default' : 'order-1 mr-2 hover:scale-105 active:scale-95 transition-transform'}`}
            >
              {imgSrc ? <img src={imgSrc} alt="" className="w-full h-full object-cover" /> : initial}
            </button>
          );
          return (
            <div key={msg.id} className={`flex items-end ${own ? 'justify-end' : 'justify-start'}`}>
              {!own && avatar}
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                own
                  ? 'bg-primary text-white rounded-tr-sm'
                  : 'bg-[#F4F4F5] border border-black/10 rounded-tl-sm'
              }`}>
                {!own && <p className="text-[11px] font-semibold text-primary mb-0.5">{msg.userName}</p>}
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                <p className={`text-[10px] mt-1 ${own ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {own && avatar}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );

  const footer = (
    <div className="flex w-full gap-2">
      <Input
        placeholder={inputPlaceholder || 'Message the group...'}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        maxLength={2000}
        className="flex-1 text-sm"
      />
      <Button
        size="sm"
        onClick={onSend}
        disabled={sending || !input.trim()}
        className="rounded-full bg-primary hover:bg-primary/90 shrink-0"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );

  if (isDesktop) {
    return (
      <div className={`w-[420px] shrink-0 ${exiting ? 'animate-out fade-out pointer-events-none duration-200' : 'animate-in fade-in duration-200'}`}>
        <Card className="rounded-4xl border border-black bg-white flex flex-col h-[680px]">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {switcher ? (
                  <SheetHeaderSwitcher
                    icon={icon}
                    title={title || 'Test Chat'}
                    subtitle={subtitle}
                    options={switcher.options}
                    onSelect={switcher.onSelect}
                  />
                ) : (
                  <>
                    <div className="w-8 h-8 bg-cta rounded-lg flex items-center justify-center">{icon}</div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{title || 'Test Chat'}</CardTitle>
                      {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
                    </div>
                  </>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">{body}</CardContent>
          <CardFooter className="pt-3 pb-4 shrink-0">{footer}</CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <MobileChatSheet
      onClose={onClose}
      icon={icon}
      title={title || 'Test Chat'}
      subtitle={subtitle}
      body={body}
      footer={footer}
      switcher={switcher}
      exiting={exiting}
    />
  );
}
