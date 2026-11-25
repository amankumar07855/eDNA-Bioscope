import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiFetch } from '../lib/api';

interface SpeciesEntry {
  scientificName: string;
  commonName: string;
  domain: string;
  kingdom: string;
  phylum: string;
  className: string;
  orderName: string;
  familyName: string;
  genusName: string;
  speciesName: string;
  taxonomyId: string;
  taxonomicRank: string;
  confidence: string;
  referenceSource: string;
  conservationStatus: string | null;
  invasiveStatus: string | null;
  maxIdentity: number;
  detections: Array<{
    sampleId: string;
    sampleName: string;
    sampleType: string;
    readCount: number;
    relativeAbundance: number;
  }>;
}

export default function SpeciesExplorerPage() {
  const [species, setSpecies] = useState<SpeciesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [rankFilter, setRankFilter] = useState('All');
  const [confidenceFilter, setConfidenceFilter] = useState('All');
  const [sampleFilter, setSampleFilter] = useState('All');

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ species: SpeciesEntry[] }>('/api/species');
        setSpecies(res.species);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allSamples = useMemo(() => {
    const set = new Set<string>();
    for (const sp of species) {
      for (const d of sp.detections) set.add(d.sampleName);
    }
    return Array.from(set);
  }, [species]);

  const filtered = useMemo(() => {
    return species.filter((sp) => {
      const q = query.toLowerCase().trim();
      if (
        q &&
        !sp.scientificName.toLowerCase().includes(q) &&
        !sp.commonName.toLowerCase().includes(q) &&
        !sp.phylum.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (rankFilter !== 'All' && sp.taxonomicRank !== rankFilter) return false;
      if (confidenceFilter !== 'All' && sp.confidence !== confidenceFilter) return false;
      if (sampleFilter !== 'All' && !sp.detections.some((d) => d.sampleName === sampleFilter)) return false;
      return true;
    });
  }, [species, query, rankFilter, confidenceFilter, sampleFilter]);

  return (
    <WorkspaceLayout title="Species Explorer" subtitle="Searchable taxonomic database compiled from your verified eDNA sequence identifications">
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid sm:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scientific or common name..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <select
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Taxonomic Ranks</option>
            <option value="Species">Species</option>
            <option value="Genus">Genus</option>
            <option value="Family">Family</option>
            <option value="Order">Order</option>
          </select>
          <select
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Confidence Levels</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
          <select
            value={sampleFilter}
            onChange={(e) => setSampleFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Environmental Samples</option>
            {allSamples.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
            <h2 className="text-base font-semibold text-slate-900">No Matching Taxa Found</h2>
            <p className="text-xs text-slate-500">
              {species.length === 0
                ? 'Analyze an uploaded eDNA sample to populate your verified species directory.'
                : 'Adjust your search filters to view detected organisms.'}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map((sp) => (
              <div key={sp.scientificName} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-display font-bold text-slate-900 italic">{sp.scientificName}</h3>
                    <div className="text-xs text-slate-600">
                      {sp.commonName ? `${sp.commonName} · ` : ''}
                      TaxID {sp.taxonomyId} · Rank: {sp.taxonomicRank}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-emerald-700">{sp.maxIdentity}% ID</div>
                    <div className="text-[11px] text-slate-500">{sp.confidence} Confidence</div>
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
                  <span className="font-semibold text-slate-700">Lineage: </span>
                  {[sp.kingdom, sp.phylum, sp.className, sp.orderName, sp.familyName, sp.genusName]
                    .filter(Boolean)
                    .join(' → ')}
                </div>

                {(sp.conservationStatus || sp.invasiveStatus) && (
                  <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
                    {sp.conservationStatus && <div>Conservation: {sp.conservationStatus}</div>}
                    {sp.invasiveStatus && <div>Ecological Flag: {sp.invasiveStatus}</div>}
                  </div>
                )}

                <div className="text-xs space-y-1">
                  <div className="font-semibold text-slate-700">Sample Detections &amp; Relative Read Abundance</div>
                  {sp.detections.map((d) => (
                    <div key={d.sampleId} className="flex items-center justify-between text-slate-600">
                      <span>{d.sampleName} ({d.sampleType})</span>
                      <span className="font-mono">{d.readCount} reads · {d.relativeAbundance}%</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                  Reference Source: {sp.referenceSource}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
