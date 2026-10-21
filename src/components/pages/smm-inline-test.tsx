'use client';

// ---------------------------------------------------------------------------
// INLINE TEST BUILDER — the «Вопросы» section of the test-creation page,
// carried over 1:1 into the event editor's «Квалификационные тесты» card.
//
// Creating a qualification test no longer navigates away to the test page:
// the question text + answer options (A–D) are written right inside the
// event form, and the test itself is born when the event is saved (its id
// then joins the picked qualification tests).
//
// The markup and the behaviors mirror the test editor's section exactly:
//   «Вопросы (N)» header + «Перемешать все» / «Добавить вопрос» buttons,
//   question cards with the text field, the question photo and the A–D
//   options grid with per-option photos and the correct-answer radio.
// Photos upload to the owner's Telegram channel via /api/attachments/upload
// (the DB keeps only a tg:<file_id> reference) — the same contract as the
// test editor's photo pickers.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, ListChecks, Loader2, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { EMPTY_QUESTION } from '@/stores/editor-store';
import type { Question } from '@/lib/app-types';
import { imgSrc } from '@/components/shared-bits';

// The same lightweight inline toast the whole SMM page speaks.
const smmToast = (msg: string) => {
  try { window.dispatchEvent(new CustomEvent('smm-toast', { detail: msg })); } catch { /* noop */ }
};

// Downscale a picked photo in the browser (max 1600px, JPEG) — the SAME
// helper the test editor runs before uploading, so uploads stay light.
async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  try {
    if (typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 900 * 1024) return file; // already small enough
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size > 0 && blob.size < file.size ? blob : file;
  } catch {
    return file; // any decode hiccup — upload the original bytes
  }
}

// One photo → the Telegram channel (kind=image). Throws on any failure —
// the caller toasts `photoUploadFail` with the server's reason.
async function uploadPhoto(file: File): Promise<{ url: string; tgMessageId: number | null }> {
  const blob = await compressImage(file);
  const fd = new FormData();
  fd.append('file', new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: blob.type || 'image/jpeg' }));
  fd.append('kind', 'image');
  const res = await fetch('/api/attachments/upload', { method: 'POST', body: fd });
  const body = await res.json().catch(() => null);
  if (!(res.ok && body?.ok && body?.url)) throw new Error(body?.error || `HTTP ${res.status}`);
  return { url: body.url as string, tgMessageId: typeof body.tgMessageId === 'number' ? body.tgMessageId : null };
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A question counts as "written" when ANY of its fields carries content —
// used by the event save to skip a builder the user never filled in.
export function questionHasContent(q: Question): boolean {
  return !!(q.text?.trim() || q.optionA?.trim() || q.optionB?.trim() || q.optionC?.trim()
    || q.optionD?.trim() || q.imageUrl || (q.optionImages && Object.keys(q.optionImages).length));
}

export function InlineQuestionsSection({ questions, onChange, t, onBusyChange }: {
  questions: Question[];
  onChange: (qs: Question[]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onBusyChange?: (busy: boolean) => void;
}) {
  // `q-<idx>` / `o-<idx>-<L>` — the SAME busy markers the test editor uses.
  const [photoBusy, setPhotoBusy] = useState('');
  useEffect(() => { onBusyChange?.(photoBusy !== ''); }, [photoBusy, onBusyChange]);

  const patchQuestion = (idx: number, patch: Partial<Question>) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], ...patch };
    onChange(updated);
  };

  const addQuestion = () => onChange([...questions, { ...EMPTY_QUESTION }]);
  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return; // the SAME >=1 rule the test editor keeps
    onChange(questions.filter((_, i) => i !== idx));
  };
  const updateQuestion = (idx: number, field: string, value: string) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  // --- Question / option photos (the test editor's exact pipeline) ---
  const pickQuestionPhoto = async (idx: number, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { smmToast(t('notAnImage')); return; }
    setPhotoBusy(`q-${idx}`);
    try {
      const up = await uploadPhoto(file);
      patchQuestion(idx, { imageUrl: up.url, imageMsgId: up.tgMessageId });
    } catch (e: any) {
      smmToast(`${t('photoUploadFail')}${e?.message ? `: ${e.message}` : ''}`);
    } finally {
      setPhotoBusy('');
    }
  };

  const pickOptionPhoto = async (idx: number, letter: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { smmToast(t('notAnImage')); return; }
    setPhotoBusy(`o-${idx}-${letter}`);
    try {
      const up = await uploadPhoto(file);
      const q = questions[idx];
      const next = { ...(q.optionImages || {}) };
      next[letter] = { u: up.url, m: up.tgMessageId };
      patchQuestion(idx, { optionImages: next });
    } catch (e: any) {
      smmToast(`${t('photoUploadFail')}${e?.message ? `: ${e.message}` : ''}`);
    } finally {
      setPhotoBusy('');
    }
  };

  const clearQuestionPhoto = (idx: number) => patchQuestion(idx, { imageUrl: null, imageMsgId: null });
  const clearOptionPhoto = (idx: number, letter: string) => {
    const q = questions[idx];
    if (!q.optionImages?.[letter]) return;
    const next = { ...q.optionImages };
    delete next[letter];
    patchQuestion(idx, { optionImages: Object.keys(next).length ? next : null });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* The section header — «Вопросы (N)» + the shuffle/add pair, the SAME
      row the test-creation page renders above its question cards. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 font-semibold text-sm">
          <ListChecks className="w-4 h-4 shrink-0" />
          {t('questionsN', { n: questions.length })}
        </span>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onChange(shuffleArray(questions))} className="h-8 rounded-full border-black/20 text-xs">
            <Shuffle className="w-3 h-3 mr-1" /> {t('shuffleAll')}
          </Button>
          <Button size="sm" onClick={addQuestion} className="h-8 rounded-full text-xs">
            <Plus className="w-3 h-3 mr-1" /> {t('addQuestion')}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <Card key={idx} className="rounded-3xl border border-black bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{t('questionN', { n: idx + 1 })}</Badge>
                <Button variant="ghost" size="sm" className="text-destructive h-7 w-7 p-0" onClick={() => removeQuestion(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={q.text} onChange={e => updateQuestion(idx, 'text', e.target.value)} placeholder={t('questionTextPh')} rows={2} />
              {/* Question photo — uploaded to the Telegram channel, shown
              above the answers when taking the test */}
              <div className="flex items-center gap-2">
                <label
                  className={`h-7 rounded-full border px-2.5 text-xs flex items-center gap-1.5 cursor-pointer select-none ${photoBusy === `q-${idx}` ? 'border-primary bg-[#FFE8DE] text-primary' : 'border-black hover:bg-muted/50'}`}
                  title={t('qPhotoTip')}
                >
                  {photoBusy === `q-${idx}`
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ImagePlus className="w-3.5 h-3.5" />}
                  <span className="truncate">{q.imageUrl ? t('changePhoto') : t('addPhoto')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onClick={e => { (e.target as HTMLInputElement).value = ''; }}
                    onChange={e => pickQuestionPhoto(idx, e.target.files?.[0])}
                  />
                </label>
                {q.imageUrl && (
                  <>
                    <span className="h-9 w-14 rounded-lg overflow-hidden border border-black/15 shrink-0">
                      <img src={imgSrc(q.imageUrl)} alt="" className="w-full h-full object-cover" />
                    </span>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-destructive shrink-0"
                      onClick={() => clearQuestionPhoto(idx)}
                      title={t('removePhoto')} aria-label={t('removePhoto')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
                {photoBusy === `q-${idx}` && <span className="text-xs text-muted-foreground truncate">{t('photoUploading')}</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['A', 'B', 'C', 'D'].map(letter => {
                  const optImg = q.optionImages?.[letter];
                  return (
                    <div key={letter} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        q.correctAnswer === letter ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                      }`}>
                        {letter}
                      </div>
                      <Input
                        value={q[`option${letter}` as keyof Question] as string}
                        onChange={e => updateQuestion(idx, `option${letter}`, e.target.value)}
                        placeholder={t('optionL', { letter })}
                        className="text-sm"
                      />
                      {/* Option photo chip: empty → plus tile opens the picker;
                      set → live thumbnail (click replaces) + red dot removes */}
                      <span className="relative shrink-0" title={t('oPhotoTip', { letter })}>
                        <label
                          className={`block w-8 h-8 rounded-lg overflow-hidden cursor-pointer ${photoBusy === `o-${idx}-${letter}` ? 'ring-2 ring-primary' : 'ring-1 ring-black/15'}`}
                        >
                          {optImg ? (
                            <img src={imgSrc(optImg.u)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className={`w-full h-full flex items-center justify-center ${photoBusy === `o-${idx}-${letter}` ? 'bg-[#FFE8DE]' : 'bg-muted'}`}>
                              {photoBusy === `o-${idx}-${letter}`
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                : <ImagePlus className="w-3.5 h-3.5 text-muted-foreground" />}
                            </span>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onClick={e => { (e.target as HTMLInputElement).value = ''; }}
                            onChange={e => pickOptionPhoto(idx, letter, e.target.files?.[0])}
                          />
                        </label>
                        {optImg && (
                          <button
                            type="button"
                            onClick={() => clearOptionPhoto(idx, letter)}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center shadow"
                            title={t('removePhoto')} aria-label={t('removePhoto')}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </span>
                      <input
                        type="radio"
                        name={`smm-inline-correct-${idx}`}
                        checked={q.correctAnswer === letter}
                        onChange={() => updateQuestion(idx, 'correctAnswer', letter)}
                        className="shrink-0 accent-[#fe5933]"
                        title={t('markCorrect')}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
