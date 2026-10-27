'use client';

// ---------------------------------------------------------------------------
// SMM AGENT SHEET — the one-button platform automation (replaces the old
// free-tools page). Opened by the Bot icon in the top panel; the sheet is
// the «всплывающая снизу страница» of the three-page-type rule.
//
// The agent EXECUTES, not chats:
//   * Контент-план / Идеи Reels / Хештеги — the ready text (copy) —
//     the same generations the tools page used to host;
//   * ТЗ заказа — the agent composes the FULL brief as strict JSON and the
//     «Создать заказ с этим ТЗ» button creates a REAL мероприятие in the
//     personal library (api.createEvent) — true platform automation.
// ---------------------------------------------------------------------------

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResizableSheetFrame } from '@/components/resize-sheet';
import { api } from '@/lib/api';
import { tUI, type Lang } from '@/lib/i18n';
import { Bot, Building2, Check, Clapperboard, Copy, Hash, CalendarRange, Loader2, X } from 'lucide-react';

type AgentTask = 'content-plan' | 'reels-ideas' | 'hashtags' | 'event-tz';

interface AgentTzData {
  title: string;
  summary: string;
  brief: string;
  category: string;
  platform: string;
  format: string;
  deadline: string;
  budget: string;
  restrictions: string;
}

export default function SmmAgentSheet({
  open,
  onClose,
  lang,
  isSpecialist,
  onEventCreated,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  isSpecialist: boolean;
  onEventCreated: () => void;
}) {
  const t = (key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars);

  const [task, setTask] = useState<AgentTask>('event-tz');
  const [business, setBusiness] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState('');
  const [tz, setTz] = useState<AgentTzData | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const chips: { key: AgentTask; icon: React.ReactNode; label: string }[] = [
    { key: 'event-tz', icon: <Building2 className="w-4 h-4" />, label: t('agentChipTZ') },
    { key: 'content-plan', icon: <CalendarRange className="w-4 h-4" />, label: t('agentChipPlan') },
    { key: 'reels-ideas', icon: <Clapperboard className="w-4 h-4" />, label: t('agentChipIdeas') },
    { key: 'hashtags', icon: <Hash className="w-4 h-4" />, label: t('agentChipTags') },
  ];

  const run = async () => {
    if (!business.trim()) { setError(t('toolNeedBusiness')); return; }
    setBusy(true);
    setError('');
    setResult('');
    setTz(null);
    setCopied(false);
    try {
      const res = await api.smmAgent({ task, business, platform, details, lang });
      setResult(res.text || '—');
      setTz(res.data || null);
    } catch (e: any) {
      setError(e?.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be blocked */ }
  };

  const createEvent = async () => {
    if (!tz) return;
    setCreating(true);
    try {
      await api.createEvent({ ...tz, isPublic: true });
      onClose();
      onEventCreated();
    } catch (e: any) {
      setError(e?.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ResizableSheetFrame
      open={open}
      onClose={onClose}
      initialVh={0.85}
      minVh={0.4}
      maxW="max-w-3xl"
      header={
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-2xl bg-cta text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">{t('agentTitle')}</p>
              <p className="text-[11px] text-muted-foreground truncate">{t('agentSub')}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onClose} aria-label={t('cancel')}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      }
      body={
        <div className="px-4 py-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* task chips */}
            <div>
              <Label className="text-sm font-bold">{t('agentPickTask')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {chips.map(c => (
                  <button key={c.key} type="button" onClick={() => { setTask(c.key); setResult(''); setTz(null); setError(''); }}
                    className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-left text-xs sm:text-[13px] font-bold transition-colors ${task === c.key ? 'border-cta bg-cta/5 text-cta' : 'border-black/15 bg-white hover:border-black/35'}`}>
                    <span className={`shrink-0 ${task === c.key ? 'text-cta' : 'text-muted-foreground'}`}>{c.icon}</span>
                    <span className="min-w-0 truncate">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-bold">{t('toolBusiness')}</Label>
              <Input value={business} onChange={e => setBusiness(e.target.value)} placeholder={t('toolBusinessPh')} className="h-10 rounded-2xl border-black/20 bg-white" />
            </div>
            <div>
              <Label className="text-sm font-bold">{t('toolPlatform')}</Label>
              <div className="flex flex-wrap gap-2">
                {['instagram', 'tiktok', 'youtube', 'telegram'].map(p => (
                  <button key={p} type="button" onClick={() => setPlatform(p)}
                    className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold capitalize transition-colors ${platform === p ? 'bg-cta text-white border-cta' : 'border-black/20 bg-white hover:border-black/40'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-bold">{t('toolDetails')}</Label>
              <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder={t('toolDetailsPh')} className="rounded-2xl border-black/20 bg-white min-h-16" />
            </div>
            <Button onClick={run} disabled={busy} className="w-full h-11 rounded-full bg-cta hover:bg-cta/90 text-white font-bold">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
              {busy ? t('toolGenerating') : t('toolGenerate')}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {result && (
              <div className="rounded-3xl border-2 border-cta/40 bg-[#FFF7ED] p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <p className="text-xs font-bold text-cta uppercase">{chips.find(c => c.key === task)?.label}</p>
                  <Button variant="outline" size="sm" onClick={copy} className="h-8 rounded-full border-black text-xs shrink-0">
                    {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copied ? t('toolCopied') : t('toolCopy')}
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{result}</pre>
                {/* THE AUTOMATION: the ТЗ becomes a REAL заказ with one tap */}
                {task === 'event-tz' && !isSpecialist && (
                  tz ? (
                    <Button onClick={createEvent} disabled={creating} className="mt-3 w-full h-10 rounded-full bg-primary hover:bg-primary/90 text-white font-bold">
                      {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Building2 className="w-4 h-4 mr-2" />}
                      {t('agentCreateEvent')}
                    </Button>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">{t('agentNoTz')}</p>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}
