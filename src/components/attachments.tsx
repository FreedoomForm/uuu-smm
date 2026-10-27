'use client';

import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Music,
  Video,
  FileText,
  Link as LinkIcon,
  ImageIcon,
  Upload,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
  ExternalLink,
  Paperclip,
  Check,
  MonitorPlay,
  Loader2,
} from 'lucide-react';
// Perf: pdfjs-dist (~345 KB chunk) must NOT be in the initial bundle — it is
// needed only when a PDF attachment is actually opened. next/dynamic defers
// the whole pdf-canvas-viewer module into an on-demand chunk.
const PdfCanvasViewer = dynamic(
  () => import('@/components/pdf-canvas-viewer').then(m => m.PdfCanvasViewer),
  { ssr: false, loading: () => <div className="h-[560px] animate-pulse bg-neutral-100 rounded-xl" /> }
);
import { SheetHeaderSwitcher, SheetSwitcher } from '@/components/sheet-switcher';
import { DragHandle, useResizableSheet } from '@/components/resize-sheet';
import { useExitMount } from '@/components/motion';
import { getUser } from '@/lib/api';
// Perf: shared types/helpers live in the tiny attachment-utils module so the
// main page can import them statically WITHOUT dragging this heavy editor
// module (and pdfjs) into the initial chunk.
import {
  ATTACHMENT_TYPES,
  MAX_UPLOAD_BYTES,
  attachmentFileUrl,
  formatSize,
  typeIcon,
  type AttachmentItem,
} from '@/components/attachment-utils';

export type { AttachmentItem } from '@/components/attachment-utils';
export { ATTACHMENT_TYPES, MAX_UPLOAD_BYTES, attachmentFileUrl, formatSize, typeIcon } from '@/components/attachment-utils';

/** Direct open URL (new tab). For unsaved data: URL items we cannot stream yet. */
function attachmentOpenUrl(a: AttachmentItem): string {
  if (a.blobUrl || a.id) return attachmentFileUrl(a);
  return a.url;
}

/* ------------------------------------------------------------------ */
/* Inline media preview (audio player / video player / PDF modal)      */
/* ------------------------------------------------------------------ */

function AudioPreview({ item }: { item: AttachmentItem }) {
  return (
    <div className="mt-2">
      <audio
        controls
        preload="metadata"
        src={attachmentFileUrl(item)}
        className="w-full h-10"
      />
    </div>
  );
}

function VideoPreview({ item }: { item: AttachmentItem }) {
  return (
    <video
      controls
      preload="metadata"
      src={attachmentFileUrl(item)}
      className="mt-2 w-full max-h-64 rounded-lg bg-black"
    />
  );
}

/** Embedded external player (TED, YouTube, SoundCloud, VK ... via their official embed URL). */
function EmbedPreview({ item }: { item: AttachmentItem }) {
  return (
    <div className="mt-2">
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16 / 9' }}>
        <iframe
          src={item.url}
          title={item.title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <div className="flex justify-end mt-1">
        <button
          onClick={() => window.open(item.url, '_blank')}
          className="text-[11px] text-muted-foreground hover:text-foreground underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" /> Player not loading? Open externally
        </button>
      </div>
    </div>
  );
}

/**
 * True native inline PDF rendering via PDF.js canvas — works on every browser,
 * including Android Chrome where <iframe> PDFs are not supported (they render
 * as an "Open" placeholder and navigate away).
 */
function PdfInline({ item }: { item: AttachmentItem }) {
  return <PdfCanvasViewer url={attachmentFileUrl(item)} heightClass="h-[560px]" />;
}

export function PdfViewerModal({ item, onClose }: { item: AttachmentItem | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-4xl h-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {typeIcon(item.type)}
            <span className="text-sm font-medium truncate">{item.title}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => window.open(attachmentOpenUrl(item), '_blank')}>
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 px-2 pb-2">
          <PdfCanvasViewer url={attachmentFileUrl(item)} heightClass="h-full" />
        </div>
      </div>
    </div>
  );
}

/** One attachment row with preview, used in start / take / results panels. */
function ViewerRow({ item }: { item: AttachmentItem }) {
  const [pdfExpanded, setPdfExpanded] = useState(false);
  return (
    <div className="py-2.5 border-b last:border-b-0">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          {typeIcon(item.type)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug break-words">{item.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] uppercase rounded-full px-1.5 py-0">{item.type}</Badge>
            {item.size ? <span className="text-[11px] text-muted-foreground">{formatSize(item.size)}</span> : null}
          </div>
          {item.type === 'audio' && <AudioPreview item={item} />}
          {item.type === 'video' && <VideoPreview item={item} />}
          {item.type === 'embed' && <EmbedPreview item={item} />}
          {item.type === 'pdf' && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-full" onClick={() => setPdfExpanded(v => !v)}>
                  {pdfExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                  {pdfExpanded ? 'Hide PDF' : 'Show PDF'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs rounded-full" onClick={() => window.open(attachmentOpenUrl(item), '_blank')}>
                  <ExternalLink className="w-3 h-3 mr-1" /> New tab
                </Button>
              </div>
              {pdfExpanded && <PdfInline item={item} />}
            </div>
          )}
          {item.type === 'image' && (
            <img src={attachmentFileUrl(item)} alt={item.title} className="mt-2 max-h-48 rounded-lg" />
          )}
          {item.type === 'link' && (
            <Button size="sm" variant="outline" className="mt-1.5 h-7 text-xs rounded-full" onClick={() => window.open(item.url, '_blank')}>
              <ExternalLink className="w-3 h-3 mr-1" /> Open link
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Scrollable list of attachments with inline players (no outer chrome). */
export function AttachmentsList({ items, emptyText }: { items: AttachmentItem[]; emptyText?: string }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{emptyText || 'No attached files yet.'}</p>;
  }
  return (
    <div className="divide-y">
      {items.map((item, idx) => <ViewerRow key={item.id || `idx-${idx}`} item={item} />)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile bottom sheet: fixed up-arrow button + sliding panel          */
/* ------------------------------------------------------------------ */

export function AttachmentsBottomSheet({
  items,
  open: openProp,
  onOpenChange,
  switcher,
  hideLauncher = false,
  title,
  subtitle,
}: {
  items: AttachmentItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When provided, the header arrow merges with the title and opens a window switcher */
  switcher?: SheetSwitcher;
  /** Hide the floating bottom launcher button (window still opens via header / switcher) */
  hideLauncher?: boolean;
  /** Localized header label, defaults to "Attached Files (N)" */
  title?: string;
  /** Optional second header line (e.g. the test's title) */
  subtitle?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  // Launcher button: mounted while the sheet is closed, and kept mounted
  // briefly on open so its fade-out can play instead of vanishing.
  const launcherMounted = useExitMount(!open, 180);
  if (!items.length) return null;

  return (
    <>
      {/* Floating up-arrow button (mobile / tablet) */}
      {!hideLauncher && launcherMounted && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open attached files"
          className={`lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-cta text-white pl-3 pr-4 py-3 shadow-xl border border-black/10 active:scale-95 transition-transform ${open ? 'animate-out fade-out slide-out-to-bottom pointer-events-none duration-200' : 'animate-in fade-in slide-in-from-bottom duration-300'}`}
        >
          <ChevronUp className="w-5 h-5" />
          <span className="text-sm font-semibold">{title || `Attached Files (${items.length})`}</span>
        </button>
      )}

      {/* Bottom sheet — resizable: drag the bar up to full screen, down to close */}
      <ResizableAttachmentsSheet
        open={open}
        items={items}
        onClose={() => setOpen(false)}
        switcher={switcher}
        title={title}
        subtitle={subtitle}
      />
    </>
  );
}

function ResizableAttachmentsSheet({
  open,
  items,
  onClose,
  switcher,
  title,
  subtitle,
}: {
  open: boolean;
  items: AttachmentItem[];
  onClose: () => void;
  switcher?: SheetSwitcher;
  title?: string;
  subtitle?: string;
}) {
  const sheet = useResizableSheet({ initialVh: 0.78, minVh: 0.35, onClose });
  // Stay mounted while the slide-down exit animation plays
  const mounted = useExitMount(open, 220);
  if (!mounted) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/50 ${open ? 'animate-in fade-in duration-200' : 'animate-out fade-out pointer-events-none duration-200'}`} onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-black/10 flex flex-col ${open ? 'animate-in slide-in-from-bottom duration-200' : 'animate-out slide-out-to-bottom fade-out pointer-events-none duration-200'}`}
        style={{ ...sheet.style, maxHeight: '100dvh' }}
      >
        <DragHandle handleProps={sheet.handleProps} dragging={sheet.dragging} />
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          {switcher ? (
            <SheetHeaderSwitcher
              icon={<Paperclip className="w-4 h-4" />}
              title={title || `Attached Files (${items.length})`}
              subtitle={subtitle}
              options={switcher.options}
              onSelect={switcher.onSelect}
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={onClose}
                aria-label="Close attached files"
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
              <span className="min-w-0">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4" /> {title || `Attached Files (${items.length})`}
                </span>
                {subtitle ? <span className="block text-xs text-muted-foreground truncate">{subtitle}</span> : null}
              </span>
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 pb-8">
            <AttachmentsList items={items} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/** Desktop side panel version (paired with the flex layout of take-test).
 *  subtitle: optional second header line (e.g. the test's title) — the same
 *  header format the AI chat window wears (title + muted subtitle). */
export function AttachmentsSidePanel({ items, onClose, title, subtitle, switcher }: { items: AttachmentItem[]; onClose: () => void; title?: string; subtitle?: string; switcher?: SheetSwitcher }) {
  return (
    <div className="w-full lg:w-[400px] shrink-0 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="rounded-4xl border border-black bg-white flex flex-col h-[calc(100vh-160px)] lg:h-[680px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          {switcher ? (
            <SheetHeaderSwitcher
              icon={<Paperclip className="w-4 h-4" />}
              title={title || `Attached Files (${items.length})`}
              subtitle={subtitle}
              options={switcher.options}
              onSelect={switcher.onSelect}
            />
          ) : (
            <span className="min-w-0">
              <span className="font-semibold text-sm flex items-center gap-1.5">
                <Paperclip className="w-4 h-4" /> {title || `Attached Files (${items.length})`}
              </span>
              {subtitle ? <span className="block text-xs text-muted-foreground truncate">{subtitle}</span> : null}
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-4 pb-6">
            <AttachmentsList items={items} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor (create / edit test) — view, add, edit, delete, reorder      */
/* ------------------------------------------------------------------ */

interface EditorRowProps {
  item: AttachmentItem;
  index: number;
  count: number;
  onUpdate: (patch: Partial<AttachmentItem>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

function EditorRow({ item, index, count, onUpdate, onRemove, onMove }: EditorRowProps) {
  const [editing, setEditing] = useState(false);
  // A just-picked file is uploaded in the background (Telegram round trip):
  // the row shows a live spinner and its controls are locked until the
  // upload resolves — the user SEES the button worked, instantly.
  const uploading = !!item.uploading;

  return (
    <div className={`rounded-2xl border p-3 bg-white ${uploading ? 'border-dashed border-black/25 opacity-90' : 'border-black/15'}`}>
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-cta" /> : typeIcon(item.type)}
        </div>
        <div className="min-w-0 flex-1">
          {uploading ? (
            <div>
              <p className="text-sm font-medium leading-snug break-words">{item.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] uppercase rounded-full px-1.5 py-0">{item.type}</Badge>
                {item.size ? <span className="text-[11px] text-muted-foreground">{formatSize(item.size)}</span> : null}
                <span className="text-[11px] text-cta flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                </span>
              </div>
            </div>
          ) : editing ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  value={item.title}
                  onChange={e => onUpdate({ title: e.target.value })}
                  placeholder="File title"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL</Label>
                <Input
                  value={item.blobUrl ? '(uploaded file)' : item.url}
                  onChange={e => onUpdate({ url: e.target.value })}
                  placeholder="https://..."
                  className="h-8 text-sm"
                  disabled={!!item.blobUrl}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ATTACHMENT_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => onUpdate({ type: t })}
                      className={`px-2.5 h-7 rounded-full text-xs border flex items-center gap-1 transition-colors ${
                        item.type === t ? 'bg-cta text-white border-cta' : 'bg-white border-black/15 hover:bg-muted'
                      }`}
                    >
                      {typeIcon(t, 'w-3 h-3')} {t}
                    </button>
                  ))}
                </div>
              </div>
              <Button size="sm" className="h-7 rounded-full text-xs" onClick={() => setEditing(false)}>
                <Check className="w-3 h-3 mr-1" /> Done
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium leading-snug break-words">{item.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] uppercase rounded-full px-1.5 py-0">{item.type}</Badge>
                {item.size ? <span className="text-[11px] text-muted-foreground">{formatSize(item.size)}</span> : null}
                {!item.blobUrl && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[240px]">{item.url}</span>
                )}
                {item.blobUrl && <span className="text-[11px] text-emerald-600">uploaded (saved with the test)</span>}
              </div>
              {item.type === 'audio' && <AudioPreview item={item} />}
              {item.type === 'video' && <VideoPreview item={item} />}
              {item.type === 'embed' && <EmbedPreview item={item} />}
              {item.type === 'pdf' && item.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1.5 h-7 text-xs rounded-full"
                  onClick={() => window.open(attachmentFileUrl(item), '_blank')}
                >
                  <ExternalLink className="w-3 h-3 mr-1" /> Open
                </Button>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <div className="flex gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={uploading || index === 0} onClick={() => onMove(-1)} title="Move up">
              <ChevronUp className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={uploading || index === count - 1} onClick={() => onMove(1)} title="Move down">
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={uploading} onClick={() => setEditing(e => !e)} title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" disabled={uploading} onClick={onRemove} title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AttachmentsEditor({
  items,
  onChange,
}: {
  items: AttachmentItem[];
  onChange: (items: AttachmentItem[]) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<AttachmentItem['type']>('link');
  const [showAdd, setShowAdd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Latest items for the async upload closures — `items` inside onPickFile
  // would be stale by the time the Telegram round trip resolves.
  const itemsRef = useRef<AttachmentItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const add = () => {
    if (!url.trim()) {
      toast({ title: 'Error', description: 'Paste a file URL first', variant: 'destructive' });
      return;
    }
    const next = [...items, { title: title.trim() || 'Attachment', type, url: url.trim() }];
    onChange(next);
    setTitle(''); setUrl(''); setShowAdd(false);
  };

  const onPickFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: 'File is too large',
        description: `Max ${formatSize(MAX_UPLOAD_BYTES)} per upload. For bigger files host them online and paste the link.`,
        variant: 'destructive',
      });
      return;
    }
    const guessed = file.type.startsWith('audio/') ? 'audio'
      : file.type.startsWith('video/') ? 'video'
      : file.type === 'application/pdf' ? 'pdf'
      : file.type.startsWith('image/') ? 'image' : 'link';
    const blobUrl = URL.createObjectURL(file);
    // OPTIMISTIC ROW: the picked file appears in the list IMMEDIATELY (with a
    // live spinner) — the user sees the button worked the moment it was
    // tapped, not seconds later when the Telegram round trip finishes.
    onChange([...items, {
      title: file.name.replace(/\.[^.]+$/, ''),
      type: guessed as AttachmentItem['type'],
      url: '',
      size: file.size,
      blobUrl,
      uploading: true,
    }]);
    // Upload to the Telegram channel storage (/api/attachments/upload). The
    // server returns a lightweight `tg:<file_id>` reference — the bytes live
    // ONLY in the owner's Telegram channel. If the bot is not connected yet,
    // the server falls back to a data: URL (in-DB) for small files.
    const patchRow = (patch: Partial<AttachmentItem>) => {
      // Patch the row by blobUrl identity — the list may have been reordered
      // or grown while the upload was in flight.
      onChange(itemsRef.current.map(it => (it.blobUrl === blobUrl && it.uploading ? { ...it, ...patch } : it)));
    };
    let finalUrl = '';
    let tgMessageId: number | null = null;
    try {
      const fd = new FormData();
      fd.append('file', file);
      // The upload endpoint is authenticated by the httpOnly session cookie —
      // same-origin fetch carries it automatically (zero identity on the device)
      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        body: fd,
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok && body?.url) {
        finalUrl = body.url as string;
        tgMessageId = typeof body.tgMessageId === 'number' ? body.tgMessageId : null;
      } else {
        const desc = body?.error === 'FILE_STORAGE_UNAVAILABLE'
          ? 'Telegram storage is not connected yet and the file is too large for the built-in fallback. Connect the bot (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID) or pick a smaller file.'
          : (body?.detail || body?.error || `Upload failed (${res.status})`);
        toast({ title: 'Upload failed', description: desc, variant: 'destructive' });
        URL.revokeObjectURL(blobUrl);
        // The optimistic row goes away again — the failure is visible, the
        // list is exactly as it was before the pick.
        onChange(itemsRef.current.filter(it => !(it.blobUrl === blobUrl && it.uploading)));
        return;
      }
    } catch {
      toast({ title: 'Upload failed', description: 'Network error while uploading the file', variant: 'destructive' });
      URL.revokeObjectURL(blobUrl);
      onChange(itemsRef.current.filter(it => !(it.blobUrl === blobUrl && it.uploading)));
      return;
    }
    patchRow({ uploading: false, url: finalUrl, tgMessageId });
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <EditorRow
              key={item.id || `new-${idx}`}
              item={item}
              index={idx}
              count={items.length}
              onUpdate={patch => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))}
              onRemove={() => onChange(items.filter((_, i) => i !== idx))}
              onMove={dir => {
                const next = [...items];
                const j = idx + dir;
                [next[idx], next[j]] = [next[j], next[idx]];
                onChange(next);
              }}
            />
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="rounded-2xl border border-dashed border-black/25 p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Week 3 Audio" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <div className="flex flex-wrap gap-1.5">
                {ATTACHMENT_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-2.5 h-8 rounded-full text-xs border flex items-center gap-1 transition-colors ${
                      type === t ? 'bg-cta text-white border-cta' : 'bg-white border-black/15 hover:bg-muted'
                    }`}
                  >
                    {typeIcon(t, 'w-3 h-3')} {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">File URL</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://... (mp3, mp4, pdf)" className="h-8 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8 rounded-full text-xs" onClick={add}>
              <Check className="w-3 h-3 mr-1" /> Add file
            </Button>
            <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="rounded-full text-xs border-black" onClick={() => setShowAdd(true)}>
            <LinkIcon className="w-3 h-3 mr-1" /> Add by link
          </Button>
          <Button size="sm" variant="outline" className="rounded-full text-xs border-black" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3 h-3 mr-1" /> Upload file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/*,application/pdf,image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
