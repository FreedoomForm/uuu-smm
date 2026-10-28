'use client';

// ---------------------------------------------------------------------------
// SMM EDITORS — the two creation screens opened by the contextual «+»:
//
//   SmmEventEditor — the test editor's twin MINUS the test machinery
//     (no questions/answers, no slider, no shuffles, no practice/test mode).
//     The OLD «биржа услуг» facts (категория услуги, бюджет, формат,
//     онлайн-площадка/локация с картой, время, цветной Cover) are GONE from
//     the form per the user's cut — an order is now: cover photo + название
//     + описание + теги + сколько людей требуется + задачи + файлы.
//     (The qualification-tests picker is gone too: the заявка flow takes an
//     ad link, not tests.)
//
//   SmmPostEditor — the specialist's post card: ONE role (existing or new
//     with the two prices) + video/photo collection + description.
//
// The FORM BODIES (SmmEventForm / SmmPostForm) are shared components: the
// full-page editors wrap them in the EditorShell, and the card's EDIT WINDOW
// (the switcher's «Изменить» option — the SAME window the test cards open)
// embeds them in a resizable sheet with the Save button in its footer.
// ---------------------------------------------------------------------------

import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { tUI } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session-store';
import { useNavStore } from '@/stores/nav-store';
import { useSmmStore } from '@/stores/smm-store';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Image as ImgIcon, Loader2, Paperclip, Plus, Trash2, Users, Tag as TagIcon, ListChecks, Pencil, Minus, Upload } from 'lucide-react';
import LangButton from '@/components/lang-button';
import { Collapse } from '@/components/motion';
import { mediaSrc, fmtMoney, SmmToast } from './smm-bits';
import type { SmmEventT, SmmPostT, SmmPostMedia, SmmAttachmentT } from '@/lib/app-types';
import type { AttachmentItem } from '@/components/attachment-utils';

// The «Прикреплённые файлы» editor — the SAME component the test editor
// embeds (rows + «Add by link» / «Upload file», live upload spinners).
const AttachmentsEditor = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsEditor), { ssr: false, loading: () => null });

export function EditorShell({ title, onBack, lang, cycleLang, children, saveLabel, onSave, saving, saveDisabled }: {
  title: string;
  onBack: () => void;
  lang: string;
  cycleLang: () => void;
  children: React.ReactNode;
  saveLabel: string;
  onSave: () => void;
  saving: boolean;
  saveDisabled?: boolean;
}) {
  return (
    <div className="relative h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      <SmmToast />
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 lg:h-16 flex flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full shrink-0 h-8 w-8 p-0 sm:w-auto sm:px-3">
              <ArrowLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Back</span>
            </Button>
            <h1 className="text-base sm:text-lg font-bold truncate">{title}</h1>
          </div>
          <LangButton lang={lang as any} onChange={cycleLang} className="border-black px-1.5 sm:px-3 shrink-0" />
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">{children}</div>
      </main>
      <div className="desktop-dock shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/10">
        <div className="max-w-2xl mx-auto px-4 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button onClick={onSave} disabled={saving || saveDisabled} className="w-full h-9 lg:h-11 lg:text-base rounded-full bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function useT() {
  const lang = useSessionStore(s => s.lang);
  const cycleLang = useSessionStore(s => s.cycleLang);
  const t = (key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars);
  return { t, lang, cycleLang };
}

// The toast helper — the same lightweight inline toast the whole SMM page
// speaks (the SmmToast listener renders it on the dashboard; the editor
// pages keep the same event contract).
const smmToast = (msg: string) => {
  try { window.dispatchEvent(new CustomEvent('smm-toast', { detail: msg })); } catch { /* noop */ }
};

// ── THE «ПРИКРЕПЛЁННЫЕ ФАЙЛЫ» SECTION OF EVERY CREATE/EDIT PAGE ───────────
// The same collapsed-to-one-line card the test editor keeps: Paperclip +
// «Прикреплённые файлы (N)» header, the hint line and the SAME
// AttachmentsEditor inside (add by link / upload a file / reorder rows).
function EditorFilesSection({ items, onChange, t }: {
  items: AttachmentItem[];
  onChange: (items: AttachmentItem[]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="rounded-4xl border border-black bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1.5 px-4 sm:px-6 py-4 text-left hover:bg-muted/50 transition-colors"
      >
        <Paperclip className="w-4 h-4 shrink-0" />
        <span className="font-semibold text-base">{t('attachedFiles', { n: items.length })}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 ml-auto shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
        )}
      </button>
      <Collapse open={expanded} keepMountedOnceShown>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground mb-3">{t('smmFilesHint')}</p>
          <AttachmentsEditor items={items} onChange={onChange} />
        </CardContent>
      </Collapse>
    </Card>
  );
}

// ── THE COLLAPSIBLE SECTION — the SAME one-card pattern the «Прикреплённые
// файлы» section keeps (header button + Collapse): every creation page wears
// раскрывающиеся секции — «Ввод», «Теги», «Список задач», «Сколько людей
// требуется». `defaultOpen` picks the initial state (the input section opens
// on create, stays folded on edit).
export function CollapsibleSection({ title, icon, hint, defaultOpen = false, count, children, tone }: {
  title: string;
  icon?: React.ReactNode;
  hint?: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
  tone?: 'cta' | 'plain';
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <Card className={`rounded-4xl border bg-white overflow-hidden ${tone === 'cta' ? 'border-cta/50' : 'border-black'}`}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1.5 px-4 sm:px-6 py-4 text-left hover:bg-muted/50 transition-colors"
      >
        {icon}
        <span className="font-semibold text-base">{title}</span>
        {count != null && count > 0 && (
          <span className="h-5 min-w-5 px-1.5 rounded-full bg-cta text-white text-[10px] font-bold flex items-center justify-center">{count}</span>
        )}
        {expanded ? (
          <ChevronDown className="w-4 h-4 ml-auto shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
        )}
      </button>
      <Collapse open={expanded} keepMountedOnceShown>
        <CardContent className="pt-0">
          {hint && <p className="text-xs text-muted-foreground mb-3">{hint}</p>}
          {children}
        </CardContent>
      </Collapse>
    </Card>
  );
}

// ── ФОТО ОБЛОЖКИ — the cover photo picker of the «Ввод» section: one image,
// uploaded through the SAME POST /api/attachments/upload every editor uses
// (tg:/data:/https: storage). The pastel colors stay as the fallback pick.
export function CoverPhotoPicker({ url, onChange, t }: {
  url: string | null;
  onChange: (url: string | null) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/attachments/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || !j?.url) throw new Error(j?.error || 'Upload failed');
      onChange(String(j.url));
    } catch (e: any) {
      smmToast(e?.message || 'Error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-bold">{t('smmCoverPhoto')}</Label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-black/10 bg-[#FFF0D9] flex items-center justify-center shrink-0">
          {url
            ? <img src={mediaSrc(url)} alt="" className="w-full h-full object-cover" />
            : <ImgIcon className="w-6 h-6 text-cta/60" />}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border-2 border-black text-xs font-bold cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : 'hover:bg-muted/50'}`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {t('smmCoverUpload')}
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          </label>
          {url && (
            <button type="button" onClick={() => onChange(null)} className="text-xs font-bold text-destructive text-left">{t('smmCoverRemove')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ТЕГИ — the «Теги» section: chips + a type-and-Enter input. Stored as
// string[] (≤20), the SAME shape the tests keep.
export function TagsEditor({ tags, onChange, t }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [val, setVal] = useState('');
  const add = () => {
    const s = val.trim().slice(0, 40);
    if (!s) return;
    if (!tags.some(x => x.toLowerCase() === s.toLowerCase())) onChange([...tags, s].slice(0, 20));
    setVal('');
  };
  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-black/20 bg-muted/50 text-xs font-semibold">
              {tag}
              <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))}
                className="w-5 h-5 rounded-full bg-white border border-black/15 flex items-center justify-center" aria-label="remove tag">
                <Trash2 className="w-3 h-3 text-destructive" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={t('smmTagsPh')} maxLength={40} className="h-9 rounded-full border-black/20 bg-white text-sm" />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!val.trim()} className="h-9 rounded-full border-black shrink-0"><Plus className="size-3.5" /></Button>
      </div>
    </div>
  );
}

// ── СПИСОК ЗАДАЧ — the task-card rows: each card = the description of ONE
// expected result (e.g. «оплата на эту карту — 500 000 сум» + пояснение).
// On the EVENT the list is created for the SMM specialist when they accept
// the invitation; on the POST the cards land in the CUSTOMER's task list
// when they accept the заявка with this post (the deal checklist).
export function TasksEditor({ items, onChange, t, addLabel }: {
  items: { label: string; desc: string }[];
  onChange: (items: { label: string; desc: string }[]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  addLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{items.length > 0 ? `${items.length}` : ''}</span>
        <button type="button" onClick={() => onChange([...items, { label: '', desc: '' }])}
          className="h-8 px-3 rounded-full bg-cta text-white text-xs font-bold">
          + {addLabel || t('smmTaskAdd')}
        </button>
      </div>
      {items.map((c, i) => (
        <div key={i} className="rounded-2xl border border-black/10 p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground shrink-0">{i + 1}.</span>
            <Input value={c.label} onChange={e => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              placeholder={t('smmTaskLabelPh')} className="h-9 rounded-xl border-black/20 bg-white text-sm" />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="shrink-0 w-8 h-8 rounded-full border border-destructive/40 text-destructive flex items-center justify-center" aria-label="remove">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <Input value={c.desc} onChange={e => onChange(items.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))}
            placeholder={t('smmTaskDescPh')} className="h-9 rounded-xl border-black/10 bg-black/[0.02] text-xs" />
        </div>
      ))}
      {items.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-1">—</p>}
    </div>
  );
}

// ── THE SHARED FORM HANDLES ─────────────────────────────────────────────────
// The edit window (and the EditorShell footer) triggers the save through the
// ref: `formRef.current?.save()`.

export interface SmmFormHandle {
  save: () => void;
}

// ── EVENT FORM (the body of the event editor) ───────────────────────────────

export const SmmEventForm = React.forwardRef<SmmFormHandle, {
  editingId: string | null; // null = create
  onSaved: (saved: SmmEventT) => void; // the save succeeded — the parent closes/navigates
  onFail: () => void; // the card is not mine / gone — the parent closes
  onSaving?: (saving: boolean) => void;
}>(function SmmEventForm({ editingId, onSaved, onFail, onSaving }, ref) {
  const { t } = useT();
  const myId = useSessionStore(s => s.user?.id || s.hydratedUser?.id || '');

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  // legacy qualification tests: the picker is gone from the UI (the заявка
  // flow takes an ad LINK, not tests), but the ids ride along on update so
  // an old order never loses what it carried
  const [testIds, setTestIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  // ЧЕК-ЛИСТ СДАЧИ: the delivery slots the specialist must fill on the
  // accepted deal — each slot = WHAT the file/link must be ({ label, desc })
  const [checklist, setChecklist] = useState<{ label: string; desc: string }[]>([]);
  // СКОЛЬКО ЛЮДЕЙ ТРЕБУЕТСЯ + ТЕГИ + ФОТО ОБЛОЖКИ — the editor's own sections
  const [peopleRequired, setPeopleRequired] = useState(1);
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  // Version rule (the SAME one the tests keep): a VERSION (a copy of somebody
  // else's мероприятие) can never be public — the editor hides the publish
  // selector for it (the server coerces the flag anyway).
  const [isVersion, setIsVersion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // load the edited event
    if (editingId) {
      setLoading(true);
      api.getEvent(editingId).then((r: any) => {
        const e: SmmEventT = r.event;
        if (e.customerId !== myId) { onFail(); return; }
        setTitle(e.title); setSummary(e.summary || '');
        setTestIds(e.testIds || []); setAttachments(((e as SmmEventT).attachments || []) as AttachmentItem[]);
        setChecklist(Array.isArray((e as any).checklist) ? (e as any).checklist : []);
        setPeopleRequired(Number((e as any).peopleRequired) > 0 ? Number((e as any).peopleRequired) : 1);
        setTags(Array.isArray((e as any).tags) ? (e as any).tags : []);
        setCoverUrl((e as any).coverUrl || null);
        setIsVersion(!!e.parentId);
        setIsPublic(e.isPublic !== false);
      }).catch(() => onFail()).finally(() => setLoading(false));
    } else {
      setTitle(''); setSummary(''); setTestIds([]); setAttachments([]); setChecklist([]); setIsPublic(true); setIsVersion(false);
      setPeopleRequired(1); setTags([]); setCoverUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, myId]);

  const save = async () => {
    if (!title.trim()) { smmToast(t('smmEventTitle')); return; }
    setSaving(true); onSaving?.(true);
    try {
      // The «биржа услуг» facts (category/budget/format/platform/location/
      // time/coverColor) are NOT collected any more — they are deliberately
      // LEFT OUT of the payload: on update the server keeps whatever the old
      // order carried (nothing is wiped), on create the DB defaults apply.
      const payload = { title, summary, testIds, attachments, isPublic, checklist: checklist.filter(c => c.label.trim() || c.desc.trim()), peopleRequired, tags, coverUrl };
      const saved = editingId ? await api.updateEvent(editingId, payload) : await api.createEvent(payload);
      smmToast(t('smmEventSaved'));
      onSaved(saved as SmmEventT);
    } catch (e: any) {
      smmToast(e?.message === 'PUBLISH_NAME_TAKEN' ? t('publishNameTaken') : (e?.message || 'Error'));
    } finally {
      setSaving(false); onSaving?.(false);
    }
  };

  useImperativeHandle(ref, () => ({ save }));

  return (
    <>
      {/* ── СЕКЦИЯ ВВОДА (раскрывается/скрывается): фото обложки + название +
      описание. Открыта при создании, сложена при правке. */}
      <CollapsibleSection title={t('smmInputSection')} icon={<Pencil className="w-4 h-4 shrink-0" />} defaultOpen={!editingId}>
        <div className="flex flex-col gap-3">
          <CoverPhotoPicker url={coverUrl} onChange={setCoverUrl} t={t} />
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmEventTitle')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-10 rounded-2xl border-black/20 bg-white" placeholder={t('smmEventTitle')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmEventSummary')}</Label>
            <Textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} className="rounded-2xl border-black/20 bg-white" />
          </div>
        </div>
      </CollapsibleSection>

      {/* ── СКОЛЬКО ЛЮДЕЙ ТРЕБУЕТСЯ — the event-only section: how many
      specialists the order needs; the card shows «Принято X · Осталось Y» */}
      <CollapsibleSection title={t('smmPeopleRequired')} icon={<Users className="w-4 h-4 shrink-0 text-cta" />} defaultOpen={!editingId} tone="cta">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setPeopleRequired(p => Math.max(1, p - 1))}
            className="w-10 h-10 rounded-full border-2 border-black/20 flex items-center justify-center hover:border-black" aria-label="-">
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-2xl font-extrabold w-14 text-center">{peopleRequired}</span>
          <button type="button" onClick={() => setPeopleRequired(p => Math.min(999, p + 1))}
            className="w-10 h-10 rounded-full border-2 border-black/20 flex items-center justify-center hover:border-black" aria-label="+">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </CollapsibleSection>

      {/* ── ТЕГИ */}
      <CollapsibleSection title={t('smmTagsSection')} icon={<TagIcon className="w-4 h-4 shrink-0" />} defaultOpen={false} count={tags.length}>
        <TagsEditor tags={tags} onChange={setTags} t={t} />
      </CollapsibleSection>

      {/* ── СПИСОК ЗАДАЧ (the delivery checklist, re-labeled): the task cards
      created FOR the SMM specialist when they accept the invitation — each
      card describes WHAT to deliver; they fill it on the accepted deal */}
      <CollapsibleSection title={t('smmTasksSection')} icon={<ListChecks className="w-4 h-4 shrink-0 text-cta" />} hint={t('smmTasksHintEvent')} defaultOpen={false} count={checklist.filter(c => c.label.trim() || c.desc.trim()).length} tone="cta">
        <TasksEditor items={checklist} onChange={setChecklist} t={t} />
      </CollapsibleSection>

      {/* the «Прикреплённые файлы» section — the SAME one the test editor
      keeps, present on every creation and editing page */}
      <EditorFilesSection items={attachments} onChange={setAttachments} t={t} />

      {/* public — a VERSION can never be public (the test editor's rule:
      the publish selector is hidden for versions) */}
      {!isVersion && (
        <label className="flex items-center gap-2 cursor-pointer select-none px-1">
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-4 h-4 accent-[#F97316]" />
          <span className="text-sm font-semibold">{t('modeDiscover')} — {t('smmEvents')}</span>
        </label>
      )}
    </>
  );
});

// ── EVENT PAGE EDITOR (the «+» create flow — the full page) ─────────────────

export function SmmEventEditor() {
  const { t, lang, cycleLang } = useT();
  const setPage = useNavStore(s => s.setPage);
  const editingId = useSmmStore(s => s.editingId);
  const formRef = useRef<SmmFormHandle>(null);
  const [saving, setSaving] = useState(false);

  return (
    <EditorShell title={editingId ? t('smmEventEdit') : t('smmEventCreate')}
      onBack={() => { useSmmStore.setState({ editingId: null }); setPage('dashboard'); }}
      lang={lang} cycleLang={cycleLang}
      saveLabel={editingId ? t('save') : t('smmEventCreate')} onSave={() => formRef.current?.save()} saving={saving}>
      <SmmEventForm
        ref={formRef}
        editingId={editingId}
        onSaving={setSaving}
        onSaved={() => { useSmmStore.setState((s: any) => ({ editingId: null, refreshNonce: (s.refreshNonce || 0) + 1 })); setPage('dashboard'); }}
        onFail={() => setPage('dashboard')}
      />
    </EditorShell>
  );
}

// ── POST FORM (the body of the post editor) ─────────────────────────────────

export const SmmPostForm = React.forwardRef<SmmFormHandle, {
  editingId: string | null; // null = create
  onSaved: (saved: SmmPostT) => void;
  onFail: () => void;
  onSaving?: (saving: boolean) => void;
}>(function SmmPostForm({ editingId, onSaved, onFail, onSaving }, ref) {
  const { t } = useT();
  const myId = useSessionStore(s => s.user?.id || s.hydratedUser?.id || '');

  const [roles, setRoles] = useState<{ id: string; name: string; pricePerK?: number | null; pricePerDay?: number | null }[]>([]);
  const [roleId, setRoleId] = useState<string>('');
  const [newRoleName, setNewRoleName] = useState('');
  const [pricePerK, setPricePerK] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<SmmPostMedia[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  // ТЕГИ + ФОТО ОБЛОЖКИ + ЗАДАЧИ ЗАКАЗЧИКА — the post editor's own sections:
  // the tasks («Ожидаемые результаты») land in the CUSTOMER's task list when
  // they accept the заявка sent with this post
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [tasks, setTasks] = useState<{ label: string; desc: string }[]>([]);
  const [coverColor, setCoverColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyRoles().then((r: any) => setRoles(r.items || [])).catch(() => setRoles([]));
    if (editingId) {
      api.getPosts('mine').then((r: any) => {
        const post: SmmPostT | undefined = (r.items || []).find((p: SmmPostT) => p.id === editingId);
        if (!post) { onFail(); return; }
        setDescription(post.description || '');
        setMedia((post.media || []) as SmmPostMedia[]);
        setAttachments((post.attachments || []) as AttachmentItem[]);
        setTags(Array.isArray((post as any).tags) ? (post as any).tags : []);
        setCoverUrl((post as any).coverUrl || null);
        setTasks(Array.isArray((post as any).tasks) ? (post as any).tasks : []);
        setCoverColor(post.coverColor || null);
        if (post.role) {
          setRoleId(post.roleId);
          setNewRoleName(post.role.name || '');
          setPricePerK(post.role.pricePerK != null ? String(post.role.pricePerK) : '');
          setPricePerDay(post.role.pricePerDay != null ? String(post.role.pricePerDay) : '');
        }
      }).catch(() => onFail());
    } else {
      setDescription(''); setMedia([]); setAttachments([]); setCoverColor(null);
      setRoleId(''); setNewRoleName(''); setPricePerK(''); setPricePerDay('');
      setTags([]); setCoverUrl(null); setTasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, myId]);

  // the «Видео или коллекция фото» section is REMOVED from the editor — the
  // loaded media/coverColor still ride on every save, so old posts keep
  // their collections and the cover colour untouched.

  const save = async () => {
    const name = newRoleName.trim();
    if (!name) { smmToast(t('smmRoleName')); return; }
    const role = { name, pricePerK: pricePerK.trim() || null, pricePerDay: pricePerDay.trim() || null };
    setSaving(true); onSaving?.(true);
    try {
      const saved = editingId
        ? await api.updatePost(editingId, { role, description, media, attachments, coverColor, tags, coverUrl, tasks: tasks.filter(c => c.label.trim() || c.desc.trim()) })
        : await api.createPost({ roleId: roleId || undefined, role, description, media, attachments, coverColor, tags, coverUrl, tasks: tasks.filter(c => c.label.trim() || c.desc.trim()) });
      smmToast(t('smmPostSaved'));
      onSaved(saved as SmmPostT);
    } catch (e: any) {
      smmToast(e?.message === 'This role already has a post' ? t('smmPostRoleTaken') : (e?.message || 'Error'));
    } finally {
      setSaving(false); onSaving?.(false);
    }
  };

  useImperativeHandle(ref, () => ({ save }));

  return (
    <>
      {/* ── СЕКЦИЯ ВВОДА (раскрывается/скрывается): фото обложки + название
      поста + цены + описание. Открыта при создании, сложена при правке. */}
      <CollapsibleSection title={t('smmInputSection')} icon={<Pencil className="w-4 h-4 shrink-0" />} defaultOpen={!editingId}>
        <div className="flex flex-col gap-3">
          <CoverPhotoPicker url={coverUrl} onChange={setCoverUrl} t={t} />
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmPostRole')}</Label>
            {roles.length > 0 && !editingId && (
              <div className="flex flex-wrap gap-1.5">
                {roles.map(r => (
                  <button key={r.id} type="button" onClick={() => { setRoleId(r.id === roleId ? '' : r.id); setNewRoleName(r.name); setPricePerK(r.pricePerK != null ? String(r.pricePerK) : ''); setPricePerDay(r.pricePerDay != null ? String(r.pricePerDay) : ''); }}
                    className={`h-8 px-2.5 rounded-full border-2 text-xs font-bold ${roleId === r.id ? 'bg-cta text-white border-cta' : 'bg-white border-black/20 hover:border-black'}`}>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <Input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder={t('smmRoleNamePh')} className="h-10 rounded-2xl border-black/20 bg-white" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold">{t('smmRolePriceK')}</Label>
              <Input value={pricePerK} onChange={e => setPricePerK(e.target.value)} inputMode="decimal" className="h-9 rounded-2xl border-black/20 bg-white" placeholder={fmtMoney(0)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold">{t('smmRolePriceDay')}</Label>
              <Input value={pricePerDay} onChange={e => setPricePerDay(e.target.value)} inputMode="decimal" className="h-9 rounded-2xl border-black/20 bg-white" placeholder={fmtMoney(0)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmPostDesc')}</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder={t('smmPostDescPh')} className="rounded-2xl border-black/20 bg-white" />
          </div>
        </div>
      </CollapsibleSection>

      {/* ── «ВИДЕО ИЛИ КОЛЛЕКЦИЯ ФОТО» REMOVED — the media section is gone
      from the creation and editing pages (the user's cut). The cover photo
      lives in the ВВОД section; old posts keep their saved collections. */}

      {/* ── ТЕГИ */}
      <CollapsibleSection title={t('smmTagsSection')} icon={<TagIcon className="w-4 h-4 shrink-0" />} defaultOpen={false} count={tags.length}>
        <TagsEditor tags={tags} onChange={setTags} t={t} />
      </CollapsibleSection>

      {/* ── ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ (задачи заказчика): the result cards — what
      the CUSTOMER must do when they accept the заявка with this post (e.g.
      «оплата на эту карту…» + чек-скрин) */}
      <CollapsibleSection title={t('smmTasksSection')} icon={<ListChecks className="w-4 h-4 shrink-0 text-cta" />} hint={t('smmTasksHintPost')} defaultOpen={false} count={tasks.filter(c => c.label.trim() || c.desc.trim()).length} tone="cta">
        <TasksEditor items={tasks} onChange={setTasks} t={t} />
      </CollapsibleSection>

      {/* the «Прикреплённые файлы» section — the SAME one the test editor
      keeps, present on every creation and editing page */}
      <EditorFilesSection items={attachments} onChange={setAttachments} t={t} />
    </>
  );
});

// ── POST PAGE EDITOR (the «+» create flow — the full page) ──────────────────

export function SmmPostEditor() {
  const { t, lang, cycleLang } = useT();
  const setPage = useNavStore(s => s.setPage);
  const editingId = useSmmStore(s => s.editingId);
  const formRef = useRef<SmmFormHandle>(null);
  const [saving, setSaving] = useState(false);

  return (
    <EditorShell title={editingId ? t('smmPostEdit') : t('smmPostCreate')}
      onBack={() => { useSmmStore.setState({ editingId: null }); setPage('dashboard'); }}
      lang={lang} cycleLang={cycleLang}
      saveLabel={editingId ? t('save') : t('smmPostCreate')} onSave={() => formRef.current?.save()} saving={saving}>
      <SmmPostForm
        ref={formRef}
        editingId={editingId}
        onSaving={setSaving}
        onSaved={() => { useSmmStore.setState((s: any) => ({ editingId: null, refreshNonce: (s.refreshNonce || 0) + 1 })); setPage('dashboard'); }}
        onFail={() => setPage('dashboard')}
      />
    </EditorShell>
  );
}
