import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, FileText, Loader2 } from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiDownload, apiFetch } from '../lib/api';

interface ProjectOption {
  id: string;
  project_name: string;
}

interface ReportItem {
  id: string;
  project_id: string;
  report_name: string;
  format: 'PDF' | 'CSV' | 'JSON';
  summary_text: string;
  created_at: string;
}

interface GeneratedReportPayload {
  generatedAt: string;
  project: {
    project_name: string;
    study_type: string;
    geographic_region: string;
    research_objective: string;
  };
  samples: Array<{
    sample_name: string;
    sample_type: string;
    marker: string;
    collection_location: string;
    collection_date: string;
  }>;
  biodiversityMetrics: Array<{
    species_richness: number;
    total_reads: number;
    shannon_index: number;
    simpson_diversity_1_minus_d: number;
    pielou_evenness: number | null;
  }>;
  taxonomicAssignments: Array<{
    query_sequence_id: string;
    scientific_name: string;
    taxonomic_rank: string;
    percentage_identity: number;
    confidence: string;
    reference_source: string;
  }>;
  interpretation: string;
  limitations: string[];
}

export default function ReportsPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [format, setFormat] = useState<'PDF' | 'CSV' | 'JSON'>('PDF');
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    const [pRes, rRes] = await Promise.all([
      apiFetch<{ projects: ProjectOption[] }>('/api/projects'),
      apiFetch<{ reports: ReportItem[] }>('/api/reports'),
    ]);
    setProjects(pRes.projects);
    setReports(rRes.reports);
    if (!selectedProjectId && pRes.projects.length > 0) {
      setSelectedProjectId(pRes.projects[0].id);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const exportPdfFromPayload = (payload: GeneratedReportPayload) => {
    const doc = new jsPDF();
    let y = 18;
    doc.setFontSize(16);
    doc.text('EcoDNA AI — Environmental DNA Biodiversity Report', 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Project: ${payload.project.project_name}`, 14, y);
    y += 6;
    doc.text(`Region: ${payload.project.geographic_region || 'N/A'} | Study: ${payload.project.study_type}`, 14, y);
    y += 6;
    doc.text(`Generated: ${payload.generatedAt.slice(0, 19).replace('T', ' ')} UTC`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text('1. Samples & Biodiversity Summary', 14, y);
    y += 7;
    doc.setFontSize(9);
    payload.biodiversityMetrics.forEach((b, idx) => {
      const sName = payload.samples[idx]?.sample_name ?? `Sample ${idx + 1}`;
      doc.text(
        `${sName}: Richness S=${b.species_richness}, Shannon H'=${b.shannon_index}, Simpson (1-D)=${b.simpson_diversity_1_minus_d}, Pielou J=${b.pielou_evenness ?? 'N/A'}`,
        14,
        y
      );
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = 18;
      }
    });

    y += 4;
    doc.setFontSize(12);
    doc.text('2. Scientific Interpretation', 14, y);
    y += 7;
    doc.setFontSize(9);
    const interpLines = doc.splitTextToSize(payload.interpretation || 'No interpretation recorded.', 180);
    doc.text(interpLines, 14, y);
    y += interpLines.length * 4.5 + 6;

    if (y > 250) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(12);
    doc.text('3. Top Taxonomic Assignments', 14, y);
    y += 7;
    doc.setFontSize(8.5);
    payload.taxonomicAssignments.slice(0, 25).forEach((t) => {
      doc.text(
        `${t.query_sequence_id} | ${t.scientific_name} (${t.taxonomic_rank}) | ${t.percentage_identity}% | ${t.confidence} | ${t.reference_source}`,
        14,
        y
      );
      y += 5;
      if (y > 275) {
        doc.addPage();
        y = 18;
      }
    });

    y += 5;
    doc.setFontSize(10);
    doc.text('Methodological Limitations:', 14, y);
    y += 6;
    doc.setFontSize(8.5);
    payload.limitations.forEach((lim) => {
      const lines = doc.splitTextToSize(`- ${lim}`, 180);
      doc.text(lines, 14, y);
      y += lines.length * 4.5;
    });

    doc.save(`ecodna_report_${payload.project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  const handleGenerate = async () => {
    if (!selectedProjectId) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ report: ReportItem; reportData: GeneratedReportPayload }>('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ projectId: selectedProjectId, format }),
      });
      if (format === 'PDF') {
        exportPdfFromPayload(res.reportData);
      } else {
        await apiDownload(
          `/api/reports/${res.report.id}/download`,
          `ecodna_report.${format.toLowerCase()}`
        );
      }
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <WorkspaceLayout title="Scientific Report Generation" subtitle="Export PDF, CSV taxonomic tables, and JSON biodiversity dossiers">
      <div className="space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">{errorMsg}</div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Generate New Biodiversity Report</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Research Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {projects.length === 0 ? (
                  <option value="">No projects created yet</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.project_name}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Export Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'PDF' | 'CSV' | 'JSON')}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="PDF">PDF Full Scientific Report</option>
                <option value="CSV">CSV Taxonomic Assignment Table</option>
                <option value="JSON">JSON Complete Project Data</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !selectedProjectId}
                className="w-full py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {generating ? 'Generating Report...' : 'Generate & Download'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Saved Reports Archive ({reports.length})</h2>
          </div>
          {reports.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No reports generated yet. Select a project above to compile your first report.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reports.map((r) => (
                <div key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="text-sm font-semibold text-slate-900">{r.report_name}</div>
                    <div className="text-xs font-mono text-slate-500">
                      Format: {r.format} · Created {r.created_at.slice(0, 10)}
                    </div>
                    {r.summary_text && (
                      <p className="text-xs text-slate-600 line-clamp-2">{r.summary_text}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      apiDownload(
                        `/api/reports/${r.id}/download`,
                        `ecodna_report_${r.id.slice(0, 8)}.${r.format === 'CSV' ? 'csv' : 'json'}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Data
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
