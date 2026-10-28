'use client';

import React from 'react';
import { Star, ClipboardList } from 'lucide-react';
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
 * SEPARATE REGISTRATION: sign-up runs in TWO steps — first the user picks
 * the account kind (СММ специалист | Заказчик), then the form itself. The
 * picked role is sent with POST /api/auth/register (User.smmRole) and FIXED
 * afterwards: the SMM view locks to this tab and the bottom role-switcher
 * panel is not rendered at all.
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

// The two registration flows — the same pair the (removed) bottom panel used.
const ROLE_CARDS = [
  { role: 'specialist' as const, icon: Star, labelKey: 'smmSpecialist', hintKey: 'smmModeHintSpecialist', accent: 'bg-[#FFF0D9] text-amber-700' },
  { role: 'customer' as const, icon: ClipboardList, labelKey: 'smmCustomer', hintKey: 'smmModeHintCustomer', accent: 'bg-[#E3EEFF] text-blue-700' },
];

export default function AuthView({ handleAuth, onCancel }: AuthViewProps) {
  const authMode = useSessionStore(s => s.authMode);
  const setAuthMode = useSessionStore(s => s.setAuthMode);
  const authRole = useSessionStore(s => s.authRole);
  const setAuthRole = useSessionStore(s => s.setAuthRole);
  const name = useSessionStore(s => s.name);
  const email = useSessionStore(s => s.email);
  const password = useSessionStore(s => s.password);
  const setName = useSessionStore(s => s.setName);
  const setEmail = useSessionStore(s => s.setEmail);
  const setPassword = useSessionStore(s => s.setPassword);
  const loading = useSessionStore(s => s.loading);
  const lang = useSessionStore(s => s.lang);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  // The signup flow's local step: 'role' (pick the account kind) → 'form'.
  // Login keeps the plain form — the role comes from the account, not the form.
  const [roleStep, setRoleStep] = React.useState<'role' | 'form'>('role');
  const isSignup = authMode === 'signup';
  const picked = ROLE_CARDS.find(r => r.role === authRole) || ROLE_CARDS[0];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 screen-enter">
      <Card className="w-full max-w-md lg:max-w-lg rounded-4xl border border-black shadow-lg bg-white">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 mb-4 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="ADposter" className="w-16 h-16 rounded-2xl object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">
            ADposter
          </CardTitle>
          <CardDescription>
            {authMode === 'login' ? t('signInToAccount') : (roleStep === 'role' ? t('createNewAccount') : t('createNewAccount'))}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {authMode === 'signup' && roleStep === 'role' && (
            <>
              {/* STEP 1 — the SEPARATE registration entry: who is signing up.
              Two flows, one tap each; the choice becomes User.smmRole. */}
              <div className="text-center">
                <h3 className="text-lg font-bold">{t('regWhoAreYou')}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{t('regChooseRoleHint')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {ROLE_CARDS.map(({ role, icon: Icon, labelKey, hintKey, accent }) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => { setAuthRole(role); setRoleStep('form'); }}
                    className="group flex items-center gap-4 w-full text-left rounded-3xl border-2 border-black/15 bg-white p-4 transition-all hover:border-cta hover:shadow-md active:scale-[0.99]"
                  >
                    <span className={`w-12 h-12 rounded-2xl ${accent} flex items-center justify-center shrink-0`}>
                      <Icon className="w-6 h-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{t(labelKey)}</span>
                      <span className="block text-sm text-muted-foreground leading-snug">{t(hintKey)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {(authMode === 'login' || (isSignup && roleStep === 'form')) && (
            <>
              {isSignup && (
                <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-cta/40 bg-[#FFF7ED] px-3 py-2">
                  <span className="flex items-center gap-2 min-w-0 text-sm">
                    <span className="w-8 h-8 rounded-xl bg-cta/10 text-cta flex items-center justify-center shrink-0">
                      <picked.icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{t('regYouRegisterAs')}</span>
                      <span className="block font-bold truncate">{t(picked.labelKey)}</span>
                    </span>
                  </span>
                  <button type="button" onClick={() => setRoleStep('role')} className="text-xs font-semibold text-primary underline shrink-0">
                    {t('regChangeRole')}
                  </button>
                </div>
              )}
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
            </>
          )}
          <div className="text-center text-sm text-muted-foreground">
            {authMode === 'login' ? (
              <>{t('noAccount')} <button className="text-primary underline" onClick={() => { setRoleStep('role'); setAuthMode('signup'); }}>{t('signUpLink')}</button></>
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
