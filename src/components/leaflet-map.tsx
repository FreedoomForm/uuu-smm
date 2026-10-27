'use client';

// ---------------------------------------------------------------------------
// LeafletMap — the raw Leaflet wrapper for the photo-spots map (OpenStreetMap
// tiles, NO API key, NO billing). Loaded client-side only (dynamic import in
// spots-map-view). Three modes:
//   * browse   — pins of the spots; tapping a pin fires onSelect
//   * pickMode — the editor is open: tapping the map fires onPick(lat,lng)
//   * picked   — the editor's current pin (draggable marker)
// The map auto-fits the markers' bounds on first load.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
}

export default function LeafletMap({
  center,
  zoom,
  markers,
  selectedId,
  pickMode,
  picked,
  onPick,
  onSelect,
}: {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  selectedId: string | null;
  pickMode: boolean;
  picked: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  onSelect?: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinsRef = useRef<Map<string, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null); // the leaflet module (client only)
  const fittedRef = useRef(false);

  // INIT once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { center, zoom, zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      // pick mode: tapping the map drops/moves the pin
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        if (pickModeRef.current && onPickRef.current) onPickRef.current(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      setReady(x => x + 1);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        pinsRef.current.clear();
        pickMarkerRef.current = null;
        fittedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live refs for the handlers (avoid re-init on callback identity changes)
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // bump when the dynamic import resolves
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(0);

  // PINS (browse markers)
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !ready) return;
    const next = new Set(markers.map(m => m.id));
    // remove stale
    for (const [id, pin] of pinsRef.current) {
      if (!next.has(id)) {
        map.removeLayer(pin);
        pinsRef.current.delete(id);
      }
    }
    // add/update
    for (const m of markers) {
      if (pinsRef.current.has(m.id)) continue;
      const icon = L.divIcon({
        className: '',
        html: `<span style="display:flex;width:34px;height:34px;border-radius:9999px;background:#E9605A;color:#fff;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2.5px solid #fff;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const pin = L.marker([m.lat, m.lng], { icon, title: m.title }).addTo(map);
      pin.on('click', () => onSelectRef.current?.(m.id));
      pinsRef.current.set(m.id, pin);
    }
    // fit bounds once (first batch only — user panning wins afterwards)
    if (!fittedRef.current && markers.length > 1) {
      fittedRef.current = true;
      map.fitBounds(L.latLngBounds(markers.map(m => [m.lat, m.lng])).pad(0.15));
    }
    // highlight the selected pin (bigger ring)
    for (const [id, pin] of pinsRef.current) {
      const el = pin.getElement();
      if (el) el.style.filter = id === selectedId ? 'drop-shadow(0 0 6px rgba(233,96,90,.9))' : '';
      if (el) el.style.transform = id === selectedId ? el.style.transform + ' scale(1.15)' : el.style.transform;
    }
  }, [markers, selectedId, ready]);

  // PICK MARKER (editor's pin)
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !ready) return;
    if (pickMode && picked) {
      if (!pickMarkerRef.current) {
        const icon = L.divIcon({
          className: '',
          html: `<span style="display:flex;width:34px;height:34px;border-radius:9999px;background:#E9605A;color:#fff;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2.5px solid #fff;cursor:grab;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        pickMarkerRef.current = L.marker([picked.lat, picked.lng], { icon, draggable: true }).addTo(map);
        pickMarkerRef.current.on('dragend', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          const ll = e.target.getLatLng();
          onPickRef.current?.(ll.lat, ll.lng);
        });
      } else {
        pickMarkerRef.current.setLatLng([picked.lat, picked.lng]);
      }
    } else if (pickMarkerRef.current) {
      map.removeLayer(pickMarkerRef.current);
      pickMarkerRef.current = null;
    }
  }, [pickMode, picked, ready]);

  return <div ref={elRef} className="absolute inset-0 z-0" />;
}
