import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  Play,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiDownload, apiFetch } from '../lib/api';

interface SampleOption {
  id: string;
  project_id: string;
  sample_code: string;
  sample_name: string;
  sample_type: string;
  marker: string;
}

interface DatasetItem {
  id: string;
  sample_id: string;
  file_name: string;
  file_format: string;
  file_size: number;
  sequence_count: number;
  malformed_count: number;
  malformed_details: Array<{ lineOrIndex: number; sequenceId: string; reason: string }>;
  avg_length: number;
  min_length: number;
  max_length: number;
  upload_status: string;
  cleaned_storage_path: string | null;
  preprocessing_stats: {
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
    meanQuality: number | null;
    processedAt: string;
  } | null;
  created_at: string;
}

export default function UploadAndPreprocessPage() {
  const [samples, setSamples] = useState<SampleOption[]>([]);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [qcParams, setQcParams] = useState({
    minLength: 80,
    maxLength: 5000,
    minMeanQuality: 20,
    maxAmbiguousPct: 5,
    deduplicate: true,
  });
  const [preprocessing, setPreprocessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    try {
      const [sRes, dRes] = await Promise.all([
        apiFetch<{ samples: SampleOption[] }>('/api/samples'),
        apiFetch<{ datasets: DatasetItem[] }>('/api/datasets'),
      ]);
      setSamples(sRes.samples);
      setDatasets(dRes.datasets);
      if (!selectedSampleId && sRes.samples.length > 0) {
        setSelectedSampleId(sRes.samples[0].id);
      }
      if (!selectedDatasetId && dRes.datasets.length > 0) {
        setSelectedDatasetId(dRes.datasets[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load datasets');
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!selectedSampleId) {
      setErrorMsg('Please select or create an environmental sample before uploading.');
      return;
    }
    const files = Array.from(fileList);
    setErrorMsg(null);
    setStatusMsg(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(Math.round(((i + 0.3) / files.length) * 100));
      try {
        const text = await file.text();
        const res = await apiFetch<{ dataset: DatasetItem }>('/api/datasets/upload', {
          method: 'POST',
          body: JSON.stringify({
            sampleId: selectedSampleId,
            fileName: file.name,
            content: text,
          }),
        });
        setSelectedDatasetId(res.dataset.id);
        setStatusMsg(
          `Uploaded ${res.dataset.file_name}: ${res.dataset.sequence_count} total records (${res.dataset.malformed_count} malformed flagged).`
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }
    setUploadProgress(100);
    setTimeout(() => setUploadProgress(null), 800);
    await loadAll();
  };

  const handleRunPreprocessing = async () => {
    if (!selectedDatasetId) return;
    setPreprocessing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiFetch(`/api/datasets/${selectedDatasetId}/preprocess`, {
        method: 'POST',
        body: JSON.stringify(qcParams),
      });
      setStatusMsg('Sequence preprocessing and quality control completed.');
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Preprocessing failed');
    } finally {
      setPreprocessing(false);
    }
  };

  const activeDataset = datasets.find((d) => d.id === selectedDatasetId) ?? null;

  return (
    <WorkspaceLayout
      title="DNA Dataset Upload & Preprocessing"
      subtitle="Upload FASTA, FASTQ, CSV, TSV, or JSON sequences and execute quality-control filtering"
    >
      <div className="space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">{errorMsg}</div>
        )}
        {statusMsg && (
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {samples.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Create a Project &amp; Sample First</h2>
            <p className="text-sm text-slate-600">
              Uploaded sequence files must be linked to an environmental sample record.
            </p>
            <Link
              to="/projects"
              className="inline-block px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg"
            >
              Go to Projects &amp; Samples
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Upload Panel */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">1. Upload Raw eDNA Sequence Files</h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Target Environmental Sample</label>
                <select
                  value={selectedSampleId}
                  onChange={(e) => setSelectedSampleId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {samples.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sample_name} ({s.sample_type} · {s.marker})
                    </option>
                  ))}
                </select>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center space-y-2 transition-colors ${
                  dragActive ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-300 hover:border-emerald-500'
                }`}
              >
                <UploadCloud className="w-8 h-8 text-emerald-700 mx-auto" />
                <div className="text-sm font-semibold text-slate-900">
                  Drag &amp; drop DNA files here, or click to browse
                </div>
                <p className="text-xs text-slate-500">
                  Supports FASTA, FA, FNA, FASTQ, FQ, CSV, TSV, JSON (multiple files allowed)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".fasta,.fa,.fna,.fastq,.fq,.csv,.tsv,.json"
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files);
                  }}
                  className="hidden"
                />
              </div>

              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono text-slate-600">
                    <span>Uploading &amp; parsing sequences...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Uploaded Datasets List */}
              <div className="pt-2 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Your Uploaded Datasets ({datasets.length})</div>
                {datasets.length === 0 ? (
                  <p className="text-xs text-slate-500">No datasets uploaded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {datasets.map((ds) => (
                      <div
                        key={ds.id}
                        onClick={() => setSelectedDatasetId(ds.id)}
                        className={`cursor-pointer p-3 rounded-lg border text-xs transition-colors ${
                          selectedDatasetId === ds.id
                            ? 'bg-emerald-50 border-emerald-500'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-slate-900 truncate">{ds.file_name}</span>
                          <span className="font-mono text-emerald-700 shrink-0">{ds.file_format}</span>
                        </div>
                        <div className="mt-1 text-slate-500">
                          {ds.sequence_count} reads · {ds.malformed_count} malformed · {ds.upload_status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Preprocessing & Malformed Inspector */}
            <div className="lg:col-span-7 space-y-6">
              {!activeDataset ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
                  <FileCode2 className="w-7 h-7 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-600">
                    Select an uploaded dataset on the left to inspect parsed sequence statistics, review malformed records, and run preprocessing.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 font-mono">{activeDataset.file_name}</h2>
                        <p className="text-xs text-slate-500">
                          Original file preserved · {(activeDataset.file_size / 1024).toFixed(2)} KB · Min {activeDataset.min_length} bp · Avg {activeDataset.avg_length} bp · Max {activeDataset.max_length} bp
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => apiDownload(`/api/datasets/${activeDataset.id}/download`, activeDataset.file_name)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Original
                      </button>
                    </div>

                    {activeDataset.malformed_count > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                          <AlertTriangle className="w-4 h-4 text-amber-700" />
                          {activeDataset.malformed_count} Malformed Record(s) Flagged (Preserved, Never Silently Discarded)
                        </div>
                        <div className="max-h-28 overflow-y-auto text-[11px] font-mono text-amber-900 space-y-1">
                          {activeDataset.malformed_details.map((m, idx) => (
                            <div key={idx}>
                              Line {m.lineOrIndex} ({m.sequenceId}): {m.reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Preprocessing Parameters */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <SlidersHorizontal className="w-4 h-4 text-emerald-700" />
                        2. Configure Preprocessing &amp; Quality Filtering
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">Min Length (bp)</label>
                          <input
                            type="number"
                            value={qcParams.minLength}
                            onChange={(e) => setQcParams({ ...qcParams, minLength: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">Max Length (bp)</label>
                          <input
                            type="number"
                            value={qcParams.maxLength}
                            onChange={(e) => setQcParams({ ...qcParams, maxLength: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">Min Phred Quality</label>
                          <input
                            type="number"
                            value={qcParams.minMeanQuality}
                            onChange={(e) => setQcParams({ ...qcParams, minMeanQuality: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">Max Ambiguous N (%)</label>
                          <input
                            type="number"
                            value={qcParams.maxAmbiguousPct}
                            onChange={(e) => setQcParams({ ...qcParams, maxAmbiguousPct: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={qcParams.deduplicate}
                          onChange={(e) => setQcParams({ ...qcParams, deduplicate: e.target.checked })}
                          className="rounded border-slate-300 text-emerald-700"
                        />
                        Remove exact duplicate sequences during cleaning
                      </label>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={handleRunPreprocessing}
                          disabled={preprocessing}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-60"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {preprocessing ? 'Preprocessing...' : 'Run Preprocessing Pipeline'}
                        </button>
                        {activeDataset.cleaned_storage_path && (
                          <button
                            type="button"
                            onClick={() =>
                              apiDownload(
                                `/api/datasets/${activeDataset.id}/download-cleaned`,
                                `cleaned_${activeDataset.file_name}.fasta`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-cyan-800 border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 rounded-lg"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Cleaned FASTA
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Preprocessing Metrics */}
                  {activeDataset.preprocessing_stats && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-slate-900">Preprocessing Quality Control Telemetry</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Total Sequences</div>
                          <div className="text-lg font-mono font-bold text-slate-900">
                            {activeDataset.preprocessing_stats.totalSequences}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Valid Sequences</div>
                          <div className="text-lg font-mono font-bold text-emerald-700">
                            {activeDataset.preprocessing_stats.validSequences}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Invalid / Malformed</div>
                          <div className="text-lg font-mono font-bold text-rose-700">
                            {activeDataset.preprocessing_stats.invalidSequences}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Filtered Out</div>
                          <div className="text-lg font-mono font-bold text-amber-700">
                            {activeDataset.preprocessing_stats.filteredSequences}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Duplicates Detected</div>
                          <div className="text-lg font-mono font-bold text-slate-900">
                            {activeDataset.preprocessing_stats.duplicateSequences}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Retained Cleaned</div>
                          <div className="text-lg font-mono font-bold text-cyan-700">
                            {activeDataset.preprocessing_stats.retainedSequences}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Length (Min/Avg/Max)</div>
                          <div className="text-xs font-mono font-bold text-slate-900 mt-1">
                            {activeDataset.preprocessing_stats.minLength} / {activeDataset.preprocessing_stats.avgLength} / {activeDataset.preprocessing_stats.maxLength} bp
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[11px] text-slate-500">Mean GC% / Phred</div>
                          <div className="text-xs font-mono font-bold text-slate-900 mt-1">
                            {activeDataset.preprocessing_stats.meanGcPct}% ·{' '}
                            {activeDataset.preprocessing_stats.meanQuality !== null
                              ? `Q${activeDataset.preprocessing_stats.meanQuality}`
                              : 'FASTA'}
                          </div>
                        </div>
                      </div>
                      <div className="pt-1">
                        <Link
                          to="/analysis"
                          className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          Proceed to Taxonomic Identification &amp; Biodiversity Analysis →
                        </Link>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
