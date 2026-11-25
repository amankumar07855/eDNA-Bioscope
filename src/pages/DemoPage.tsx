import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { AlertTriangle, Download, FlaskConical, Play, RotateCcw } from 'lucide-react';
import { EcoDnaLogo } from '../components/EcoDnaLogo';

interface DemoResult {
  isDemo: boolean;
  disclaimer: string;
  preprocessingStats: {
    totalSequences: number;
    validSequences: number;
    invalidSequences: number;
    filteredSequences: number;
    duplicateSequences: number;
    retainedSequences: number;
    avgLength: number;
    minLength: number;
    maxLength: number;
    meanGcPct: number;
  };
  cleanedFasta: string;
  assignments: Array<{
    id: string;
    query_sequence_id: string;
    scientific_name: string;
    common_name: string;
    phylum_name: string;
    taxonomic_rank: string;
    percentage_identity: number;
    query_coverage: number;
    e_value: number;
    confidence: string;
    reference_source: string;
  }>;
  biodiversity: {
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
  };
}

export default function DemoPage() {
  const [fastaText, setFastaText] = useState('');
  const [defaultFasta, setDefaultFasta] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [minLength, setMinLength] = useState(60);
  const [deduplicate, setDeduplicate] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/demo');
        const data = (await res.json()) as { rawFasta: string; disclaimer: string };
        setFastaText(data.rawFasta);
        setDefaultFasta(data.rawFasta);
        setDisclaimer(data.disclaimer);
      } catch {
        setError('Unable to load demonstration dataset.');
      }
    })();
  }, []);

  const runDemoAnalysis = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fasta: fastaText, minLength, deduplicate }),
      });
      if (!res.ok) throw new Error('Demonstration analysis failed');
      const data = (await res.json()) as DemoResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo error');
    } finally {
      setRunning(false);
    }
  };

  const downloadCsv = () => {
    if (!result) return;
    const header = 'QueryID,ScientificName,Phylum,Rank,IdentityPct,CoveragePct,EValue,Confidence,Source\n';
    const rows = result.assignments
      .map(
        (a) =>
          `"${a.query_sequence_id}","${a.scientific_name}","${a.phylum_name}","${a.taxonomic_rank}",${a.percentage_identity},${a.query_coverage},${a.e_value},"${a.confidence}","${a.reference_source}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ecodna_demo_simulated_report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <Link to="/">
            <EcoDnaLogo />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0">
              Public Home
            </Link>
            <Link to="/register" className="px-4 py-2 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0">
              Create Researcher Account
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-950">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Demonstration Mode — Isolated Sandbox</div>
            <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
              {disclaimer || 'Illustrative FASTA sequences and simulated local reference matches only. This sandbox never mixes with your real projects and never attributes simulated results to live NCBI or BOLD queries.'}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-emerald-700" />
                Illustrative FASTA Input
              </h1>
              <button
                type="button"
                onClick={() => setFastaText(defaultFasta)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Sample
              </button>
            </div>

            <textarea
              value={fastaText}
              onChange={(e) => setFastaText(e.target.value)}
              rows={12}
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Min Sequence Length (bp)</label>
                <input
                  type="number"
                  value={minLength}
                  onChange={(e) => setMinLength(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deduplicate}
                    onChange={(e) => setDeduplicate(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Deduplicate identical reads
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={runDemoAnalysis}
              disabled={running}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <Play className="w-4 h-4" />
              {running ? 'Running Demonstration Pipeline...' : 'Run Demo Preprocessing & Analysis'}
            </button>

            {error && <p className="text-xs text-rose-600">{error}</p>}
          </div>

          <div className="lg:col-span-7 space-y-6">
            {!result ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                <FlaskConical className="w-8 h-8 text-emerald-700 mx-auto" />
                <h2 className="text-base font-semibold text-slate-900">Ready to Test the eDNA Pipeline</h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Click &ldquo;Run Demo Preprocessing &amp; Analysis&rdquo; to inspect sequence QC statistics, simulated taxonomic matching, Shannon/Simpson indices, rarefaction curves, and CSV export.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">Species Richness</div>
                    <div className="mt-1 text-2xl font-mono font-bold text-slate-900">{result.biodiversity.species_richness}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">Shannon Index (H&apos;)</div>
                    <div className="mt-1 text-2xl font-mono font-bold text-emerald-700">{result.biodiversity.shannon_index}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">Simpson (1 - D)</div>
                    <div className="mt-1 text-2xl font-mono font-bold text-cyan-700">{result.biodiversity.simpson_diversity_1_minus_d}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">Pielou Evenness (J)</div>
                    <div className="mt-1 text-2xl font-mono font-bold text-slate-900">{result.biodiversity.pielou_evenness ?? 'N/A'}</div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Relative Read Abundance (%)</h3>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={result.biodiversity.relative_abundances}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="scientific_name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="relative_abundance" fill="#059669" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Hurlbert Rarefaction Curve</h3>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={result.biodiversity.rarefaction_curve}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="subsampleSize" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="expectedSpecies" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Simulated Taxonomic Assignments</h3>
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Demo CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2.5 px-4 font-semibold">Query ID</th>
                          <th className="py-2.5 px-4 font-semibold">Taxon</th>
                          <th className="py-2.5 px-4 font-semibold">Rank</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Identity %</th>
                          <th className="py-2.5 px-4 font-semibold">Confidence</th>
                          <th className="py-2.5 px-4 font-semibold">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.assignments.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-mono text-slate-700">{a.query_sequence_id}</td>
                            <td className="py-2.5 px-4 font-medium text-slate-900 italic">{a.scientific_name}</td>
                            <td className="py-2.5 px-4 text-slate-600">{a.taxonomic_rank}</td>
                            <td className="py-2.5 px-4 font-mono text-right">{a.percentage_identity}%</td>
                            <td className="py-2.5 px-4 font-medium">{a.confidence}</td>
                            <td className="py-2.5 px-4 text-amber-800">{a.reference_source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
