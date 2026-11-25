/**
 * EcoDNA AI Firestore Rules Adversarial Verification Spec (Phase 0)
 * Verifies that all 12 Dirty Dozen payloads fail with PERMISSION_DENIED
 * when evaluated against the Firestore Rules simulator.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated user profile read',
    operation: 'get',
    path: '/users/user_1',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-user PII read',
    operation: 'get',
    path: '/users/victim_uid',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Ordinary user listing all profiles',
    operation: 'list',
    path: '/users',
    auth: { uid: 'ordinary_uid', email: 'user@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow role injection on registration',
    operation: 'create',
    path: '/users/attacker_uid',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attacker_uid',
      fullName: 'Attacker',
      email: 'attacker@example.com',
      country: 'US',
      userCategory: 'Researcher',
      emailVerified: true,
      role: 'admin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Privilege escalation via update affectedKeys',
    operation: 'update',
    path: '/users/attacker_uid',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: { isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Direct write to /admins collection',
    operation: 'create',
    path: '/admins/attacker_uid',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: { uid: 'attacker_uid', email: 'attacker@example.com', grantedBy: 'self' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Identity spoofing via mismatched data.uid',
    operation: 'create',
    path: '/users/attacker_uid',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'victim_uid',
      fullName: 'Spoofer',
      email: 'attacker@example.com',
      country: 'US',
      userCategory: 'Researcher',
      emailVerified: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable createdAt mutation on update',
    operation: 'update',
    path: '/users/user_1',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client timestamp forgery on create',
    operation: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: {
      uid: 'user_1',
      fullName: 'User One',
      email: 'user1@example.com',
      country: 'India',
      userCategory: 'Student',
      emailVerified: false,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid path variable ID poisoning',
    operation: 'create',
    path: '/users/bad$id!chars',
    auth: { uid: 'bad$id!chars', email: 'bad@example.com', email_verified: true },
    payload: { uid: 'bad$id!chars' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Oversized fullName DoS payload',
    operation: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: {
      uid: 'user_1',
      fullName: 'A'.repeat(500),
      email: 'user1@example.com',
      country: 'India',
      userCategory: 'Researcher',
      emailVerified: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unverified email spoofing admin bootstrap address',
    operation: 'list',
    path: '/users',
    auth: { uid: 'spoof_uid', email: 'singhsujit07855@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
];
