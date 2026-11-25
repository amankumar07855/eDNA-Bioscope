import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { requireAdmin, requireAuth, verifyBearerToken } from './server/authMiddleware.ts';
import { dbStore } from './server/storageAdapter.ts';
import {
  buildDemoSampleFasta,
  identifySequences,
  parseDatasetContent,
  runPreprocessingPipeline,
} from './server/bioinformatics.ts';
import { calculateBiodiversityMetrics, computeBetaDiversityMatrix } from './server/biodiversity.ts';
import { askScientificAssistant, generateReportInterpretation, isGeminiConfigured } from './server/geminiService.ts';
import type { PreprocessingParams, ReferenceMode } from './server/types.ts';

const ALLOWED_FORMATS = new Set(['fasta', 'fa', 'fna', 'fastq', 'fq', 'csv', 'tsv', 'json']);

async function runAnalysisJobAsync(
  jobId: string,
  ownerUid: string,
  sampleId: string,
  datasetId: string,
  referenceMode: ReferenceMode
): Promise<void> {
  try {
    await dbStore.updateJob(jobId, {
      job_status: 'processing',
      progress: 15,
      current_stage: 'Validating & preprocessing sequences',
    });

    const dataset = dbStore.getDataset(datasetId);
    if (!dataset || dataset.owner_uid !== ownerUid) {
      throw new Error('Dataset not found or unauthorized');
    }

    let seqs = dbStore.getSequencesByDataset(datasetId);
    if (!dataset.preprocessing_stats) {
      const cfg = dbStore.getSystemConfig();
      const params: PreprocessingParams = {
        minLength: cfg.defaultMinLength,
        maxLength: 5000,
        minMeanQuality: cfg.defaultMinQuality,
        maxAmbiguousPct: 5,
        deduplicate: true,
      };
      const pre = runPreprocessingPipeline(seqs, params);
      seqs = pre.updatedSequences;
      await dbStore.replaceSequencesForDataset(datasetId, seqs);
      const cleanedPath = await dbStore.saveFile(
        'edna-datasets',
        `${ownerUid}/${datasetId}_cleaned.fasta`,
        pre.cleanedFasta,
        'text/plain'
      );
      await dbStore.updateDataset(datasetId, {
        upload_status: 'preprocessed',
        preprocessing_params: params,
        preprocessing_stats: pre.stats,
        cleaned_storage_path: cleanedPath,
      });
    }

    await dbStore.updateJob(jobId, {
      progress: 45,
      current_stage:
        referenceMode === 'ncbi_blast'
          ? 'Querying NCBI BLAST & NCBI Taxonomy'
          : referenceMode === 'bold_systems'
          ? 'Querying BOLD Systems COI Engine'
          : 'Aligning against curated reference marker database',
    });

    const { assignments, notices } = await identifySequences(seqs, sampleId, datasetId, ownerUid, referenceMode, false);

    await dbStore.updateJob(jobId, {
      progress: 80,
      current_stage: 'Computing alpha diversity & rarefaction metrics',
    });

    const bio = calculateBiodiversityMetrics(sampleId, ownerUid, assignments);
    await dbStore.saveAnalysisResults(sampleId, datasetId, assignments, bio);

    await dbStore.updateJob(jobId, {
      job_status: 'completed',
      progress: 100,
      current_stage: notices.length > 0 ? `Completed (${notices[0]})` : 'Analysis completed',
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await dbStore.updateJob(jobId, {
      job_status: 'failed',
      progress: 0,
      current_stage: 'Failed',
      error_message: err instanceof Error ? err.message : 'Unexpected analysis error',
      completed_at: new Date().toISOString(),
    });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Public Health Diagnostics (no secrets exposed)
  app.get('/api/health', async (_req: Request, res: Response) => {
    const supa = await dbStore.checkSupabaseHealth();
    const cfg = dbStore.getSystemConfig();
    res.json({
      status: 'ok',
      geminiConfigured: isGeminiConfigured(),
      supabase: supa,
      maintenanceMode: cfg.maintenanceMode,
      timestamp: new Date().toISOString(),
    });
  });

  // Auth Sync: Verifies Firebase ID token and ensures server-side profile + role (defaults to 'user')
  app.post('/api/auth/sync', async (req: Request, res: Response) => {
    try {
      const decoded = await verifyBearerToken(req);
      const { fullName, country, institution, userCategory } = (req.body ?? {}) as {
        fullName?: string;
        country?: string;
        institution?: string;
        userCategory?: string;
      };

      const profile = await dbStore.upsertProfileOnAuth({
        firebaseUid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.emailVerified,
        fullName: fullName ?? decoded.name,
        country,
        institution,
        userCategory,
      });

      if (profile.account_status === 'disabled') {
        res.status(403).json({ error: 'Your account has been disabled by an administrator.' });
        return;
      }

      res.json({
        profile: {
          uid: profile.firebase_uid,
          fullName: profile.full_name,
          email: profile.email,
          country: profile.country,
          institution: profile.institution,
          userCategory: profile.user_category,
          role: profile.role,
          accountStatus: profile.account_status,
          emailVerified: profile.email_verified,
          createdAt: profile.created_at,
        },
      });
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Unable to verify Firebase identity token',
      });
    }
  });

  // User Dashboard Aggregate
  app.get('/api/dashboard', requireAuth, (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const projects = dbStore.listProjects(uid);
    const samples = dbStore.listSamples(uid);
    const datasets = dbStore.listDatasets(uid);
    const jobs = dbStore.listJobs(uid);
    const taxa = dbStore.listTaxa(uid);
    const biodiversity = dbStore.listBiodiversityResults(uid);
    const reports = dbStore.listReports(uid);

    const totalSequences = datasets.reduce((acc, d) => acc + d.sequence_count, 0);
    const uniqueSpecies = new Set(
      taxa.filter((t) => t.confidence !== 'Unclassified').map((t) => t.scientific_name)
    );

    const phylumCounts = new Map<string, number>();
    for (const t of taxa) {
      if (t.confidence === 'Unclassified') continue;
      const phylum = t.phylum_name || 'Unassigned';
      phylumCounts.set(phylum, (phylumCounts.get(phylum) ?? 0) + 1);
    }

    const taxonomicDistribution = Array.from(phylumCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const sampleNameById = new Map(samples.map((s) => [s.id, s.sample_name]));
    const biodiversityOverview = biodiversity.map((b) => ({
      sampleId: b.sample_id,
      sampleName: sampleNameById.get(b.sample_id) ?? 'Sample',
      speciesRichness: b.species_richness,
      shannonIndex: b.shannon_index,
      simpson1MinusD: b.simpson_diversity_1_minus_d,
      pielouEvenness: b.pielou_evenness,
      totalReads: b.total_reads,
    }));

    res.json({
      stats: {
        totalProjects: projects.length,
        totalSamples: samples.length,
        totalSequences,
        identifiedTaxa: uniqueSpecies.size,
        speciesRichness: biodiversity.reduce((max, b) => Math.max(max, b.species_richness), 0),
        latestAnalysisStatus: jobs[0]?.job_status ?? 'None',
      },
      recentProjects: projects.slice(0, 5),
      recentDatasets: datasets.slice(0, 5),
      recentJobs: jobs.slice(0, 6),
      recentReports: reports.slice(0, 5),
      biodiversityOverview,
      taxonomicDistribution,
    });
  });

  // Projects CRUD
  app.get('/api/projects', requireAuth, (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const projects = dbStore.listProjects(uid);
    const samples = dbStore.listSamples(uid);
    const enriched = projects.map((p) => ({
      ...p,
      sampleCount: samples.filter((s) => s.project_id === p.id).length,
    }));
    res.json({ projects: enriched });
  });

  app.post('/api/projects', requireAuth, async (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const body = req.body ?? {};
    const projectName = String(body.projectName ?? '').trim();
    if (projectName.length < 2 || projectName.length > 140) {
      res.status(400).json({ error: 'Project name must be between 2 and 140 characters.' });
      return;
    }

    const now = new Date().toISOString();
    const project = await dbStore.createProject({
      id: crypto.randomUUID(),
      owner_uid: uid,
      project_name: projectName,
      description: String(body.description ?? '').trim().slice(0, 2000),
      research_objective: String(body.researchObjective ?? '').trim().slice(0, 1000),
      study_type: String(body.studyType ?? 'Freshwater eDNA').trim().slice(0, 100),
      geographic_region: String(body.geographicRegion ?? '').trim().slice(0, 200),
      start_date: String(body.startDate ?? now.slice(0, 10)),
      project_notes: String(body.projectNotes ?? '').trim().slice(0, 2000),
      created_at: now,
      updated_at: now,
    });
    res.status(201).json({ project });
  });

  app.patch('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const body = req.body ?? {};
    const updated = await dbStore.updateProject(String(req.params.id), uid, {
      ...(body.projectName ? { project_name: String(body.projectName).trim().slice(0, 140) } : {}),
      ...(body.description !== undefined ? { description: String(body.description).trim().slice(0, 2000) } : {}),
      ...(body.researchObjective !== undefined ? { research_objective: String(body.researchObjective).trim().slice(0, 1000) } : {}),
      ...(body.studyType ? { study_type: String(body.studyType).trim().slice(0, 100) } : {}),
      ...(body.geographicRegion !== undefined ? { geographic_region: String(body.geographicRegion).trim().slice(0, 200) } : {}),
      ...(body.startDate ? { start_date: String(body.startDate) } : {}),
      ...(body.projectNotes !== undefined ? { project_notes: String(body.projectNotes).trim().slice(0, 2000) } : {}),
    });
    if (!updated) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ project: updated });
  });

  app.delete('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
    const ok = await dbStore.deleteProject(String(req.params.id), req.authUser!.uid);
    if (!ok) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  // Samples CRUD
  app.get('/api/samples', requireAuth, (req: Request, res: Response) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const samples = dbStore.listSamples(req.authUser!.uid, projectId);
    const bio = dbStore.listBiodiversityResults(req.authUser!.uid);
    const bioBySample = new Map(bio.map((b) => [b.sample_id, b]));
    res.json({
      samples: samples.map((s) => ({
        ...s,
        biodiversity: bioBySample.get(s.id) ?? null,
      })),
    });
  });

  app.post('/api/samples', requireAuth, async (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const body = req.body ?? {};
    const projectId = String(body.projectId ?? '');
    const project = dbStore.getProject(projectId);
    if (!project || project.owner_uid !== uid) {
      res.status(404).json({ error: 'Parent project not found or unauthorized.' });
      return;
    }

    const sampleName = String(body.sampleName ?? '').trim();
    if (sampleName.length < 2 || sampleName.length > 120) {
      res.status(400).json({ error: 'Sample name must be between 2 and 120 characters.' });
      return;
    }

    const lat = body.latitude !== undefined && body.latitude !== '' && body.latitude !== null ? Number(body.latitude) : null;
    const lng = body.longitude !== undefined && body.longitude !== '' && body.longitude !== null ? Number(body.longitude) : null;
    if ((lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180))) {
      res.status(400).json({ error: 'Invalid geographic coordinates.' });
      return;
    }

    const sample = await dbStore.createSample({
      id: crypto.randomUUID(),
      project_id: projectId,
      owner_uid: uid,
      sample_code: String(body.sampleCode ?? `SMP-${Date.now().toString().slice(-5)}`).trim().slice(0, 40),
      sample_name: sampleName,
      sample_type: String(body.sampleType ?? 'River').trim().slice(0, 60),
      collection_location: String(body.collectionLocation ?? '').trim().slice(0, 200),
      collection_date: String(body.collectionDate ?? new Date().toISOString().slice(0, 10)),
      latitude: lat,
      longitude: lng,
      marker: String(body.marker ?? 'COI').trim().slice(0, 24),
      notes: String(body.notes ?? '').trim().slice(0, 1000),
      created_at: new Date().toISOString(),
    });
    res.status(201).json({ sample });
  });

  app.patch('/api/samples/:id', requireAuth, async (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const body = req.body ?? {};
    const lat = body.latitude !== undefined && body.latitude !== '' && body.latitude !== null ? Number(body.latitude) : undefined;
    const lng = body.longitude !== undefined && body.longitude !== '' && body.longitude !== null ? Number(body.longitude) : undefined;
    if ((lat !== undefined && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lng !== undefined && (Number.isNaN(lng) || lng < -180 || lng > 180))) {
      res.status(400).json({ error: 'Invalid geographic coordinates.' });
      return;
    }

    const updated = await dbStore.updateSample(String(req.params.id), uid, {
      ...(body.sampleName ? { sample_name: String(body.sampleName).trim().slice(0, 120) } : {}),
      ...(body.sampleType ? { sample_type: String(body.sampleType).trim().slice(0, 60) } : {}),
      ...(body.collectionLocation !== undefined ? { collection_location: String(body.collectionLocation).trim().slice(0, 200) } : {}),
      ...(body.collectionDate ? { collection_date: String(body.collectionDate) } : {}),
      ...(body.marker ? { marker: String(body.marker).trim().slice(0, 24) } : {}),
      ...(body.notes !== undefined ? { notes: String(body.notes).trim().slice(0, 1000) } : {}),
      ...(lat !== undefined ? { latitude: lat } : {}),
      ...(lng !== undefined ? { longitude: lng } : {}),
    });
    if (!updated) {
      res.status(404).json({ error: 'Sample not found.' });
      return;
    }
    res.json({ sample: updated });
  });

  app.delete('/api/samples/:id', requireAuth, async (req: Request, res: Response) => {
    const ok = await dbStore.deleteSample(String(req.params.id), req.authUser!.uid);
    if (!ok) {
      res.status(404).json({ error: 'Sample not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  // Dataset Upload & Parsing
  app.get('/api/datasets', requireAuth, (req: Request, res: Response) => {
    const sampleId = typeof req.query.sampleId === 'string' ? req.query.sampleId : undefined;
    res.json({ datasets: dbStore.listDatasets(req.authUser!.uid, sampleId) });
  });

  app.post('/api/datasets/upload', requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = req.authUser!.uid;
      const body = req.body ?? {};
      const sampleId = String(body.sampleId ?? '');
      const fileName = path.basename(String(body.fileName ?? ''));
      const content = String(body.content ?? '');

      const sample = dbStore.getSample(sampleId);
      if (!sample || sample.owner_uid !== uid) {
        res.status(404).json({ error: 'Target sample not found or unauthorized.' });
        return;
      }

      const ext = path.extname(fileName).slice(1).toLowerCase();
      if (!ALLOWED_FORMATS.has(ext)) {
        res.status(400).json({
          error: `Unsupported file format ".${ext}". Allowed: FASTA, FA, FNA, FASTQ, FQ, CSV, TSV, JSON.`,
        });
        return;
      }

      const maxBytes = dbStore.getSystemConfig().maxUploadSizeMb * 1024 * 1024;
      const byteSize = Buffer.byteLength(content, 'utf8');
      if (byteSize === 0 || byteSize > maxBytes) {
        res.status(400).json({
          error: `File size must be between 1 byte and ${dbStore.getSystemConfig().maxUploadSizeMb} MB.`,
        });
        return;
      }

      const datasetId = crypto.randomUUID();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-]/g, '_');
      const storagePath = await dbStore.saveFile(
        'edna-datasets',
        `${uid}/${sample.project_id}/${datasetId}_${safeFileName}`,
        content,
        'text/plain'
      );

      const parsed = parseDatasetContent(content, ext, datasetId, uid);

      const dataset = await dbStore.createDatasetWithSequences(
        {
          id: datasetId,
          sample_id: sampleId,
          owner_uid: uid,
          storage_path: storagePath,
          cleaned_storage_path: null,
          file_name: safeFileName,
          file_format: ext.toUpperCase(),
          file_size: byteSize,
          sequence_count: parsed.totalRecords,
          malformed_count: parsed.malformedCount,
          malformed_details: parsed.malformedDetails.slice(0, 100),
          avg_length: parsed.avgLength,
          min_length: parsed.minLength,
          max_length: parsed.maxLength,
          upload_status: parsed.totalRecords > 0 ? 'uploaded' : 'failed',
          preprocessing_params: null,
          preprocessing_stats: null,
          created_at: new Date().toISOString(),
        },
        parsed.sequences
      );

      res.status(201).json({ dataset, parsedSummary: { validCount: parsed.validCount, malformedCount: parsed.malformedCount } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Dataset upload failed' });
    }
  });

  app.get('/api/datasets/:id/download', requireAuth, async (req: Request, res: Response) => {
    const ds = dbStore.getDataset(String(req.params.id));
    if (!ds || (ds.owner_uid !== req.authUser!.uid && req.authUser!.role !== 'admin')) {
      res.status(404).json({ error: 'Dataset not found.' });
      return;
    }
    try {
      const buf = await dbStore.readFile(ds.storage_path);
      res.setHeader('Content-Disposition', `attachment; filename="${ds.file_name}"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(buf);
    } catch {
      res.status(404).json({ error: 'Stored dataset file missing.' });
    }
  });

  app.post('/api/datasets/:id/preprocess', requireAuth, async (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const ds = dbStore.getDataset(String(req.params.id));
    if (!ds || ds.owner_uid !== uid) {
      res.status(404).json({ error: 'Dataset not found.' });
      return;
    }

    const body = req.body ?? {};
    const params: PreprocessingParams = {
      minLength: Math.max(10, Number(body.minLength ?? 80)),
      maxLength: Math.min(20000, Number(body.maxLength ?? 5000)),
      minMeanQuality: Math.max(0, Number(body.minMeanQuality ?? 20)),
      maxAmbiguousPct: Math.min(100, Math.max(0, Number(body.maxAmbiguousPct ?? 5))),
      deduplicate: Boolean(body.deduplicate ?? true),
    };

    const existingSeqs = dbStore.getSequencesByDataset(ds.id);
    const result = runPreprocessingPipeline(existingSeqs, params);
    await dbStore.replaceSequencesForDataset(ds.id, result.updatedSequences);

    const cleanedPath = await dbStore.saveFile(
      'edna-datasets',
      `${uid}/${ds.id}_cleaned.fasta`,
      result.cleanedFasta,
      'text/plain'
    );

    const updatedDataset = await dbStore.updateDataset(ds.id, {
      upload_status: 'preprocessed',
      preprocessing_params: params,
      preprocessing_stats: result.stats,
      cleaned_storage_path: cleanedPath,
    });

    res.json({ dataset: updatedDataset, stats: result.stats });
  });

  app.get('/api/datasets/:id/download-cleaned', requireAuth, async (req: Request, res: Response) => {
    const ds = dbStore.getDataset(String(req.params.id));
    if (!ds || ds.owner_uid !== req.authUser!.uid || !ds.cleaned_storage_path) {
      res.status(404).json({ error: 'Cleaned dataset not available.' });
      return;
    }
    const buf = await dbStore.readFile(ds.cleaned_storage_path);
    res.setHeader('Content-Disposition', `attachment; filename="cleaned_${ds.file_name}.fasta"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buf);
  });

  // Asynchronous Taxonomic + Biodiversity Analysis
  app.post('/api/analysis/start', requireAuth, async (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const body = req.body ?? {};
    const sampleId = String(body.sampleId ?? '');
    const datasetId = String(body.datasetId ?? '');
    const referenceMode = (['local_ref', 'ncbi_blast', 'bold_systems'].includes(body.referenceMode)
      ? body.referenceMode
      : 'local_ref') as ReferenceMode;

    const sample = dbStore.getSample(sampleId);
    const dataset = dbStore.getDataset(datasetId);
    if (!sample || sample.owner_uid !== uid || !dataset || dataset.owner_uid !== uid) {
      res.status(404).json({ error: 'Sample or dataset not found or unauthorized.' });
      return;
    }

    const job = await dbStore.createJob({
      id: crypto.randomUUID(),
      owner_uid: uid,
      project_id: sample.project_id,
      sample_id: sampleId,
      dataset_id: datasetId,
      reference_mode: referenceMode,
      job_status: 'pending',
      progress: 5,
      current_stage: 'Queued for taxonomic & biodiversity pipeline',
      error_message: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    });

    // Launch asynchronously so large datasets never block the HTTP request
    setImmediate(() => {
      void runAnalysisJobAsync(job.id, uid, sampleId, datasetId, referenceMode);
    });

    res.status(202).json({ job });
  });

  app.get('/api/analysis/jobs', requireAuth, (req: Request, res: Response) => {
    res.json({ jobs: dbStore.listJobs(req.authUser!.uid) });
  });

  app.get('/api/analysis/jobs/:id', requireAuth, (req: Request, res: Response) => {
    const job = dbStore.getJob(String(req.params.id));
    if (!job || (job.owner_uid !== req.authUser!.uid && req.authUser!.role !== 'admin')) {
      res.status(404).json({ error: 'Analysis job not found.' });
      return;
    }
    res.json({ job });
  });

  app.get('/api/analysis/results', requireAuth, (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const sampleId = typeof req.query.sampleId === 'string' ? req.query.sampleId : undefined;
    const taxa = dbStore.listTaxa(uid, sampleId);
    const biodiversity = dbStore
      .listBiodiversityResults(uid)
      .filter((b) => !sampleId || b.sample_id === sampleId);
    res.json({ taxa, biodiversity });
  });

  // Species Explorer
  app.get('/api/species', requireAuth, (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const taxa = dbStore.listTaxa(uid);
    const samples = dbStore.listSamples(uid);
    const biodiversity = dbStore.listBiodiversityResults(uid);
    const sampleMap = new Map(samples.map((s) => [s.id, s]));
    const bioBySample = new Map(biodiversity.map((b) => [b.sample_id, b]));

    const grouped = new Map<string, {
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
      detections: Array<{ sampleId: string; sampleName: string; sampleType: string; readCount: number; relativeAbundance: number }>;
    }>();

    for (const t of taxa) {
      if (t.confidence === 'Unclassified') continue;
      const sample = sampleMap.get(t.sample_id);
      const bio = bioBySample.get(t.sample_id);
      const relItem = bio?.relative_abundances.find((r) => r.scientific_name === t.scientific_name);

      let entry = grouped.get(t.scientific_name);
      if (!entry) {
        entry = {
          scientificName: t.scientific_name,
          commonName: t.common_name,
          domain: t.domain_name,
          kingdom: t.kingdom_name,
          phylum: t.phylum_name,
          className: t.class_name,
          orderName: t.order_name,
          familyName: t.family_name,
          genusName: t.genus_name,
          speciesName: t.species_name,
          taxonomyId: t.taxonomy_id,
          taxonomicRank: t.taxonomic_rank,
          confidence: t.confidence,
          referenceSource: t.reference_source,
          conservationStatus: t.conservation_status,
          invasiveStatus: t.invasive_status,
          maxIdentity: t.percentage_identity,
          detections: [],
        };
        grouped.set(t.scientific_name, entry);
      } else {
        entry.maxIdentity = Math.max(entry.maxIdentity, t.percentage_identity);
      }

      if (sample && !entry.detections.some((d) => d.sampleId === sample.id)) {
        entry.detections.push({
          sampleId: sample.id,
          sampleName: sample.sample_name,
          sampleType: sample.sample_type,
          readCount: relItem?.read_count ?? 1,
          relativeAbundance: relItem?.relative_abundance ?? 0,
        });
      }
    }

    res.json({ species: Array.from(grouped.values()) });
  });

  // Beta Diversity & Sample Comparisons
  app.get('/api/biodiversity/compare', requireAuth, (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const samples = dbStore.listSamples(uid);
    const bioList = dbStore.listBiodiversityResults(uid);
    const sampleMap = new Map(samples.map((s) => [s.id, s]));

    const combined = bioList
      .map((bio) => ({
        sampleId: bio.sample_id,
        sampleName: sampleMap.get(bio.sample_id)?.sample_name ?? 'Unknown Sample',
        bio,
      }))
      .filter((item) => item.bio.total_reads > 0);

    const matrix = computeBetaDiversityMatrix(combined);
    res.json({
      samplesCount: combined.length,
      ...matrix,
    });
  });

  // Isolated Demonstration Mode (never touches real user datasets)
  app.get('/api/demo', (_req: Request, res: Response) => {
    const demoFasta = buildDemoSampleFasta();
    const parsed = parseDatasetContent(demoFasta, 'fasta', 'demo-dataset', 'demo-sandbox');
    res.json({
      isDemo: true,
      disclaimer: 'Demonstration Mode uses illustrative eDNA sequences and simulated local reference matches. Results are strictly isolated and do not come from live NCBI/BOLD queries.',
      demoProject: {
        name: 'Cascadia Coldwater Watershed eDNA Demonstration (Simulated)',
        region: 'Pacific Northwest Riparian Basin',
        marker: 'COI / 18S Multiplex',
        sampleName: 'Demo Stream Station A (Illustrative)',
      },
      rawFasta: demoFasta,
      parsedSummary: {
        totalRecords: parsed.totalRecords,
        validCount: parsed.validCount,
        malformedCount: parsed.malformedCount,
        avgLength: parsed.avgLength,
        minLength: parsed.minLength,
        maxLength: parsed.maxLength,
      },
    });
  });

  app.post('/api/demo/analyze', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const fastaText = typeof body.fasta === 'string' && body.fasta.trim() ? body.fasta : buildDemoSampleFasta();
    const minLength = Math.max(20, Number(body.minLength ?? 60));
    const parsed = parseDatasetContent(fastaText, 'fasta', 'demo-dataset', 'demo-sandbox');
    const pre = runPreprocessingPipeline(parsed.sequences, {
      minLength,
      maxLength: 5000,
      minMeanQuality: 20,
      maxAmbiguousPct: 5,
      deduplicate: Boolean(body.deduplicate ?? true),
    });
    const { assignments } = await identifySequences(
      pre.updatedSequences,
      'demo-sample',
      'demo-dataset',
      'demo-sandbox',
      'local_ref',
      true
    );
    const bio = calculateBiodiversityMetrics('demo-sample', 'demo-sandbox', assignments);

    res.json({
      isDemo: true,
      disclaimer: 'Simulated Reference Matches (Demo Mode — Not from live NCBI or BOLD).',
      preprocessingStats: pre.stats,
      cleanedFasta: pre.cleanedFasta,
      assignments,
      biodiversity: bio,
    });
  });

  // Gemini Scientific Research Assistant
  app.post('/api/ai/chat', requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = req.authUser!.uid;
      const question = String(req.body?.question ?? '').trim();
      if (!question || question.length > 2000) {
        res.status(400).json({ error: 'Please provide a question between 1 and 2000 characters.' });
        return;
      }

      const answer = await askScientificAssistant({
        question,
        projects: dbStore.listProjects(uid),
        samples: dbStore.listSamples(uid),
        biodiversity: dbStore.listBiodiversityResults(uid),
        taxa: dbStore.listTaxa(uid),
        history: Array.isArray(req.body?.history) ? req.body.history : [],
      });

      res.json({ answer });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Gemini Scientific Assistant request failed.',
      });
    }
  });

  // Report Generation & Downloads
  app.get('/api/reports', requireAuth, (req: Request, res: Response) => {
    res.json({ reports: dbStore.listReports(req.authUser!.uid) });
  });

  app.post('/api/reports/generate', requireAuth, async (req: Request, res: Response) => {
    const uid = req.authUser!.uid;
    const projectId = String(req.body?.projectId ?? '');
    const format = (['CSV', 'JSON', 'PDF'].includes(req.body?.format) ? req.body.format : 'PDF') as 'PDF' | 'CSV' | 'JSON';

    const project = dbStore.getProject(projectId);
    if (!project || project.owner_uid !== uid) {
      res.status(404).json({ error: 'Project not found or unauthorized.' });
      return;
    }

    const samples = dbStore.listSamples(uid, projectId);
    const sampleIds = new Set(samples.map((s) => s.id));
    const taxa = dbStore.listTaxa(uid).filter((t) => sampleIds.has(t.sample_id));
    const bio = dbStore.listBiodiversityResults(uid).filter((b) => sampleIds.has(b.sample_id));

    const summaryText = await generateReportInterpretation({
      project,
      samples,
      biodiversity: bio,
      taxa,
    }).catch(() => 'Automated interpretation unavailable; verified quantitative tables attached.');

    const reportId = crypto.randomUUID();
    const payloadObj = {
      generatedAt: new Date().toISOString(),
      project,
      samples,
      biodiversityMetrics: bio,
      taxonomicAssignments: taxa,
      interpretation: summaryText,
      limitations: [
        'Sequencing read abundance reflects relative amplicon reads and is not directly equivalent to actual organism counts or biomass due to PCR primer bias and gene copy-number variation.',
        'Taxonomic resolution depends on marker length, reference database completeness, and sequence quality.',
      ],
    };

    const csvHeader = 'Sample,QueryID,ScientificName,TaxonomyID,Rank,IdentityPct,CoveragePct,EValue,Confidence,ReferenceSource\n';
    const sampleNameMap = new Map(samples.map((s) => [s.id, s.sample_name]));
    const csvRows = taxa
      .map((t) =>
        [
          sampleNameMap.get(t.sample_id) ?? t.sample_id,
          t.query_sequence_id,
          t.scientific_name,
          t.taxonomy_id,
          t.taxonomic_rank,
          t.percentage_identity,
          t.query_coverage,
          t.e_value,
          t.confidence,
          t.reference_source,
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const storageContent = format === 'CSV' ? csvHeader + csvRows : JSON.stringify(payloadObj, null, 2);
    const ext = format === 'CSV' ? 'csv' : 'json';
    const storagePath = await dbStore.saveFile(
      'edna-reports',
      `${uid}/${projectId}/${reportId}.${ext}`,
      storageContent,
      format === 'CSV' ? 'text/csv' : 'application/json'
    );

    const report = await dbStore.createReport({
      id: reportId,
      owner_uid: uid,
      project_id: projectId,
      report_name: `${project.project_name} — ${format} Biodiversity Report`,
      format,
      storage_path: storagePath,
      summary_text: summaryText,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ report, reportData: payloadObj });
  });

  app.get('/api/reports/:id/download', requireAuth, async (req: Request, res: Response) => {
    const report = dbStore.getReport(String(req.params.id));
    if (!report || report.owner_uid !== req.authUser!.uid) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    const buf = await dbStore.readFile(report.storage_path);
    const isCsv = report.storage_path.endsWith('.csv');
    res.setHeader('Content-Disposition', `attachment; filename="ecodna_report_${report.id.slice(0, 8)}.${isCsv ? 'csv' : 'json'}"`);
    res.setHeader('Content-Type', isCsv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
    res.send(buf);
  });

  // ============================================================================
  // HIDDEN ADMINISTRATOR CONTROL CENTER ROUTES (Server-Verified RBAC Only)
  // ============================================================================
  app.post('/api/admin/log-login', requireAdmin, async (req: Request, res: Response) => {
    await dbStore.appendAuditLog({
      actor_uid: req.authUser!.uid,
      actor_email: req.authUser!.email,
      action: 'ADMIN_LOGIN',
      target_id: req.authUser!.uid,
      details: { userAgent: req.headers['user-agent'] ?? 'unknown' },
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/overview', requireAdmin, async (_req: Request, res: Response) => {
    const profiles = dbStore.listAllProfiles();
    const projects = dbStore.listAllProjects();
    const datasets = dbStore.listAllDatasets();
    const jobs = dbStore.listAllJobs();
    const taxa = dbStore.listAllTaxa();
    const supa = await dbStore.checkSupabaseHealth();

    res.json({
      metrics: {
        totalUsers: profiles.length,
        activeUsers: profiles.filter((p) => p.account_status === 'active').length,
        totalProjects: projects.length,
        totalDatasets: datasets.length,
        totalSequencesProcessed: datasets.reduce((acc, d) => acc + d.sequence_count, 0),
        completedJobs: jobs.filter((j) => j.job_status === 'completed').length,
        failedJobs: jobs.filter((j) => j.job_status === 'failed').length,
        totalIdentifiedTaxa: new Set(
          taxa.filter((t) => t.confidence !== 'Unclassified').map((t) => t.scientific_name)
        ).size,
      },
      services: {
        firebase: 'Connected (Admin Token Verification Active)',
        supabase: supa.connected ? 'Connected' : 'Local Persistent Fallback',
        gemini: isGeminiConfigured() ? 'Configured' : 'API Key Missing',
        ncbiBlast: dbStore.getSystemConfig().enableLiveNcbiBlast ? 'Enabled' : 'Disabled',
      },
    });
  });

  app.get('/api/admin/users', requireAdmin, (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase().trim() : '';
    let users = dbStore.listAllProfiles();
    if (q) {
      users = users.filter(
        (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    res.json({ users });
  });

  app.patch('/api/admin/users/:uid/status', requireAdmin, async (req: Request, res: Response) => {
    const targetUid = String(req.params.uid);
    const status = req.body?.status === 'disabled' ? 'disabled' : 'active';
    if (targetUid === req.authUser!.uid && status === 'disabled') {
      res.status(400).json({ error: 'Administrators cannot disable their own active account.' });
      return;
    }
    const updated = await dbStore.updateUserStatus(targetUid, status);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    await dbStore.appendAuditLog({
      actor_uid: req.authUser!.uid,
      actor_email: req.authUser!.email,
      action: status === 'disabled' ? 'DISABLE_USER_ACCOUNT' : 'ENABLE_USER_ACCOUNT',
      target_id: targetUid,
      details: { targetEmail: updated.email, newStatus: status },
    });
    res.json({ user: updated });
  });

  app.patch('/api/admin/users/:uid/role', requireAdmin, async (req: Request, res: Response) => {
    const targetUid = String(req.params.uid);
    const role = req.body?.role === 'admin' ? 'admin' : 'user';
    if (targetUid === req.authUser!.uid && role !== 'admin') {
      res.status(400).json({ error: 'Administrators cannot revoke their own admin role.' });
      return;
    }
    const updated = await dbStore.updateUserRole(targetUid, role);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    await dbStore.appendAuditLog({
      actor_uid: req.authUser!.uid,
      actor_email: req.authUser!.email,
      action: 'CHANGE_USER_ROLE',
      target_id: targetUid,
      details: { targetEmail: updated.email, newRole: role },
    });
    res.json({ user: updated });
  });

  app.delete('/api/admin/users/:uid', requireAdmin, async (req: Request, res: Response) => {
    const targetUid = String(req.params.uid);
    if (targetUid === req.authUser!.uid) {
      res.status(400).json({ error: 'Administrators cannot delete their own account.' });
      return;
    }
    const target = dbStore.getProfileByUid(targetUid);
    const deleted = await dbStore.deleteUserAccount(targetUid);
    if (!deleted) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    await dbStore.appendAuditLog({
      actor_uid: req.authUser!.uid,
      actor_email: req.authUser!.email,
      action: 'DELETE_USER_ACCOUNT',
      target_id: targetUid,
      details: { deletedEmail: target?.email ?? 'unknown' },
    });
    res.json({ deleted: true });
  });

  app.get('/api/admin/datasets', requireAdmin, (_req: Request, res: Response) => {
    const datasets = dbStore.listAllDatasets();
    const profiles = new Map(dbStore.listAllProfiles().map((p) => [p.firebase_uid, p]));
    const projects = new Map(dbStore.listAllProjects().map((p) => [p.id, p]));
    res.json({
      datasets: datasets.map((d) => ({
        ...d,
        ownerEmail: profiles.get(d.owner_uid)?.email ?? d.owner_uid,
        projectName: Array.from(projects.values()).find((p) => p.owner_uid === d.owner_uid)?.project_name ?? 'Research Project',
      })),
    });
  });

  app.delete('/api/admin/datasets/:id', requireAdmin, async (req: Request, res: Response) => {
    const removed = await dbStore.deleteDatasetAdmin(String(req.params.id));
    if (!removed) {
      res.status(404).json({ error: 'Dataset not found.' });
      return;
    }
    await dbStore.appendAuditLog({
      actor_uid: req.authUser!.uid,
      actor_email: req.authUser!.email,
      action: 'ADMIN_DELETE_DATASET',
      target_id: removed.id,
      details: { fileName: removed.file_name, ownerUid: removed.owner_uid },
    });
    res.json({ deleted: true });
  });

  app.get('/api/admin/jobs', requireAdmin, (_req: Request, res: Response) => {
    res.json({ jobs: dbStore.listAllJobs() });
  });

  app.post('/api/admin/jobs/:id/retry', requireAdmin, async (req: Request, res: Response) => {
    const job = dbStore.getJob(String(req.params.id));
    if (!job || !job.dataset_id) {
      res.status(404).json({ error: 'Analysis job or dataset not found.' });
      return;
    }
    await dbStore.updateJob(job.id, {
      job_status: 'pending',
      progress: 5,
      error_message: null,
      current_stage: 'Queued for retry by administrator',
    });
    await dbStore.appendAuditLog({
      actor_uid: req.authUser!.uid,
      actor_email: req.authUser!.email,
      action: 'RETRY_ANALYSIS_JOB',
      target_id: job.id,
      details: { ownerUid: job.owner_uid },
    });
    const dsId = job.dataset_id;
    setImmediate(() => {
      void runAnalysisJobAsync(job.id, job.owner_uid, job.sample_id, dsId, job.reference_mode);
    });
    res.json({ retried: true });
  });

  app.get('/api/admin/science-overview', requireAdmin, (_req: Request, res: Response) => {
    const taxa = dbStore.listAllTaxa();
    const bio = dbStore.listAllBiodiversityResults();
    const counts = new Map<string, number>();
    for (const t of taxa) {
      if (t.confidence === 'Unclassified') continue;
      counts.set(t.scientific_name, (counts.get(t.scientific_name) ?? 0) + 1);
    }
    const topTaxa = Array.from(counts.entries())
      .map(([scientificName, count]) => ({ scientificName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const meanShannon = bio.length
      ? Number((bio.reduce((a, b) => a + b.shannon_index, 0) / bio.length).toFixed(3))
      : 0;

    res.json({
      totalAssignments: taxa.length,
      totalBiodiversityRuns: bio.length,
      meanShannonIndex: meanShannon,
      topTaxa,
    });
  });

  app.get('/api/admin/settings', requireAdmin, async (_req: Request, res: Response) => {
    const supa = await dbStore.checkSupabaseHealth();
    res.json({
      config: dbStore.getSystemConfig(),
      statuses: {
        api: 'Operational',
        firebase: 'Connected (Verified ID Tokens)',
        supabase: supa.detail,
        gemini: isGeminiConfigured() ? 'Connected (gemini-4-hydrogen)' : 'Missing GEMINI_API_KEY',
        referenceDb: 'NCBI BLAST + NCBI Taxonomy + BOLD + Local Curated Marker DB',
      },
    });
  });

  app.patch('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const updated = await dbStore.updateSystemConfig({
      ...(body.maxUploadSizeMb !== undefined ? { maxUploadSizeMb: Math.max(1, Math.min(50, Number(body.maxUploadSizeMb))) } : {}),
      ...(body.defaultMinQuality !== undefined ? { defaultMinQuality: Math.max(0, Math.min(40, Number(body.defaultMinQuality))) } : {}),
      ...(body.defaultMinLength !== undefined ? { defaultMinLength: Math.max(20, Math.min(1000, Number(body.defaultMinLength))) } : {}),
      ...(body.enableLiveNcbiBlast !== undefined ? { enableLiveNcbiBlast: Boolean(body.enableLiveNcbiBlast) } : {}),
      ...(body.enableBoldSystems !== undefined ? { enableBoldSystems: Boolean(body.enableBoldSystems) } : {}),
      ...(body.maintenanceMode !== undefined ? { maintenanceMode: Boolean(body.maintenanceMode) } : {}),
    });
    await dbStore.appendAuditLog({
      actor_uid: req.authUser!.uid,
      actor_email: req.authUser!.email,
      action: 'UPDATE_SYSTEM_SETTINGS',
      target_id: 'system_config',
      details: updated as unknown as Record<string, unknown>,
    });
    res.json({ config: updated });
  });

  app.get('/api/admin/audit-logs', requireAdmin, (_req: Request, res: Response) => {
    res.json({ logs: dbStore.listAuditLogs() });
  });

  // Vite Dev Middleware or Production Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EcoDNA AI server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
