'use client';

import React from 'react';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSessionStore } from '@/stores/session-store';
import { tUI } from '@/lib/i18n';

/**
 * AUTH PAGE — login / sign-up card. The form state lives in the session
 * store and is consumed here directly; app-root keeps handleAuth (it needs
 * the shared toast + session plumbing).
 *
 * GUEST FLOW: when an anonymous share-link visitor tapped "Sign up" on the
 * registration wall, `onCancel` is provided — a link under the card that
 * returns to the test they were taking (the session stays alive in the
 * stores; nothing was lost).
 */
export interface AuthViewProps {
  handleAuth: () => void;
  /** Present only in the guest flow — cancels back to the running test. */
  onCancel?: () => void;
}

export default function AuthView({ handleAuth, onCancel }: AuthViewProps) {
  const authMode = useSessionStore(s => s.authMode);
  const setAuthMode = useSessionStore(s => s.setAuthMode);
  const name = useSessionStore(s => s.name);
  const email = useSessionStore(s => s.email);
  const password = useSessionStore(s => s.password);
  const setName = useSessionStore(s => s.setName);
  const setEmail = useSessionStore(s => s.setEmail);
  const setPassword = useSessionStore(s => s.setPassword);
  const loading = useSessionStore(s => s.loading);
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 screen-enter">
      <Card className="w-full max-w-md lg:max-w-lg rounded-4xl border border-black shadow-lg bg-white">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-cta rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <FlaskConical className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">
            ChemTest
          </CardTitle>
          <CardDescription>
            {authMode === 'login' ? t('signInToAccount') : t('createNewAccount')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {authMode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="name">{t('fullName')}</Label>
              <Input id="name" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
            <Input id="password" type="password" placeholder={t('min6chars')} value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAuth()} />
          </div>
          <Button className="w-full h-11 rounded-full text-base font-semibold" onClick={handleAuth} disabled={loading}>
            {loading ? t('loading') : authMode === 'login' ? t('signIn') : t('signUp')}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            {authMode === 'login' ? (
              <>{t('noAccount')} <button className="text-primary underline" onClick={() => setAuthMode('signup')}>{t('signUpLink')}</button></>
            ) : (
              <>{t('haveAccount')} <button className="text-primary underline" onClick={() => setAuthMode('login')}>{t('signInLink')}</button></>
            )}
          </div>
          {onCancel && (
            <div className="text-center">
              <button type="button" onClick={onCancel} className="text-sm text-muted-foreground underline hover:text-foreground transition-colors">
                {t('cancel')}
              </button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
