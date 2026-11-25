-- EcoDNA AI — Supabase Private Storage Buckets & Access Policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('edna-datasets', 'edna-datasets', false, 10485760, ARRAY['text/plain', 'text/csv', 'text/tab-separated-values', 'application/json', 'application/octet-stream']),
  ('edna-reports', 'edna-reports', false, 10485760, ARRAY['application/pdf', 'text/csv'])
ON CONFLICT (id) DO NOTHING;

-- Folder structure: {firebase_uid}/{project_id}/{filename}
CREATE POLICY "datasets_storage_owner_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'edna-datasets'
    AND (storage.foldername(name))[1] = public.current_firebase_uid()
  );

CREATE POLICY "datasets_storage_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'edna-datasets'
    AND (storage.foldername(name))[1] = public.current_firebase_uid()
  );

CREATE POLICY "datasets_storage_owner_or_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'edna-datasets'
    AND (
      (storage.foldername(name))[1] = public.current_firebase_uid()
      OR public.is_verified_admin()
    )
  );

CREATE POLICY "reports_storage_owner_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'edna-reports'
    AND (storage.foldername(name))[1] = public.current_firebase_uid()
  );

CREATE POLICY "reports_storage_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'edna-reports'
    AND (storage.foldername(name))[1] = public.current_firebase_uid()
  );
