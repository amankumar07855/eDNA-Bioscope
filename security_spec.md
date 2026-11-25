# EcoDNA AI Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity Integrity**: A document at `/users/{userId}` can only be created or read when `request.auth.uid == userId` (or by a verified admin for reads).
2. **Zero Self-Assigned Roles**: The `/users/{userId}` collection does NOT accept `role`, `isAdmin`, `accountStatus`, or any privilege field. Any payload containing unauthorized keys fails `hasOnly(...)`.
3. **Immutable Ownership & Timestamps**: `uid` and `createdAt` are immutable after document creation. `createdAt` on create and `updatedAt` on update must equal `request.time`.
4. **Server-Only Admin Provisioning**: `/admins/{adminId}` denies all client writes (`allow write: if false;`), preventing privilege escalation from the browser.
5. **Email Verification Gate on Sensitive Reads**: Admin bootstrap email checks require `request.auth.token.email_verified == true`.
6. **PII Isolation**: No blanket `isSignedIn()` reads or `list` queries are permitted on `/users`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read**: `GET /users/user123` with `auth == null` -> `PERMISSION_DENIED`.
2. **Cross-User PII Read**: `GET /users/victimUid` signed in as `attackerUid` -> `PERMISSION_DENIED`.
3. **Blanket User List Scraping**: `LIST /users` signed in as ordinary user -> `PERMISSION_DENIED`.
4. **Ghost Role Field Injection (Shadow Create)**: `CREATE /users/attackerUid` including `role: "admin"` -> `PERMISSION_DENIED`.
5. **Ghost Privilege Update**: `UPDATE /users/attackerUid` including `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Self-Promotion in Admins Collection**: `CREATE /admins/attackerUid` signed in as `attackerUid` -> `PERMISSION_DENIED`.
7. **Identity Spoofing**: `CREATE /users/attackerUid` with `data.uid = "victimUid"` -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: `UPDATE /users/user123` changing `uid` or `createdAt` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `CREATE /users/user123` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
10. **Path Variable Poisoning**: `CREATE /users/invalid$id!with/1500chars...` -> `PERMISSION_DENIED`.
11. **Oversized String DoS**: `CREATE /users/user123` with `fullName` of 5,000 characters -> `PERMISSION_DENIED`.
12. **Unverified Admin Email Spoof**: Request with `token.email == "singhsujit07855@gmail.com"` and `token.email_verified == false` -> `PERMISSION_DENIED`.
