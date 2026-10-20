'use client';

import React from 'react';
import {
  ArrowLeft, ClipboardList, FileText, Link2, Loader2, Palette,
  Plus, Sparkles, Trash2, Users, ChevronDown, ChevronRight, ListOrdered,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapse } from '@/components/motion';
import { PhotoshopColorPicker } from '@/components/color-picker';
import { useSessionStore } from '@/stores/session-store';
import { useRequestEditorStore, EMPTY_STEP, type RequestStepDraft } from '@/stores/request-editor-store';
import { tUI } from '@/lib/i18n';

/**
 * CREATE / EDIT ЗАПРОС — the full-page editor, a one-to-one visual clone of
 * the test editor (create-edit-view.tsx + smm-event-editor-view.tsx): the
 * same sticky 56px header, the same rounded-4xl collapsible section cards,
 * the same publication-variant option cards, the same fixed bottom save bar.
 * Only the TEXT is different — a запрос stores its summary and its STEPS
 * (the analogue of the question list: each step becomes a card on the
 * filling screen, the test-taking page's twin).
 */

export interface SmmRequestEditorViewProps {
  goHome: () => void;
  handleSaveRequest: () => void;
  busy: boolean;
}

export default function SmmRequestEditorView({ goHome, handleSaveRequest, busy }: SmmRequestEditorViewProps) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  const rqTitle = useRequestEditorStore(s => s.rqTitle);
  const setRqTitle = useRequestEditorStore(s => s.setRqTitle);
  const rqSummary = useRequestEditorStore(s => s.rqSummary);
  const setRqSummary = useRequestEditorStore(s => s.setRqSummary);
  const rqCoverColor = useRequestEditorStore(s => s.rqCoverColor);
  const setRqCoverColor = useRequestEditorStore(s => s.setRqCoverColor);
  const rqIsPublic = useRequestEditorStore(s => s.rqIsPublic);
  const setRqIsPublic = useRequestEditorStore(s => s.setRqIsPublic);
  const steps = useRequestEditorStore(s => s.steps);
  const setSteps = useRequestEditorStore(s => s.setSteps);
  const editingRequestId = useRequestEditorStore(s => s.editingRequestId);
  const rqInfoExpanded = useRequestEditorStore(s => s.rqInfoExpanded);
  const setRqInfoExpanded = useRequestEditorStore(s => s.setRqInfoExpanded);
  const rqCoverExpanded = useRequestEditorStore(s => s.rqCoverExpanded);
  const setRqCoverExpanded = useRequestEditorStore(s => s.setRqCoverExpanded);
  const rqStepsExpanded = useRequestEditorStore(s => s.rqStepsExpanded);
  const setRqStepsExpanded = useRequestEditorStore(s => s.setRqStepsExpanded);

  const isEdit = !!editingRequestId;
  const [sideError, setSideError] = React.useState('');

  // ---- steps ---------------------------------------------------------------
  const updateStepLocal = (id: string, patch: Partial<RequestStepDraft>) =>
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const addStep = () => {
    setSideError('');
    setSteps(prev => [...prev, { ...EMPTY_STEP, id: `local-${Date.now()}` }]);
  };

  const removeStep = (step: RequestStepDraft) => {
    setSideError('');
    setSteps(prev => prev.filter(s => s.id !== step.id));
  };

  // A plain JSX helper (NOT a component) — keeps the collapsible section
  // headers terse without triggering the static-components rule.
  const chev = (open: boolean) => (open
    ? <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
    : <ChevronDown className="w-4 h-4 ml-auto shrink-0" />);

  return (
    <div className="min-h-screen bg-background screen-enter">
      {/* The same sticky header chrome as the test editor — the uniform
          56px top-panel contract (h-14 mobile / h-16 desktop). */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 h-14 lg:h-16 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goHome} className="rounded-full"><ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}</Button>
          <h1 className="text-lg font-bold">{isEdit ? t('smmEditRequestTitle') : t('smmNewRequest')}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 pb-32 space-y-6">
        {/* ── REQUEST INFORMATION — the same collapsible card the test's info
            block uses, with the same publication-variant option cards ── */}
        <Card className="rounded-4xl border border-black bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setRqInfoExpanded(v => !v)}
            className="w-full flex items-center gap-1.5 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-base">{t('smmRequestInformation')}</span>
            {chev(rqInfoExpanded)}
          </button>
          <Collapse open={rqInfoExpanded} className="pt-0">
            <CardContent className="space-y-4 !pt-0">
              <div className="space-y-2">
                <Label>{t('smmRequestTitle')}</Label>
                <Input value={rqTitle} onChange={e => setRqTitle(e.target.value)} maxLength={200} placeholder={t('smmRequestTitle')} />
              </div>
              <div className="space-y-2">
                <Label>{t('smmRequestSummary')}</Label>
                <Textarea value={rqSummary} onChange={e => setRqSummary(e.target.value)} maxLength={1000} rows={2} placeholder={t('smmRequestSummaryHint')} />
                <p className="text-xs text-muted-foreground">{t('smmRequestSummaryHint')}</p>
              </div>
              {/* Publication variant — the SAME option-card pair the test
              editor uses: «Только по ссылке» keeps the запрос out of the
              public library, «Всему сообществу» shares it as a template. */}
              <div className="space-y-2">
                <Label>{t('publishVariant')}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRqIsPublic(false)}
                    className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                      !rqIsPublic
                        ? 'border-primary bg-[#FFE8DE] shadow-md'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link2 className="w-4 h-4 text-cta shrink-0" />
                      <span className="font-semibold text-sm">{t('shareOptLink')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('shareOptLinkSub')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRqIsPublic(true)}
                    className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                      rqIsPublic
                        ? 'border-primary bg-[#FFE8DE] shadow-md'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm">{t('shareOptCommunity')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('shareOptCommunitySub')}</p>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{t('publishNote')}</p>
              </div>
            </CardContent>
          </Collapse>
        </Card>

        {/* ── COVER — the same card color customization (the feed derives the
            color automatically when nothing is chosen) ── */}
        <Card className="rounded-4xl border border-black bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setRqCoverExpanded(v => !v)}
            className="w-full flex items-center gap-1.5 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
          >
            <Palette className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-base">{t('cover')}</span>
            {chev(rqCoverExpanded)}
          </button>
          <Collapse open={rqCoverExpanded}>
            <CardContent className="space-y-4 !pt-0">
              <p className="text-xs text-muted-foreground">{t('smmRequestCoverHint')}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">{t('cardColor')}</Label>
                  <button
                    type="button"
                    onClick={() => setRqCoverColor('')}
                    title={t('auto')}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border-2 transition-all ${
                      rqCoverColor === '' ? 'border-cta bg-[#FFF0D9] text-cta font-semibold' : 'border-black/10 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {t('auto')}
                  </button>
                </div>
                <PhotoshopColorPicker value={rqCoverColor || '#E3EEFF'} onChange={v => setRqCoverColor(v)} />
              </div>
            </CardContent>
          </Collapse>
        </Card>

        {/* ── STEPS — the запрос's analogue of the question list: each step
            becomes a card on the filling screen (the test-taking twin) ── */}
        <Card className="rounded-4xl border border-black bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setRqStepsExpanded(v => !v)}
            className="w-full flex items-center gap-1.5 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
          >
            <ListOrdered className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-base">{t('smmRequestSteps')} · {t('smmStepsN', { n: steps.length })}</span>
            {chev(rqStepsExpanded)}
          </button>
          <Collapse open={rqStepsExpanded} keepMountedOnceShown>
            <CardContent className="!pt-0">
              <p className="text-xs text-muted-foreground mb-3">{t('smmRequestStepsHint')}</p>
              <div className="flex justify-end gap-2 mb-4">
                <Button size="sm" onClick={addStep} data-testid="add-step">
                  <Plus className="w-3 h-3 mr-1" /> {t('smmAddStep')}
                </Button>
              </div>
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{t('smmFillEmptyHint')}</p>
              )}
              <div className="space-y-4">
                {steps.map((s, idx) => (
                  <Card key={s.id} className="rounded-3xl border border-black bg-white">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="rounded-full"><FileText className="w-3 h-3 mr-1" />{t('smmFillStepOf', { n: idx + 1, m: steps.length })}</Badge>
                        <Button variant="ghost" size="sm" className="text-destructive h-7 w-7 p-0" onClick={() => removeStep(s)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <Input value={s.title} onChange={e => updateStepLocal(s.id, { title: e.target.value })} maxLength={200} placeholder={t('smmStepTitle')} />
                      <Textarea value={s.hint} onChange={e => updateStepLocal(s.id, { hint: e.target.value })} rows={2} maxLength={2000} placeholder={t('smmStepHint')} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Collapse>
        </Card>

        {sideError && <p className="text-sm text-destructive text-center">{sideError}</p>}
      </main>

      {/* Bottom action bar — the same fixed bar as the test editor: fixed to
          the screen edge on phones, a floating dock pill on desktop. */}
      <div className="desktop-dock fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div
          className="max-w-4xl mx-auto px-4 pt-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Button
            onClick={handleSaveRequest}
            disabled={busy || !rqTitle.trim()}
            className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? t('save') : t('smmCreateNewRequest')}
          </Button>
        </div>
      </div>
    </div>
  );
}
