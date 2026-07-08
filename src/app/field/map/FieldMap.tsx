'use client';

// Full port of Sales Tracker's SimpleMap.jsx onto Belarro OP's own data
// (locations table via /api/field/locations, not Google Sheets).
// Keeps every real behavior: GPS pulse dot, colored+badged custom pin
// overlays (visit-count badge, microgreens badge), click-a-map-POI to log a
// new visit, text search with save-to-visit/bookmark-to-prospect, "quick
// add" nearest place, blue prospect ("To Visit") layer, visited counter,
// first-run tap hint. Data flows through the same visit-logging API the
// Visits list page uses, so a place logged from the map shows up
// identically everywhere else in the app.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getPinColor } from '../colorUtils';

declare global {
  interface Window {
    google: any;
    initGoogleMaps?: () => void;
  }
}

export interface MapLocation {
  id?: string;
  location_name: string;
  business_address: string | null;
  contact_person: string | null;
  direct_phone: string | null;
  interest_level: string | null;
  pipeline_stage: string | null;
  visit_notes: string | null;
  direct_link?: string | null;
  lat?: number | null;
  lng?: number | null;
  uses_microgreens?: boolean;
  business_website?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  place_id?: string | null;
  pin_color?: string | null;
  sample_given?: string | boolean | null;
  visit_count?: number;
}

export interface Prospect {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  uses_microgreens: boolean;
}

export default function FieldMap({
  locations,
  prospects,
  onSelect,
  onProspectTap,
}: {
  locations: MapLocation[];
  prospects: Prospect[];
  onSelect: (loc: Partial<MapLocation>) => void;
  onProspectTap: (p: Prospect) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const prospectOverlaysRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const customMarkerClickedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showYouAreHere, setShowYouAreHere] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [savingProspectIdx, setSavingProspectIdx] = useState<number | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // First-run tap hint (P2-18) — localStorage-gated, auto-dismiss.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('belarro_op_hasSeenMapHint')) return;
    const showTimer = setTimeout(() => setShowHint(true), 2000);
    const hideTimer = setTimeout(() => {
      setShowHint(false);
      localStorage.setItem('belarro_op_hasSeenMapHint', 'true');
    }, 12000);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, []);

  const createUserLocationMarker = useCallback((positionInput: { lat: number; lng: number }, map: any) => {
    const g = window.google;
    const position = new g.maps.LatLng(positionInput.lat, positionInput.lng);
    const markerDiv = document.createElement('div');
    Object.assign(markerDiv.style, {
      position: 'absolute', width: '14px', height: '14px', backgroundColor: '#4285F4',
      borderRadius: '50%', border: '2px solid white', boxShadow: '0 0 6px rgba(66,133,244,0.5)', zIndex: '999',
    });
    const pulse = document.createElement('div');
    Object.assign(pulse.style, {
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: '100%', height: '100%', borderRadius: '50%', backgroundColor: 'rgba(66,133,244,0.4)',
      animation: 'field-map-pulse 2s infinite',
    });
    markerDiv.appendChild(pulse);

    class UserOverlay extends g.maps.OverlayView {
      div: HTMLDivElement | null = null;
      position: any;
      content: HTMLDivElement;
      constructor(pos: any, content: HTMLDivElement) { super(); this.position = pos; this.content = content; }
      onAdd() { this.div = this.content; this.getPanes().overlayMouseTarget.appendChild(this.div); }
      draw() {
        const proj = this.getProjection();
        const pos = proj.fromLatLngToDivPixel(this.position);
        if (pos && this.div) { this.div.style.left = `${pos.x - 7}px`; this.div.style.top = `${pos.y - 7}px`; }
      }
      onRemove() { if (this.div?.parentNode) this.div.parentNode.removeChild(this.div); }
    }

    const overlay = new UserOverlay(position, markerDiv);
    overlay.setMap(map);
    userMarkerRef.current = overlay;
  }, []);

  const makePinOverlay = useCallback((position: any, content: HTMLDivElement, targetRef: React.MutableRefObject<any[]>) => {
    const g = window.google;
    class PinOverlay extends g.maps.OverlayView {
      div: HTMLDivElement | null = null;
      position: any;
      content: HTMLDivElement;
      constructor(pos: any, c: HTMLDivElement) { super(); this.position = pos; this.content = c; }
      onAdd() { this.div = this.content; this.getPanes().overlayMouseTarget.appendChild(this.div); }
      draw() {
        const proj = this.getProjection();
        const pos = proj.fromLatLngToDivPixel(this.position);
        if (pos && this.div) { this.div.style.left = `${pos.x - 10}px`; this.div.style.top = `${pos.y - 10}px`; this.div.style.position = 'absolute'; }
      }
      onRemove() { if (this.div?.parentNode) this.div.parentNode.removeChild(this.div); }
    }
    const overlay = new PinOverlay(position, content);
    overlay.setMap(mapInstanceRef.current);
    targetRef.current.push(overlay);
  }, []);

  const createCustomMarker = useCallback((position: any, color: string, count: number, loc: MapLocation) => {
    const markerDiv = document.createElement('div');
    Object.assign(markerDiv.style, { position: 'relative', width: '20px', height: '20px', cursor: 'pointer' });

    const circle = document.createElement('div');
    Object.assign(circle.style, {
      width: '20px', height: '20px', borderRadius: '50%', backgroundColor: color,
      border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: '10px',
    });
    circle.textContent = count > 1 ? String(count) : '';
    markerDiv.appendChild(circle);

    if (loc.uses_microgreens) {
      const badge = document.createElement('div');
      Object.assign(badge.style, {
        position: 'absolute', top: '-3px', right: '-3px', width: '14px', height: '14px',
        borderRadius: '50%', backgroundColor: '#e53935', border: '2px solid white', zIndex: '2',
      });
      markerDiv.appendChild(badge);
    }

    markerDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      customMarkerClickedRef.current = true;
      setTimeout(() => { customMarkerClickedRef.current = false; }, 1000);
      onSelect(loc);
    });

    makePinOverlay(position, markerDiv, overlaysRef);
  }, [onSelect, makePinOverlay]);

  const createProspectMarker = useCallback((position: any, prospect: Prospect) => {
    const markerDiv = document.createElement('div');
    Object.assign(markerDiv.style, { position: 'relative', width: '18px', height: '18px', cursor: 'pointer' });
    const circle = document.createElement('div');
    Object.assign(circle.style, {
      width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#2196F3',
      border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    });
    markerDiv.appendChild(circle);
    if (prospect.uses_microgreens) {
      const badge = document.createElement('div');
      Object.assign(badge.style, {
        position: 'absolute', top: '-3px', right: '-3px', width: '12px', height: '12px',
        borderRadius: '50%', backgroundColor: '#e53935', border: '2px solid white',
      });
      markerDiv.appendChild(badge);
    }
    markerDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      customMarkerClickedRef.current = true;
      setTimeout(() => { customMarkerClickedRef.current = false; }, 1000);
      onProspectTap(prospect);
    });
    makePinOverlay(position, markerDiv, prospectOverlaysRef);
  }, [onProspectTap, makePinOverlay]);

  const geocodeAndCreateMarker = useCallback((address: string, color: string, count: number, loc: MapLocation) => {
    const g = window.google;
    const geocoder = new g.maps.Geocoder();
    geocoder.geocode({ address }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) createCustomMarker(results[0].geometry.location, color, count, loc);
    });
  }, [createCustomMarker]);

  const plotLocation = useCallback((loc: MapLocation) => {
    const g = window.google;
    const color = getPinColor({ pin_color: loc.pin_color, interest_level: loc.interest_level, sample_given: loc.sample_given });
    const count = loc.visit_count || 1;

    if (loc.lat && loc.lng) {
      createCustomMarker(new g.maps.LatLng(loc.lat, loc.lng), color, count, loc);
      return;
    }
    // Fall back to parsing direct_link the way the old Sales Tracker did,
    // for rows created before lat/lng columns existed.
    if (loc.direct_link) {
      const coordMatch = loc.direct_link.match(/^-?\d+\.\d+,-?\d+\.\d+/);
      if (coordMatch) {
        const [lat, lng] = loc.direct_link.split('|')[0].split(',').map(parseFloat);
        createCustomMarker(new g.maps.LatLng(lat, lng), color, count, loc);
        return;
      }
      const atMatch = loc.direct_link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (atMatch) {
        createCustomMarker(new g.maps.LatLng(parseFloat(atMatch[1]), parseFloat(atMatch[2])), color, count, loc);
        return;
      }
    }
    if (loc.business_address) geocodeAndCreateMarker(loc.business_address, color, count, loc);
  }, [createCustomMarker, geocodeAndCreateMarker]);

  const createMap = useCallback((center: { lat: number; lng: number }) => {
    const g = window.google;
    const map = new g.maps.Map(mapRef.current, {
      center, zoom: 14, zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: true,
    });
    mapInstanceRef.current = map;

    map.addListener('click', async (event: any) => {
      if (customMarkerClickedRef.current) { customMarkerClickedRef.current = false; if (event.placeId) event.stop(); return; }
      if (!event.placeId) return;
      event.stop();
      try {
        const { Place } = await g.maps.importLibrary('places');
        const place = new Place({ id: event.placeId });
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'nationalPhoneNumber', 'websiteURI', 'location'] });
        const placeName = place.displayName || 'Unknown Place';
        const placeAddr = place.formattedAddress || '';
        const existing = locations.find(l =>
          (l.direct_link && l.direct_link.includes(event.placeId)) ||
          l.location_name === placeName || l.business_address === placeAddr
        );
        if (existing) { onSelect(existing); return; }
        onSelect({
          location_name: placeName,
          business_address: placeAddr,
          business_phone: place.nationalPhoneNumber || '',
          business_website: place.websiteURI || '',
          place_id: event.placeId,
          lat: place.location?.lat?.() ?? null,
          lng: place.location?.lng?.() ?? null,
        });
      } catch (err) {
        console.error('Places API error:', err);
      }
    });

    createUserLocationMarker(center, map);
    setMapReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, onSelect, createUserLocationMarker]);

  // Init: show the map immediately (cached/low-accuracy fix, or Berlin as a
  // last resort), then silently refine the center once a high-accuracy GPS
  // fix comes in. Previously this blocked map creation on the FIRST
  // high-accuracy watchPosition callback, which can take several seconds
  // to cold-lock on a real phone — the map now appears right away instead
  // of showing a spinner while GPS locks.
  useEffect(() => {
    let mounted = true;
    let watchId: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const start = () => {
      if (!mounted) return;
      if (!navigator.geolocation) { createMap({ lat: 52.520008, lng: 13.404954 }); return; }

      let mapCreated = false;
      const showMapFast = (loc: { lat: number; lng: number }) => {
        if (mapCreated || !mounted) return;
        createMap(loc);
        mapCreated = true;
      };

      // Fast path: accept a cached/low-accuracy fix (or timeout to Berlin)
      // so the map renders within ~1s instead of waiting on a cold GPS lock.
      navigator.geolocation.getCurrentPosition(
        (pos) => showMapFast({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => showMapFast({ lat: 52.520008, lng: 13.404954 }),
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
      );
      // Belt-and-suspenders: if even the fast path hasn't resolved yet.
      fallbackTimer = setTimeout(() => showMapFast({ lat: 52.520008, lng: 13.404954 }), 3500);

      // Refine path: high-accuracy watch, silently recenters once locked.
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          showMapFast(loc);
          if (mapInstanceRef.current) mapInstanceRef.current.setCenter(loc);
          if (pos.coords.accuracy <= 50 && watchId !== null) navigator.geolocation.clearWatch(watchId);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    };

    let loadedHandler: (() => void) | null = null;
    let loadTimer: ReturnType<typeof setTimeout> | null = null;

    if (window.google?.maps) start();
    else {
      loadedHandler = () => start();
      window.addEventListener('google-maps-loaded', loadedHandler, { once: true });
      loadTimer = setTimeout(() => { if (window.google?.maps) start(); }, 200);
    }

    return () => {
      mounted = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (loadTimer) clearTimeout(loadTimer);
      if (loadedHandler) window.removeEventListener('google-maps-loaded', loadedHandler);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-plot visited-location pins whenever locations change.
  useEffect(() => {
    if (!mapReady || !window.google) return;
    overlaysRef.current.forEach(o => o.setMap && o.setMap(null));
    overlaysRef.current = [];
    locations.forEach(plotLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, mapReady]);

  // Re-plot prospect (blue, "To Visit") pins whenever prospects change.
  useEffect(() => {
    if (!mapReady || !window.google) return;
    prospectOverlaysRef.current.forEach(o => o.setMap && o.setMap(null));
    prospectOverlaysRef.current = [];
    for (const p of prospects) {
      if (p.lat && p.lng) {
        createProspectMarker(new window.google.maps.LatLng(p.lat, p.lng), p);
      } else if (p.address) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: p.address }, (results: any[], status: string) => {
          if (status === 'OK' && results[0]) createProspectMarker(results[0].geometry.location, p);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects, mapReady]);

  const zoomToUserLocation = () => {
    if (!navigator.geolocation || !mapInstanceRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapInstanceRef.current.setCenter(loc);
      mapInstanceRef.current.setZoom(18);
      if (userMarkerRef.current) { userMarkerRef.current.position = new window.google.maps.LatLng(loc.lat, loc.lng); userMarkerRef.current.draw(); }
      setShowYouAreHere(true);
      setTimeout(() => setShowYouAreHere(false), 2500);
    }, () => alert('Unable to get your location. Check browser permissions.'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const handleQuickAdd = async () => {
    if (!mapInstanceRef.current) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapInstanceRef.current.setCenter(current);
      mapInstanceRef.current.setZoom(17);
      try {
        const { Place } = await window.google.maps.importLibrary('places');
        const { places } = await Place.searchByText({
          textQuery: 'restaurant OR cafe OR bar',
          fields: ['displayName', 'formattedAddress', 'nationalPhoneNumber', 'websiteURI', 'location'],
          locationBias: { center: current, radius: 50 },
          maxResultCount: 5,
        });
        const nearest = places?.[0];
        onSelect(nearest ? {
          location_name: nearest.displayName || 'Unknown Place',
          business_address: nearest.formattedAddress || '',
          business_phone: nearest.nationalPhoneNumber || '',
          business_website: nearest.websiteURI || '',
          lat: nearest.location?.lat?.() ?? current.lat,
          lng: nearest.location?.lng?.() ?? current.lng,
        } : {
          location_name: 'New Location',
          business_address: `Lat: ${current.lat.toFixed(6)}, Lng: ${current.lng.toFixed(6)}`,
          lat: current.lat, lng: current.lng,
        });
      } finally {
        setIsLocating(false);
      }
    }, () => { alert('Unable to get your location.'); setIsLocating(false); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const runSearch = useCallback(async (query: string) => {
    if (!window.google || !query.trim()) return;
    setIsSearching(true);
    try {
      const { Place } = await window.google.maps.importLibrary('places');
      const center = mapInstanceRef.current?.getCenter();
      const request: any = {
        textQuery: query,
        fields: ['displayName', 'formattedAddress', 'nationalPhoneNumber', 'websiteURI', 'location', 'id'],
        maxResultCount: 8,
      };
      if (center) request.locationBias = { center: { lat: center.lat(), lng: center.lng() }, radius: 5000 };
      const { places } = await Place.searchByText(request);
      setSearchResults(places || []);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchInput = (val: string) => {
    setSearchText(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchDebounceRef.current = setTimeout(() => runSearch(val), 400);
  };

  const isAlreadySaved = (place: any) => {
    const name = place.displayName || '';
    const addr = place.formattedAddress || '';
    return locations.some(l => l.location_name === name || l.business_address === addr)
      || prospects.some(p => p.name === name || p.address === addr);
  };

  const selectSearchResult = (place: any) => {
    const loc: Partial<MapLocation> = {
      location_name: place.displayName || 'Unknown Place',
      business_address: place.formattedAddress || '',
      business_phone: place.nationalPhoneNumber || '',
      business_website: place.websiteURI || '',
      place_id: place.id || '',
      lat: place.location?.lat?.() ?? null,
      lng: place.location?.lng?.() ?? null,
    };
    if (loc.lat && loc.lng && mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat: loc.lat, lng: loc.lng });
      mapInstanceRef.current.setZoom(17);
    }
    setShowSearch(false); setSearchText(''); setSearchResults([]);
    onSelect(loc);
  };

  const bookmarkSearchResult = async (place: any, idx: number) => {
    setSavingProspectIdx(idx);
    try {
      await fetch('/api/field/prospects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: place.displayName || 'Unknown Place',
          address: place.formattedAddress || '',
          lat: place.location?.lat?.() ?? null,
          lng: place.location?.lng?.() ?? null,
        }),
      });
      setShowSearch(false); setSearchText(''); setSearchResults([]);
    } finally {
      setSavingProspectIdx(null);
    }
  };

  return (
    <div className="relative w-full h-full">
      <style>{`@keyframes field-map-pulse { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0.8; } 70% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; } 100% { transform: translate(-50%,-50%) scale(1); opacity: 0; } }`}</style>
      <div ref={mapRef} className="w-full h-full" />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      )}

      {showHint && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-blue-600 text-white rounded-full px-4 py-2.5 shadow-lg flex items-center gap-3 max-w-[90%]">
          <span className="text-sm font-medium whitespace-nowrap">👆 Tap any business to add visit notes</span>
          <button onClick={() => { setShowHint(false); localStorage.setItem('belarro_op_hasSeenMapHint', 'true'); }}
            className="bg-white/20 rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0">
            Got it
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="absolute top-3 left-3 right-3 z-10">
        {!showSearch ? (
          <button
            onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 80); }}
            className="w-full bg-white shadow-md rounded-full px-4 py-2.5 text-left text-sm text-gray-400 flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            Search places…
          </button>
        ) : (
          <div className="bg-white shadow-lg rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
              <input
                ref={searchInputRef}
                value={searchText}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Search places…"
                className="flex-1 text-sm outline-none"
              />
              <button onClick={() => { setShowSearch(false); setSearchText(''); setSearchResults([]); }} className="text-gray-400 font-bold px-1">✕</button>
            </div>
            {isSearching && <div className="px-4 py-3 text-xs text-gray-400">Searching…</div>}
            {searchResults.length > 0 && (
              <div className="max-h-72 overflow-y-auto">
                {searchResults.map((p, i) => {
                  const saved = isAlreadySaved(p);
                  return (
                    <div key={i} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <button onClick={() => selectSearchResult(p)} className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                          {p.displayName}
                          {saved && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0">SAVED</span>}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{p.formattedAddress}</div>
                      </button>
                      {!saved && (
                        <button
                          onClick={(e) => { e.stopPropagation(); bookmarkSearchResult(p, i); }}
                          disabled={savingProspectIdx === i}
                          title="Save to visit later"
                          className="shrink-0 w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center disabled:opacity-50"
                        >
                          {savingProspectIdx === i ? '…' : '🔖'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick add + locate buttons */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <button onClick={zoomToUserLocation} className="w-11 h-11 bg-white shadow-md rounded-full flex items-center justify-center text-lg">📍</button>
        <button onClick={handleQuickAdd} disabled={isLocating} className="w-11 h-11 bg-green-600 shadow-md rounded-full flex items-center justify-center text-white text-2xl font-bold disabled:opacity-50">
          {isLocating ? '…' : '+'}
        </button>
      </div>

      {/* Visited + to-visit counter */}
      <div className="absolute bottom-4 left-4 z-10 bg-white shadow-md rounded-full px-3 py-1.5 text-xs font-semibold text-gray-600">
        📍 <span className="text-blue-600">{locations.length}</span> visited
        {prospects.length > 0 && <> · <span className="text-blue-600">{prospects.length}</span> to visit</>}
      </div>

      {showYouAreHere && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow">
          You are here
        </div>
      )}
    </div>
  );
}
