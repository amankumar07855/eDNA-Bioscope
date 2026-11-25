export type UserRole = 'user' | 'admin';
export type AccountStatus = 'active' | 'disabled';
export type ReferenceMode = 'local_ref' | 'ncbi_blast' | 'bold_systems';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ConfidenceLevel = 'High' | 'Moderate' | 'Low' | 'Unclassified';

export interface ProfileRecord {
  id: string;
  firebase_uid: string;
  full_name: string;
  email: string;
  country: string;
  institution: string;
  user_category: string;
  role: UserRole;
  account_status: AccountStatus;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  id: string;
  owner_uid: string;
  project_name: string;
  description: string;
  research_objective: string;
  study_type: string;
  geographic_region: string;
  start_date: string;
  project_notes: string;
  created_at: string;
  updated_at: string;
}

export interface SampleRecord {
  id: string;
  project_id: string;
  owner_uid: string;
  sample_code: string;
  sample_name: string;
  sample_type: string;
  collection_location: string;
  collection_date: string;
  latitude: number | null;
  longitude: number | null;
  marker: string;
  notes: string;
  created_at: string;
}

export interface PreprocessingParams {
  minLength: number;
  maxLength: number;
  minMeanQuality: number;
  maxAmbiguousPct: number;
  deduplicate: boolean;
}

export interface PreprocessingStats {
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
}

export interface DatasetRecord {
  id: string;
  sample_id: string;
  owner_uid: string;
  storage_path: string;
  cleaned_storage_path: string | null;
  file_name: string;
  file_format: string;
  file_size: number;
  sequence_count: number;
  malformed_count: number;
  malformed_details: Array<{ lineOrIndex: number; sequenceId: string; reason: string }>;
  avg_length: number;
  min_length: number;
  max_length: number;
  upload_status: 'uploaded' | 'preprocessed' | 'failed';
  preprocessing_params: PreprocessingParams | null;
  preprocessing_stats: PreprocessingStats | null;
  created_at: string;
}

export interface SequenceRecord {
  id: string;
  dataset_id: string;
  owner_uid: string;
  sequence_id: string;
  sequence_length: number;
  sequence_data: string;
  quality_score: number | null;
  ambiguous_bases: number;
  is_valid: boolean;
  is_duplicate: boolean;
  is_filtered_out: boolean;
  validation_error: string | null;
}

export interface TaxonomicAssignmentRecord {
  id: string;
  sequence_id: string;
  sample_id: string;
  dataset_id: string;
  owner_uid: string;
  query_sequence_id: string;
  reference_id: string;
  scientific_name: string;
  common_name: string;
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
  confidence: ConfidenceLevel;
  reference_source: string;
  conservation_status: string | null;
  invasive_status: string | null;
  is_simulated: boolean;
  created_at: string;
}

export interface RelativeAbundanceItem {
  scientific_name: string;
  common_name: string;
  phylum_name: string;
  taxonomy_id: string;
  read_count: number;
  relative_abundance: number;
  mean_identity: number;
  confidence: ConfidenceLevel;
  reference_source: string;
}

export interface BiodiversityResultRecord {
  id: string;
  sample_id: string;
  owner_uid: string;
  species_richness: number;
  total_reads: number;
  shannon_index: number;
  simpson_index: number;
  simpson_diversity_1_minus_d: number;
  pielou_evenness: number | null;
  relative_abundances: RelativeAbundanceItem[];
  rarefaction_curve: Array<{ subsampleSize: number; expectedSpecies: number }>;
  analysis_date: string;
}

export interface AnalysisJobRecord {
  id: string;
  owner_uid: string;
  project_id: string;
  sample_id: string;
  dataset_id: string | null;
  reference_mode: ReferenceMode;
  job_status: JobStatus;
  progress: number;
  current_stage: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ReportRecord {
  id: string;
  owner_uid: string;
  project_id: string;
  report_name: string;
  format: 'PDF' | 'CSV' | 'JSON';
  storage_path: string;
  summary_text: string;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  actor_uid: string;
  actor_email: string;
  action: string;
  target_id: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface SystemConfigRecord {
  maxUploadSizeMb: number;
  defaultMinQuality: number;
  defaultMinLength: number;
  enableLiveNcbiBlast: boolean;
  enableBoldSystems: boolean;
  maintenanceMode: boolean;
  updatedAt: string;
}

export interface DatabaseState {
  profiles: ProfileRecord[];
  projects: ProjectRecord[];
  samples: SampleRecord[];
  datasets: DatasetRecord[];
  sequences: SequenceRecord[];
  taxonomic_assignments: TaxonomicAssignmentRecord[];
  biodiversity_results: BiodiversityResultRecord[];
  analysis_jobs: AnalysisJobRecord[];
  reports: ReportRecord[];
  audit_logs: AuditLogRecord[];
  system_config: SystemConfigRecord;
}
