'use client';

import React, { useCallback, useEffect, useState } from 'react';
import FieldMap, { MapLocation } from './FieldMap';
import VisitForm, { VisitFormLoc } from '../VisitForm';

export default function FieldMapPage() {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLoc, setFormLoc] = useState<VisitFormLoc | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/field/locations');
      const json = await res.json();
      if (json.success) setLocations(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (loc: Partial<MapLocation>) => {
    setFormLoc(loc as VisitFormLoc);
    setShowForm(true);
  };

  return (
    <div className="relative w-full h-full">
      {loading && locations.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <FieldMap locations={locations} onSelect={handleSelect} />
      )}

      {showForm && (
        <VisitForm
          loc={formLoc}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
