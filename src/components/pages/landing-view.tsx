'use client';

// ---------------------------------------------------------------------------
// LANDING — the public home of the ТУРИЗМ × SMM platform (the first screen
// every guest sees instead of the old login card). The idea, the pillars,
// the three audiences, the CTA. (The photo-spots map is NOT on the landing
// any more — the user's cut; it stays inside the app. The old tools page
// became the ИИ-агент inside the app; the catalog is the личная/публичная
// библиотека.)
// ---------------------------------------------------------------------------

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { tUI, type Lang } from '@/lib/i18n';
import {
  Briefcase, Megaphone, Wrench, Hotel, Camera, ArrowRight, Compass, Sparkles,
} from 'lucide-react';

export default function LandingView({
  lang,
  cycleLang,
  onEnter,
}: {
  lang: Lang;
  cycleLang: () => void;
  onEnter: () => void;
}) {
  const t = (key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars);

  const pillars = [
    { icon: <Briefcase className="w-6 h-6" />, title: t('p1Title'), sub: t('p1Sub'), color: 'bg-[#E3EEFF]', fg: 'text-blue-700' },
    { icon: <Megaphone className="w-6 h-6" />, title: t('p2Title'), sub: t('p2Sub'), color: 'bg-[#FFE3D6]', fg: 'text-orange-700' },
    { icon: <Wrench className="w-6 h-6" />, title: t('p4Title'), sub: t('p4Sub'), color: 'bg-[#FFF0D9]', fg: 'text-amber-700' },
  ];

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col screen-enter">
      {/* language switcher — the same cycle button the auth card keeps */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-extrabold tracking-tight flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="ADposter" className="w-7 h-7 rounded-lg object-cover" />
            <span><span className="text-brand">AD</span>poster</span>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={cycleLang} className="rounded-full border-black h-9 px-4 font-bold">
              {lang === 'en' ? 'EN' : lang === 'ru' ? 'RU' : 'UZ'}
            </Button>
            <Button size="sm" onClick={onEnter} className="rounded-full bg-cta hover:bg-cta/90 text-white h-9 px-4">
              {t('landingEnter')}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="max-w-5xl mx-auto px-4 pt-12 pb-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-cta/40 bg-[#FFF7ED] px-3 py-1 text-xs font-bold text-cta">
            <Sparkles className="w-3.5 h-3.5" /> {t('landingBadge')}
          </span>
          <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
            {t('landingTitle')}
          </h1>
          <p className="mt-4 text-muted-foreground text-base sm:text-lg max-w-3xl mx-auto leading-relaxed">
            {t('landingSub')}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={onEnter} className="h-12 px-8 rounded-full bg-cta hover:bg-cta/90 text-white text-base font-bold shadow-lg">
              {t('landingCta')} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </section>

        {/* PILLARS */}
        <section className="max-w-5xl mx-auto px-4 pb-10">
          <h2 className="text-xl sm:text-2xl font-extrabold text-center mb-6">{t('landingPillars')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {pillars.map((p, i) => (
              <Card key={i} className="rounded-4xl border-2 border-black/80 bg-white shadow-sm">
                <CardContent className="p-5">
                  <span className={`w-12 h-12 rounded-2xl ${p.color} ${p.fg} flex items-center justify-center`}>{p.icon}</span>
                  <h3 className="mt-3 text-lg font-extrabold">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{p.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* AUDIENCES */}
        <section className="max-w-5xl mx-auto px-4 pb-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {[
              { icon: <Hotel className="w-5 h-5" />, text: t('landingForBiz') },
              { icon: <Camera className="w-5 h-5" />, text: t('landingForSmm') },
              { icon: <Compass className="w-5 h-5" />, text: t('landingForTourist') },
            ].map((a, i) => (
              <div key={i} className="rounded-3xl bg-[#FAFAF9] border border-black/10 p-4 flex gap-3 items-start">
                <span className="w-9 h-9 rounded-xl bg-cta/10 text-cta flex items-center justify-center shrink-0">{a.icon}</span>
                <p className="text-sm leading-relaxed">{a.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button onClick={onEnter} className="h-12 px-10 rounded-full bg-cta hover:bg-cta/90 text-white text-base font-bold shadow-lg">
              {t('landingCta')} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
