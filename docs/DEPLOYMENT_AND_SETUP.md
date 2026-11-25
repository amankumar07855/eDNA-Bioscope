# EcoDNA AI — Setup, Security & Deployment Guide (Problem Statement ID: 25042)

## 1. Architecture Overview
- **Identity & Auth**: Firebase Authentication + Cloud Firestore (`users/{uid}`, `admins/{uid}`).
- **Scientific Data & Storage**: Express API (`server.ts`) enforcing Firebase ID token verification via `firebase-admin/auth`, routing to Supabase PostgreSQL & Storage (when `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` are set) or the local persistent `.ecodna-data/` store in preview.
- **Bioinformatics Engine**: Real FASTA/FASTQ/CSV/TSV/JSON parsing, Phred+33 quality scoring, NCBI BLAST (`blastn`), NCBI Entrez Taxonomy, BOLD Systems ID Engine, Curated Local Marker Reference DB, and Shannon/Simpson/Pielou/Bray-Curtis/Jaccard/Rarefaction biodiversity calculations.
- **AI Research Assistant**: Server-side `@google/genai` (`gemini-4-hydrogen`) grounded strictly in verified database records.
- **Hidden Admin Environment**: `/control-center` and `/control-center/login` backed by server-verified RBAC (`requireAdmin`) and immutable `audit_logs`.

## 2. Firebase Console Configuration
1. Open [Firebase Console](https://console.firebase.google.com/) and select the provisioned project (`shining-axle-npd8p` or your custom project).
2. Go to **Authentication > Sign-in method**:
   - **Google**: Enabled by default.
   - **Email/Password**: Click **Add new provider > Email/Password > Enable** to allow public email registration, email verification, and password resets.
3. Go to **Authentication > Settings > Authorized domains** and ensure your production domain and AI Studio preview domain are listed.
4. Deploy `firestore.rules` (already deployed via AI Studio, or run `firebase deploy --only firestore:rules`).

## 3. Supabase Configuration & SQL Migrations
1. Create a project at [Supabase Dashboard](https://supabase.com/dashboard).
2. Run the SQL migrations in order in **SQL Editor**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_storage_policies.sql`
3. Deploy the Edge Function (optional if using Express `server.ts` as primary API):
   ```bash
   supabase functions deploy edna-pipeline
   supabase secrets set FIREBASE_PROJECT_ID=shining-axle-npd8p
   ```
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your server environment variables / Secrets panel (never expose `SUPABASE_SERVICE_ROLE_KEY` to `VITE_*`).

## 4. Gemini API & NCBI BLAST Setup
- **Gemini API**: Configure `GEMINI_API_KEY` in the server environment / AI Studio **Settings > Secrets**.
- **NCBI BLAST**: No key is required for standard rate-limited queries (`<= 1 request per 10 seconds` via `https://blast.ncbi.nlm.nih.gov/Blast.cgi`). When running analyses, choose **NCBI BLAST (Live)** or **Curated Local Marker DB** depending on dataset size and network policy.

## 5. Administrator Account Provisioning
Never allow users to self-select `admin` in registration forms or Firestore client writes (`firestore.rules` explicitly forbids `role` fields in `/users` and forbids all client writes to `/admins`).
To provision an administrator:
1. Ensure the user has registered and verified their email address.
2. Add their verified email to the server environment variable `ADMIN_BOOTSTRAP_EMAILS` (comma-separated) OR promote them from an existing admin session inside `/control-center` > User Management (which writes an immutable audit log entry).
3. Access the hidden administrator login at `/control-center/login`.

## 6. Testing & Verification
- Type-check: `npm run lint`
- Build production bundle: `npm run build`
- Start production server: `npm start`
- Security audit checklist:
  - Unauthenticated requests to `/api/projects` or `/api/admin/*` return `401 Unauthorized`.
  - Ordinary user token calling `/api/admin/*` returns `403 Forbidden`.
  - Setting `role: "admin"` in `localStorage` or request body has zero effect; server derives role strictly from verified Firebase ID token + server-side `profiles` role table.
