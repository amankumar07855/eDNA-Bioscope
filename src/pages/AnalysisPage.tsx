import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info, Loader2, Play, RefreshCw } from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiFetch } from '../lib/api';

interface SampleItem {
  id: string;
  sample_name: string;
  sample_type: string;
  marker: string;
}

interface DatasetItem {
  id: string;
  sample_id: string;
  file_name: string;
  sequence_count: number;
}

interface JobItem {
  id: string;
  sample_id: string;
  dataset_id: string | null;
  reference_mode: string;
  job_status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_stage: string;
  error_message: string | null;
  created_at: string;
}

interface TaxonAssignment {
  id: string;
  sample_id: string;
  query_sequence_id: string;
  reference_id: string;
  scientific_name: string;
  taxonomy_id: string;
  taxonomic_rank: string;
  domain_name: string;
  kingdom_name: string;
  phylum_name: string;
  class_name: string;
  order_name: string;
  family_name: string;
  genus_name: string;
  species_name: string;
  percentage_identity: number;
  query_coverage: number;
  e_value: number;
  alignment_score: number;
  confidence: string;
  reference_source: string;
}

interface BioResult {
  id: string;
  sample_id: string;
  species_richness: number;
  total_reads: number;
  shannon_index: number;
  simpson_index: number;
  simpson_diversity_1_minus_d: number;
  pielou_evenness: number | null;
  relative_abundances: Array<{
    scientific_name: string;
    read_count: number;
    relative_abundance: number;
  }>;
  rarefaction_curve: Array<{ subsampleSize: number; expectedSpecies: number }>;
}

interface BetaCompare {
  samplesCount: number;
  pairs: Array<{
    sampleAName: string;
    sampleBName: string;
    brayCurtisDissimilarity: number;
    jaccardSimilarity: number;
    sharedTaxaCount: number;
  }>;
  accumulationCurve: Array<{ samplesIncluded: number; cumulativeTaxa: number; sampleName: string }>;
}

export default function AnalysisPage() {
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [taxa, setTaxa] = useState<TaxonAssignment[]>([]);
  const [biodiversity, setBiodiversity] = useState<BioResult[]>([]);
  const [betaData, setBetaData] = useState<BetaCompare | null>(null);

  const [selectedSampleId, setSelectedSampleId] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [referenceMode, setReferenceMode] = useState<'local_ref' | 'ncbi_blast' | 'bold_systems'>('local_ref');
  const [launching, setLaunching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [sRes, dRes, jRes, rRes, bRes] = await Promise.all([
        apiFetch<{ samples: SampleItem[] }>('/api/samples'),
        apiFetch<{ datasets: DatasetItem[] }>('/api/datasets'),
        apiFetch<{ jobs: JobItem[] }>('/api/analysis/jobs'),
        apiFetch<{ taxa: TaxonAssignment[]; biodiversity: BioResult[] }>('/api/analysis/results'),
        apiFetch<BetaCompare>('/api/biodiversity/compare'),
      ]);
      setSamples(sRes.samples);
      setDatasets(dRes.datasets);
      setJobs(jRes.jobs);
      setTaxa(rRes.taxa);
      setBiodiversity(rRes.biodiversity);
      setBetaData(bRes);

      if (!selectedSampleId && sRes.samples.length > 0) {
        const firstSid = sRes.samples[0].id;
        setSelectedSampleId(firstSid);
        const matchingDs = dRes.datasets.find((d) => d.sample_id === firstSid);
        if (matchingDs) setSelectedDatasetId(matchingDs.id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load analysis state');
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  // Poll active jobs
  useEffect(() => {
    const hasActive = jobs.some((j) => j.job_status === 'pending' || j.job_status === 'processing');
    if (!hasActive) return;
    const timer = setInterval(() => {
      void loadAll();
    }, 2000);
    return () => clearInterval(timer);
  }, [jobs]);

  const sampleDatasets = datasets.filter((d) => d.sample_id === selectedSampleId);

  const handleStartAnalysis = async () => {
    if (!selectedSampleId || !selectedDatasetId) {
      setErrorMsg('Select both a sample and an uploaded dataset to analyze.');
      return;
    }
    setLaunching(true);
    setErrorMsg(null);
    try {
      await apiFetch('/api/analysis/start', {
        method: 'POST',
        body: JSON.stringify({
          sampleId: selectedSampleId,
          datasetId: selectedDatasetId,
          referenceMode,
        }),
      });
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to start analysis job');
    } finally {
      setLaunching(false);
    }
  };

  const activeBio = biodiversity.find((b) => b.sample_id === selectedSampleId) ?? biodiversity[0] ?? null;
  const activeTaxa = taxa.filter((t) => !selectedSampleId || t.sample_id === selectedSampleId);

  return (
    <WorkspaceLayout
      title="Taxonomic Identification & Biodiversity Engine"
      subtitle="Run reference alignments (NCBI BLAST, BOLD Systems, Curated Local DB) and compute ecological indices"
    >
      <div className="space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">{errorMsg}</div>
        )}

        {/* Job Launcher */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Launch Asynchronous eDNA Analysis Job</h2>
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Status
            </button>
          </div>

          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sample</label>
              <select
                value={selectedSampleId}
                onChange={(e) => {
                  const sid = e.target.value;
                  setSelectedSampleId(sid);
                  const firstDs = datasets.find((d) => d.sample_id === sid);
                  setSelectedDatasetId(firstDs?.id ?? '');
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sample_name} ({s.marker})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Dataset</label>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {sampleDatasets.length === 0 ? (
                  <option value="">No datasets for sample</option>
                ) : (
                  sampleDatasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.file_name} ({d.sequence_count} reads)
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reference Database</label>
              <select
                value={referenceMode}
                onChange={(e) => setReferenceMode(e.target.value as 'local_ref' | 'ncbi_blast' | 'bold_systems')}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="local_ref">Curated Local Marker RefSeq DB</option>
                <option value="ncbi_blast">Live NCBI BLAST (nt) + NCBI Taxonomy</option>
                <option value="bold_systems">BOLD Systems COI Engine</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={launching || !selectedDatasetId}
                className="w-full py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {launching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Start Analysis
              </button>
            </div>
          </div>

          {/* Active & Recent Jobs */}
          {jobs.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-xs font-semibold text-slate-700">Analysis Job Queue</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {jobs.slice(0, 6).map((j) => (
                  <div key={j.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-900 capitalize">{j.job_status}</span>
                      <span className="font-mono text-emerald-700">{j.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          j.job_status === 'failed' ? 'bg-rose-600' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${j.progress}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">{j.error_message || j.current_stage}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scientific Caveat */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-start gap-3 text-xs text-cyan-950">
          <Info className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
          <span>
            <strong>Ecological Methodology Note:</strong> eDNA sequencing read counts reflect relative amplicon read abundance and are influenced by PCR primer affinity, mitochondrial copy-number variation, and DNA degradation; therefore, relative read abundance is not directly equivalent to actual organism abundance or biomass.
          </span>
        </div>

        {/* Alpha Diversity Metrics */}
        {activeBio && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Species Richness (S)</div>
                <div className="mt-1 text-2xl font-mono font-bold text-slate-900">{activeBio.species_richness}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Shannon H&apos; = -Σ(pi ln pi)</div>
                <div className="mt-1 text-2xl font-mono font-bold text-emerald-700">{activeBio.shannon_index}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Simpson Dominance (D)</div>
                <div className="mt-1 text-2xl font-mono font-bold text-slate-900">{activeBio.simpson_index}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Simpson Diversity (1 - D)</div>
                <div className="mt-1 text-2xl font-mono font-bold text-cyan-700">{activeBio.simpson_diversity_1_minus_d}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Pielou Evenness (J)</div>
                <div className="mt-1 text-2xl font-mono font-bold text-slate-900">
                  {activeBio.pielou_evenness !== null ? activeBio.pielou_evenness : 'N/A (S≤1)'}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Relative Read Abundance (%)</h3>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activeBio.relative_abundances}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="scientific_name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="relative_abundance" name="Relative Abundance %" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Hurlbert Rarefaction Curve</h3>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeBio.rarefaction_curve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="subsampleSize" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="expectedSpecies" name="Expected Taxa E[S]" stroke="#0891b2" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Beta Diversity & Accumulation */}
        {betaData && betaData.samplesCount >= 2 && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Beta Diversity Pairwise Comparison</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Sample Pair</th>
                      <th className="py-2 px-3 text-right">Bray-Curtis</th>
                      <th className="py-2 px-3 text-right">Jaccard</th>
                      <th className="py-2 px-3 text-right">Shared Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {betaData.pairs.map((p, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {p.sampleAName} vs {p.sampleBName}
                        </td>
                        <td className="py-2 px-3 font-mono text-right">{p.brayCurtisDissimilarity}</td>
                        <td className="py-2 px-3 font-mono text-right">{p.jaccardSimilarity}</td>
                        <td className="py-2 px-3 font-mono text-right">{p.sharedTaxaCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Species Accumulation Curve Across Samples</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={betaData.accumulationCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="samplesIncluded" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="cumulativeTaxa" name="Cumulative Taxa" stroke="#047857" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Full Taxonomic Assignments Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Taxonomic Identification Results ({activeTaxa.length} alignments)
            </h2>
          </div>
          {activeTaxa.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No taxonomic identifications recorded for this selection yet. Start an analysis job above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Query ID</th>
                    <th className="py-2.5 px-3 font-semibold">Scientific Name</th>
                    <th className="py-2.5 px-3 font-semibold">Taxonomy Lineage (Domain → Family)</th>
                    <th className="py-2.5 px-3 font-semibold">TaxID / RefID</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Identity</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Cov</th>
                    <th className="py-2.5 px-3 font-semibold text-right">E-value</th>
                    <th className="py-2.5 px-3 font-semibold">Confidence</th>
                    <th className="py-2.5 px-3 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTaxa.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-slate-700">{t.query_sequence_id}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 italic">
                        {t.scientific_name}
                        <span className="block not-italic text-[11px] font-normal text-slate-500">Rank: {t.taxonomic_rank}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                        {[t.domain_name, t.kingdom_name, t.phylum_name, t.class_name, t.order_name, t.family_name]
                          .filter(Boolean)
                          .join(' › ') || 'Unclassified'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {t.taxonomy_id} · {t.reference_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right">{t.percentage_identity}%</td>
                      <td className="py-2.5 px-3 font-mono text-right">{t.query_coverage}%</td>
                      <td className="py-2.5 px-3 font-mono text-right">{t.e_value}</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-700">{t.confidence}</td>
                      <td className="py-2.5 px-3 text-slate-600">{t.reference_source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
