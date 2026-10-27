'use client';

import React from 'react';
import {
  ArrowLeft,
  Dices,
  ListChecks,
  Minus,
  Plus,
  BookOpen,
  Shuffle,
  Paperclip,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
// Perf: keep the attachments module (and pdfjs) out of this view's chunk —
// same lazy pattern as the main page.
import dynamic from 'next/dynamic';
const AttachmentsList = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsList), { ssr: false });
import { type AttachmentItem } from '@/components/attachment-utils';
import { testBackgroundCss } from '@/lib/test-bg';
import { countAnsweredProgress } from '@/lib/test-progress';
import { Collapse } from '@/components/motion';
import type { Test } from '@/lib/app-types';
import { useTakeStore } from '@/stores/take-store';
import { useSessionStore } from '@/stores/session-store';
import { useProfileStore } from '@/stores/profile-store';
import { tUI } from '@/lib/i18n';

/**
 * START TEST — question count selection + mode (exam/practice) +
 * randomization toggles + attached files, with the fixed bottom action bar
 * (Start / Restart + Continue when saved progress exists). The state lives
 * in the zustand domain stores and is consumed here directly — app-root
 * keeps the action handlers (startTest / continueTestWith / goHome).
 */
export interface StartTestViewProps {
  startTest: () => void;
  continueTestWith: (test: Test) => boolean | void | Promise<boolean>;
  goHome: () => void;
}

export default function StartTestView({
  startTest,
  continueTestWith,
  goHome,
}: StartTestViewProps) {
  // ── State: read straight from the zustand domain stores ──────────────
  const currentTest = useTakeStore(s => s.currentTest);
  const myBgStyle = useProfileStore(s => s.myBgStyle);
  const selectedQuestionCount = useTakeStore(s => s.selectedQuestionCount);
  const setSelectedQuestionCount = useTakeStore(s => s.setSelectedQuestionCount);
  const practiceMode = useTakeStore(s => s.practiceMode);
  const setPracticeMode = useTakeStore(s => s.setPracticeMode);
  const startRandomizeQ = useTakeStore(s => s.startRandomizeQ);
  const setStartRandomizeQ = useTakeStore(s => s.setStartRandomizeQ);
  const startRandomizeO = useTakeStore(s => s.startRandomizeO);
  const setStartRandomizeO = useTakeStore(s => s.setStartRandomizeO);
  const startFilesExpanded = useTakeStore(s => s.startFilesExpanded);
  const setStartFilesExpanded = useTakeStore(s => s.setStartFilesExpanded);
  const savedProgress = useTakeStore(s => s.savedProgress);
  const loading = useSessionStore(s => s.loading);
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const totalQ = currentTest?.questions.length ?? 0;
  // app-root mounts this view only with a test on screen — guard for the
  // store's transient null (all hooks ran above, so this is safe)
  if (!currentTest) return null;

  return (
    <div className="min-h-screen bg-background screen-enter" style={myBgStyle ? { background: testBackgroundCss(myBgStyle) } : undefined}>
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        {/* FIXED h-14 — the uniform 56px top-panel contract (every page, every viewport). */}
        <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 h-14 lg:h-16 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goHome} className="rounded-full"><ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}</Button>
          <h1 className="text-lg font-bold">{t('startTest')}</h1>
        </div>
      </header>

      <main className="max-w-2xl lg:max-w-3xl mx-auto px-4 pt-8 lg:pt-12 pb-32">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-cta rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <ListChecks className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-xl">{currentTest.title}</CardTitle>
            {currentTest.description && <CardDescription className="mt-2">{currentTest.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Question Count Selection */}
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{t('howMany')}</h3>
                <p className="text-sm text-muted-foreground">{t('chooseHowMany')}</p>
              </div>

              {/* Counter — tap the number to type an exact value */}
              <div className="flex items-center justify-center gap-4">
                <Button variant="outline" size="icon" onClick={() => setSelectedQuestionCount(Math.max(1, selectedQuestionCount - 1))} disabled={selectedQuestionCount <= 1}>
                  <Minus className="w-4 h-4" />
                </Button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={totalQ}
                  value={selectedQuestionCount}
                  onChange={e => {
                    if (e.target.value === '') return;
                    const v = Math.round(Number(e.target.value));
                    if (Number.isNaN(v)) return;
                    setSelectedQuestionCount(Math.min(totalQ, Math.max(1, v)));
                  }}
                  onBlur={e => {
                    if (e.target.value === '') setSelectedQuestionCount(1);
                  }}
                  aria-label={t('numQuestions')}
                  className="text-3xl font-bold w-20 text-center bg-white rounded-xl border-2 border-black/10 focus:border-cta outline-none py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button variant="outline" size="icon" onClick={() => setSelectedQuestionCount(Math.min(totalQ, selectedQuestionCount + 1))} disabled={selectedQuestionCount >= totalQ}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Slider */}
              <div className="px-4">
                <input
                  type="range"
                  min={1}
                  max={totalQ}
                  value={selectedQuestionCount}
                  onChange={e => setSelectedQuestionCount(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-[#fe5933]"
                />
              </div>
            </div>

            <Separator />

            {/* Mode Selection */}
            <div className="space-y-3">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{t('testMode')}</h3>
                <p className="text-sm text-muted-foreground">{t('chooseHowTake')}</p>
              </div>
              {/* FIXED 2-SLOT GRID — the same two positions on EVERY viewport:
              slots never move, never reflow, never wrap. The ONLY adaptation
              is the label: below 480px BOTH labels hide at once (icons only),
              at 480px+ BOTH show text (the longest one still fits). One
              button can never lose its text while the other keeps it. */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPracticeMode(false)}
                  title={t('examMode')}
                  aria-label={t('examMode')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    !practiceMode
                      ? 'border-cta bg-[#FFF0D9] shadow-md'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                    <ListChecks className="w-5 h-5 text-cta shrink-0" />
                    <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('examMode')}</span>
                  </div>
                </button>
                <button
                  onClick={() => setPracticeMode(true)}
                  title={t('practiceMode')}
                  aria-label={t('practiceMode')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    practiceMode
                      ? 'border-primary bg-[#FFE8DE] shadow-md'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                    <BookOpen className="w-5 h-5 text-primary shrink-0" />
                    <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('practiceMode')}</span>
                  </div>
                </button>
              </div>
            </div>

            <Separator />

            {/* Randomization Settings */}
            <div className="space-y-3">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{t('randomization')}</h3>
                <p className="text-sm text-muted-foreground">{t('chooseOrder')}</p>
              </div>
              {/* Same fixed-2-slot contract + uniform label collapse as the
              mode buttons. The two toggles keep DIFFERENT icons (Shuffle for
              questions / Dices for answers) so the icon-only state on small
              screens stays tellable apart — slots never swap. */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStartRandomizeQ(v => !v)}
                  title={t('randomizeQuestions')}
                  aria-label={t('randomizeQuestions')}
                  className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                    startRandomizeQ
                      ? 'border-cta bg-[#FFF0D9] shadow-md'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                    <Shuffle className="w-4 h-4 text-cta shrink-0" />
                    <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('randomizeQuestions')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setStartRandomizeO(v => !v)}
                  title={t('randomizeAnswers')}
                  aria-label={t('randomizeAnswers')}
                  className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                    startRandomizeO
                      ? 'border-primary bg-[#FFE8DE] shadow-md'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2 [@media(max-width:479px)]:justify-center">
                    <Dices className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm min-w-0 truncate [@media(max-width:479px)]:hidden">{t('randomizeAnswers')}</span>
                  </div>
                </button>
              </div>
            </div>

            <Separator />

            {/* Attached files — collapsed to a one-line header by default; arrow expands/collapses */}
            {(currentTest.attachments?.length || 0) > 0 && (
              <div className="rounded-2xl border border-black bg-white overflow-hidden">
                <button
                  onClick={() => setStartFilesExpanded(v => !v)}
                  className="w-full flex items-center gap-1.5 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <Paperclip className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-sm">{t('attachedFiles', { n: currentTest.attachments!.length })}</span>
                  {startFilesExpanded ? (
                    <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto shrink-0" />
                  )}
                </button>
                <Collapse open={startFilesExpanded} keepMountedOnceShown>
                  <div className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('startFilesHint')}
                    </p>
                    <AttachmentsList items={currentTest.attachments as AttachmentItem[]} />
                  </div>
                </Collapse>
              </div>
            )}

          </CardContent>
        </Card>
      </main>

      {/* Bottom bar — fixed to the screen edge on phones; a floating dock pill
          on desktop (the desktop-dock class re-anchors it). */}
      <div className="desktop-dock fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-2xl mx-auto px-4 pt-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {savedProgress && savedProgress.shuffledQuestions.length > 0 ? (
            /* SIDE-BY-SIDE (never stacked): the bottom panel keeps its fixed
            60px height in EVERY state — Restart | Continue. */
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={startTest}
                disabled={loading}
                className="flex-1 min-w-0 h-9 rounded-full"
                aria-label={t('startOver')}
              >
                <RefreshCw className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('restart')}</span>
              </Button>
              <Button
                onClick={() => continueTestWith(currentTest!)}
                disabled={loading}
                className="flex-1 min-w-0 h-9 rounded-full bg-primary hover:bg-primary/90"
              >
                {loading ? t('loading') : <><Play className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{t('continueTest', { n: countAnsweredProgress(savedProgress), m: savedProgress.shuffledQuestions.length })}</span></>}
              </Button>
            </div>
          ) : (
            <Button onClick={startTest} disabled={loading} className="w-full h-9 rounded-full bg-primary hover:bg-primary/90">
              {loading ? t('loading') : <><Play className="w-4 h-4 mr-2" /> {practiceMode ? t('startPractice', { count: selectedQuestionCount }) : t('startTestN', { count: selectedQuestionCount })}</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
