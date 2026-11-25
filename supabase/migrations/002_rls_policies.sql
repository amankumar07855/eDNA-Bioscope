-- EcoDNA AI — Supabase Row Level Security (RLS) Policies
-- Enforces strict Firebase UID ownership & independent admin verification.
-- NOTE: Backend Express / Edge Functions verify Firebase ID tokens and mint scoped JWTs or use service_role strictly after verification.

CREATE OR REPLACE FUNCTION public.current_firebase_uid()
RETURNS TEXT AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''),
    NULLIF(current_setting('app.current_firebase_uid', true), '')
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.is_verified_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE firebase_uid = public.current_firebase_uid()
      AND role = 'admin'
      AND account_status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS on all tables (restrictive default deny)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomic_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biodiversity_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can view/update own non-role fields; admins can manage via verified admin check
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (firebase_uid = public.current_firebase_uid() OR public.is_verified_admin());

CREATE POLICY "profiles_insert_own_user_only" ON public.profiles
  FOR INSERT WITH CHECK (
    firebase_uid = public.current_firebase_uid()
    AND role = 'user'
    AND account_status = 'active'
  );

CREATE POLICY "profiles_update_admin_only" ON public.profiles
  FOR UPDATE USING (public.is_verified_admin());

-- Projects: strict owner isolation
CREATE POLICY "projects_owner_all" ON public.projects
  FOR ALL USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin())
  WITH CHECK (owner_uid = public.current_firebase_uid());

-- Samples: strict owner isolation
CREATE POLICY "samples_owner_all" ON public.samples
  FOR ALL USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin())
  WITH CHECK (owner_uid = public.current_firebase_uid());

-- Datasets: strict owner isolation (admins may view/delete per policy)
CREATE POLICY "datasets_select_owner_or_admin" ON public.datasets
  FOR SELECT USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin());

CREATE POLICY "datasets_insert_owner" ON public.datasets
  FOR INSERT WITH CHECK (owner_uid = public.current_firebase_uid());

CREATE POLICY "datasets_delete_owner_or_admin" ON public.datasets
  FOR DELETE USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin());

-- Sequences & Taxonomic Assignments & Biodiversity Results
CREATE POLICY "sequences_owner_or_admin" ON public.sequences
  FOR ALL USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin())
  WITH CHECK (owner_uid = public.current_firebase_uid());

CREATE POLICY "taxa_owner_or_admin" ON public.taxonomic_assignments
  FOR ALL USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin())
  WITH CHECK (owner_uid = public.current_firebase_uid());

CREATE POLICY "biodiversity_owner_or_admin" ON public.biodiversity_results
  FOR ALL USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin())
  WITH CHECK (owner_uid = public.current_firebase_uid());

-- Analysis Jobs & Reports
CREATE POLICY "jobs_owner_or_admin" ON public.analysis_jobs
  FOR ALL USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin())
  WITH CHECK (owner_uid = public.current_firebase_uid());

CREATE POLICY "reports_owner_or_admin" ON public.reports
  FOR ALL USING (owner_uid = public.current_firebase_uid() OR public.is_verified_admin())
  WITH CHECK (owner_uid = public.current_firebase_uid());

-- Audit Logs: strictly readable only by verified admins, append-only via server
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
  FOR SELECT USING (public.is_verified_admin());
