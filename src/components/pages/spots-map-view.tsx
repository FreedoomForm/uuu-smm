'use client';

// ---------------------------------------------------------------------------
// PHOTO-SPOTS MAP (столп 3) — the PUBLIC page open to every visitor (the
// idea's free-search-traffic pillar). A real Leaflet map (OpenStreetMap
// tiles, no API key) with the spots as pins; tapping a pin opens the spot's
// card: photos, best shooting time, angle tips. Signed-in users add/edit/
// delete their own spots (drop the pin by tapping the map); guests get the
// «sign in» hint instead of the editor.
//
// TWO SURFACES, ONE BODY — the three-page-type rule:
//   * SpotsEmbed  — the map BODY (map + rails + cards + editor sheet). The
//     SMM dashboard mounts it for topWindow === 'map': the TOP PANEL and the
//     BOTTOM PANELS (library dock + mode dock) stay on screen, the universal
//     back arrow in the top panel closes the window.
//   * SpotsMapView (default) — the guest standalone page (landing → Карта):
//     its header IS the top panel (the back button lives there), the body
//     below is the same SpotsEmbed.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { tUI, type Lang } from '@/lib/i18n';
import { mediaSrc } from './smm-bits';
import type { PhotoSpotT } from '@/lib/app-types';
import {
  ArrowLeft, Camera, Clock, Compass, Loader2, MapPin, Pencil, Plus, Trash2, X, Sun,
} from 'lucide-react';

// Leaflet needs `window` — loaded client-side only
const LeafletMap = dynamic(() => import('@/components/leaflet-map'), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-full rounded-none" />,
});

// Uzbekistan-ish default view
const DEFAULT_CENTER: [number, number] = [39.6547, 66.9758]; // Samarkand
const DEFAULT_ZOOM = 6;

export function SpotsEmbed({
  lang,
  myId,
  authed,
}: {
  lang: Lang;
  myId: string | null;
  authed: boolean;
}) {
  const t = (key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars);

  const [spots, setSpots] = useState<PhotoSpotT[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PhotoSpotT | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PhotoSpotT | null>(null); // null = create
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<PhotoSpotT | null>(null);
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  // toast line (top center)
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback((sc: 'all' | 'mine') => {
    setLoading(true);
    api.getSpots(sc === 'mine' ? 'mine' : 'public')
      .then((items) => setSpots(Array.isArray(items) ? items : []))
      .catch((e) => showToast(e?.message || 'Error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(scope); }, [scope, load]);

  const markers = useMemo(() => spots
    .map(s => ({ id: s.id, lat: Number(s.lat), lng: Number(s.lng), title: s.title }))
    .filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng)),
  [spots]);

  // ── editor state ──
  const [fTitle, setFTitle] = useState('');
  const [fPlace, setFPlace] = useState('');
  const [fBestTime, setFBestTime] = useState('');
  const [fAngle, setFAngle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fPhotos, setFPhotos] = useState('');
  const [fLat, setFLat] = useState<number | null>(null);
  const [fLng, setFLng] = useState<number | null>(null);

  const openEditor = (spot: PhotoSpotT | null) => {
    setEditing(spot);
    setFTitle(spot?.title || '');
    setFPlace(spot?.place || '');
    setFBestTime(spot?.bestTime || '');
    setFAngle(spot?.angleTips || '');
    setFDesc(spot?.description || '');
    setFPhotos((spot?.media || []).map(m => m.url).join('\n'));
    setFLat(spot ? Number(spot.lat) : null);
    setFLng(spot ? Number(spot.lng) : null);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!fTitle.trim()) { showToast(t('spotTitle')); return; }
    if (fLat == null || fLng == null) { showToast(t('spotCoordsHint')); return; }
    setBusy(true);
    const media = fPhotos.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12)
      .map(u => ({ url: u, type: 'image' as const }));
    const payload = {
      title: fTitle, place: fPlace, bestTime: fBestTime, angleTips: fAngle,
      description: fDesc, media, lat: fLat, lng: fLng, isPublic: true,
    };
    try {
      if (editing) await api.updateSpot(editing.id, payload);
      else await api.createSpot(payload);
      showToast(t('spotSaved'));
      setEditorOpen(false);
      load(scope);
    } catch (e: any) {
      showToast(e?.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteSpot(deleting.id);
      showToast(t('spotDeleted'));
      setSelected(null);
      setDeleting(null);
      load(scope);
    } catch (e: any) {
      showToast(e?.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* MAP + list — fills the MAIN area between the top panel and the
      bottom docks (the dashboard frame stays around it) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="relative flex-1 min-h-[45vh] lg:min-h-0">
          <LeafletMap
            center={markers.length ? [markers[0].lat, markers[0].lng] : DEFAULT_CENTER}
            zoom={markers.length ? 12 : DEFAULT_ZOOM}
            markers={markers}
            selectedId={selected?.id || null}
            pickMode={editorOpen}
            picked={fLat != null && fLng != null ? { lat: fLat, lng: fLng } : null}
            onPick={(lat, lng) => { if (editorOpen) { setFLat(lat); setFLng(lng); } }}
            onSelect={(id) => { if (!editorOpen) setSelected(spots.find(s => s.id === id) || null); }}
          />
          {/* floating controls: scope «все/мои» + «добавить спот» — they used
          to live in the page header; on the embedded map they float over the
          map itself (the dashboard's top panel is the frame around it) */}
          {authed && (
            <div className="absolute top-3 right-3 z-[510] flex flex-col gap-2 items-end">
              <Button variant="outline" size="sm" onClick={() => setScope(scope === 'all' ? 'mine' : 'all')}
                className={`rounded-full h-9 px-3 font-bold shadow-md ${scope === 'mine' ? 'bg-cta text-white border-cta' : 'border-black bg-white'}`}>
                {scope === 'mine' ? t('spotMine') : t('spotAll')}
              </Button>
              <Button size="sm" onClick={() => openEditor(null)} className="rounded-full bg-cta hover:bg-cta/90 text-white h-9 px-3 shadow-md">
                <Plus className="w-4 h-4 mr-1" /> {t('spotAdd')}
              </Button>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/60">
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</p>
            </div>
          )}
          {toast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] rounded-full bg-black/80 text-white text-sm px-4 py-2 shadow-lg">
              {toast}
            </div>
          )}
          {editorOpen && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] rounded-full bg-cta text-white text-xs px-4 py-2 shadow-lg font-bold">
              {t('spotCoordsHint')}
            </div>
          )}
        </div>

        {/* the spot list (desktop: side rail; mobile: hidden — pin tap opens the card) */}
        <aside className="hidden lg:flex w-80 xl:w-96 shrink-0 flex-col border-l bg-white">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {spots.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-10">{t('spotsEmpty')}</p>
            )}
            {spots.map(s => (
              <button key={s.id} onClick={() => setSelected(s)}
                className={`w-full text-left rounded-3xl border-2 p-3 transition-colors ${selected?.id === s.id ? 'border-cta bg-cta/5' : 'border-black/10 bg-white hover:border-black/30'}`}>
                <p className="font-bold text-sm truncate">{s.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {s.place || '—'}</p>
                {s.bestTime && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {s.bestTime}</p>}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* SPOT CARD (bottom sheet on mobile / floating panel on desktop) */}
      {selected && !editorOpen && (
        <div className="fixed inset-x-0 bottom-0 z-[550] lg:inset-auto lg:right-6 lg:top-24 lg:bottom-auto lg:w-96">
          <Card className="rounded-t-4xl lg:rounded-4xl border-2 border-black/80 bg-white shadow-2xl max-h-[65dvh] overflow-y-auto">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold leading-tight">{selected.title}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" /> {selected.place || '—'}
                    {selected.author && <> · {t('spotBy')}: {selected.author.name}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {authed && myId === selected.authorId && (
                    <>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-black" onClick={() => openEditor(selected)} title={t('spotEdit')}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-destructive/50 text-destructive" onClick={() => setDeleting(selected)} title={t('delete')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-black" onClick={() => setSelected(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {(selected.media || []).length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {(selected.media || []).map((m, i) => (
                    <img key={i} src={mediaSrc(m.url)} alt="" className="h-24 w-32 rounded-2xl object-cover border border-black/10 shrink-0" />
                  ))}
                </div>
              )}
              {selected.description && <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{selected.description}</p>}
              <div className="mt-3 space-y-2">
                {selected.bestTime && (
                  <div className="rounded-2xl bg-[#FFF7ED] border border-cta/30 p-3 flex gap-2 items-start">
                    <Sun className="w-4 h-4 text-cta mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-cta">{t('spotBestTime')}</p>
                      <p className="text-sm">{selected.bestTime}</p>
                    </div>
                  </div>
                )}
                {selected.angleTips && (
                  <div className="rounded-2xl bg-[#E3EEFF] border border-black/10 p-3 flex gap-2 items-start">
                    <Camera className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-blue-700">{t('spotAngle')}</p>
                      <p className="text-sm whitespace-pre-wrap">{selected.angleTips}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* EDITOR SHEET — the overlay is pointer-events-none so the map STAYS
      clickable while the editor is open (the pick flow: tap the map → the
      pin drops; the sheet carries the same coordinates). Closing is via the
      X button / Save / Cancel — not by clicking outside. */}
      {editorOpen && (
        <div className="fixed inset-0 z-[700] bg-black/40 pointer-events-none flex items-end sm:items-center justify-center">
          <Card className="pointer-events-auto rounded-t-4xl sm:rounded-4xl w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto bg-white border-2 border-black/80" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold">{editing ? t('spotEdit') : t('spotAdd')}</h3>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-black" onClick={() => setEditorOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div>
                <Label className="text-sm font-bold">{t('spotTitle')}</Label>
                <Input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder={t('spotTitlePh')} className="h-10 rounded-2xl border-black/20 bg-white" />
              </div>
              <div>
                <Label className="text-sm font-bold">{t('spotCoords')}</Label>
                <p className="text-xs text-muted-foreground mb-1">{t('spotCoordsHint')}</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" step="any" placeholder="lat"
                    value={fLat != null ? String(fLat) : ''}
                    onChange={e => { const v = Number(e.target.value); setFLat(e.target.value === '' ? null : v); }}
                    className="h-9 rounded-xl border-black/20 bg-white text-xs flex-1"
                  />
                  <Input
                    type="number" step="any" placeholder="lng"
                    value={fLng != null ? String(fLng) : ''}
                    onChange={e => { const v = Number(e.target.value); setFLng(e.target.value === '' ? null : v); }}
                    className="h-9 rounded-xl border-black/20 bg-white text-xs flex-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-bold">{t('spotPlace')}</Label>
                  <Input value={fPlace} onChange={e => setFPlace(e.target.value)} placeholder={t('spotPlacePh')} className="h-10 rounded-2xl border-black/20 bg-white" />
                </div>
                <div>
                  <Label className="text-sm font-bold">{t('spotBestTime')}</Label>
                  <Input value={fBestTime} onChange={e => setFBestTime(e.target.value)} placeholder={t('spotBestTimePh')} className="h-10 rounded-2xl border-black/20 bg-white" />
                </div>
              </div>
              <div>
                <Label className="text-sm font-bold">{t('spotAngle')}</Label>
                <Textarea value={fAngle} onChange={e => setFAngle(e.target.value)} placeholder={t('spotAnglePh')} className="rounded-2xl border-black/20 bg-white min-h-20" />
              </div>
              <div>
                <Label className="text-sm font-bold">{t('spotDescription')}</Label>
                <Textarea value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder={t('spotDescriptionPh')} className="rounded-2xl border-black/20 bg-white min-h-20" />
              </div>
              <div>
                <Label className="text-sm font-bold">{t('spotPhotos')}</Label>
                <Textarea value={fPhotos} onChange={e => setFPhotos(e.target.value)} placeholder={'https://…\nhttps://…'} className="rounded-2xl border-black/20 bg-white min-h-16 text-xs" />
              </div>
              <Button onClick={save} disabled={busy} className="w-full h-11 rounded-full bg-cta hover:bg-cta/90 text-white font-bold">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Compass className="w-4 h-4 mr-2" />}
                {t('save')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* DELETE confirm */}
      {deleting && (
        <div className="fixed inset-0 z-[700] bg-black/40 flex items-center justify-center p-4" onClick={() => setDeleting(null)}>
          <Card className="rounded-4xl w-full max-w-sm bg-white border-2 border-black/80" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4">
              <h3 className="font-extrabold">{t('smmDeleteQ')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('smmDeleteWarning')}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setDeleting(null)} className="rounded-full border-black">{t('cancel')}</Button>
                <Button variant="destructive" onClick={doDelete} disabled={busy} className="rounded-full">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('delete')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* guest hint */}
      {!authed && spots.length === 0 && !loading && (
        <div className="fixed inset-x-0 bottom-4 z-[550] flex justify-center px-4">
          <Card className="rounded-4xl border-2 border-black/80 bg-white shadow-xl">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{t('spotsEmpty')}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

// The guest STANDALONE page (landing → Карта спотов): the header IS the top
// panel — the universal back button lives there (the same 56px contract the
// other pages keep). Authed users never see this page: the map opens INSIDE
// the SMM dashboard (top-panel map icon), keeping both panels.
export default function SpotsMapView({
  lang,
  cycleLang,
  myId,
  authed,
  onBack,
}: {
  lang: Lang;
  cycleLang: () => void;
  myId: string | null;
  authed: boolean;
  onBack: () => void;
}) {
  const t = (key: string, vars?: Record<string, string | number>) => tUI(lang, key, vars);

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden screen-enter">
      {/* TOP PANEL — the universal back lives HERE (not inside the map body) */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 lg:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="icon" onClick={onBack} className="rounded-full shrink-0 border-black lg:h-10 lg:w-10" aria-label={t('back')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">{t('mapTitle')}</h1>
              <p className="text-[11px] text-muted-foreground truncate hidden sm:block">{t('mapSub')}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={cycleLang} className="rounded-full border-black h-9 px-3 font-bold">
            {lang === 'en' ? 'EN' : lang === 'ru' ? 'RU' : 'UZ'}
          </Button>
        </div>
      </header>

      {/* the map body (map + rails + cards + editor sheet) */}
      <SpotsEmbed lang={lang} myId={myId} authed={authed} />
    </div>
  );
}
