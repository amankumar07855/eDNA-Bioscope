-- EcoDNA AI — Supabase PostgreSQL Initial Schema Migration
-- Problem Statement ID: 25042

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User identity mirror & server-controlled RBAC
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT DEFAULT 'Unknown',
  institution TEXT DEFAULT '',
  user_category TEXT DEFAULT 'Researcher',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_firebase_uid ON public.profiles(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Research Projects
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid TEXT NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  research_objective TEXT NOT NULL DEFAULT '',
  study_type TEXT NOT NULL DEFAULT 'Freshwater eDNA',
  geographic_region TEXT NOT NULL DEFAULT '',
  start_date DATE,
  project_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_uid ON public.projects(owner_uid);

-- Environmental Samples
CREATE TABLE IF NOT EXISTS public.samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  sample_code TEXT NOT NULL DEFAULT '',
  sample_name TEXT NOT NULL,
  sample_type TEXT NOT NULL DEFAULT 'River',
  collection_location TEXT DEFAULT '',
  collection_date DATE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  marker TEXT NOT NULL DEFAULT 'COI',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_samples_project_id ON public.samples(project_id);
CREATE INDEX IF NOT EXISTS idx_samples_owner_uid ON public.samples(owner_uid);

-- Uploaded DNA Datasets
CREATE TABLE IF NOT EXISTS public.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  sequence_count INTEGER NOT NULL DEFAULT 0,
  malformed_count INTEGER NOT NULL DEFAULT 0,
  avg_length DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_length INTEGER NOT NULL DEFAULT 0,
  max_length INTEGER NOT NULL DEFAULT 0,
  upload_status TEXT NOT NULL DEFAULT 'uploaded' CHECK (upload_status IN ('uploaded', 'preprocessed', 'failed')),
  preprocessing_params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasets_sample_id ON public.datasets(sample_id);
CREATE INDEX IF NOT EXISTS idx_datasets_owner_uid ON public.datasets(owner_uid);

-- Parsed DNA Sequences
CREATE TABLE IF NOT EXISTS public.sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  sequence_length INTEGER NOT NULL,
  sequence_data TEXT NOT NULL,
  quality_score DOUBLE PRECISION,
  ambiguous_bases INTEGER NOT NULL DEFAULT 0,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  validation_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sequences_dataset_id ON public.sequences(dataset_id);

-- Taxonomic Assignments
CREATE TABLE IF NOT EXISTS public.taxonomic_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  sample_id UUID NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  scientific_name TEXT NOT NULL,
  common_name TEXT DEFAULT '',
  taxonomy_id TEXT NOT NULL,
  taxonomic_rank TEXT NOT NULL,
  domain_name TEXT DEFAULT '',
  kingdom_name TEXT DEFAULT '',
  phylum_name TEXT DEFAULT '',
  class_name TEXT DEFAULT '',
  order_name TEXT DEFAULT '',
  family_name TEXT DEFAULT '',
  genus_name TEXT DEFAULT '',
  species_name TEXT DEFAULT '',
  percentage_identity DOUBLE PRECISION NOT NULL,
  query_coverage DOUBLE PRECISION NOT NULL,
  e_value DOUBLE PRECISION NOT NULL,
  alignment_score DOUBLE PRECISION NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('High', 'Moderate', 'Low', 'Unclassified')),
  reference_source TEXT NOT NULL,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxonomic_sample_id ON public.taxonomic_assignments(sample_id);
CREATE INDEX IF NOT EXISTS idx_taxonomic_owner_uid ON public.taxonomic_assignments(owner_uid);

-- Biodiversity Results per Sample
CREATE TABLE IF NOT EXISTS public.biodiversity_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL,
  species_richness INTEGER NOT NULL DEFAULT 0,
  total_reads INTEGER NOT NULL DEFAULT 0,
  shannon_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  simpson_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  simpson_diversity_1_minus_d DOUBLE PRECISION NOT NULL DEFAULT 0,
  pielou_evenness DOUBLE PRECISION,
  relative_abundances JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biodiversity_sample_id ON public.biodiversity_results(sample_id);

-- Asynchronous Analysis Jobs
CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid TEXT NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sample_id UUID NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  reference_mode TEXT NOT NULL DEFAULT 'local_ref',
  job_status TEXT NOT NULL DEFAULT 'pending' CHECK (job_status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  current_stage TEXT NOT NULL DEFAULT 'Queued',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_owner_uid ON public.analysis_jobs(owner_uid);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON public.analysis_jobs(job_status);

-- Generated Reports
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid TEXT NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'PDF',
  storage_path TEXT NOT NULL,
  summary_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_owner_uid ON public.reports(owner_uid);

-- Immutable Administrative Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_uid TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
