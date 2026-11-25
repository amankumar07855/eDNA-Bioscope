import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountStatus,
  AnalysisJobRecord,
  AuditLogRecord,
  BiodiversityResultRecord,
  DatabaseState,
  DatasetRecord,
  ProfileRecord,
  ProjectRecord,
  ReportRecord,
  SampleRecord,
  SequenceRecord,
  SystemConfigRecord,
  TaxonomicAssignmentRecord,
  UserRole,
} from './types.ts';

const DATA_ROOT = path.resolve(process.cwd(), '.ecodna-data');
const DB_FILE = path.join(DATA_ROOT, 'db.json');
const FILES_DIR = path.join(DATA_ROOT, 'files');

const DEFAULT_SYSTEM_CONFIG: SystemConfigRecord = {
  maxUploadSizeMb: 10,
  defaultMinQuality: 20,
  defaultMinLength: 80,
  enableLiveNcbiBlast: true,
  enableBoldSystems: true,
  maintenanceMode: false,
  updatedAt: new Date().toISOString(),
};

function createEmptyDb(): DatabaseState {
  return {
    profiles: [],
    projects: [],
    samples: [],
    datasets: [],
    sequences: [],
    taxonomic_assignments: [],
    biodiversity_results: [],
    analysis_jobs: [],
    reports: [],
    audit_logs: [],
    system_config: { ...DEFAULT_SYSTEM_CONFIG },
  };
}

class StorageAdapter {
  private supabase: SupabaseClient | null = null;
  private state: DatabaseState;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
    if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DatabaseState>;
        this.state = {
          ...createEmptyDb(),
          ...parsed,
          system_config: { ...DEFAULT_SYSTEM_CONFIG, ...(parsed.system_config ?? {}) },
        };
      } catch {
        this.state = createEmptyDb();
      }
    } else {
      this.state = createEmptyDb();
      this.persistSync();
    }
  }

  public isSupabaseConfigured(): boolean {
    return this.supabase !== null;
  }

  public async checkSupabaseHealth(): Promise<{ connected: boolean; mode: 'supabase' | 'local-persistent'; detail: string }> {
    if (!this.supabase) {
      return {
        connected: false,
        mode: 'local-persistent',
        detail: 'Local server persistence active (.ecodna-data). Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable cloud PostgreSQL & Storage.',
      };
    }
    try {
      const { error } = await this.supabase.from('profiles').select('id').limit(1);
      if (error) {
        return { connected: false, mode: 'local-persistent', detail: error.message };
      }
      return { connected: true, mode: 'supabase', detail: 'Connected to Supabase PostgreSQL & Storage' };
    } catch (err) {
      return {
        connected: false,
        mode: 'local-persistent',
        detail: err instanceof Error ? err.message : 'Supabase connection error',
      };
    }
  }

  private persistSync(): void {
    const tmp = `${DB_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${DB_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      await fs.promises.rename(tmp, DB_FILE);
    });
    return this.writeQueue;
  }

  // Confined file storage (prevents path traversal)
  private resolveSafePath(relativePath: string): string {
    const cleaned = relativePath.replace(/^\/+/, '');
    const resolved = path.resolve(FILES_DIR, cleaned);
    if (!resolved.startsWith(FILES_DIR + path.sep)) {
      throw new Error('Invalid storage path');
    }
    return resolved;
  }

  public async saveFile(bucket: 'edna-datasets' | 'edna-reports', relativePath: string, content: Buffer | string, contentType: string): Promise<string> {
    const storagePath = `${bucket}/${relativePath}`;
    const safeDiskPath = this.resolveSafePath(storagePath);
    await fs.promises.mkdir(path.dirname(safeDiskPath), { recursive: true });
    await fs.promises.writeFile(safeDiskPath, content);

    if (this.supabase) {
      await this.supabase.storage.from(bucket).upload(relativePath, content, {
        contentType,
        upsert: true,
      }).catch(() => null);
    }
    return storagePath;
  }

  public async readFile(storagePath: string): Promise<Buffer> {
    const safeDiskPath = this.resolveSafePath(storagePath);
    if (fs.existsSync(safeDiskPath)) {
      return fs.promises.readFile(safeDiskPath);
    }
    if (this.supabase) {
      const slashIdx = storagePath.indexOf('/');
      if (slashIdx > 0) {
        const bucket = storagePath.slice(0, slashIdx);
        const rel = storagePath.slice(slashIdx + 1);
        const { data, error } = await this.supabase.storage.from(bucket).download(rel);
        if (!error && data) {
          return Buffer.from(await data.arrayBuffer());
        }
      }
    }
    throw new Error('Stored file not found');
  }

  public async deleteFile(storagePath: string | null): Promise<void> {
    if (!storagePath) return;
    try {
      const safeDiskPath = this.resolveSafePath(storagePath);
      if (fs.existsSync(safeDiskPath)) {
        await fs.promises.unlink(safeDiskPath);
      }
    } catch {
      // Ignore missing disk path
    }
    if (this.supabase) {
      const slashIdx = storagePath.indexOf('/');
      if (slashIdx > 0) {
        const bucket = storagePath.slice(0, slashIdx);
        const rel = storagePath.slice(slashIdx + 1);
        await this.supabase.storage.from(bucket).remove([rel]).catch(() => null);
      }
    }
  }

  // Profile & RBAC Operations
  public getBootstrapAdminEmails(): string[] {
    const envEmails = (process.env.ADMIN_BOOTSTRAP_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(['singhsujit07855@gmail.com', ...envEmails]));
  }

  public async upsertProfileOnAuth(input: {
    firebaseUid: string;
    email: string;
    emailVerified: boolean;
    fullName?: string;
    country?: string;
    institution?: string;
    userCategory?: string;
  }): Promise<ProfileRecord> {
    const now = new Date().toISOString();
    const existing = this.state.profiles.find((p) => p.firebase_uid === input.firebaseUid);
    const bootstrapAdmins = this.getBootstrapAdminEmails();
    const shouldBootstrapAdmin = input.emailVerified && bootstrapAdmins.includes(input.email.toLowerCase());

    if (existing) {
      existing.email = input.email || existing.email;
      existing.email_verified = input.emailVerified;
      if (input.fullName && input.fullName.trim().length >= 2) existing.full_name = input.fullName.trim();
      if (input.country && input.country.trim().length >= 2) existing.country = input.country.trim();
      if (typeof input.institution === 'string') existing.institution = input.institution.trim();
      if (input.userCategory) existing.user_category = input.userCategory;
      if (shouldBootstrapAdmin && existing.role !== 'admin') {
        existing.role = 'admin';
      }
      existing.updated_at = now;
      await this.persist();
      if (this.supabase) {
        try {
          await this.supabase.from('profiles').upsert({
            firebase_uid: existing.firebase_uid,
            full_name: existing.full_name,
            email: existing.email,
            country: existing.country,
            institution: existing.institution,
            user_category: existing.user_category,
            role: existing.role,
            account_status: existing.account_status,
            updated_at: now,
          }, { onConflict: 'firebase_uid' });
        } catch {
          // Local store remains authoritative fallback
        }
      }
      return existing;
    }

    const record: ProfileRecord = {
      id: crypto.randomUUID(),
      firebase_uid: input.firebaseUid,
      full_name: (input.fullName?.trim() || input.email.split('@')[0] || 'Researcher').slice(0, 120),
      email: input.email,
      country: input.country?.trim() || 'Unspecified',
      institution: input.institution?.trim() || '',
      user_category: input.userCategory || 'Researcher',
      role: shouldBootstrapAdmin ? 'admin' : 'user',
      account_status: 'active',
      email_verified: input.emailVerified,
      created_at: now,
      updated_at: now,
    };

    this.state.profiles.push(record);
    await this.persist();

    if (this.supabase) {
      try {
        await this.supabase.from('profiles').upsert({
          id: record.id,
          firebase_uid: record.firebase_uid,
          full_name: record.full_name,
          email: record.email,
          country: record.country,
          institution: record.institution,
          user_category: record.user_category,
          role: record.role,
          account_status: record.account_status,
        }, { onConflict: 'firebase_uid' });
      } catch {
        // Local store remains authoritative fallback
      }
    }

    return record;
  }

  public getProfileByUid(uid: string): ProfileRecord | undefined {
    return this.state.profiles.find((p) => p.firebase_uid === uid);
  }

  public listAllProfiles(): ProfileRecord[] {
    return [...this.state.profiles].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public async updateUserStatus(uid: string, status: AccountStatus): Promise<ProfileRecord | null> {
    const profile = this.state.profiles.find((p) => p.firebase_uid === uid);
    if (!profile) return null;
    profile.account_status = status;
    profile.updated_at = new Date().toISOString();
    await this.persist();
    return profile;
  }

  public async updateUserRole(uid: string, role: UserRole): Promise<ProfileRecord | null> {
    const profile = this.state.profiles.find((p) => p.firebase_uid === uid);
    if (!profile) return null;
    profile.role = role;
    profile.updated_at = new Date().toISOString();
    await this.persist();
    return profile;
  }

  public async deleteUserAccount(uid: string): Promise<boolean> {
    const idx = this.state.profiles.findIndex((p) => p.firebase_uid === uid);
    if (idx === -1) return false;
    this.state.profiles.splice(idx, 1);

    const userDatasets = this.state.datasets.filter((d) => d.owner_uid === uid);
    for (const ds of userDatasets) {
      await this.deleteFile(ds.storage_path);
      await this.deleteFile(ds.cleaned_storage_path);
    }
    const userReports = this.state.reports.filter((r) => r.owner_uid === uid);
    for (const rp of userReports) {
      await this.deleteFile(rp.storage_path);
    }

    this.state.projects = this.state.projects.filter((p) => p.owner_uid !== uid);
    this.state.samples = this.state.samples.filter((s) => s.owner_uid !== uid);
    this.state.datasets = this.state.datasets.filter((d) => d.owner_uid !== uid);
    this.state.sequences = this.state.sequences.filter((q) => q.owner_uid !== uid);
    this.state.taxonomic_assignments = this.state.taxonomic_assignments.filter((t) => t.owner_uid !== uid);
    this.state.biodiversity_results = this.state.biodiversity_results.filter((b) => b.owner_uid !== uid);
    this.state.analysis_jobs = this.state.analysis_jobs.filter((j) => j.owner_uid !== uid);
    this.state.reports = this.state.reports.filter((r) => r.owner_uid !== uid);

    await this.persist();
    return true;
  }

  // Projects
  public listProjects(ownerUid: string): ProjectRecord[] {
    return this.state.projects
      .filter((p) => p.owner_uid === ownerUid)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public listAllProjects(): ProjectRecord[] {
    return [...this.state.projects].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getProject(id: string): ProjectRecord | undefined {
    return this.state.projects.find((p) => p.id === id);
  }

  public async createProject(project: ProjectRecord): Promise<ProjectRecord> {
    this.state.projects.push(project);
    await this.persist();
    if (this.supabase) {
      try {
        await this.supabase.from('projects').insert(project);
      } catch {
        // Local store remains authoritative fallback
      }
    }
    return project;
  }

  public async updateProject(id: string, ownerUid: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
    const project = this.state.projects.find((p) => p.id === id && p.owner_uid === ownerUid);
    if (!project) return null;
    Object.assign(project, patch, { updated_at: new Date().toISOString() });
    await this.persist();
    return project;
  }

  public async deleteProject(id: string, ownerUid: string): Promise<boolean> {
    const idx = this.state.projects.findIndex((p) => p.id === id && p.owner_uid === ownerUid);
    if (idx === -1) return false;
    this.state.projects.splice(idx, 1);
    const sampleIds = new Set(this.state.samples.filter((s) => s.project_id === id).map((s) => s.id));
    this.state.samples = this.state.samples.filter((s) => s.project_id !== id);
    const datasetIds = new Set(this.state.datasets.filter((d) => sampleIds.has(d.sample_id)).map((d) => d.id));
    for (const ds of this.state.datasets.filter((d) => datasetIds.has(d.id))) {
      await this.deleteFile(ds.storage_path);
      await this.deleteFile(ds.cleaned_storage_path);
    }
    this.state.datasets = this.state.datasets.filter((d) => !datasetIds.has(d.id));
    this.state.sequences = this.state.sequences.filter((q) => !datasetIds.has(q.dataset_id));
    this.state.taxonomic_assignments = this.state.taxonomic_assignments.filter((t) => !sampleIds.has(t.sample_id));
    this.state.biodiversity_results = this.state.biodiversity_results.filter((b) => !sampleIds.has(b.sample_id));
    this.state.analysis_jobs = this.state.analysis_jobs.filter((j) => j.project_id !== id);
    this.state.reports = this.state.reports.filter((r) => r.project_id !== id);
    await this.persist();
    return true;
  }

  // Samples
  public listSamples(ownerUid: string, projectId?: string): SampleRecord[] {
    return this.state.samples
      .filter((s) => s.owner_uid === ownerUid && (!projectId || s.project_id === projectId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getSample(id: string): SampleRecord | undefined {
    return this.state.samples.find((s) => s.id === id);
  }

  public async createSample(sample: SampleRecord): Promise<SampleRecord> {
    this.state.samples.push(sample);
    await this.persist();
    return sample;
  }

  public async updateSample(id: string, ownerUid: string, patch: Partial<SampleRecord>): Promise<SampleRecord | null> {
    const sample = this.state.samples.find((s) => s.id === id && s.owner_uid === ownerUid);
    if (!sample) return null;
    Object.assign(sample, patch);
    await this.persist();
    return sample;
  }

  public async deleteSample(id: string, ownerUid: string): Promise<boolean> {
    const idx = this.state.samples.findIndex((s) => s.id === id && s.owner_uid === ownerUid);
    if (idx === -1) return false;
    this.state.samples.splice(idx, 1);
    const dsIds = new Set(this.state.datasets.filter((d) => d.sample_id === id).map((d) => d.id));
    for (const ds of this.state.datasets.filter((d) => dsIds.has(d.id))) {
      await this.deleteFile(ds.storage_path);
      await this.deleteFile(ds.cleaned_storage_path);
    }
    this.state.datasets = this.state.datasets.filter((d) => d.sample_id !== id);
    this.state.sequences = this.state.sequences.filter((q) => !dsIds.has(q.dataset_id));
    this.state.taxonomic_assignments = this.state.taxonomic_assignments.filter((t) => t.sample_id !== id);
    this.state.biodiversity_results = this.state.biodiversity_results.filter((b) => b.sample_id !== id);
    this.state.analysis_jobs = this.state.analysis_jobs.filter((j) => j.sample_id !== id);
    await this.persist();
    return true;
  }

  // Datasets & Sequences
  public listDatasets(ownerUid: string, sampleId?: string): DatasetRecord[] {
    return this.state.datasets
      .filter((d) => d.owner_uid === ownerUid && (!sampleId || d.sample_id === sampleId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public listAllDatasets(): DatasetRecord[] {
    return [...this.state.datasets].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getDataset(id: string): DatasetRecord | undefined {
    return this.state.datasets.find((d) => d.id === id);
  }

  public async createDatasetWithSequences(dataset: DatasetRecord, sequences: SequenceRecord[]): Promise<DatasetRecord> {
    this.state.datasets.push(dataset);
    this.state.sequences.push(...sequences);
    await this.persist();
    return dataset;
  }

  public async updateDataset(id: string, patch: Partial<DatasetRecord>): Promise<DatasetRecord | null> {
    const ds = this.state.datasets.find((d) => d.id === id);
    if (!ds) return null;
    Object.assign(ds, patch);
    await this.persist();
    return ds;
  }

  public async deleteDatasetAdmin(id: string): Promise<DatasetRecord | null> {
    const idx = this.state.datasets.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    const [removed] = this.state.datasets.splice(idx, 1);
    await this.deleteFile(removed.storage_path);
    await this.deleteFile(removed.cleaned_storage_path);
    this.state.sequences = this.state.sequences.filter((q) => q.dataset_id !== id);
    this.state.taxonomic_assignments = this.state.taxonomic_assignments.filter((t) => t.dataset_id !== id);
    await this.persist();
    return removed;
  }

  public getSequencesByDataset(datasetId: string): SequenceRecord[] {
    return this.state.sequences.filter((s) => s.dataset_id === datasetId);
  }

  public async replaceSequencesForDataset(datasetId: string, sequences: SequenceRecord[]): Promise<void> {
    this.state.sequences = this.state.sequences.filter((s) => s.dataset_id !== datasetId);
    this.state.sequences.push(...sequences);
    await this.persist();
  }

  // Taxonomic Assignments & Biodiversity Results
  public listTaxa(ownerUid: string, sampleId?: string): TaxonomicAssignmentRecord[] {
    return this.state.taxonomic_assignments.filter(
      (t) => t.owner_uid === ownerUid && (!sampleId || t.sample_id === sampleId)
    );
  }

  public listAllTaxa(): TaxonomicAssignmentRecord[] {
    return this.state.taxonomic_assignments;
  }

  public async saveAnalysisResults(
    sampleId: string,
    datasetId: string,
    assignments: TaxonomicAssignmentRecord[],
    biodiversity: BiodiversityResultRecord
  ): Promise<void> {
    this.state.taxonomic_assignments = this.state.taxonomic_assignments.filter(
      (t) => !(t.sample_id === sampleId && t.dataset_id === datasetId)
    );
    this.state.taxonomic_assignments.push(...assignments);

    this.state.biodiversity_results = this.state.biodiversity_results.filter((b) => b.sample_id !== sampleId);
    this.state.biodiversity_results.push(biodiversity);
    await this.persist();
  }

  public listBiodiversityResults(ownerUid: string): BiodiversityResultRecord[] {
    return this.state.biodiversity_results
      .filter((b) => b.owner_uid === ownerUid)
      .sort((a, b) => b.analysis_date.localeCompare(a.analysis_date));
  }

  public listAllBiodiversityResults(): BiodiversityResultRecord[] {
    return this.state.biodiversity_results;
  }

  // Analysis Jobs
  public listJobs(ownerUid: string): AnalysisJobRecord[] {
    return this.state.analysis_jobs
      .filter((j) => j.owner_uid === ownerUid)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public listAllJobs(): AnalysisJobRecord[] {
    return [...this.state.analysis_jobs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getJob(id: string): AnalysisJobRecord | undefined {
    return this.state.analysis_jobs.find((j) => j.id === id);
  }

  public async createJob(job: AnalysisJobRecord): Promise<AnalysisJobRecord> {
    this.state.analysis_jobs.push(job);
    await this.persist();
    return job;
  }

  public async updateJob(id: string, patch: Partial<AnalysisJobRecord>): Promise<AnalysisJobRecord | null> {
    const job = this.state.analysis_jobs.find((j) => j.id === id);
    if (!job) return null;
    Object.assign(job, patch);
    await this.persist();
    return job;
  }

  // Reports
  public listReports(ownerUid: string): ReportRecord[] {
    return this.state.reports
      .filter((r) => r.owner_uid === ownerUid)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getReport(id: string): ReportRecord | undefined {
    return this.state.reports.find((r) => r.id === id);
  }

  public async createReport(report: ReportRecord): Promise<ReportRecord> {
    this.state.reports.push(report);
    await this.persist();
    return report;
  }

  // Audit Logs
  public listAuditLogs(): AuditLogRecord[] {
    return [...this.state.audit_logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  public async appendAuditLog(entry: Omit<AuditLogRecord, 'id' | 'timestamp'>): Promise<AuditLogRecord> {
    const log: AuditLogRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.state.audit_logs.push(log);
    await this.persist();
    return log;
  }

  // System Config
  public getSystemConfig(): SystemConfigRecord {
    return { ...this.state.system_config };
  }

  public async updateSystemConfig(patch: Partial<SystemConfigRecord>): Promise<SystemConfigRecord> {
    this.state.system_config = {
      ...this.state.system_config,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.persist();
    return { ...this.state.system_config };
  }
}

export const dbStore = new StorageAdapter();
