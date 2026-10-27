'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Loader2, LogOut, Trash2, Building2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TEST_BG_PRESETS } from '@/lib/test-bg';
import { api } from '@/lib/api';
import { useProfileStore } from '@/stores/profile-store';
import { useSessionStore } from '@/stores/session-store';
import { useNavStore } from '@/stores/nav-store';
import { tUI } from '@/lib/i18n';

/**
 * PROFILE PAGE — opened by tapping the account avatar. Hosts everything
 * account-related that used to be scattered over the header: the profile
 * photo, the display name, the test-taking background (affects how the
 * background looks while taking a test), logout and account deletion.
 * The back arrow in the top-left of the top panel returns to the dashboard.
 *
 * The state lives in the zustand domain stores and is consumed here
 * directly — app-root keeps the action handlers (they orchestrate the
 * API calls): avatar upload, name save, background save, logout, deletion.
 */
export interface ProfileViewProps {
  avatarInputRef: React.RefObject<HTMLInputElement | null>;
  handleAvatarFile: (file: File) => void;
  saveProfileName: () => void;
  saveBgStyle: (id: string) => void;
  handleLogout: () => void;
  handleDeleteAccount: () => void;
}

/**
 * PROFILE BODY — everything account-related WITHOUT the page chrome (no
 * header/back — the universal back of the host surface does that job). The
 * SMM dashboard mounts it inside a RESIZABLE SHEET (the «всплывающая снизу
 * страница» of the three-page-type rule) when the avatar is tapped; the
 * legacy full page below keeps the same body for the old flows.
 */
export function ProfileBody({
  avatarInputRef,
  handleAvatarFile,
  saveProfileName,
  saveBgStyle,
  handleLogout,
  handleDeleteAccount,
}: ProfileViewProps) {
  // ── State: read straight from the zustand domain stores ──────────────────
  const sessionUser = useSessionStore(s => s.user);
  const hydratedUser = useSessionStore(s => s.hydratedUser);
  const lang = useSessionStore(s => s.lang);
  const setPage = useNavStore(s => s.setPage);
  const myAvatar = useProfileStore(s => s.myAvatar);
  const myBgStyle = useProfileStore(s => s.myBgStyle);
  const avatarBusy = useProfileStore(s => s.avatarBusy);
  const profileName = useProfileStore(s => s.profileName);
  const setProfileName = useProfileStore(s => s.setProfileName);
  const profileSaving = useProfileStore(s => s.profileSaving);
  const accBusy = useProfileStore(s => s.accBusy);
  const deleteAccOpen = useProfileStore(s => s.deleteAccOpen);
  const setDeleteAccOpen = useProfileStore(s => s.setDeleteAccOpen);
  const effectiveUser = sessionUser || hydratedUser;
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);
  // Round avatar initials (same rule as app-root / dashboard-view)
  const userInitials = (() => {
    const userName = effectiveUser?.name || effectiveUser?.email || '';
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : userName.slice(0, 2);
    return (s || '?').toUpperCase();
  })();

  return (
    <div className="bg-background flex flex-col">
      <main className="w-full mx-auto px-4 py-5 sm:py-6 pb-32 space-y-5">
        {/* Photo + identity */}
        <Card className="rounded-4xl border border-black bg-white">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy || !effectiveUser}
              className="relative group rounded-full active:scale-95 transition-transform disabled:opacity-60"
              title={t('avatarUpload')}
              aria-label={t('avatarUpload')}
            >
              {myAvatar ? (
                <img src={myAvatar} alt="" className="w-24 h-24 rounded-full object-cover ring-2 ring-black/10" />
              ) : (
                <span className="w-24 h-24 rounded-full bg-cta text-white flex items-center justify-center text-2xl font-extrabold ring-2 ring-black/10">
                  {userInitials}
                </span>
              )}
              <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white border border-black/15 shadow-sm flex items-center justify-center">
                {avatarBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleAvatarFile(f); }}
            />
            <p className="mt-3 text-base font-semibold">{effectiveUser?.name}</p>
            <p className="text-sm text-muted-foreground">{effectiveUser?.email}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t('avatarUpload')}</p>
          </CardContent>
        </Card>

        {/* Name */}
        <Card className="rounded-4xl border border-black bg-white">
          <CardContent className="p-5 sm:p-6 space-y-3">
            <Label htmlFor="profile-name" className="text-sm font-semibold">{t('profileNameLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="profile-name"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveProfileName(); }}
                maxLength={60}
                className="flex-1 rounded-full border-black/20 bg-white"
                placeholder={t('profileNameLabel')}
              />
              <Button
                onClick={saveProfileName}
                disabled={profileSaving || !profileName.trim() || profileName.trim() === effectiveUser?.name}
                className="rounded-full shrink-0 h-9 px-4"
              >
                {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('save')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── COMPANY PROFILE (customer side of the tourism marketplace) ── */}
        <CompanyProfileCard t={t} smmRole={(effectiveUser as any)?.smmRole || ''} />

        {/* Test-taking background */}
        <Card className="rounded-4xl border border-black bg-white">
          <CardContent className="p-5 sm:p-6 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{t('profileBgTitle')}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t('profileBgDesc')}</p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {/* Standard option — resets to the plain app background */}
              <button
                type="button"
                onClick={() => saveBgStyle('')}
                className={`relative h-16 rounded-2xl border-2 flex items-center justify-center text-[11px] font-medium transition-all active:scale-95 ${myBgStyle === '' ? 'border-cta ring-2 ring-cta/30' : 'border-black/15 hover:border-black/40'}`}
                style={{ background: 'repeating-linear-gradient(45deg,#fafafa,#fafafa 8px,#f0f0f0 8px,#f0f0f0 16px)' }}
                title={t('profileBgStandard')}
              >
                <span className="bg-white/85 rounded-full px-2 py-0.5">{t('profileBgStandard')}</span>
              </button>
              {TEST_BG_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => saveBgStyle(p.id)}
                  className={`relative h-16 rounded-2xl border-2 transition-all active:scale-95 ${myBgStyle === p.id ? 'border-cta ring-2 ring-cta/30' : 'border-black/15 hover:border-black/40'}`}
                  style={{ background: p.css }}
                  title={p.id}
                  aria-label={p.id}
                >
                  {myBgStyle === p.id && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-cta drop-shadow" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account actions */}
        <Card className="rounded-4xl border border-black bg-white">
          <CardContent className="p-5 sm:p-6 space-y-3">
            <Button
              variant="outline"
              onClick={handleLogout}
              disabled={accBusy}
              className="w-full rounded-2xl border-black h-11 justify-start gap-2"
            >
              <LogOut className="w-4 h-4" /> {t('logoutBtn')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteAccOpen(true)}
              disabled={accBusy}
              className="w-full rounded-2xl border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive h-11 justify-start gap-2"
            >
              <Trash2 className="w-4 h-4" /> {t('deleteAccountBtn')}
            </Button>
          </CardContent>
        </Card>
      </main>

      {/* Account deletion confirmation */}
      <AlertDialog open={deleteAccOpen} onOpenChange={setDeleteAccOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteAccountQ')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteAccountWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {accBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('deleteAccountBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The legacy FULL PAGE (kept for the old flows that still navigate here) —
// its header IS the top panel with the universal back; the body below is the
// same ProfileBody the SMM dashboard shows in a sheet.
export default function ProfileView(props: ProfileViewProps) {
  const lang = useSessionStore(s => s.lang);
  const setPage = useNavStore(s => s.setPage);
  const t = React.useCallback((key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars), [lang]);

  return (
    <div className="min-h-screen bg-background flex flex-col screen-enter">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        {/* FIXED h-14 — the uniform 56px top-panel contract (every page, every viewport). */}
        <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 h-14 lg:h-16 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage('dashboard')}
            className="rounded-full h-8 w-8 p-0 sm:w-auto sm:px-3 shrink-0"
            title={t('back')}
            aria-label={t('back')}
          >
            <ArrowLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">{t('back')}</span>
          </Button>
          <h1 className="text-lg font-bold truncate">{t('profileTitle')}</h1>
        </div>
      </header>
      <div className="max-w-2xl lg:max-w-3xl w-full mx-auto">
        <ProfileBody {...props} />
      </div>
    </div>
  );
}

// ── COMPANY PROFILE CARD (the tourism business card for the catalog) ────────
// The customer fills the company name/type/city — the card then shows in the
// КАТАЛОГ КОМПАНИЙ (and the specialist understands WHO places the orders).
// The premium toggle flips User.smmPremium (monetization MVP: the flag only —
// billing comes later; premium ranks first in the catalog).
function CompanyProfileCard({ t, smmRole }: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  smmRole: string;
}) {
  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [premium, setPremium] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    api.getProfile().then((p: any) => {
      setCompanyName(p.smmCompanyName || '');
      setCompanyType(p.smmCompanyType || '');
      setCompanyCity(p.smmCompanyCity || '');
      setPremium(!!p.smmPremium);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const save = async (overrides?: { premium?: boolean }) => {
    setSaving(true);
    try {
      await api.updateProfile({
        smmCompanyName: companyName,
        smmCompanyType: companyType,
        smmCompanyCity: companyCity,
        smmPremium: overrides?.premium ?? premium,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch { /* noop */ } finally {
      setSaving(false);
    }
  };

  const types = ['hotel', 'guesthouse', 'guide', 'tour-agency', 'other'];
  const typeKey = (ty: string) => ty === 'hotel' ? 'companyTypeHotel' : ty === 'guesthouse' ? 'companyTypeGuesthouse' : ty === 'guide' ? 'companyTypeGuide' : ty === 'tour-agency' ? 'companyTypeTourAgency' : 'companyTypeOther';

  return (
    <Card className="rounded-4xl border border-black bg-white">
      <CardContent className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-cta/10 text-cta flex items-center justify-center shrink-0"><Building2 className="w-4 h-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">{t('profileCompanyTitle')}</h3>
            {smmRole === 'specialist' && (
              <p className="text-[11px] text-muted-foreground">{t('smmSpecialist')}: {t('companyTypeOther')}</p>
            )}
          </div>
        </div>
        {loaded && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">{t('profileCompanyName')}</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t('profileCompanyNamePh')} className="h-10 rounded-2xl border-black/20 bg-white" maxLength={120} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">{t('profileCompanyCity')}</Label>
                <Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} placeholder={t('profileCompanyCityPh')} className="h-10 rounded-2xl border-black/20 bg-white" maxLength={80} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">{t('profileCompanyType')}</Label>
              <div className="flex flex-wrap gap-2">
                {types.map(ty => (
                  <button key={ty} type="button" onClick={() => setCompanyType(ty)}
                    className={`h-9 px-3 rounded-full border-2 text-xs font-semibold transition-colors ${companyType === ty ? 'bg-cta text-white border-cta' : 'bg-white border-black/20 hover:border-black'}`}>
                    {t(typeKey(ty))}
                  </button>
                ))}
              </div>
            </div>
            {/* premium toggle */}
            <button type="button" onClick={() => { const next = !premium; setPremium(next); void save({ premium: next }); }}
              className={`w-full flex items-center justify-between gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${premium ? 'border-amber-400 bg-amber-50' : 'border-black/15 hover:border-black/40'}`}>
              <span className="flex items-center gap-2 min-w-0">
                <Crown className={`w-4 h-4 shrink-0 ${premium ? 'text-amber-500' : 'text-muted-foreground'}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{t('premiumToggle')}</span>
                  <span className="block text-[11px] text-muted-foreground">{t('premiumHint')}</span>
                </span>
              </span>
              <span className={`w-10 h-6 rounded-full p-0.5 shrink-0 transition-colors ${premium ? 'bg-amber-500' : 'bg-black/15'}`}>
                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${premium ? 'translate-x-4' : ''}`} />
              </span>
            </button>
            <Button onClick={() => save()} disabled={saving} className="rounded-full h-9 px-4">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedFlash ? <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" /> : null}
              {t('save')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
