import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit2, FolderPlus, MapPin, Plus, Trash2, Upload } from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiFetch } from '../lib/api';

interface ProjectItem {
  id: string;
  project_name: string;
  description: string;
  research_objective: string;
  study_type: string;
  geographic_region: string;
  start_date: string;
  project_notes: string;
  sampleCount?: number;
  created_at: string;
}

interface SampleItem {
  id: string;
  project_id: string;
  sample_code: string;
  sample_name: string;
  sample_type: string;
  collection_location: string;
  collection_date: string;
  latitude: number | null;
  longitude: number | null;
  marker: string;
  notes: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [projForm, setProjForm] = useState({
    projectName: '',
    description: '',
    researchObjective: '',
    studyType: 'Freshwater eDNA',
    geographicRegion: '',
    startDate: new Date().toISOString().slice(0, 10),
    projectNotes: '',
  });

  const [showSampleForm, setShowSampleForm] = useState(false);
  const [sampleForm, setSampleForm] = useState({
    sampleCode: '',
    sampleName: '',
    sampleType: 'River',
    collectionLocation: '',
    collectionDate: new Date().toISOString().slice(0, 10),
    latitude: '',
    longitude: '',
    marker: 'COI',
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, sRes] = await Promise.all([
        apiFetch<{ projects: ProjectItem[] }>('/api/projects'),
        apiFetch<{ samples: SampleItem[] }>('/api/samples'),
      ]);
      setProjects(pRes.projects);
      setSamples(sRes.samples);
      if (!selectedProjectId && pRes.projects.length > 0) {
        setSelectedProjectId(pRes.projects[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingProject) {
        await apiFetch(`/api/projects/${editingProject.id}`, {
          method: 'PATCH',
          body: JSON.stringify(projForm),
        });
      } else {
        const res = await apiFetch<{ project: ProjectItem }>('/api/projects', {
          method: 'POST',
          body: JSON.stringify(projForm),
        });
        setSelectedProjectId(res.project.id);
      }
      setShowProjectForm(false);
      setEditingProject(null);
      setProjForm({
        projectName: '',
        description: '',
        researchObjective: '',
        studyType: 'Freshwater eDNA',
        geographicRegion: '',
        startDate: new Date().toISOString().slice(0, 10),
        projectNotes: '',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (selectedProjectId === id) setSelectedProjectId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const handleCreateSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setError(null);
    try {
      await apiFetch('/api/samples', {
        method: 'POST',
        body: JSON.stringify({
          projectId: selectedProjectId,
          ...sampleForm,
          latitude: sampleForm.latitude ? Number(sampleForm.latitude) : null,
          longitude: sampleForm.longitude ? Number(sampleForm.longitude) : null,
        }),
      });
      setShowSampleForm(false);
      setSampleForm({
        sampleCode: '',
        sampleName: '',
        sampleType: 'River',
        collectionLocation: '',
        collectionDate: new Date().toISOString().slice(0, 10),
        latitude: '',
        longitude: '',
        marker: 'COI',
        notes: '',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sample');
    }
  };

  const handleDeleteSample = async (id: string) => {
    try {
      await apiFetch(`/api/samples/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sample');
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const projectSamples = samples.filter((s) => s.project_id === selectedProjectId);

  return (
    <WorkspaceLayout title="Projects & Environmental Samples" subtitle="Manage eDNA research studies, sample metadata, and GPS station coordinates">
      <div className="space-y-6">
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">{error}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-slate-600">
            {projects.length} research {projects.length === 1 ? 'project' : 'projects'} · {samples.length} environmental samples
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingProject(null);
              setShowProjectForm(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
          >
            <FolderPlus className="w-4 h-4" />
            New Research Project
          </button>
        </div>

        {showProjectForm && (
          <form onSubmit={handleSaveProject} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              {editingProject ? 'Edit Project' : 'Create New Research Project'}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Project Name *</label>
                <input
                  required
                  value={projForm.projectName}
                  onChange={(e) => setProjForm({ ...projForm, projectName: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  placeholder="Upper Yamuna Ichthyofauna eDNA Survey"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Environmental Study Type</label>
                <select
                  value={projForm.studyType}
                  onChange={(e) => setProjForm({ ...projForm, studyType: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option>Freshwater eDNA</option>
                  <option>Marine &amp; Estuarine Metabarcoding</option>
                  <option>Soil Microbiome Assessment</option>
                  <option>Wetland Conservation Monitoring</option>
                  <option>Invasive Species Surveillance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Geographic Region</label>
                <input
                  value={projForm.geographicRegion}
                  onChange={(e) => setProjForm({ ...projForm, geographicRegion: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  placeholder="Western Himalayas Basin"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={projForm.startDate}
                  onChange={(e) => setProjForm({ ...projForm, startDate: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Research Objective</label>
              <input
                value={projForm.researchObjective}
                onChange={(e) => setProjForm({ ...projForm, researchObjective: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                placeholder="Assess native fish richness and detect non-native species using COI and 12S markers"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Description &amp; Notes</label>
              <textarea
                rows={3}
                value={projForm.description}
                onChange={(e) => setProjForm({ ...projForm, description: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
                {editingProject ? 'Save Changes' : 'Create Project'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProjectForm(false);
                  setEditingProject(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ) : projects.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <h2 className="text-base font-semibold text-slate-900">No Research Projects Yet</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Create your first eDNA research project to organize field samples, upload sequence datasets, and track biodiversity results.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Project List */}
            <div className="lg:col-span-4 space-y-3">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={`cursor-pointer rounded-xl p-4 border transition-colors ${
                    selectedProjectId === proj.id
                      ? 'bg-emerald-50/70 border-emerald-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{proj.project_name}</h3>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProject(proj);
                          setProjForm({
                            projectName: proj.project_name,
                            description: proj.description,
                            researchObjective: proj.research_objective,
                            studyType: proj.study_type,
                            geographicRegion: proj.geographic_region,
                            startDate: proj.start_date,
                            projectNotes: proj.project_notes,
                          });
                          setShowProjectForm(true);
                        }}
                        className="p-1 text-slate-500 hover:text-slate-900"
                        title="Edit project"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(proj.id)}
                        className="p-1 text-slate-500 hover:text-rose-700"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {proj.study_type} · {proj.geographic_region || 'Region N/A'}
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-slate-500">
                    {samples.filter((s) => s.project_id === proj.id).length} samples · Started {proj.start_date}
                  </div>
                </div>
              ))}
            </div>

            {/* Project Details & Samples */}
            <div className="lg:col-span-8 space-y-5">
              {selectedProject && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-xl font-display font-bold text-slate-900">{selectedProject.project_name}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedProject.study_type} · {selectedProject.geographic_region || 'Region unspecified'} · Start {selectedProject.start_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSampleForm((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Sample
                      </button>
                      <Link
                        to="/upload"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload Dataset
                      </Link>
                    </div>
                  </div>

                  {selectedProject.research_objective && (
                    <div>
                      <div className="text-xs font-semibold text-slate-700">Research Objective</div>
                      <p className="text-sm text-slate-600 mt-0.5">{selectedProject.research_objective}</p>
                    </div>
                  )}
                  {selectedProject.description && (
                    <div>
                      <div className="text-xs font-semibold text-slate-700">Description</div>
                      <p className="text-sm text-slate-600 mt-0.5">{selectedProject.description}</p>
                    </div>
                  )}

                  {showSampleForm && (
                    <form onSubmit={handleCreateSample} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900">Add Environmental Sample</h3>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Sample ID / Code</label>
                          <input
                            value={sampleForm.sampleCode}
                            onChange={(e) => setSampleForm({ ...sampleForm, sampleCode: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                            placeholder="SMP-RIV-01"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Sample Name *</label>
                          <input
                            required
                            value={sampleForm.sampleName}
                            onChange={(e) => setSampleForm({ ...sampleForm, sampleName: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                            placeholder="Station Alpha Riffle"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Environmental Source</label>
                          <select
                            value={sampleForm.sampleType}
                            onChange={(e) => setSampleForm({ ...sampleForm, sampleType: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                          >
                            <option>River</option>
                            <option>Lake</option>
                            <option>Pond</option>
                            <option>Marine water</option>
                            <option>Soil</option>
                            <option>Sediment</option>
                            <option>Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">DNA Marker</label>
                          <select
                            value={sampleForm.marker}
                            onChange={(e) => setSampleForm({ ...sampleForm, marker: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                          >
                            <option>COI</option>
                            <option>16S</option>
                            <option>12S</option>
                            <option>18S</option>
                            <option>ITS</option>
                            <option>rbcL</option>
                            <option>Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Collection Location</label>
                          <input
                            value={sampleForm.collectionLocation}
                            onChange={(e) => setSampleForm({ ...sampleForm, collectionLocation: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                            placeholder="Upper Tributary Reach"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Collection Date</label>
                          <input
                            type="date"
                            value={sampleForm.collectionDate}
                            onChange={(e) => setSampleForm({ ...sampleForm, collectionDate: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Latitude (Optional)</label>
                          <input
                            type="number"
                            step="any"
                            value={sampleForm.latitude}
                            onChange={(e) => setSampleForm({ ...sampleForm, latitude: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                            placeholder="30.4512"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Longitude (Optional)</label>
                          <input
                            type="number"
                            step="any"
                            value={sampleForm.longitude}
                            onChange={(e) => setSampleForm({ ...sampleForm, longitude: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                            placeholder="78.0814"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Research Notes</label>
                          <input
                            value={sampleForm.notes}
                            onChange={(e) => setSampleForm({ ...sampleForm, notes: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                            placeholder="0.45 µm Sterivex filter"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg">
                          Save Sample
                        </button>
                        <button type="button" onClick={() => setShowSampleForm(false)} className="px-3.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Samples Table */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900">Samples in Project ({projectSamples.length})</h3>
                    {projectSamples.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">No samples added yet. Click &ldquo;Add Sample&rdquo; above.</p>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">Code</th>
                              <th className="py-2.5 px-3 font-semibold">Sample Name</th>
                              <th className="py-2.5 px-3 font-semibold">Source · Marker</th>
                              <th className="py-2.5 px-3 font-semibold">Coordinates</th>
                              <th className="py-2.5 px-3 font-semibold">Date</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {projectSamples.map((s) => (
                              <tr key={s.id} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-mono text-slate-700">{s.sample_code}</td>
                                <td className="py-2.5 px-3 font-medium text-slate-900">{s.sample_name}</td>
                                <td className="py-2.5 px-3 text-slate-600">{s.sample_type} · {s.marker}</td>
                                <td className="py-2.5 px-3 font-mono text-slate-500">
                                  {s.latitude !== null && s.longitude !== null ? (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-emerald-700" />
                                      {s.latitude.toFixed(3)}, {s.longitude.toFixed(3)}
                                    </span>
                                  ) : (
                                    'Not set'
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-500">{s.collection_date}</td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSample(s.id)}
                                    className="text-slate-400 hover:text-rose-700"
                                    title="Delete sample"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 inline" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
