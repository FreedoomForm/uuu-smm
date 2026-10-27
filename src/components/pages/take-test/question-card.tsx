'use client';

import React from 'react';
import MathText from '@/components/math-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { trExpl, trOption, trText, tUI } from '@/lib/i18n';
import { CheckCircle2, MessageSquare, Sparkles, XCircle } from 'lucide-react';
import { imgSrc } from '@/components/shared-bits';
import type { Question } from '@/lib/app-types';
import { useTakeStore } from '@/stores/take-store';
import { useNavStore } from '@/stores/nav-store';
import { useSessionStore } from '@/stores/session-store';

// ---------------------------------------------------------------------------
// QUESTION-CARD — one question of the taking feed (the <section data-qslide>
// inside its SwiperSlide). Previously inlined in take-test-view.tsx's slide
// map; the state comes straight from the zustand stores with fine-grained
// selectors, the two user actions arrive as props.
// ---------------------------------------------------------------------------

export function QuestionCard({
  q,
  idx,
  total,
  selectAnswer,
  openChat,
}: {
  q: Question;
  idx: number;
  total: number;
  selectAnswer: (questionId: string, answer: string) => void;
  openChat: (questionId: string, userAnswer?: string, opts?: { force?: boolean }) => void;
}) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  const answers = useTakeStore(s => s.answers);
  const practiceMode = useTakeStore(s => s.practiceMode);
  const revealedAnswers = useTakeStore(s => s.revealedAnswers);
  const explanations = useTakeStore(s => s.explanations);
  const loadingExplanations = useTakeStore(s => s.loadingExplanations);
  const chatOpen = useNavStore(s => s.chatOpen);

  const slideQId = q.id || '';
  const slideRevealed = practiceMode && revealedAnswers[slideQId];

  return (
    // relative = containing block for sr-only radios inside the card,
    // otherwise they anchor to the document and stretch it into a
    // huge white void below the feed (position:absolute escapes the
    // feed's overflow clipping when no ancestor is positioned)
    <section data-qslide className="relative h-full w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="min-h-full flex flex-col px-4 py-4 lg:py-6 lg:pb-28">
        <div className="max-w-3xl w-full mx-auto my-auto">
          <Card className="rounded-4xl border border-black bg-white shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-sm rounded-full">{t('questionXofY', { n: idx + 1, m: total })}</Badge>
                {practiceMode && slideRevealed && (
                  answers[slideQId] === q.correctAnswer ? (
                    <Badge className="rounded-full bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" /> {t('correct')}</Badge>
                  ) : (
                    <Badge className="rounded-full bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" /> {t('wrong')}</Badge>
                  )
                )}
              </div>
              <p className="text-lg font-medium mt-2"><MathText text={trText(q, lang)} /></p>
              {/* Question photo — lives in the Telegram channel, streamed on demand */}
              {imgSrc(q.imageUrl) && (
                <img
                  src={imgSrc(q.imageUrl)}
                  alt=""
                  loading="lazy"
                  className="mt-3 w-full max-h-72 object-contain rounded-2xl border border-black/10 bg-white"
                />
              )}
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={answers[slideQId] || ''}
                onValueChange={(value) => selectAnswer(slideQId, value)}
                disabled={practiceMode && revealedAnswers[slideQId]}
              >
                <div className="space-y-3">
                  {['A', 'B', 'C', 'D', 'E'].map(letter => {
                    const optionText = trOption(q, letter, lang);
                    if (!optionText) return null;
                    const isRevealedOption = practiceMode && revealedAnswers[slideQId];
                    const isCorrectOption = letter === q.correctAnswer;
                    const isSelectedOption = letter === answers[slideQId];

                    let optionClass = 'border-black/15 hover:border-black hover:bg-[#FFF0D9]/40';
                    if (isRevealedOption) {
                      if (isCorrectOption) {
                        optionClass = 'border-emerald-500 bg-emerald-50';
                      } else if (isSelectedOption && !isCorrectOption) {
                        optionClass = 'border-red-500 bg-red-50';
                      } else {
                        optionClass = 'border-muted opacity-60';
                      }
                    } else if (isSelectedOption) {
                      optionClass = 'border-cta bg-[#FFF0D9]';
                    }

                    return (
                      <div key={letter} className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all ${optionClass}`}>
                        <RadioGroupItem value={letter} id={`q-${slideQId}-${letter}`} className="sr-only" />
                        <div className="flex-1 min-w-0">
                          <Label htmlFor={`q-${slideQId}-${letter}`} className="flex items-start gap-2.5 cursor-pointer">
                            <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isRevealedOption && isCorrectOption ? 'bg-emerald-500 text-white' :
                              isRevealedOption && isSelectedOption && !isCorrectOption ? 'bg-red-500 text-white' :
                              isSelectedOption ? 'bg-cta text-white' : 'bg-muted text-muted-foreground'
                            }`}>
                              {letter}
                            </span>
                            <span className="text-[16px] sm:text-[15px] leading-relaxed min-w-0 break-words"><MathText text={optionText} /></span>
                          </Label>
                          {/* Option photo — part of the answer, travels with it on shuffle */}
                          {imgSrc(q.optionImages?.[letter]?.u) && (
                            <img
                              src={imgSrc(q.optionImages?.[letter]?.u)}
                              alt=""
                              loading="lazy"
                              onClick={() => { if (!(practiceMode && revealedAnswers[slideQId])) selectAnswer(slideQId, letter); }}
                              className="mt-2 ml-9.5 w-full max-w-xs max-h-48 object-contain rounded-xl border border-black/10 bg-white cursor-pointer"
                            />
                          )}
                        </div>
                        {isRevealedOption && isCorrectOption && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-1" />}
                        {isRevealedOption && isSelectedOption && !isCorrectOption && <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-1" />}
                      </div>
                    );
                  })}
                </div>
              </RadioGroup>

              {/* Practice mode: show result and explanation + Ask AI button */}
              {practiceMode && revealedAnswers[slideQId] && (
                <div className="mt-4 p-3 rounded-xl bg-muted/50">
                  <p className="text-sm font-medium mb-1">
                    {t('correctAnswerIs', { letter: q.correctAnswer })}
                  </p>
                  {trExpl(q, lang, explanations[slideQId]) && (
                    <p className="text-xs text-muted-foreground mt-1 ml-7"><MathText text={trExpl(q, lang, explanations[slideQId]) || ''} /></p>
                  )}
                  {!chatOpen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-primary hover:bg-[#FFE8DE]"
                      onClick={() => openChat(slideQId, answers[slideQId])}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      {t('askAiAbout')}
                    </Button>
                  )}
                </div>
              )}

              {/* Exam mode: Ask AI button always visible after answering */}
              {!practiceMode && answers[slideQId] && !chatOpen && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full border-black text-foreground hover:bg-[#FFF0D9]"
                    onClick={() => openChat(slideQId, answers[slideQId])}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {t('askAiAbout')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {loadingExplanations && (
            <p className="text-xs text-center text-muted-foreground mt-4">{t('loadingExpl')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
