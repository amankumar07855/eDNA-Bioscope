// Supabase Edge Function: edna-pipeline
// Verifies Firebase ID token via Google's public x509 / JWKS before accessing Supabase PostgreSQL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function verifyFirebaseJwt(token: string): Promise<{ uid: string; email?: string; email_verified?: boolean }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed Firebase JWT');

  const headerJson = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
  const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

  const now = Math.floor(Date.now() / 1000);
  if (payloadJson.exp < now) throw new Error('Firebase token expired');
  if (payloadJson.aud !== FIREBASE_PROJECT_ID) throw new Error('Invalid Firebase audience');
  if (payloadJson.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error('Invalid Firebase issuer');

  const jwksRes = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const { keys } = await jwksRes.json();
  const jwk = keys.find((k: { kid: string }) => k.kid === headerJson.kid);
  if (!jwk) throw new Error('Signing key not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
  if (!valid) throw new Error('Invalid Firebase token signature');

  return {
    uid: payloadJson.sub,
    email: payloadJson.email,
    email_verified: payloadJson.email_verified,
  };
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Bearer token' }), { status: 401 });
    }

    const identity = await verifyFirebaseJwt(authHeader.slice(7));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { action, jobId } = body;

    if (action === 'get_job_status' && jobId) {
      const { data, error } = await supabase
        .from('analysis_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('owner_uid', identity.uid)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Analysis job not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ job: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, uid: identity.uid }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
