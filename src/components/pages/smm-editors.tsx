'use client';

// ---------------------------------------------------------------------------
// SMM EDITORS — the two creation screens opened by the contextual «+»:
//
//   SmmEventEditor — the test editor's twin MINUS the test machinery
//     (no questions/answers, no slider, no shuffles, no practice/test mode)
//     PLUS the 4 event facts: format (online/offline), the online platform
//     (instagram/telegram/youtube/tiktok) OR the location with a live map,
//     the time — and the qualification-tests picker.
//
//   SmmPostEditor — the specialist's post card: ONE role (existing or new
//     with the two prices) + video/photo collection + description.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
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
import { useSmmStore, smmNow } from '@/stores/smm-store';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Film, Image as ImgIcon, Loader2, MapPin, Paperclip, Plus, Trash2 } from 'lucide-react';
import LangButton from '@/components/lang-button';
import { Collapse } from '@/components/motion';
import { SMM_PLATFORMS, eventPlatformIcon, eventPlatformLabel, mapEmbedUrl, mediaSrc, fmtMoney } from './smm-bits';
import type { SmmEventT, SmmPostT, SmmPostMedia, SmmAttachmentT } from '@/lib/app-types';
import type { AttachmentItem } from '@/components/attachment-utils';

// The «Прикреплённые файлы» editor — the SAME component the test editor
// embeds (rows + «Add by link» / «Upload file», live upload spinners).
const AttachmentsEditor = dynamic(() => import('@/components/attachments').then(m => m.AttachmentsEditor), { ssr: false, loading: () => null });

const COVER_COLORS = ['#E3EEFF', '#DFF3E8', '#FFF0D9', '#FCE8F2', '#FFE3D6', '#E8E3FF'];

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

// ── EVENT EDITOR ────────────────────────────────────────────────────────────

export function SmmEventEditor() {
  const { t, lang, cycleLang } = useT();
  const setPage = useNavStore(s => s.setPage);
  const editingId = useSmmStore(s => s.editingId);
  const myId = useSessionStore(s => s.user?.id || s.hydratedUser?.id || '');

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [format, setFormat] = useState<'online' | 'offline'>('online');
  const [platform, setPlatform] = useState('instagram');
  const [location, setLocation] = useState('');
  const [timeAt, setTimeAt] = useState('');
  const [testIds, setTestIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [myTests, setMyTests] = useState<{ id: string; title: string; q: number }[]>([]);
  const [coverColor, setCoverColor] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // my tests for the qualification picker
    api.getTests(myId || undefined).then((r: any) => {
      const arr = Array.isArray(r) ? r : (r?.items || []);
      setMyTests(arr.map((x: any) => ({ id: x.id, title: x.title, q: x._count?.questions ?? x.questions?.length ?? 0 })));
    }).catch(() => setMyTests([]));
    // load the edited event
    if (editingId) {
      setLoading(true);
      api.getEvent(editingId).then((r: any) => {
        const e: SmmEventT = r.event;
        if (e.customerId !== myId) { setPage('dashboard'); return; }
        setTitle(e.title); setSummary(e.summary || '');
        setFormat(e.format || 'online'); setPlatform(e.platform || 'instagram');
        setLocation(e.location || ''); setTimeAt(e.timeAt || '');
        setTestIds(e.testIds || []); setAttachments(((e as SmmEventT).attachments || []) as AttachmentItem[]);
        setCoverColor(e.coverColor || null);
        setIsPublic(e.isPublic !== false);
      }).catch(() => setPage('dashboard')).finally(() => setLoading(false));
    } else {
      setTitle(''); setSummary(''); setFormat('online'); setPlatform('instagram');
      setLocation(''); setTimeAt(''); setTestIds([]); setAttachments([]); setCoverColor(null); setIsPublic(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, myId]);

  const toggleTest = (id: string) => {
    setTestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!title.trim()) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmEventTitle') })); return; }
    setSaving(true);
    const payload = { title, summary, format, platform: format === 'online' ? platform : '', location: format === 'offline' ? location : '', timeAt, testIds, attachments, coverColor, isPublic };
    try {
      if (editingId) await api.updateEvent(editingId, payload);
      else await api.createEvent(payload);
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmEventSaved') }));
      useSmmStore.setState((s: any) => ({ editingId: null, refreshNonce: (s.refreshNonce || 0) + 1 }));
      setPage('dashboard');
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message || 'Error' }));
    } finally {
      setSaving(false);
    }
  };

  const chip = (active: boolean) => `h-9 px-3 rounded-full border-2 text-xs sm:text-sm font-semibold transition-colors ${active ? 'bg-cta text-white border-cta' : 'bg-white border-black/20 hover:border-black'}`;

  return (
    <EditorShell title={editingId ? t('smmEventEdit') : t('smmEventCreate')} onBack={() => { useSmmStore.setState({ editingId: null }); setPage('dashboard'); }}
      lang={lang} cycleLang={cycleLang} saveLabel={editingId ? t('smmEventSaved') : t('smmEventCreate')} onSave={save} saving={saving} saveDisabled={!title.trim() || loading}>
      <Card className="rounded-4xl border border-black bg-white">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmEventTitle')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-10 rounded-2xl border-black/20 bg-white" placeholder={t('smmEventTitle')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmEventSummary')}</Label>
            <Textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} className="rounded-2xl border-black/20 bg-white" />
          </div>
          {/* format */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmEventFormat')}</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFormat('online')} className={chip(format === 'online')}>{t('smmFormatOnline')}</button>
              <button type="button" onClick={() => setFormat('offline')} className={chip(format === 'offline')}>{t('smmFormatOffline')}</button>
            </div>
          </div>
          {format === 'online' ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-bold">{t('smmEventPlatform')}</Label>
              <div className="flex flex-wrap gap-2">
                {SMM_PLATFORMS.map(p => (
                  <button key={p} type="button" onClick={() => setPlatform(p)} className={`${chip(platform === p)} flex items-center gap-1.5`}>
                    {eventPlatformIcon(p, 'w-4 h-4')} {eventPlatformLabel(p, t)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-bold">{t('smmEventLocation')}</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder={t('smmEventLocationPh')} className="h-10 rounded-2xl border-black/20 bg-white" />
              {location.trim().length > 2 && (
                <div className="rounded-2xl overflow-hidden border border-black/10">
                  <iframe src={mapEmbedUrl(location)} title={t('smmEventLocation')} loading="lazy" className="w-full h-40 border-0 pointer-events-none" />
                  <p className="px-2.5 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-cta" /> {location}</p>
                </div>
              )}
            </div>
          )}
          {/* time */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmEventTime')}</Label>
            <Input value={timeAt} onChange={e => setTimeAt(e.target.value)} placeholder={t('smmEventTimePh')} className="h-10 rounded-2xl border-black/20 bg-white" />
          </div>
          {/* cover */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">Cover</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {COVER_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setCoverColor(coverColor === c ? null : c)}
                  className={`w-8 h-8 rounded-full border-2 ${coverColor === c ? 'border-black scale-110' : 'border-black/20'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {/* public */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-4 h-4 accent-[#F97316]" />
            <span className="text-sm font-semibold">{t('modeDiscover')} — {t('smmEvents')}</span>
          </label>
        </CardContent>
      </Card>

      {/* qualification tests picker */}
      <Card className="rounded-4xl border border-black bg-white">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-bold">{t('smmEventTests')}</Label>
            <Button size="sm" variant="outline" onClick={() => setPage('create-test')} className="h-8 rounded-full border-black text-xs">
              <Plus className="size-3.5" /> {t('smmEventTestsCreate')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('smmEventTestsHint')}</p>
          {myTests.length === 0 && <p className="text-xs text-muted-foreground">{t('smmEventTestsNone')}</p>}
          <div className="flex flex-col gap-1.5">
            {myTests.map(ts => (
              <label key={ts.id} className="flex items-center gap-2.5 rounded-2xl border-2 border-black/10 px-3 py-2 cursor-pointer hover:border-black/30 transition-colors">
                <input type="checkbox" checked={testIds.includes(ts.id)} onChange={() => toggleTest(ts.id)} className="w-4 h-4 accent-[#F97316]" />
                <span className="text-sm font-semibold truncate flex-1">{ts.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{ts.q} Q</span>
              </label>
            ))}
          </div>
          {testIds.length === 0 && myTests.length > 0 && <p className="text-xs text-muted-foreground">{t('smmEventTestsNone')}</p>}
        </CardContent>
      </Card>

      {/* the «Прикреплённые файлы» section — the SAME one the test editor
      keeps, present on every creation and editing page */}
      <EditorFilesSection items={attachments} onChange={setAttachments} t={t} />
    </EditorShell>
  );
}

// ── POST EDITOR ─────────────────────────────────────────────────────────────

export function SmmPostEditor() {
  const { t, lang, cycleLang } = useT();
  const setPage = useNavStore(s => s.setPage);
  const editingId = useSmmStore(s => s.editingId);
  const myId = useSessionStore(s => s.user?.id || s.hydratedUser?.id || '');

  const [roles, setRoles] = useState<{ id: string; name: string; pricePerK?: number | null; pricePerDay?: number | null }[]>([]);
  const [roleId, setRoleId] = useState<string>('');
  const [newRoleName, setNewRoleName] = useState('');
  const [pricePerK, setPricePerK] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<SmmPostMedia[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'image'>('image');
  const [coverColor, setCoverColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.getMyRoles().then((r: any) => setRoles(r.items || [])).catch(() => setRoles([]));
    if (editingId) {
      api.getPosts('mine').then((r: any) => {
        const post: SmmPostT | undefined = (r.items || []).find((p: SmmPostT) => p.id === editingId);
        if (!post) { setPage('dashboard'); return; }
        setDescription(post.description || '');
        setMedia((post.media || []) as SmmPostMedia[]);
        setAttachments((post.attachments || []) as AttachmentItem[]);
        setCoverColor(post.coverColor || null);
        if (post.role) {
          setRoleId(post.roleId);
          setNewRoleName(post.role.name || '');
          setPricePerK(post.role.pricePerK != null ? String(post.role.pricePerK) : '');
          setPricePerDay(post.role.pricePerDay != null ? String(post.role.pricePerDay) : '');
        }
      }).catch(() => setPage('dashboard'));
    } else {
      setDescription(''); setMedia([]); setAttachments([]); setCoverColor(null);
      setRoleId(''); setNewRoleName(''); setPricePerK(''); setPricePerDay('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, myId]);

  const addMedia = () => {
    const u = mediaUrl.trim();
    if (!u) return;
    setMedia(prev => [...prev, { url: u, type: mediaType }]);
    setMediaUrl('');
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/attachments/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || !j?.url) throw new Error(j?.error || 'Upload failed');
      const isVideo = (file.type || '').startsWith('video');
      setMedia(prev => [...prev, { url: j.url, type: isVideo ? 'video' : 'image', title: file.name }]);
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message || 'Error' }));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const name = newRoleName.trim();
    if (!name) { window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmRoleName') })); return; }
    const role = { name, pricePerK: pricePerK.trim() || null, pricePerDay: pricePerDay.trim() || null };
    setSaving(true);
    try {
      if (editingId) {
        await api.updatePost(editingId, { role, description, media, attachments, coverColor });
      } else {
        await api.createPost({ roleId: roleId || undefined, role, description, media, attachments, coverColor });
      }
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: t('smmPostSaved') }));
      useSmmStore.setState((s: any) => ({ editingId: null, refreshNonce: (s.refreshNonce || 0) + 1 }));
      setPage('dashboard');
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('smm-toast', { detail: e?.message === 'This role already has a post' ? t('smmPostRoleTaken') : (e?.message || 'Error') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorShell title={editingId ? t('smmPostEdit') : t('smmPostCreate')} onBack={() => { useSmmStore.setState({ editingId: null }); setPage('dashboard'); }}
      lang={lang} cycleLang={cycleLang} saveLabel={editingId ? t('smmPostSaved') : t('smmPostCreate')} onSave={save} saving={saving} saveDisabled={!newRoleName.trim()}>

      {/* role + prices */}
      <Card className="rounded-4xl border border-black bg-white">
        <CardContent className="p-4 flex flex-col gap-3">
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
        </CardContent>
      </Card>

      {/* media */}
      <Card className="rounded-4xl border border-black bg-white">
        <CardContent className="p-4 flex flex-col gap-3">
          <Label className="text-sm font-bold">{t('smmPostMedia')}</Label>
          <div className="flex flex-wrap gap-2">
            {media.map((m, i) => (
              <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-black/10 bg-[#FFF0D9] flex items-center justify-center group">
                {m.type === 'image' ? <img src={mediaSrc(m.url)} alt="" className="w-full h-full object-cover" /> : <Film className="w-6 h-6 text-cta" />}
                <button type="button" onClick={() => setMedia(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 border border-black/20 flex items-center justify-center">
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="https://…" className="h-9 rounded-full border-black/20 bg-white flex-1" />
            <button type="button" onClick={() => setMediaType(mediaType === 'image' ? 'video' : 'image')}
              className="h-9 px-3 rounded-full border-2 border-black/20 text-xs font-bold flex items-center gap-1.5 shrink-0">
              {mediaType === 'image' ? <ImgIcon className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />} {mediaType}
            </button>
            <Button size="sm" variant="outline" onClick={addMedia} disabled={!mediaUrl.trim()} className="h-9 rounded-full border-black shrink-0"><Plus className="size-3.5" /></Button>
          </div>
          <label className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {uploading ? <Loader2 className="w-3.5 h-3.5 inline animate-spin" /> : null} {t('smmPostMediaAdd')} ⤴
            <input type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ''; }} />
          </label>
        </CardContent>
      </Card>

      {/* description + cover */}
      <Card className="rounded-4xl border border-black bg-white">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">{t('smmPostDesc')}</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder={t('smmPostDescPh')} className="rounded-2xl border-black/20 bg-white" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">Cover</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {COVER_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setCoverColor(coverColor === c ? null : c)}
                  className={`w-8 h-8 rounded-full border-2 ${coverColor === c ? 'border-black scale-110' : 'border-black/20'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* the «Прикреплённые файлы» section — the SAME one the test editor
      keeps, present on every creation and editing page */}
      <EditorFilesSection items={attachments} onChange={setAttachments} t={t} />
    </EditorShell>
  );
}
