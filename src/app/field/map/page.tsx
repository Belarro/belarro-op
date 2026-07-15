'use client';

import React, { useCallback, useEffect, useState } from 'react';
import FieldMap, { MapLocation, Prospect } from './FieldMap';
import VisitForm, { VisitFormLoc } from '../VisitForm';
import { useNearbyDetection, NearbyPlace } from '../useNearbyDetection';
import { useBackToClose } from '../useBackToClose';

export default function FieldMapPage() {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLoc, setFormLoc] = useState<VisitFormLoc | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tappedProspect, setTappedProspect] = useState<Prospect | null>(null);
  const [removingProspect, setRemovingProspect] = useState(false);
  const [nearbyBanner, setNearbyBanner] = useState<NearbyPlace | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number } | null>(null);

  const handleNearbyPlace = useCallback((place: NearbyPlace) => {
    setNearbyBanner(place);
    setTimeout(() => setNearbyBanner(null), 12000);
  }, []);

  useNearbyDetection({ onNearbyPlace: handleNearbyPlace, enabled: true });

  // Android hardware back button closes the open sheet/form instead of
  // exiting the whole app — Ron's ask.
  useBackToClose(showForm, () => { setShowForm(false); load(); });
  useBackToClose(!!tappedProspect && !showForm, () => setTappedProspect(null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, prospRes] = await Promise.all([
        fetch('/api/field/locations'),
        fetch('/api/field/prospects'),
      ]);
      const locJson = await locRes.json();
      const prospJson = await prospRes.json();
      if (locJson.success) setLocations(locJson.data || []);
      if (prospJson.success) setProspects(prospJson.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (loc: Partial<MapLocation>) => {
    setFormLoc(loc as VisitFormLoc);
    setShowForm(true);
  };

  // After saving a visit, keep the map on that place (zoomed in) instead of
  // resetting to GPS/last view — Ron's ask: "keep me at the same location
  // so I see the mark on the map, zoomed in enough to see it."
  const handleFormClose = async (savedLoc?: { id: string; lat?: number | null; lng?: number | null }) => {
    setShowForm(false);
    await load();
    if (!savedLoc) return;
    if (savedLoc.lat != null && savedLoc.lng != null) {
      setFocusPoint({ lat: savedLoc.lat, lng: savedLoc.lng });
      return;
    }
    // New place saved without coords on hand (typed manually, no map/search
    // origin) — the refetch above may have a geocoded lat/lng for it now.
    setLocations(prev => {
      const match = prev.find(l => l.id === savedLoc.id);
      if (match?.lat != null && match?.lng != null) {
        setFocusPoint({ lat: match.lat, lng: match.lng });
      }
      return prev;
    });
  };

  const removeProspect = async () => {
    if (!tappedProspect) return;
    setRemovingProspect(true);
    try {
      const res = await fetch('/api/field/prospects', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tappedProspect.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        alert(json?.error || 'Remove failed — try again');
        return;
      }
      setTappedProspect(null);
      load();
    } catch {
      alert('Network error — remove failed');
    } finally {
      setRemovingProspect(false);
    }
  };

  const logVisitFromProspect = () => {
    if (!tappedProspect) return;
    setFormLoc({
      location_name: tappedProspect.name,
      business_address: tappedProspect.address,
      lat: tappedProspect.lat,
      lng: tappedProspect.lng,
      uses_microgreens: tappedProspect.uses_microgreens,
    } as VisitFormLoc);
    setShowForm(true);
    setTappedProspect(null);
  };

  return (
    <div className="relative w-full h-full">
      {loading && locations.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <FieldMap
          locations={locations}
          prospects={prospects}
          onSelect={handleSelect}
          onProspectTap={setTappedProspect}
          focusPoint={focusPoint}
        />
      )}

      {tappedProspect && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40" onClick={() => setTappedProspect(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">{tappedProspect.name}</h2>
                <p className="text-xs text-gray-400">{tappedProspect.address}</p>
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full shrink-0">TO VISIT</span>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={logVisitFromProspect} className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm">
                Log visit
              </button>
              <button onClick={removeProspect} disabled={removingProspect}
                className="flex-1 bg-red-50 border border-red-200 text-red-600 font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                {removingProspect ? '…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <VisitForm
          loc={formLoc}
          onClose={handleFormClose}
          onSaved={() => load()}
          closeOnSave
        />
      )}

      {/* GPS nearby banner — "you're standing at a restaurant, log it" */}
      {nearbyBanner && !showForm && !tappedProspect && (
        <div
          className="fixed z-30 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-green-600 text-white rounded-xl shadow-lg px-4 py-3 cursor-pointer"
          style={{ bottom: '88px', maxWidth: 'calc(100% - 32px)', width: '340px' }}
          onClick={() => { handleSelect(nearbyBanner); setNearbyBanner(null); }}
        >
          <span className="text-xl shrink-0">📍</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{nearbyBanner.location_name || 'Nearby restaurant'}</div>
            <div className="text-xs opacity-85">Tap to log a visit</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setNearbyBanner(null); }}
            className="text-white text-lg shrink-0" aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );
}
