import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  Compass,
  Database,
  Dna,
  FileText,
  FolderPlus,
  Play,
  Upload,
} from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiFetch } from '../lib/api';

interface DashboardData {
  stats: {
    totalProjects: number;
    totalSamples: number;
    totalSequences: number;
    identifiedTaxa: number;
    speciesRichness: number;
    latestAnalysisStatus: string;
  };
  recentProjects: Array<{ id: string; project_name: string; study_type: string; geographic_region: string; created_at: string }>;
  recentDatasets: Array<{ id: string; file_name: string; file_format: string; sequence_count: number; upload_status: string; created_at: string }>;
  recentJobs: Array<{ id: string; job_status: string; progress: number; current_stage: string; reference_mode: string; created_at: string }>;
  recentReports: Array<{ id: string; report_name: string; format: string; created_at: string }>;
  biodiversityOverview: Array<{ sampleName: string; speciesRichness: number; shannonIndex: number; simpson1MinusD: number }>;
  taxonomicDistribution: Array<{ name: string; count: number }>;
}

const CHART_COLORS = ['#047857', '#0891b2', '#10b981', '#0284c7', '#14b8a6', '#0f766e'];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  return (
    <WorkspaceLayout title="Researcher Dashboard" subtitle="Personal eDNA telemetry, active projects, and biodiversity summaries">
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-center justify-between">
          <span className="text-sm text-rose-800">{error}</span>
          <button onClick={loadDashboard} className="px-3 py-1.5 text-xs font-semibold bg-rose-700 text-white rounded-lg">
            Retry
          </button>
        </div>
      ) : data && (
        <div className="space-y-6">
          {/* 6 KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Projects</div>
              <div className="mt-1.5 text-2xl font-mono font-bold text-slate-900">{data.stats.totalProjects}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Samples</div>
              <div className="mt-1.5 text-2xl font-mono font-bold text-slate-900">{data.stats.totalSamples}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total DNA Sequences</div>
              <div className="mt-1.5 text-2xl font-mono font-bold text-emerald-700">{data.stats.totalSequences}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Identified Taxa</div>
              <div className="mt-1.5 text-2xl font-mono font-bold text-cyan-700">{data.stats.identifiedTaxa}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Peak Richness</div>
              <div className="mt-1.5 text-2xl font-mono font-bold text-slate-900">{data.stats.speciesRichness}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Latest Analysis</div>
              <div className="mt-1.5 text-sm font-mono font-semibold text-slate-900 capitalize truncate">
                {data.stats.latestAnalysisStatus}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-mono text-slate-500 mb-3">Quick Actions</div>
            <div className="flex flex-wrap gap-3">
              <Link to="/projects" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg">
                <FolderPlus className="w-4 h-4" />
                Create New Project
              </Link>
              <Link to="/upload" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg">
                <Upload className="w-4 h-4 text-emerald-700" />
                Upload DNA Dataset
              </Link>
              <Link to="/analysis" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg">
                <Play className="w-4 h-4 text-cyan-700" />
                Start Analysis
              </Link>
              <Link to="/species" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg">
                <Compass className="w-4 h-4 text-emerald-700" />
                Explore Species
              </Link>
              <Link to="/reports" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg">
                <FileText className="w-4 h-4 text-cyan-700" />
                Generate Report
              </Link>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Biodiversity Overview (Shannon H&apos; &amp; Richness)</h2>
                <Link to="/analysis" className="text-xs font-medium text-emerald-700 hover:underline">
                  Full Metrics
                </Link>
              </div>
              {data.biodiversityOverview.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-slate-200 rounded-lg p-6">
                  <Activity className="w-6 h-6 text-slate-400" />
                  <p className="text-xs text-slate-500">No analyzed samples yet. Upload a dataset and run taxonomic identification to populate biodiversity indices.</p>
                </div>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.biodiversityOverview}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="sampleName" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="shannonIndex" name="Shannon H'" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="speciesRichness" name="Species Richness" fill="#0891b2" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Taxonomic Phylum Distribution</h2>
                <Link to="/species" className="text-xs font-medium text-emerald-700 hover:underline">
                  Species Explorer
                </Link>
              </div>
              {data.taxonomicDistribution.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-slate-200 rounded-lg p-6">
                  <Dna className="w-6 h-6 text-slate-400" />
                  <p className="text-xs text-slate-500">Taxonomic phylum proportions will appear here once sequence alignments complete.</p>
                </div>
              ) : (
                <div className="h-60 flex items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.taxonomicDistribution}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                      >
                        {data.taxonomicDistribution.map((_entry, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Lists Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Recent Projects */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Recent Projects</h2>
                <Link to="/projects" className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1 hover:underline">
                  Manage All <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {data.recentProjects.length === 0 ? (
                <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 rounded-lg">
                  <p className="text-xs text-slate-500">You have not created any research projects yet.</p>
                  <Link to="/projects" className="inline-block text-xs font-semibold text-emerald-700 hover:underline">
                    Create your first project
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.recentProjects.map((p) => (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{p.project_name}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {p.study_type} · {p.geographic_region || 'Region unspecified'}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-400 shrink-0">{p.created_at.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Uploads & Analysis History */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Recent Dataset Uploads &amp; Jobs</h2>
                <Link to="/analysis" className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1 hover:underline">
                  Analysis Queue <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {data.recentDatasets.length === 0 && data.recentJobs.length === 0 ? (
                <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 rounded-lg">
                  <Database className="w-5 h-5 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500">No FASTA/FASTQ uploads or analysis runs recorded yet.</p>
                  <Link to="/demo" className="inline-block text-xs font-semibold text-cyan-700 hover:underline">
                    Try the isolated Demo Sandbox
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.recentDatasets.map((d) => (
                    <div key={d.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate font-mono">{d.file_name}</div>
                        <div className="text-xs text-slate-500">
                          {d.file_format} · {d.sequence_count} sequences · {d.upload_status}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-400 shrink-0">{d.created_at.slice(0, 10)}</span>
                    </div>
                  ))}
                  {data.recentJobs.slice(0, 3).map((j) => (
                    <div key={j.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800 truncate">{j.current_stage}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {j.reference_mode} · {j.progress}%
                        </div>
                      </div>
                      <span className="text-xs font-mono font-semibold text-emerald-700 capitalize shrink-0">
                        {j.job_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Reports */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent Scientific Reports</h2>
              <Link to="/reports" className="text-xs font-medium text-emerald-700 hover:underline">
                Open Reports Center
              </Link>
            </div>
            {data.recentReports.length === 0 ? (
              <p className="text-xs text-slate-500">No reports generated yet. Complete an analysis to export PDF or CSV biodiversity reports.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recentReports.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-800 truncate">{r.report_name}</span>
                    <span className="text-xs font-mono text-slate-500 shrink-0">{r.format} · {r.created_at.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
}
