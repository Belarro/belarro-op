'use client';

// Ported verbatim from saletracker/src/hooks/useNearbyDetection.js — GPS
// proximity auto-detection. While enabled, takes a GPS fix every 60s; if
// moved >30m, searches Places within 80m for a restaurant/cafe/bar/bistro;
// fires onNearbyPlace once per distinct place (won't re-fire while parked
// at the same spot).

import { useCallback, useEffect, useRef } from 'react';

const DETECTION_RADIUS = 80;
const WATCH_INTERVAL = 60000;
const MIN_MOVE_METERS = 30;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
}

export interface NearbyPlace {
  location_name: string;
  business_address: string;
  business_phone: string;
  business_website: string;
  direct_link: string;
  lat: number;
  lng: number;
}

export function useNearbyDetection({ onNearbyPlace, enabled = true }: { onNearbyPlace: (p: NearbyPlace) => void; enabled?: boolean }) {
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastPlaceIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  const detect = useCallback(async (position: GeolocationPosition) => {
    if (runningRef.current) return;
    runningRef.current = true;

    const current = { lat: position.coords.latitude, lng: position.coords.longitude };

    if (lastPositionRef.current) {
      const moved = distanceMeters(lastPositionRef.current, current);
      if (moved < MIN_MOVE_METERS) { runningRef.current = false; return; }
    }
    lastPositionRef.current = current;

    try {
      if (!window.google?.maps) { runningRef.current = false; return; }
      const { Place } = await window.google.maps.importLibrary('places');
      const { places } = await Place.searchByText({
        textQuery: 'restaurant OR cafe OR bar OR bistro',
        fields: ['id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'websiteURI', 'googleMapsURI', 'location'],
        locationRestriction: { center: current, radius: DETECTION_RADIUS },
        maxResultCount: 1,
      });

      if (!places?.length) { runningRef.current = false; return; }
      const place = places[0];
      const placeId = place.id;
      if (placeId === lastPlaceIdRef.current) { runningRef.current = false; return; }
      lastPlaceIdRef.current = placeId;

      onNearbyPlace({
        location_name: place.displayName || '',
        business_address: place.formattedAddress || '',
        business_phone: place.nationalPhoneNumber || '',
        business_website: place.websiteURI || '',
        direct_link: place.googleMapsURI || '',
        lat: place.location?.lat?.() ?? current.lat,
        lng: place.location?.lng?.() ?? current.lng,
      });
    } catch (err) {
      console.warn('Nearby detection error:', err);
    } finally {
      runningRef.current = false;
    }
  }, [onNearbyPlace]);

  const runDetection = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      detect,
      (err) => console.warn('GPS error:', err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }, [detect]);

  useEffect(() => {
    if (!enabled) return;
    runDetection();
    timerRef.current = setInterval(runDetection, WATCH_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [enabled, runDetection]);

  return { detectNow: runDetection };
}
