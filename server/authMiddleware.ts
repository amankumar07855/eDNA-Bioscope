import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { dbStore } from './storageAdapter.ts';
import type { UserRole } from './types.ts';

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: VerifiedAuthUser;
    }
  }
}

function getFirebaseProjectId(): string {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectId?: string };
      if (parsed.projectId && parsed.projectId !== 'remixed-project-id') {
        return parsed.projectId;
      }
    } catch {
      // Fallback below
    }
  }
  return process.env.FIREBASE_PROJECT_ID || 'shining-axle-npd8p';
}

function getAdminAuth() {
  const projectId = getFirebaseProjectId();
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

export async function verifyBearerToken(req: Request): Promise<{ uid: string; email: string; emailVerified: boolean; name?: string }> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new Error('Missing Authorization Bearer token');
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new Error('Empty Authorization Bearer token');
  }

  const decoded = await getAdminAuth().verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email ?? '',
    emailVerified: Boolean(decoded.email_verified),
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const decoded = await verifyBearerToken(req);

    // Ensure profile exists on server without trusting any client-supplied role
    const profile =
      dbStore.getProfileByUid(decoded.uid) ??
      (await dbStore.upsertProfileOnAuth({
        firebaseUid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.emailVerified,
        fullName: decoded.name,
      }));

    if (profile.account_status === 'disabled') {
      res.status(403).json({ error: 'This account has been disabled by an administrator.' });
      return;
    }

    req.authUser = {
      uid: decoded.uid,
      email: profile.email || decoded.email,
      emailVerified: decoded.emailVerified,
      role: profile.role,
      fullName: profile.full_name,
    };

    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid or expired Firebase authentication token',
    });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    if (!req.authUser || req.authUser.role !== 'admin') {
      if (req.authUser) {
        await dbStore.appendAuditLog({
          actor_uid: req.authUser.uid,
          actor_email: req.authUser.email,
          action: 'UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT',
          target_id: req.originalUrl,
          details: { method: req.method },
        });
      }
      res.status(403).json({ error: 'Forbidden: verified administrator privileges required.' });
      return;
    }
    next();
  });
}
