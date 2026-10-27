'use client';

import React from 'react';
import MathText from '@/components/math-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trExpl, trOption, trText, tUI } from '@/lib/i18n';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { imgSrc } from '@/components/shared-bits';
import { useTakeStore } from '@/stores/take-store';
import { useNavStore } from '@/stores/nav-store';
import { useSessionStore } from '@/stores/session-store';
import type { Question } from '@/lib/app-types';

// ---------------------------------------------------------------------------
// REVIEW-CARD — one question of the RESULTS review list (correct/wrong
// badges, the full option breakdown with the correct one highlighted, the
// explanation and the Ask-AI button). Previously inlined in take-test-view
//.tsx's results map; the grid-vs-list option layout follows the dashView
// the View button selected.
// ---------------------------------------------------------------------------

export function ReviewCard({
  q,
  idx,
  selected,
  isHighlight,
  openChat,
}: {
  q: Question;
  idx: number;
  selected: string;
  isHighlight: boolean;
  openChat: (questionId: string, userAnswer?: string, opts?: { force?: boolean }) => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const explanations = useTakeStore(s => s.explanations);
  const dashView = useNavStore(s => s.dashView);
  const isCorrect = selected === q.correctAnswer;

  return (
    <Card
      id={`result-q-${idx}`}
      className={`rounded-4xl border border-black bg-white scroll-mt-24 ${isCorrect ? 'ring-2 ring-emerald-300' : 'ring-2 ring-red-300'} ${isHighlight ? 'outline outline-2 outline-primary outline-offset-2' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-2 mb-3">
          {isCorrect ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <p className="font-medium text-sm">{idx + 1}. <MathText text={trText(q, lang)} /></p>
            {/* Question photo — same one as during the test */}
            {imgSrc(q.imageUrl) && (
              <img src={imgSrc(q.imageUrl)} alt="" loading="lazy" className="mt-2 w-full max-h-64 object-contain rounded-xl border border-black/10 bg-white" />
            )}
          </div>
        </div>
        <div className={`grid grid-cols-1 gap-2 ${dashView === 'library' || dashView === 'shelf' ? '' : 'sm:grid-cols-2 ml-7'}`}>
          {['A', 'B', 'C', 'D', 'E'].map(letter => {
            const optionText = trOption(q, letter, lang);
            if (!optionText) return null;
            const isCorrectOption = letter === q.correctAnswer;
            const isSelected = letter === selected;
            return (
              <div key={letter} className={`px-3 py-2 rounded-lg text-[15px] sm:text-sm flex items-start gap-2 ${
                isCorrectOption ? 'bg-emerald-50 text-emerald-700 font-medium' :
                isSelected ? 'bg-red-50 text-red-700' : 'bg-muted/50'
              }`}>
                <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isCorrectOption ? 'bg-emerald-500 text-white' :
                  isSelected ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {letter}
                </span>
                <div className="min-w-0">
                  <span className="min-w-0 break-words"><MathText text={optionText} /></span>
                  {/* Option photo — shown in the review too */}
                  {imgSrc(q.optionImages?.[letter]?.u) && (
                    <img src={imgSrc(q.optionImages?.[letter]?.u)} alt="" loading="lazy" className="mt-1.5 w-full max-w-xs max-h-44 object-contain rounded-lg border border-black/10 bg-white" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {trExpl(q, lang, explanations[q.id || '']) && (
          <p className="text-xs text-muted-foreground mt-2 ml-7 italic"><MathText text={trExpl(q, lang, explanations[q.id || '']) || ''} /></p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 ml-7 text-primary hover:bg-[#FFE8DE] text-xs"
          onClick={() => openChat(q.id || '', selected, { force: true })}
        >
          <Sparkles className="w-3 h-3 mr-1" />
          {t('askAi')}
        </Button>
      </CardContent>
    </Card>
  );
}
