'use client';

import React from 'react';
import MathText from '@/components/math-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trOption, trText, tUI } from '@/lib/i18n';
import { CheckCircle2, XCircle } from 'lucide-react';
import { imgSrc } from '@/components/shared-bits';
import { useTakeStore } from '@/stores/take-store';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useNavStore } from '@/stores/nav-store';
import { useSessionStore } from '@/stores/session-store';

// ---------------------------------------------------------------------------
// QUESTION-GRID — the Library / Shelf view of the QUESTIONS (the View button
// applies to the questions here): instead of the TikTok-style slide feed the
// questions become cards in the same layouts as the dashboard (library = 2/3
// per row, shelf = one full-width card per row). Every card is fully
// answerable right on the spot, and the test can be finished from here.
// Previously inlined in take-test-view.tsx.
// ---------------------------------------------------------------------------

export function QuestionGrid({
  selectAnswer,
  submitTest,
}: {
  selectAnswer: (questionId: string, answer: string) => void;
  submitTest: () => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const loading = useSessionStore(s => s.loading);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const libNarrow = useDashboardStore(s => s.libNarrow);
  const dashView = useNavStore(s => s.dashView);
  const shuffledQuestions = useTakeStore(s => s.shuffledQuestions);
  const answers = useTakeStore(s => s.answers);
  const practiceMode = useTakeStore(s => s.practiceMode);
  const revealedAnswers = useTakeStore(s => s.revealedAnswers);
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="max-w-5xl mx-auto px-2 sm:px-3 py-3 sm:py-4 lg:pb-28">
        <p className="text-[11px] sm:text-xs text-muted-foreground text-center mb-3">{t('questionsGridHint')}</p>
        <div className={`grid ${dashView === 'shelf' ? 'grid-cols-1' : (libNarrow ? 'grid-cols-2' : 'grid-cols-3')} gap-2 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-5 lg:gap-4`}>
          {shuffledQuestions.map((q, idx) => {
            const gqId = q.id || '';
            const gAnswered = !!answers[gqId];
            const gRevealed = practiceMode && revealedAnswers[gqId];
            return (
              <Card key={idx} id={`qgrid-${idx}`} className={`rounded-2xl border border-black bg-white overflow-hidden flex flex-col ${gRevealed ? (answers[gqId] === q.correctAnswer ? 'ring-2 ring-emerald-300' : 'ring-2 ring-red-300') : gAnswered ? 'ring-1 ring-emerald-200' : ''}`}>
                <CardContent className="p-2.5 sm:p-3 flex flex-col gap-1.5 sm:gap-2 flex-1 min-h-0">
                  <div className="flex items-center justify-between shrink-0">
                    <Badge variant="secondary" className="rounded-full text-[10px] sm:text-xs">{idx + 1}</Badge>
                    {gRevealed ? (
                      answers[gqId] === q.correctAnswer
                        ? <Badge className="rounded-full bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] sm:text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> {t('correct')}</Badge>
                        : <Badge className="rounded-full bg-red-100 text-red-700 border-red-200 text-[10px] sm:text-xs"><XCircle className="w-3 h-3 mr-1" /> {t('wrong')}</Badge>
                    ) : gAnswered ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <span className="w-4 h-4" />}
                  </div>
                  <p className="text-[13px] sm:text-sm font-medium leading-snug line-clamp-4 sm:line-clamp-none"><MathText text={trText(q, lang)} /></p>
                  {/* Question photo (compact for the grid) */}
                  {imgSrc(q.imageUrl) && (
                    <img src={imgSrc(q.imageUrl)} alt="" loading="lazy" className="w-full max-h-44 object-contain rounded-lg border border-black/10 bg-white" />
                  )}
                  <div className="mt-auto pt-1 space-y-1">
                    {['A', 'B', 'C', 'D', 'E'].map(letter => {
                      const optionText = trOption(q, letter, lang);
                      if (!optionText) return null;
                      const isSel = letter === answers[gqId];
                      const isCorrect = letter === q.correctAnswer;
                      let cls = 'border-black/15 hover:border-black hover:bg-[#FFF0D9]/40';
                      if (gRevealed) {
                        if (isCorrect) cls = 'border-emerald-500 bg-emerald-50';
                        else if (isSel) cls = 'border-red-500 bg-red-50';
                        else cls = 'border-muted opacity-60';
                      } else if (isSel) {
                        cls = 'border-cta bg-[#FFF0D9]';
                      }
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => selectAnswer(gqId, letter)}
                          disabled={gRevealed}
                          className={`w-full flex items-start gap-1.5 px-1.5 py-1 rounded-lg border text-left transition-all disabled:cursor-default ${cls}`}
                        >
                          <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            gRevealed && isCorrect ? 'bg-emerald-500 text-white' :
                            gRevealed && isSel ? 'bg-red-500 text-white' :
                            isSel ? 'bg-cta text-white' : 'bg-muted text-muted-foreground'
                          }`}>
                            {letter}
                          </span>
                          <span className="text-[11px] sm:text-xs leading-snug min-w-0 line-clamp-2 break-words"><MathText text={optionText} /></span>
                          {imgSrc(q.optionImages?.[letter]?.u) && (
                            <img src={imgSrc(q.optionImages?.[letter]?.u)} alt="" loading="lazy" className="hidden sm:block w-10 h-10 object-cover rounded-md border border-black/10 shrink-0 ml-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {/* Finish the test right from the grid — the bottom bar's submit
        only appears on the last slide, which the grid replaces */}
        <div className="mt-4 mb-6 flex justify-center">
          <Button onClick={submitTest} disabled={loading || answeredCount < shuffledQuestions.length} className="rounded-full bg-primary hover:bg-primary/90 px-8">
            {loading ? t('submitting') : t('submitTest')}
          </Button>
        </div>
      </div>
    </div>
  );
}
