'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LANG_LABEL, type Lang } from '@/lib/i18n';

// Language switcher button — same outline style as the other header buttons.
// Shown in the dashboard header and in the test header (instead of the old
// "Practice Mode" badge). One tap advances EN -> RU -> UZ -> EN.
export default function LangButton({ lang, onChange, className = '' }: { lang: Lang; onChange: () => void; className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onChange}
      title="English · Русский · Oʻzbekcha"
      className={`gap-1.5 shrink-0 rounded-full font-semibold ${className}`}
    >
      <Languages className="w-4 h-4" />
      {LANG_LABEL[lang]}
    </Button>
  );
}
