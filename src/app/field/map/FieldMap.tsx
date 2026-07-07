'use client';

// Full port of Sales Tracker's SimpleMap.jsx onto Belarro OP's own data
// (locations table via /api/field/locations, not Google Sheets).
// Keeps every real behavior: GPS pulse dot, colored+badged custom pin
// overlays, click-a-map-POI to log a new visit, text search, "quick add"
// nearest place, visited counter. Data flows through the same visit-logging
// API the Visits list page uses, so a place logged from the map shows up
// identically everywhere else in the app.

import React, { useCallback, useEffect, useRef, useState } from 'react';

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
}

const INTEREST_COLOR: Record<string, string> = {
  'Not Interested': '#f44336',
  'Follow Up': '#ffc107',
  'Pending': '#ffc107',
  'Interested': '#4caf50',
  'Closed Deal': '#4caf50',
};
function colorFor(interestLevel: string | null) {
  return (interestLevel && INTEREST_COLOR[interestLevel]) || '#9e9e9e';
}

export default function FieldMap({
  locations,
  onSelect,
}: {
  locations: MapLocation[];
  onSelect: (loc: Partial<MapLocation>) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const customMarkerClickedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showYouAreHere, setShowYouAreHere] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const createCustomMarker = useCallback((position: any, color: string, count: number, loc: MapLocation) => {
    const g = window.google;
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

    class PinOverlay extends g.maps.OverlayView {
      div: HTMLDivElement | null = null;
      position: any;
      content: HTMLDivElement;
      constructor(pos: any, content: HTMLDivElement) { super(); this.position = pos; this.content = content; }
      onAdd() { this.div = this.content; this.getPanes().overlayMouseTarget.appendChild(this.div); }
      draw() {
        const proj = this.getProjection();
        const pos = proj.fromLatLngToDivPixel(this.position);
        if (pos && this.div) { this.div.style.left = `${pos.x - 10}px`; this.div.style.top = `${pos.y - 10}px`; this.div.style.position = 'absolute'; }
      }
      onRemove() { if (this.div?.parentNode) this.div.parentNode.removeChild(this.div); }
    }

    const overlay = new PinOverlay(position, markerDiv);
    overlay.setMap(mapInstanceRef.current);
    overlaysRef.current.push(overlay);
  }, [onSelect]);

  const geocodeAndCreateMarker = useCallback((address: string, color: string, count: number, loc: MapLocation) => {
    const g = window.google;
    const geocoder = new g.maps.Geocoder();
    geocoder.geocode({ address }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) createCustomMarker(results[0].geometry.location, color, count, loc);
    });
  }, [createCustomMarker]);

  const plotLocation = useCallback((loc: MapLocation) => {
    const g = window.google;
    const color = colorFor(loc.interest_level);

    if (loc.lat && loc.lng) {
      createCustomMarker(new g.maps.LatLng(loc.lat, loc.lng), color, 1, loc);
      return;
    }
    // Fall back to parsing direct_link the way the old Sales Tracker did,
    // for rows created before lat/lng columns existed.
    if (loc.direct_link) {
      const coordMatch = loc.direct_link.match(/^-?\d+\.\d+,-?\d+\.\d+/);
      if (coordMatch) {
        const [lat, lng] = loc.direct_link.split('|')[0].split(',').map(parseFloat);
        createCustomMarker(new g.maps.LatLng(lat, lng), color, 1, loc);
        return;
      }
      const atMatch = loc.direct_link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (atMatch) {
        createCustomMarker(new g.maps.LatLng(parseFloat(atMatch[1]), parseFloat(atMatch[2])), color, 1, loc);
        return;
      }
    }
    if (loc.business_address) geocodeAndCreateMarker(loc.business_address, color, 1, loc);
  }, [createCustomMarker, geocodeAndCreateMarker]);

  const createMap = useCallback((center: { lat: number; lng: number }) => {
    const g = window.google;
    setUserLocation(center);
    const map = new g.maps.Map(mapRef.current, {
      center, zoom: 14, zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
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
  }, [locations, onSelect, createUserLocationMarker]);

  // Init: get GPS fix (or fall back to Berlin), then create the map once.
  useEffect(() => {
    let mounted = true;
    const start = () => {
      if (!mounted) return;
      if (!navigator.geolocation) { createMap({ lat: 52.520008, lng: 13.404954 }); return; }
      let mapCreated = false;
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (!mapCreated) { createMap(loc); mapCreated = true; }
          else if (mapInstanceRef.current) mapInstanceRef.current.setCenter(loc);
          if (pos.coords.accuracy <= 50) navigator.geolocation.clearWatch(watchId);
        },
        () => { if (!mapCreated) { createMap({ lat: 52.520008, lng: 13.404954 }); mapCreated = true; } },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    };

    if (window.google?.maps) start();
    else {
      const handler = () => start();
      window.addEventListener('google-maps-loaded', handler, { once: true });
      const t = setTimeout(() => { if (window.google?.maps) start(); }, 200);
      return () => { mounted = false; clearTimeout(t); window.removeEventListener('google-maps-loaded', handler); };
    }
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-plot pins whenever locations change (after map is ready).
  useEffect(() => {
    if (!mapReady || !window.google) return;
    overlaysRef.current.forEach(o => o.setMap && o.setMap(null));
    overlaysRef.current = [];
    locations.forEach(plotLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, mapReady]);

  const zoomToUserLocation = () => {
    if (!navigator.geolocation || !mapInstanceRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(loc);
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

  return (
    <div className="relative w-full h-full">
      <style>{`@keyframes field-map-pulse { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0.8; } 70% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; } 100% { transform: translate(-50%,-50%) scale(1); opacity: 0; } }`}</style>
      <div ref={mapRef} className="w-full h-full" />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
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
              <div className="max-h-64 overflow-y-auto">
                {searchResults.map((p, i) => (
                  <button key={i} onClick={() => selectSearchResult(p)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    <div className="text-sm font-semibold text-gray-900">{p.displayName}</div>
                    <div className="text-xs text-gray-400">{p.formattedAddress}</div>
                  </button>
                ))}
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

      {/* Visited counter */}
      <div className="absolute bottom-4 left-4 z-10 bg-white shadow-md rounded-full px-3 py-1.5 text-xs font-semibold text-gray-600">
        📍 <span className="text-blue-600">{locations.length}</span> places
      </div>

      {showYouAreHere && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow">
          You are here
        </div>
      )}
    </div>
  );
}
