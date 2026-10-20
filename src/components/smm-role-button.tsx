'use client';

import React from 'react';
import { Briefcase, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

// SMM account switcher — the account twin of the language button. Same
// outline pill, one tap flips the account kind between «Заказчик» and
// «SMM-специалист» (the server value User.smmRole, so the whole app — feed
// kind, dock buttons, mail boxes — follows). Shown in the top panel of every
// SMM page, right next to the language button.
export default function SmmRoleButton({ role, onSwitch, className = '' }: { role: 'customer' | 'specialist'; onSwitch: () => void; className?: string }) {
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSwitch}
      title={t('smmSwitchRoleTitle')}
      className={`gap-1.5 shrink-0 rounded-full font-semibold ${className}`}
    >
      {role === 'customer'
        ? <Briefcase className="w-4 h-4" />
        : <Megaphone className="w-4 h-4" />}
      {role === 'customer' ? t('smmSwitchCustomer') : t('smmSwitchSpecialist')}
    </Button>
  );
}
