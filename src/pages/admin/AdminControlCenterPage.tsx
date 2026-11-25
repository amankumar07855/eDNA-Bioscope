import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  Database,
  FileSearch,
  LogOut,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { EcoDnaLogo } from '../../components/EcoDnaLogo';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';

type AdminTab = 'overview' | 'users' | 'datasets' | 'jobs' | 'science' | 'settings' | 'audit';

interface OverviewResponse {
  metrics: {
    totalUsers: number;
    activeUsers: number;
    totalProjects: number;
    totalDatasets: number;
    totalSequencesProcessed: number;
    completedJobs: number;
    failedJobs: number;
    totalIdentifiedTaxa: number;
  };
  services: {
    firebase: string;
    supabase: string;
    gemini: string;
    ncbiBlast: string;
  };
}

interface AdminUser {
  firebase_uid: string;
  full_name: string;
  email: string;
  country: string;
  user_category: string;
  role: 'user' | 'admin';
  account_status: 'active' | 'disabled';
  created_at: string;
}

interface AdminDataset {
  id: string;
  file_name: string;
  file_format: string;
  file_size: number;
  sequence_count: number;
  upload_status: string;
  ownerEmail: string;
  projectName: string;
  created_at: string;
}

interface AdminJob {
  id: string;
  owner_uid: string;
  reference_mode: string;
  job_status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_stage: string;
  error_message: string | null;
  created_at: string;
}

interface ScienceOverview {
  totalAssignments: number;
  totalBiodiversityRuns: number;
  meanShannonIndex: number;
  topTaxa: Array<{ scientificName: string; count: number }>;
}

interface AdminSettings {
  config: {
    maxUploadSizeMb: number;
    defaultMinQuality: number;
    defaultMinLength: number;
    enableLiveNcbiBlast: boolean;
    enableBoldSystems: boolean;
    maintenanceMode: boolean;
  };
  statuses: Record<string, string>;
}

interface AuditLogItem {
  id: string;
  actor_email: string;
  action: string;
  target_id: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export default function AdminControlCenterPage() {
  const { serverProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [datasets, setDatasets] = useState<AdminDataset[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [science, setScience] = useState<ScienceOverview | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);

  const loadAllAdminData = async (search = userSearch) => {
    setErrorMsg(null);
    try {
      const [ov, us, ds, jb, sc, st, lg] = await Promise.all([
        apiFetch<OverviewResponse>('/api/admin/overview'),
        apiFetch<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(search)}`),
        apiFetch<{ datasets: AdminDataset[] }>('/api/admin/datasets'),
        apiFetch<{ jobs: AdminJob[] }>('/api/admin/jobs'),
        apiFetch<ScienceOverview>('/api/admin/science-overview'),
        apiFetch<AdminSettings>('/api/admin/settings'),
        apiFetch<{ logs: AuditLogItem[] }>('/api/admin/audit-logs'),
      ]);
      setOverview(ov);
      setUsers(us.users);
      setDatasets(ds.datasets);
      setJobs(jb.jobs);
      setScience(sc);
      setSettings(st);
      setLogs(lg.logs);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load administrator telemetry');
    }
  };

  useEffect(() => {
    void loadAllAdminData('');
  }, []);

  const handleToggleUserStatus = async (u: AdminUser) => {
    const next = u.account_status === 'active' ? 'disabled' : 'active';
    await apiFetch(`/api/admin/users/${u.firebase_uid}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    setNotice(`Account ${u.email} marked ${next}.`);
    await loadAllAdminData();
  };

  const handleToggleRole = async (u: AdminUser) => {
    const next = u.role === 'admin' ? 'user' : 'admin';
    await apiFetch(`/api/admin/users/${u.firebase_uid}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: next }),
    });
    setNotice(`Updated role for ${u.email} to ${next}.`);
    await loadAllAdminData();
  };

  const handleDeleteUser = async (u: AdminUser) => {
    await apiFetch(`/api/admin/users/${u.firebase_uid}`, { method: 'DELETE' });
    setNotice(`Deleted researcher account ${u.email}.`);
    await loadAllAdminData();
  };

  const handleDeleteDataset = async (id: string) => {
    await apiFetch(`/api/admin/datasets/${id}`, { method: 'DELETE' });
    setNotice('Dataset removed per policy and audit logged.');
    await loadAllAdminData();
  };

  const handleRetryJob = async (id: string) => {
    await apiFetch(`/api/admin/jobs/${id}/retry`, { method: 'POST' });
    setNotice('Analysis job queued for retry.');
    await loadAllAdminData();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings.config),
    });
    setNotice('System configuration saved and audit logged.');
    await loadAllAdminData();
  };

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: Shield },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'datasets', label: 'Datasets', icon: Database },
    { id: 'jobs', label: 'Analysis Jobs', icon: Activity },
    { id: 'science', label: 'Scientific Stats', icon: FileSearch },
    { id: 'settings', label: 'System Settings', icon: Settings },
    { id: 'audit', label: 'Audit Logs', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-[#07111a] text-slate-100 flex flex-col">
      <header className="h-16 bg-[#0b1824] border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <EcoDnaLogo dark />
          <span className="text-xs font-mono text-cyan-400 hidden sm:inline">
            Control Center · Server-Verified Admin
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400 hidden md:inline">{serverProfile?.email}</span>
          <button
            type="button"
            onClick={() => loadAllAdminData()}
            className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/control-center/login');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-700 rounded-lg hover:bg-slate-800"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <div className="border-b border-slate-800 bg-[#091520] px-4 sm:px-6 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex gap-1 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  tab === t.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-950/70 border border-rose-800 text-xs text-rose-200">{errorMsg}</div>
        )}
        {notice && (
          <div className="p-3.5 rounded-lg bg-emerald-950/70 border border-emerald-700 text-xs text-emerald-200">{notice}</div>
        )}

        {/* A. Overview */}
        {tab === 'overview' && overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                ['Registered Users', overview.metrics.totalUsers],
                ['Active Users', overview.metrics.activeUsers],
                ['Total Projects', overview.metrics.totalProjects],
                ['Uploaded Datasets', overview.metrics.totalDatasets],
                ['Sequences Processed', overview.metrics.totalSequencesProcessed],
                ['Completed Analyses', overview.metrics.completedJobs],
                ['Failed Analysis Jobs', overview.metrics.failedJobs],
                ['Identified Taxa', overview.metrics.totalIdentifiedTaxa],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-[#0d1b28] border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="mt-1.5 text-2xl font-mono font-bold text-white">{val}</div>
                </div>
              ))}
            </div>

            <div className="bg-[#0d1b28] border border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Connected Platform Services</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                {Object.entries(overview.services).map(([k, v]) => (
                  <div key={k} className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                    <div className="text-slate-400 capitalize">{k}</div>
                    <div className="mt-1 font-mono text-cyan-300">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* B. User Management */}
        {tab === 'users' && (
          <div className="bg-[#0d1b28] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Registered Users ({users.length})</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name or email..."
                  className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
                <button
                  type="button"
                  onClick={() => loadAllAdminData(userSearch)}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-lg"
                >
                  Search
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Name &amp; Email</th>
                    <th className="py-2.5 px-4">Category / Country</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Created</th>
                    <th className="py-2.5 px-4 text-right">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {users.map((u) => (
                    <tr key={u.firebase_uid} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-white">{u.full_name}</div>
                        <div className="font-mono text-[11px] text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">
                        {u.user_category} · {u.country}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">{u.role}</td>
                      <td className="py-2.5 px-4 font-mono text-emerald-400">{u.account_status}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">{u.created_at.slice(0, 10)}</td>
                      <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u)}
                          className="px-2.5 py-1 border border-slate-700 rounded hover:bg-slate-800"
                        >
                          {u.account_status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRole(u)}
                          className="px-2.5 py-1 border border-slate-700 rounded hover:bg-slate-800"
                        >
                          {u.role === 'admin' ? 'Revoke Admin' : 'Grant Admin'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="px-2 py-1 text-rose-400 hover:text-rose-300"
                          title="Delete account"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* C. Dataset Management */}
        {tab === 'datasets' && (
          <div className="bg-[#0d1b28] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white">All Platform Datasets ({datasets.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">File</th>
                    <th className="py-2.5 px-4">Owner</th>
                    <th className="py-2.5 px-4">Format / Reads</th>
                    <th className="py-2.5 px-4">Size</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Policy Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {datasets.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2.5 px-4 font-mono text-white">{d.file_name}</td>
                      <td className="py-2.5 px-4 text-slate-300">{d.ownerEmail}</td>
                      <td className="py-2.5 px-4 font-mono">{d.file_format} · {d.sequence_count}</td>
                      <td className="py-2.5 px-4 font-mono">{(d.file_size / 1024).toFixed(1)} KB</td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">{d.upload_status}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteDataset(d.id)}
                          className="text-rose-400 hover:text-rose-300 text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* D. Analysis Monitoring */}
        {tab === 'jobs' && (
          <div className="bg-[#0d1b28] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white">Analysis Job Monitoring ({jobs.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Job ID</th>
                    <th className="py-2.5 px-4">Reference</th>
                    <th className="py-2.5 px-4">Status / Progress</th>
                    <th className="py-2.5 px-4">Stage / Error</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="py-2.5 px-4 font-mono text-slate-300">{j.id.slice(0, 8)}</td>
                      <td className="py-2.5 px-4 font-mono">{j.reference_mode}</td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">
                        {j.job_status} ({j.progress}%)
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{j.error_message || j.current_stage}</td>
                      <td className="py-2.5 px-4 text-right">
                        {j.job_status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => handleRetryJob(j.id)}
                            className="px-2.5 py-1 bg-emerald-700 text-white rounded text-xs"
                          >
                            Retry Job
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* E. Scientific Data Overview */}
        {tab === 'science' && science && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-[#0d1b28] border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Total Taxonomic Assignments</div>
                <div className="mt-1 text-2xl font-mono font-bold text-white">{science.totalAssignments}</div>
              </div>
              <div className="bg-[#0d1b28] border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Biodiversity Assessments</div>
                <div className="mt-1 text-2xl font-mono font-bold text-white">{science.totalBiodiversityRuns}</div>
              </div>
              <div className="bg-[#0d1b28] border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Mean Shannon Index (H&apos;)</div>
                <div className="mt-1 text-2xl font-mono font-bold text-cyan-400">{science.meanShannonIndex}</div>
              </div>
            </div>

            <div className="bg-[#0d1b28] border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Most Frequently Detected Taxa</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={science.topTaxa}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="scientificName" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* F. System Settings */}
        {tab === 'settings' && settings && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-[#0d1b28] border border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Infrastructure Connection Status</h2>
              <div className="space-y-2 text-xs">
                {Object.entries(settings.statuses).map(([k, v]) => (
                  <div key={k} className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex justify-between gap-4">
                    <span className="text-slate-400 capitalize">{k}</span>
                    <span className="font-mono text-emerald-400 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="bg-[#0d1b28] border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Processing Configuration</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Max Upload (MB)</label>
                  <input
                    type="number"
                    value={settings.config.maxUploadSizeMb}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        config: { ...settings.config, maxUploadSizeMb: Number(e.target.value) },
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Default Min Phred</label>
                  <input
                    type="number"
                    value={settings.config.defaultMinQuality}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        config: { ...settings.config, defaultMinQuality: Number(e.target.value) },
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Default Min Len (bp)</label>
                  <input
                    type="number"
                    value={settings.config.defaultMinLength}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        config: { ...settings.config, defaultMinLength: Number(e.target.value) },
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.config.enableLiveNcbiBlast}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        config: { ...settings.config, enableLiveNcbiBlast: e.target.checked },
                      })
                    }
                  />
                  Enable Live NCBI BLAST Integration
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.config.enableBoldSystems}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        config: { ...settings.config, enableBoldSystems: e.target.checked },
                      })
                    }
                  />
                  Enable BOLD Systems COI Engine
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.config.maintenanceMode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        config: { ...settings.config, maintenanceMode: e.target.checked },
                      })
                    }
                  />
                  Platform Maintenance Mode
                </label>
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
              >
                Save Configuration
              </button>
            </form>
          </div>
        )}

        {/* G. Audit Logs */}
        {tab === 'audit' && (
          <div className="bg-[#0d1b28] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white">Immutable Administrative Audit Logs ({logs.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Target</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-4 font-mono text-slate-400">{l.timestamp}</td>
                      <td className="py-2.5 px-4 font-mono text-white">{l.actor_email}</td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">{l.action}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">{l.target_id}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400 truncate max-w-xs">
                        {JSON.stringify(l.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
