import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Save } from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiFetch } from '../lib/api';

interface MapSample {
  id: string;
  sample_name: string;
  sample_type: string;
  collection_location: string;
  latitude: number | null;
  longitude: number | null;
  marker: string;
  biodiversity: {
    species_richness: number;
    shannon_index: number;
    relative_abundances: Array<{ scientific_name: string; relative_abundance: number }>;
  } | null;
}

export default function BiodiversityMapPage() {
  const [samples, setSamples] = useState<MapSample[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState('All');
  const [editingSampleId, setEditingSampleId] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const loadSamples = async () => {
    const res = await apiFetch<{ samples: MapSample[] }>('/api/samples');
    setSamples(res.samples);
    if (!editingSampleId && res.samples.length > 0) {
      setEditingSampleId(res.samples[0].id);
    }
  };

  useEffect(() => {
    void loadSamples();
  }, []);

  const allSpecies = Array.from(
    new Set(
      samples.flatMap((s) => s.biodiversity?.relative_abundances.map((r) => r.scientific_name) ?? [])
    )
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const mapped = samples.filter((s) => {
      if (s.latitude === null || s.longitude === null) return false;
      if (selectedSpecies === 'All') return true;
      return s.biodiversity?.relative_abundances.some((r) => r.scientific_name === selectedSpecies);
    });

    const bounds: L.LatLngTuple[] = [];
    for (const s of mapped) {
      const lat = s.latitude as number;
      const lng = s.longitude as number;
      bounds.push([lat, lng]);
      const richness = s.biodiversity?.species_richness ?? 0;
      const shannon = s.biodiversity?.shannon_index ?? 0;

      const circle = L.circleMarker([lat, lng], {
        radius: Math.max(8, Math.min(20, 8 + richness * 2)),
        color: '#047857',
        fillColor: '#06b6d4',
        fillOpacity: 0.75,
        weight: 2,
      });

      circle.bindPopup(
        `<div style="font-size:12px;line-height:1.4">
          <strong>${s.sample_name}</strong><br/>
          Source: ${s.sample_type} (${s.marker})<br/>
          Species Richness: ${richness}<br/>
          Shannon H': ${shannon}<br/>
          Coords: ${lat.toFixed(4)}, ${lng.toFixed(4)}
        </div>`
      );
      circle.addTo(group);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
    }
  }, [samples, selectedSpecies]);

  const handleSaveCoords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSampleId) return;
    setSaveMsg(null);
    await apiFetch(`/api/samples/${editingSampleId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        latitude: Number(latInput),
        longitude: Number(lngInput),
      }),
    });
    setSaveMsg('Sample coordinates updated.');
    await loadSamples();
  };

  return (
    <WorkspaceLayout
      title="Geographic Biodiversity Map"
      subtitle="Plot verified GPS sample coordinates and inspect spatial richness and Shannon diversity"
    >
      <div className="space-y-6">
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Filter Organism Distribution</h2>
              <select
                value={selectedSpecies}
                onChange={(e) => setSelectedSpecies(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="All">All Mapped Samples</option>
                {allSpecies.map((sp) => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Only samples with user-entered GPS coordinates are plotted. Coordinates are never fabricated.
              </p>
            </div>

            <form onSubmit={handleSaveCoords} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-700" />
                Assign Sample Coordinates
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sample</label>
                <select
                  value={editingSampleId}
                  onChange={(e) => setEditingSampleId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {samples.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sample_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    placeholder="30.4512"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={lngInput}
                    onChange={(e) => setLngInput(e.target.value)}
                    placeholder="78.0814"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!editingSampleId}
                className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                Save Coordinates
              </button>
              {saveMsg && <p className="text-xs text-emerald-700">{saveMsg}</p>}
            </form>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div ref={mapContainerRef} className="w-full h-[460px]" />
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
