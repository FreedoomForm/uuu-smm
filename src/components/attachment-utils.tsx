import React from 'react';
import {
  Music,
  Video,
  FileText,
  Link as LinkIcon,
  ImageIcon,
  MonitorPlay,
} from 'lucide-react';

/**
 * Lightweight attachment types + pure helpers.
 *
 * Split out of attachments.tsx so pages that only need the TYPE or the icon /
 * size / URL helpers can import them WITHOUT pulling the heavy editor / viewer
 * components (and pdfjs-dist) into the initial bundle. attachments.tsx
 * re-imports from here; the heavy components stay lazy (next/dynamic).
 */

export interface AttachmentItem {
  id?: string; // present only after the test is saved
  title: string;
  type: 'audio' | 'video' | 'pdf' | 'image' | 'embed' | 'link';
  url: string; // external URL or data: URL for small uploads
  size?: number | null;
  orderNum?: number;
  // Telegram channel post that carries the file (upload response). Enables
  // real deletion from the channel when the attachment is removed.
  tgMessageId?: number | null;
  // client-only helpers for unsaved uploads
  blobUrl?: string; // preview URL for just-picked files
  uploading?: boolean; // row is mid-upload — locked until the file lands
}

export const ATTACHMENT_TYPES: AttachmentItem['type'][] = ['audio', 'video', 'pdf', 'image', 'embed', 'link'];

export function typeIcon(type: AttachmentItem['type'], className = 'w-4 h-4') {
  switch (type) {
    case 'audio': return <Music className={className} />;
    case 'video': return <Video className={className} />;
    case 'pdf': return <FileText className={className} />;
    case 'image': return <ImageIcon className={className} />;
    case 'embed': return <MonitorPlay className={className} />;
    default: return <LinkIcon className={className} />;
  }
}

// Upload limit: files are stored in the Telegram channel via
// /api/attachments/upload — Bot API accepts up to 50 MB per document. When
// the Telegram bot is NOT connected the server falls back to storing small
// files (≤3.5 MB) as data: URLs in the DB and refuses bigger ones.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function formatSize(bytes?: number | null) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Same-origin streaming URL for a saved attachment (PDF framing, audio seeking). */
export function attachmentFileUrl(a: AttachmentItem): string {
  if (a.blobUrl) return a.blobUrl;
  if (a.id) return `/api/attachments/${a.id}/file`;
  return a.url; // fallback: external URL opened directly
}
