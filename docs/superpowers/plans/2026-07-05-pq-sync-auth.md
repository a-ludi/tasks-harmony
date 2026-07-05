# Post-Quantum Sync Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AES-256 bearer-token sync auth with ML-KEM-1024 encryption + ML-DSA-87 challenge-response authentication, with a mandatory migration flow for existing users.

**Architecture:** A `PQSyncCredentials` bundle (four raw `Uint8Array` keys) replaces the single `CryptoKey`. Blobs are encrypted with a fresh KEM-derived AES key per push (`[0x02 | kemCiphertext(1568) | iv(12) | ciphertext]`). Authentication uses ML-DSA signatures over `UTF-8(nonce + syncId)` where `syncId = SHA-256(mlkemPk || mldsaPk)`. Existing users are migrated via a blocking modal on first launch: final pull with legacy auth, generate new keys, push, prompt to export.

**Tech Stack:** `@noble/post-quantum` (ML-KEM-1024, ML-DSA-87), WebCrypto (AES-GCM key import), `bun:test`, React + shadcn Dialog, Bun server.

**Spec:** `docs/superpowers/specs/2026-07-05-pq-sync-auth-design.md`

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Modify | `package.json` | add `@noble/post-quantum` |
| Modify | `sync-server/package.json` | add `@noble/post-quantum` |
| Modify | `src/db/schema.ts` | `SyncCredentials` union type + `isLegacyCredentials` |
| Modify | `src/sync/credentials.ts` | PQ key gen, `deriveSyncId`, v2 export/import |
| Modify | `src/sync/credentials.test.ts` (new) | PQ credential tests |
| Modify | `src/sync/encrypt.ts` | `encryptStatePQ`, `decryptStatePQ` |
| Modify | `src/sync/encrypt.test.ts` | PQ encrypt/decrypt tests |
| Modify | `src/sync/server.ts` | ML-DSA auth, PQ-aware push/pull/deleteRemote |
| Modify | `src/sync/server.test.ts` | update mocks for PQ |
| Create | `src/sync/migrate.ts` | migration orchestration |
| Create | `src/sync/migrate.test.ts` | migration tests |
| Modify | `sync-server/handlers/challenge.ts` | version dispatch `syncId` vs `syncToken` |
| Modify | `sync-server/handlers/challenge.test.ts` | new `syncId` tests |
| Modify | `sync-server/handlers/session.ts` | ML-DSA signature verification |
| Modify | `sync-server/handlers/session.test.ts` | PQ session tests |
| Create | `src/components/sync/MigrationModal.tsx` | migration UI |
| Modify | `src/App.tsx` | render `MigrationModal` |

---

### Task 1: Install @noble/post-quantum

**Files:**
- Modify: `package.json`
- Modify: `sync-server/package.json`

- [ ] **Step 1: Add to client**

```bash
cd /path/to/repo && bun add @noble/post-quantum
```

Expected: `package.json` gains `"@noble/post-quantum": "^0.x.x"` under `dependencies`.

- [ ] **Step 2: Add to sync-server**

```bash
cd sync-server && bun add @noble/post-quantum && cd ..
```

Expected: `sync-server/package.json` gains `"@noble/post-quantum"` under `dependencies`.

- [ ] **Step 3: Verify imports resolve**

```bash
bun -e "import { ml_kem1024 } from '@noble/post-quantum/ml-kem'; console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock sync-server/package.json sync-server/bun.lock
git commit -m "chore: add @noble/post-quantum to client and sync-server"
```

---

### Task 2: DB Schema — SyncCredentials Union Type

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Write the failing test**

Create `src/sync/credentials.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { isLegacyCredentials } from './credentials';
import type { LegacySyncCredentials, PQSyncCredentials } from '@/db/schema';

describe('isLegacyCredentials', () => {
  it('returns true for a record with cryptoKey', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    const legacy: LegacySyncCredentials = { id: 'main', cryptoKey: key };
    expect(isLegacyCredentials(legacy)).toBe(true);
  });

  it('returns false for a record with version 2 PQ fields', () => {
    const pq: PQSyncCredentials = {
      id: 'main',
      version: 2,
      mlkemPublicKey: new Uint8Array(1568),
      mlkemPrivateKey: new Uint8Array(3168),
      mldsaPublicKey: new Uint8Array(2592),
      mldsaPrivateKey: new Uint8Array(4896),
    };
    expect(isLegacyCredentials(pq)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/sync/credentials.test.ts
```

Expected: FAIL — `isLegacyCredentials` is not exported / `LegacySyncCredentials` is not defined.

- [ ] **Step 3: Update `src/db/schema.ts`**

Replace the existing `SyncCredentials` interface with:

```typescript
export interface LegacySyncCredentials {
  id: 'main';
  cryptoKey: CryptoKey;
}

export interface PQSyncCredentials {
  id: 'main';
  version: 2;
  mlkemPublicKey: Uint8Array;
  mlkemPrivateKey: Uint8Array;
  mldsaPublicKey: Uint8Array;
  mldsaPrivateKey: Uint8Array;
}

export type SyncCredentials = LegacySyncCredentials | PQSyncCredentials;
```

- [ ] **Step 4: Export `isLegacyCredentials` from `src/sync/credentials.ts`**

Add at the bottom of the existing file:

```typescript
import type { LegacySyncCredentials, SyncCredentials } from '@/db/schema';

export function isLegacyCredentials(c: SyncCredentials): c is LegacySyncCredentials {
  return 'cryptoKey' in c;
}
```

Also update the existing imports in `credentials.ts` — the file currently imports `CryptoKey` implicitly via the old `SyncCredentials`. Update the import line at the top:

```typescript
import type { SyncCredentials, LegacySyncCredentials, PQSyncCredentials } from '@/db/schema';
```

- [ ] **Step 5: Fix any TypeScript errors**

```bash
bun run typecheck
```

The existing `getOrCreateSyncKey` and `putCredentials` calls reference `SyncCredentials` — these still compile because `LegacySyncCredentials` satisfies the union. Fix any type errors that appear.

- [ ] **Step 6: Run test to verify it passes**

```bash
bun test src/sync/credentials.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/sync/credentials.ts src/sync/credentials.test.ts
git commit -m "feat(pq-auth): add PQSyncCredentials union type and isLegacyCredentials guard"
```

---

### Task 3: PQ Credentials — generatePQCredentials + deriveSyncId

**Files:**
- Modify: `src/sync/credentials.ts`
- Modify: `src/sync/credentials.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/sync/credentials.test.ts`:

```typescript
import { generatePQCredentials, deriveSyncId } from './credentials';

describe('generatePQCredentials', () => {
  it('produces keys of the correct byte lengths', async () => {
    const creds = await generatePQCredentials();
    expect(creds.version).toBe(2);
    expect(creds.mlkemPublicKey.byteLength).toBe(1568);
    expect(creds.mlkemPrivateKey.byteLength).toBe(3168);
    expect(creds.mldsaPublicKey.byteLength).toBe(2592);
    expect(creds.mldsaPrivateKey.byteLength).toBe(4896);
  });

  it('generates different keys on each call', async () => {
    const a = await generatePQCredentials();
    const b = await generatePQCredentials();
    expect(a.mlkemPublicKey).not.toEqual(b.mlkemPublicKey);
    expect(a.mldsaPublicKey).not.toEqual(b.mldsaPublicKey);
  });
});

describe('deriveSyncId', () => {
  it('returns a 64-char hex string', async () => {
    const creds = await generatePQCredentials();
    const id = await deriveSyncId(creds);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same credentials', async () => {
    const creds = await generatePQCredentials();
    expect(await deriveSyncId(creds)).toBe(await deriveSyncId(creds));
  });

  it('differs when either key changes', async () => {
    const a = await generatePQCredentials();
    const b = await generatePQCredentials();
    expect(await deriveSyncId(a)).not.toBe(await deriveSyncId(b));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/sync/credentials.test.ts
```

Expected: FAIL — `generatePQCredentials` and `deriveSyncId` not exported.

- [ ] **Step 3: Implement in `src/sync/credentials.ts`**

Add after the existing imports:

```typescript
import { ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa';
import type { PQSyncCredentials } from '@/db/schema';
```

Add the new functions at the bottom of the file:

```typescript
export async function generatePQCredentials(): Promise<PQSyncCredentials> {
  const kem = ml_kem1024.keygen();
  const dsa = ml_dsa87.keygen();
  return {
    id: 'main',
    version: 2,
    mlkemPublicKey: kem.publicKey,
    mlkemPrivateKey: kem.secretKey,
    mldsaPublicKey: dsa.publicKey,
    mldsaPrivateKey: dsa.secretKey,
  };
}

export async function deriveSyncId(creds: PQSyncCredentials): Promise<string> {
  const combined = new Uint8Array(creds.mlkemPublicKey.length + creds.mldsaPublicKey.length);
  combined.set(creds.mlkemPublicKey, 0);
  combined.set(creds.mldsaPublicKey, creds.mlkemPublicKey.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/sync/credentials.test.ts
```

Expected: PASS (key generation takes ~1–2 s)

- [ ] **Step 5: Commit**

```bash
git add src/sync/credentials.ts src/sync/credentials.test.ts
git commit -m "feat(pq-auth): add generatePQCredentials and deriveSyncId"
```

---

### Task 4: PQ Credentials — exportKeyFile / importKeyFile v2

**Files:**
- Modify: `src/sync/credentials.ts`
- Modify: `src/sync/credentials.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/sync/credentials.test.ts`:

```typescript
import { exportKeyFile, importKeyFile } from './credentials';

describe('exportKeyFile / importKeyFile', () => {
  it('round-trips PQSyncCredentials through v2 JSON', async () => {
    const creds = await generatePQCredentials();
    const json = exportKeyFile(creds);
    const parsed = JSON.parse(json) as { version: number };
    expect(parsed.version).toBe(2);

    const recovered = await importKeyFile(json);
    expect(isLegacyCredentials(recovered)).toBe(false);
    const pq = recovered as PQSyncCredentials;
    expect(pq.mlkemPublicKey).toEqual(creds.mlkemPublicKey);
    expect(pq.mlkemPrivateKey).toEqual(creds.mlkemPrivateKey);
    expect(pq.mldsaPublicKey).toEqual(creds.mldsaPublicKey);
    expect(pq.mldsaPrivateKey).toEqual(creds.mldsaPrivateKey);
  });

  it('importKeyFile on a v1 file returns LegacySyncCredentials', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    // exportKeyFile with a legacy CryptoKey (old overload via cast — tests backward compat)
    const raw = await crypto.subtle.exportKey('raw', key);
    const b64url = btoa(String.fromCharCode(...new Uint8Array(raw)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const v1Json = JSON.stringify({ version: 1, key: b64url });

    const recovered = await importKeyFile(v1Json);
    expect(isLegacyCredentials(recovered)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/sync/credentials.test.ts
```

Expected: FAIL — `exportKeyFile` signature mismatch / v2 branch not implemented.

- [ ] **Step 3: Update `exportKeyFile` and `importKeyFile` in `src/sync/credentials.ts`**

Add a helper pair before `exportKeyFile`:

```typescript
function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
```

Replace the existing `exportKeyFile` function:

```typescript
/**
 * @deprecated For LegacySyncCredentials only. Use the PQSyncCredentials overload.
 * Only called from migrate.ts.
 */
export async function exportKeyFile(creds: SyncCredentials): Promise<string> {
  if (!isLegacyCredentials(creds)) {
    return JSON.stringify({
      version: 2,
      mlkem: {
        pk: bytesToBase64url(creds.mlkemPublicKey),
        sk: bytesToBase64url(creds.mlkemPrivateKey),
      },
      mldsa: {
        pk: bytesToBase64url(creds.mldsaPublicKey),
        sk: bytesToBase64url(creds.mldsaPrivateKey),
      },
    });
  }
  // v1 legacy path
  const raw = await crypto.subtle.exportKey('raw', creds.cryptoKey);
  const b64url = btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return JSON.stringify({ version: 1, key: b64url });
}
```

Replace the existing `importKeyFile` function:

```typescript
export async function importKeyFile(jsonStr: string): Promise<SyncCredentials> {
  const parsed = JSON.parse(jsonStr) as { version?: number; key?: string; mlkem?: unknown; mldsa?: unknown };
  if (parsed.version === 2) {
    const v2 = parsed as {
      version: 2;
      mlkem: { pk: string; sk: string };
      mldsa: { pk: string; sk: string };
    };
    const mlkemPublicKey = base64urlToBytes(v2.mlkem.pk);
    const mlkemPrivateKey = base64urlToBytes(v2.mlkem.sk);
    const mldsaPublicKey = base64urlToBytes(v2.mldsa.pk);
    const mldsaPrivateKey = base64urlToBytes(v2.mldsa.sk);
    if (mlkemPublicKey.byteLength !== 1568) throw new Error('Invalid mlkem.pk length');
    if (mlkemPrivateKey.byteLength !== 3168) throw new Error('Invalid mlkem.sk length');
    if (mldsaPublicKey.byteLength !== 2592) throw new Error('Invalid mldsa.pk length');
    if (mldsaPrivateKey.byteLength !== 4896) throw new Error('Invalid mldsa.sk length');
    return { id: 'main', version: 2, mlkemPublicKey, mlkemPrivateKey, mldsaPublicKey, mldsaPrivateKey };
  }
  // v1 legacy path — produces LegacySyncCredentials (triggers migration on next sync)
  const { key: b64url } = parsed as { key: string };
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
  const raw = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return { id: 'main', cryptoKey };
}
```

Note: the old `exportKeyFile(key: CryptoKey)` signature no longer works. Check if `ProfilePage.tsx` calls it and update the call site to pass `SyncCredentials` instead.

- [ ] **Step 4: Fix call sites**

Search for `exportKeyFile` usages:

```bash
grep -rn 'exportKeyFile' src/
```

For each call site that passes a `CryptoKey` directly, update it to pass the full `SyncCredentials` object. If `ProfilePage.tsx` currently does:
```typescript
const json = await exportKeyFile(key);
```
update it to:
```typescript
const creds = await getCredentials(db);
if (!creds) return;
const json = await exportKeyFile(creds);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test src/sync/credentials.test.ts
```

Expected: PASS

- [ ] **Step 6: Run full suite**

```bash
bun run test
```

Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/sync/credentials.ts src/sync/credentials.test.ts src/components/profile/ProfilePage.tsx
git commit -m "feat(pq-auth): add v2 exportKeyFile/importKeyFile with version dispatch"
```

---

### Task 5: PQ Encrypt / Decrypt

**Files:**
- Modify: `src/sync/encrypt.ts`
- Modify: `src/sync/encrypt.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/sync/encrypt.test.ts`:

```typescript
import { encryptStatePQ, decryptStatePQ } from './encrypt';
import { generatePQCredentials } from './credentials';

describe('encryptStatePQ / decryptStatePQ', () => {
  it('output starts with 0x02 version byte and has correct minimum length', async () => {
    const creds = await generatePQCredentials();
    const blob = await encryptStatePQ(creds, makeState());
    expect(blob[0]).toBe(0x02);
    // min: 1 (version) + 1568 (kemCiphertext) + 12 (iv) + 1 (min ciphertext) = 1582
    expect(blob.length).toBeGreaterThan(1581);
  });

  it('round-trips app state', async () => {
    const creds = await generatePQCredentials();
    const state = makeState();
    const blob = await encryptStatePQ(creds, state);
    const recovered = await decryptStatePQ(creds, blob);
    expect(recovered.profile.displayName).toBe('Test');
    expect(recovered.syncState.pendingSync).toBe(false);
  });

  it('produces different ciphertext on each call (fresh KEM encapsulation)', async () => {
    const creds = await generatePQCredentials();
    const blob1 = await encryptStatePQ(creds, makeState());
    const blob2 = await encryptStatePQ(creds, makeState());
    expect(blob1).not.toEqual(blob2);
  });

  it('throws on wrong version byte', async () => {
    const creds = await generatePQCredentials();
    const bad = new Uint8Array(1600);
    bad[0] = 0x01; // wrong version
    await expect(decryptStatePQ(creds, bad)).rejects.toThrow(/version/i);
  });

  it('throws on tampered KEM ciphertext', async () => {
    const creds = await generatePQCredentials();
    const blob = await encryptStatePQ(creds, makeState());
    blob[100] ^= 0xff; // flip bits in kemCiphertext region
    await expect(decryptStatePQ(creds, blob)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/sync/encrypt.test.ts
```

Expected: FAIL — `encryptStatePQ` and `decryptStatePQ` not exported.

- [ ] **Step 3: Implement in `src/sync/encrypt.ts`**

Add after the existing imports:

```typescript
import { ml_kem1024 } from '@noble/post-quantum/ml-kem';
import type { PQSyncCredentials } from '@/db/schema';
```

Add the new functions at the bottom of the file (before the closing, after the existing `decryptState`):

```typescript
export async function encryptStatePQ(
  creds: PQSyncCredentials,
  state: AppState,
): Promise<Uint8Array> {
  const { cipherText: kemCiphertext, sharedSecret } = ml_kem1024.encapsulate(creds.mlkemPublicKey);

  const aesKey = await crypto.subtle.importKey(
    'raw', sharedSecret, { name: 'AES-GCM' }, false, ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext),
  );

  // [0x02 | kemCiphertext(1568) | iv(12) | ciphertext]
  const result = new Uint8Array(1 + kemCiphertext.length + 12 + ciphertext.length);
  result[0] = 0x02;
  result.set(kemCiphertext, 1);
  result.set(iv, 1 + kemCiphertext.length);
  result.set(ciphertext, 1 + kemCiphertext.length + 12);
  return result;
}

export async function decryptStatePQ(
  creds: PQSyncCredentials,
  blob: Uint8Array,
): Promise<AppState> {
  if (blob[0] !== 0x02) throw new Error('Unexpected blob version byte');

  const kemCiphertext = blob.slice(1, 1569);
  const iv = blob.slice(1569, 1581);
  const ciphertext = blob.slice(1581);

  const sharedSecret = ml_kem1024.decapsulate(kemCiphertext, creds.mlkemPrivateKey);
  const aesKey = await crypto.subtle.importKey(
    'raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as AppState;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/sync/encrypt.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/encrypt.ts src/sync/encrypt.test.ts
git commit -m "feat(pq-auth): add encryptStatePQ and decryptStatePQ"
```

---

### Task 6: Deprecate Legacy Functions

**Files:**
- Modify: `src/sync/credentials.ts`
- Modify: `src/sync/encrypt.ts`

This task adds `@deprecated` JSDoc to functions that must remain in place for `migrate.ts` but must not be used anywhere else.

- [ ] **Step 1: Mark deprecated functions in `src/sync/credentials.ts`**

Add `@deprecated` JSDoc to: `getOrCreateSyncKey`, `deriveSyncToken`.

Example for `getOrCreateSyncKey`:

```typescript
/**
 * @deprecated Use generatePQCredentials instead. Only called from migrate.ts.
 */
export async function getOrCreateSyncKey(db: IDBPDatabase<TasksHarmonyDB>): Promise<CryptoKey> {
```

Example for `deriveSyncToken`:

```typescript
/**
 * @deprecated Use deriveSyncId instead. Only called from migrate.ts.
 */
export async function deriveSyncToken(key: CryptoKey): Promise<string> {
```

- [ ] **Step 2: Mark deprecated functions in `src/sync/encrypt.ts`**

Add `@deprecated` JSDoc to: `encryptState`, `decryptState`.

```typescript
/**
 * @deprecated Use encryptStatePQ instead. Only called from migrate.ts.
 */
export async function encryptState(key: CryptoKey, state: AppState): Promise<Uint8Array> {
```

```typescript
/**
 * @deprecated Use decryptStatePQ instead. Only called from migrate.ts.
 */
export async function decryptState(key: CryptoKey, blob: Uint8Array): Promise<AppState> {
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/sync/credentials.ts src/sync/encrypt.ts
git commit -m "chore(pq-auth): mark legacy sync/encrypt functions as deprecated"
```

---

### Task 7: Server — Challenge Handler Version Dispatch

**Files:**
- Modify: `sync-server/handlers/challenge.ts`
- Modify: `sync-server/handlers/challenge.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `sync-server/handlers/challenge.test.ts`:

```typescript
const SYNC_ID = 'b'.repeat(64); // valid 64-char hex

describe('handleChallenge — PQ path (syncId)', () => {
  beforeEach(() => mockSet.mockClear());

  it('accepts { syncId } body and returns a 64-char hex nonce', async () => {
    const res = await handleChallenge(makeReq({ syncId: SYNC_ID }));
    expect(res.status).toBe(200);
    const body = await res.json() as { nonce: string };
    expect(body.nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores syncId in Redis under nonce key with 60s TTL', async () => {
    const res = await handleChallenge(makeReq({ syncId: SYNC_ID }));
    const { nonce } = await res.json() as { nonce: string };
    expect(mockSet).toHaveBeenCalledWith(`nonce:${nonce}`, SYNC_ID, 'EX', 60, 'NX');
  });

  it('returns 400 when syncId is not a 64-char hex string', async () => {
    const res = await handleChallenge(makeReq({ syncId: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when both syncId and syncToken are absent', async () => {
    const res = await handleChallenge(makeReq({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd sync-server && bun test handlers/challenge.test.ts && cd ..
```

Expected: FAIL — `{ syncId }` body returns 400 (current code only accepts `syncToken`).

- [ ] **Step 3: Update `sync-server/handlers/challenge.ts`**

```typescript
import { randomBytes } from 'crypto';
import { redis } from '../redis';

const HEX64 = /^[a-f0-9]{64}$/;

export async function handleChallenge(req: Request): Promise<Response> {
  let body: { syncToken?: unknown; syncId?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Determine identity: PQ path uses syncId, legacy path uses syncToken
  let identity: string;
  if (typeof body.syncId === 'string') {
    if (!HEX64.test(body.syncId)) return new Response('Bad Request', { status: 400 });
    identity = body.syncId;
  } else if (typeof body.syncToken === 'string') {
    if (!HEX64.test(body.syncToken)) return new Response('Bad Request', { status: 400 });
    identity = body.syncToken;
  } else {
    return new Response('Bad Request', { status: 400 });
  }

  const nonce = randomBytes(32).toString('hex');
  await redis.set(`nonce:${nonce}`, identity, 'EX', 60, 'NX');
  return Response.json({ nonce });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd sync-server && bun test handlers/challenge.test.ts && cd ..
```

Expected: PASS (all old + new tests)

- [ ] **Step 5: Commit**

```bash
git add sync-server/handlers/challenge.ts sync-server/handlers/challenge.test.ts
git commit -m "feat(pq-auth): challenge handler accepts syncId (PQ) alongside legacy syncToken"
```

---

### Task 8: Server — Session Handler ML-DSA Verification

**Files:**
- Modify: `sync-server/handlers/session.ts`
- Modify: `sync-server/handlers/session.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `sync-server/handlers/session.test.ts`:

```typescript
import { ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa';
import { createHash } from 'node:crypto';

function makePQPair() {
  const kem = ml_kem1024.keygen();
  const dsa = ml_dsa87.keygen();
  const combined = Buffer.concat([kem.publicKey, dsa.publicKey]);
  const syncId = createHash('sha256').update(combined).digest('hex');
  return { kem, dsa, syncId };
}

function toBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

describe('handleSession — PQ path', () => {
  beforeEach(() => { mockGetDel.mockClear(); mockSet.mockClear(); });

  it('returns 200 with sessionToken for a valid ML-DSA signature', async () => {
    const { kem, dsa, syncId } = makePQPair();
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => syncId);

    const signPayload = Buffer.from(nonce + syncId);
    const signature = ml_dsa87.sign(dsa.secretKey, signPayload);

    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(dsa.publicKey),
      mlkemPublicKey: toBase64url(kem.publicKey),
      signature: toBase64url(signature),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionToken: string };
    expect(body.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns 400 when mldsaPublicKey decodes to wrong byte length', async () => {
    const { kem, syncId } = makePQPair();
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => syncId);
    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(new Uint8Array(10)), // wrong size
      mlkemPublicKey: toBase64url(kem.publicKey),
      signature: toBase64url(new Uint8Array(4627)),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when SHA-256(mlkemPk || mldsaPk) does not match stored syncId', async () => {
    const { dsa, syncId } = makePQPair();
    const wrongKem = ml_kem1024.keygen(); // different KEM key
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => syncId);

    const signPayload = Buffer.from(nonce + syncId);
    const signature = ml_dsa87.sign(dsa.secretKey, signPayload);

    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(dsa.publicKey),
      mlkemPublicKey: toBase64url(wrongKem.publicKey),
      signature: toBase64url(signature),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered signature', async () => {
    const { kem, dsa, syncId } = makePQPair();
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => syncId);

    const signPayload = Buffer.from(nonce + syncId);
    const signature = ml_dsa87.sign(dsa.secretKey, signPayload);
    signature[0] ^= 0xff; // tamper

    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(dsa.publicKey),
      mlkemPublicKey: toBase64url(kem.publicKey),
      signature: toBase64url(signature),
    }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd sync-server && bun test handlers/session.test.ts && cd ..
```

Expected: FAIL — PQ session body returns 400 (current code expects syncToken).

- [ ] **Step 3: Implement `sync-server/handlers/session.ts`**

```typescript
import { randomBytes, createHash } from 'node:crypto';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa';
import { redis } from '../redis';

const HEX64 = /^[a-f0-9]{64}$/;
const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/;

function base64urlToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

export async function handleSession(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { nonce } = body;
  if (typeof nonce !== 'string' || !HEX64.test(nonce)) {
    return new Response('Bad Request', { status: 400 });
  }

  // PQ path: body contains mldsaPublicKey, mlkemPublicKey, signature
  if ('mldsaPublicKey' in body) {
    const { mldsaPublicKey, mlkemPublicKey, signature } = body;
    if (typeof mldsaPublicKey !== 'string' || typeof mlkemPublicKey !== 'string' || typeof signature !== 'string') {
      return new Response('Bad Request', { status: 400 });
    }

    const storedSyncId = await redis.getDel(`nonce:${nonce}`);
    if (storedSyncId === null) return new Response('Unauthorized', { status: 401 });

    let mldsaPkBytes: Uint8Array;
    let mlkemPkBytes: Uint8Array;
    let sigBytes: Uint8Array;
    try {
      mldsaPkBytes = base64urlToBytes(mldsaPublicKey);
      mlkemPkBytes = base64urlToBytes(mlkemPublicKey);
      sigBytes = base64urlToBytes(signature);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (mldsaPkBytes.byteLength !== 2592) return new Response('Bad Request', { status: 400 });
    if (mlkemPkBytes.byteLength !== 1568) return new Response('Bad Request', { status: 400 });
    if (sigBytes.byteLength !== 4627) return new Response('Bad Request', { status: 400 });

    // Verify key binding: SHA-256(mlkemPk || mldsaPk) must equal storedSyncId
    const combined = Buffer.concat([mlkemPkBytes, mldsaPkBytes]);
    const computedSyncId = createHash('sha256').update(combined).digest('hex');
    if (computedSyncId !== storedSyncId) return new Response('Unauthorized', { status: 401 });

    // Verify ML-DSA signature over UTF-8(nonce + syncId)
    const signPayload = Buffer.from(nonce + storedSyncId);
    const valid = ml_dsa87.verify(mldsaPkBytes, signPayload, sigBytes);
    if (!valid) return new Response('Unauthorized', { status: 401 });

    const sessionToken = randomBytes(32).toString('hex');
    await redis.set(`session:${sessionToken}`, storedSyncId, 'EX', 86400);
    return Response.json({ sessionToken });
  }

  // Legacy path: body contains syncToken
  const { syncToken } = body;
  if (typeof syncToken !== 'string' || !SESSION_TOKEN_RE.test(syncToken)) {
    return new Response('Bad Request', { status: 400 });
  }

  const storedSyncToken = await redis.getDel(`nonce:${nonce}`);
  if (storedSyncToken === null) return new Response('Unauthorized', { status: 401 });
  if (storedSyncToken !== syncToken) return new Response('Unauthorized', { status: 401 });

  const sessionToken = randomBytes(32).toString('hex');
  await redis.set(`session:${sessionToken}`, syncToken, 'EX', 86400);
  return Response.json({ sessionToken });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd sync-server && bun test handlers/session.test.ts && cd ..
```

Expected: PASS (all old + new tests)

- [ ] **Step 5: Commit**

```bash
git add sync-server/handlers/session.ts sync-server/handlers/session.test.ts
git commit -m "feat(pq-auth): session handler verifies ML-DSA signatures alongside legacy syncToken path"
```

---

### Task 9: Client server.ts — PQ Auth + Push/Pull/DeleteRemote

**Files:**
- Modify: `src/sync/server.ts`
- Modify: `src/sync/server.test.ts`

- [ ] **Step 1: Update mocks and write new tests in `src/sync/server.test.ts`**

Replace the existing credential/encrypt mocks and add PQ mock setup. The existing mocks use `getOrCreateSyncKey` and `deriveSyncToken` — update these:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';

process.env.VITE_SYNC_URL = 'http://test.local';

const SYNC_ID = 'd'.repeat(64);
const mockPQCreds = {
  id: 'main' as const,
  version: 2 as const,
  mlkemPublicKey: new Uint8Array(1568),
  mlkemPrivateKey: new Uint8Array(3168),
  mldsaPublicKey: new Uint8Array(2592),
  mldsaPrivateKey: new Uint8Array(4896),
};

mock.module('@/sync/credentials', () => ({
  isLegacyCredentials: mock(() => false),
  deriveSyncId: mock(async () => SYNC_ID),
}));

mock.module('@/db', () => ({
  getCredentials: mock(async () => mockPQCreds),
  getSyncState: mock(async () => null),
  putSyncState: mock(async () => {}),
}));

mock.module('@/sync/export', () => ({
  exportAppState: mock(async () => ({
    schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
    profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
    syncState: { id: 'main', pendingSync: false },
  })),
}));

mock.module('@/sync/import', () => ({ importAppState: mock(async () => {}) }));

mock.module('@/sync/encrypt', () => ({
  encryptStatePQ: mock(async () => new Uint8Array([1, 2, 3])),
  decryptStatePQ: mock(async () => ({
    schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
    profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
    syncState: { id: 'main', pendingSync: false, lastSyncedAt: '2026-01-02T00:00:00.000Z' },
  })),
}));

mock.module('@/sync/dirty', () => ({
  markDirty: mock(() => {}),
  clearDirty: mock(() => {}),
}));

mock.module('@/schemas/validate', () => ({
  validateAppState: mock(() => ({ valid: true })),
}));

const { push, pull, deleteRemote } = await import('./server');
```

Keep the existing test bodies (push succeeds, pull imports, etc.) — they should work with the new mocks since `fetch` is still mocked per-test.

Add one new test to verify `deriveSyncId` is called:

```typescript
it('push: calls deriveSyncId to determine blob URL', async () => {
  const { deriveSyncId } = await import('@/sync/credentials');
  (deriveSyncId as ReturnType<typeof mock>).mockClear();

  globalThis.fetch = mock(async (url: string) => {
    if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: 'e'.repeat(64) }), { status: 200 });
    if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: 'f'.repeat(64) }), { status: 200 });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const db = {} as never;
  await push(db);
  expect(deriveSyncId).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
bun test src/sync/server.test.ts
```

Expected: FAIL on the new test (and possibly others due to mock changes).

- [ ] **Step 3: Rewrite `src/sync/server.ts`**

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { PQSyncCredentials } from '@/db/schema';
import { exportAppState } from '@/sync/export';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { encryptStatePQ, decryptStatePQ } from '@/sync/encrypt';
import { isLegacyCredentials, deriveSyncId } from '@/sync/credentials';
import { markDirty, clearDirty } from '@/sync/dirty';
import { putSyncState, getSyncState, getCredentials } from '@/db';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa';

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const SESSION_KEY = 'sync-session-token';

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function fetchNewSessionToken(syncId: string, creds: PQSyncCredentials): Promise<string> {
  const chalRes = await fetch(`${SYNC_URL}/sync/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncId }),
  });
  if (!chalRes.ok) throw new Error(`Challenge failed: ${chalRes.status}`);
  const { nonce } = await chalRes.json() as { nonce: string };

  const signPayload = new TextEncoder().encode(nonce + syncId);
  const signature = ml_dsa87.sign(creds.mldsaPrivateKey, signPayload);

  const sessRes = await fetch(`${SYNC_URL}/sync/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nonce,
      mldsaPublicKey: bytesToBase64url(creds.mldsaPublicKey),
      mlkemPublicKey: bytesToBase64url(creds.mlkemPublicKey),
      signature: bytesToBase64url(signature),
    }),
  });
  if (!sessRes.ok) throw new Error(`Session failed: ${sessRes.status}`);
  const { sessionToken } = await sessRes.json() as { sessionToken: string };
  localStorage.setItem(SESSION_KEY, sessionToken);
  return sessionToken;
}

async function getSessionToken(syncId: string, creds: PQSyncCredentials): Promise<string> {
  return localStorage.getItem(SESSION_KEY) ?? fetchNewSessionToken(syncId, creds);
}

async function authorizedFetch(
  method: 'GET' | 'PUT' | 'DELETE',
  syncId: string,
  creds: PQSyncCredentials,
  body?: Uint8Array,
  retried = false,
): Promise<Response> {
  const sessionToken = await getSessionToken(syncId, creds);
  const res = await fetch(`${SYNC_URL}/sync/${syncId}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    body: body ? new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength) : undefined,
    keepalive: method === 'PUT',
  });
  if ((res.status === 401 || res.status === 403) && !retried) {
    localStorage.removeItem(SESSION_KEY);
    return authorizedFetch(method, syncId, creds, body, true);
  }
  return res;
}

export interface PushResult { success: boolean; status?: number; }
export type PullResult = { imported: true } | { imported: false; skipped?: 'server-newer' };
export interface DeleteResult { deleted: boolean; }

export async function push(db: IDBPDatabase<TasksHarmonyDB>): Promise<PushResult> {
  if (!SYNC_URL) return { success: false };
  const creds = await getCredentials(db);
  if (!creds || isLegacyCredentials(creds)) return { success: false };
  const syncId = await deriveSyncId(creds);

  const appState = await exportAppState(db);
  const now = new Date().toISOString();
  appState.syncState.lastSyncedAt = now;
  clearDirty();

  try {
    const blob = await encryptStatePQ(creds, appState);
    const res = await authorizedFetch('PUT', syncId, creds, blob);
    if (res.ok) {
      const syncState = await getSyncState(db);
      const base = syncState ?? { id: 'main' as const, pendingSync: true };
      await putSyncState(db, { ...base, lastSyncedAt: now, pendingSync: false });
      return { success: true };
    }
    markDirty();
    return { success: false, status: res.status };
  } catch {
    markDirty();
    return { success: false };
  }
}

export async function deleteRemote(
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<DeleteResult> {
  if (!SYNC_URL) return { deleted: false };
  const creds = await getCredentials(db);
  if (!creds || isLegacyCredentials(creds)) return { deleted: false };
  try {
    const syncId = await deriveSyncId(creds);
    const res = await authorizedFetch('DELETE', syncId, creds);
    if (res.status === 204 || res.status === 404) return { deleted: true };
    return { deleted: false };
  } catch {
    return { deleted: false };
  }
}

export async function pull(
  db: IDBPDatabase<TasksHarmonyDB>,
  options: { overwriteLocal?: boolean } = {},
): Promise<PullResult> {
  const { overwriteLocal = true } = options;
  if (!SYNC_URL) return { imported: false };
  const creds = await getCredentials(db);
  if (!creds || isLegacyCredentials(creds)) return { imported: false };
  const syncId = await deriveSyncId(creds);

  try {
    const res = await authorizedFetch('GET', syncId, creds);
    if (res.status === 404) { markDirty(); return { imported: false }; }
    if (!res.ok) return { imported: false };

    const blob = new Uint8Array(await res.arrayBuffer());
    const serverState = await decryptStatePQ(creds, blob);
    const validation = validateAppState(serverState);
    if (!validation.valid) return { imported: false };

    const localSyncState = await getSyncState(db);
    const localTs = localSyncState?.lastSyncedAt ?? '';
    const serverTs = serverState.syncState.lastSyncedAt ?? '';

    if (serverTs > localTs) {
      if (!overwriteLocal) return { imported: false, skipped: 'server-newer' };
      await importAppState(db, serverState);
      return { imported: true };
    }
    if (localTs > serverTs) markDirty();
    return { imported: false };
  } catch {
    return { imported: false };
  }
}
```

Note: `deleteRemote` previously accepted a `CryptoKey` parameter — remove it; credentials are read from DB.

- [ ] **Step 4: Fix any call sites of `deleteRemote`**

```bash
grep -rn 'deleteRemote' src/
```

Update callers that pass a `key` argument to `deleteRemote` — the new signature takes only `db`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test src/sync/server.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sync/server.ts src/sync/server.test.ts
git commit -m "feat(pq-auth): server.ts uses ML-DSA auth and PQ encrypt/decrypt"
```

---

### Task 10: Migration Module

**Files:**
- Create: `src/sync/migrate.ts`
- Create: `src/sync/migrate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/migrate.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockGetCredentials = mock(async () => null);
const mockPutCredentials = mock(async () => {});
const mockGetSyncState = mock(async () => null);
mock.module('@/db', () => ({
  getCredentials: mockGetCredentials,
  putCredentials: mockPutCredentials,
  getSyncState: mockGetSyncState,
}));

const mockGeneratePQCredentials = mock(async () => ({
  id: 'main' as const, version: 2 as const,
  mlkemPublicKey: new Uint8Array(1568), mlkemPrivateKey: new Uint8Array(3168),
  mldsaPublicKey: new Uint8Array(2592), mldsaPrivateKey: new Uint8Array(4896),
}));
const mockIsLegacyCredentials = mock((_c: unknown) => false);
mock.module('@/sync/credentials', () => ({
  generatePQCredentials: mockGeneratePQCredentials,
  isLegacyCredentials: mockIsLegacyCredentials,
  deriveSyncToken: mock(async () => 'a'.repeat(64)),
}));

const mockDecryptState = mock(async () => ({
  schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
  packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
  profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
  syncState: { id: 'main', pendingSync: false, lastSyncedAt: '2026-01-02T00:00:00.000Z' },
}));
mock.module('@/sync/encrypt', () => ({ decryptState: mockDecryptState }));

const mockPush = mock(async () => ({ success: true }));
mock.module('@/sync/server', () => ({ push: mockPush }));

mock.module('@/sync/import', () => ({ importAppState: mock(async () => {}) }));
mock.module('@/schemas/validate', () => ({ validateAppState: mock(() => ({ valid: true })) }));

const { migrate } = await import('./migrate');

describe('migrate', () => {
  beforeEach(() => {
    mockGetCredentials.mockClear();
    mockPutCredentials.mockClear();
    mockGeneratePQCredentials.mockClear();
    mockIsLegacyCredentials.mockClear();
    mockPush.mockClear();
  });

  it('is a no-op when credentials are already PQSyncCredentials', async () => {
    const pqCreds = { id: 'main', version: 2, mlkemPublicKey: new Uint8Array(1568),
      mlkemPrivateKey: new Uint8Array(3168), mldsaPublicKey: new Uint8Array(2592),
      mldsaPrivateKey: new Uint8Array(4896) };
    mockGetCredentials.mockImplementationOnce(async () => pqCreds);
    mockIsLegacyCredentials.mockImplementationOnce(() => false);

    await migrate({} as never);

    expect(mockPutCredentials).not.toHaveBeenCalled();
    expect(mockGeneratePQCredentials).not.toHaveBeenCalled();
  });

  it('generates new PQ credentials and stores them when legacy credentials exist', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }));
    mockIsLegacyCredentials.mockImplementationOnce(() => true);

    globalThis.fetch = mock(async () => new Response(null, { status: 404 })) as typeof fetch;

    await migrate({} as never);

    expect(mockGeneratePQCredentials).toHaveBeenCalled();
    expect(mockPutCredentials).toHaveBeenCalled();
  });

  it('calls push after storing new credentials', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }));
    mockIsLegacyCredentials.mockImplementationOnce(() => true);
    globalThis.fetch = mock(async () => new Response(null, { status: 404 })) as typeof fetch;

    await migrate({} as never);

    expect(mockPush).toHaveBeenCalled();
  });

  it('completes successfully when server is unreachable (skips final pull and push)', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }));
    mockIsLegacyCredentials.mockImplementationOnce(() => true);
    mockPush.mockImplementationOnce(async () => { throw new Error('network error'); });
    globalThis.fetch = mock(async () => { throw new Error('network error'); }) as typeof fetch;

    await expect(migrate({} as never)).resolves.toBeUndefined();
    expect(mockPutCredentials).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/sync/migrate.test.ts
```

Expected: FAIL — `migrate` not exported.

- [ ] **Step 3: Create `src/sync/migrate.ts`**

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { getCredentials, putCredentials, getSyncState } from '@/db';
import { isLegacyCredentials, generatePQCredentials, deriveSyncToken } from '@/sync/credentials';
import { decryptState } from '@/sync/encrypt';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { push } from '@/sync/server';

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const LEGACY_SESSION_KEY = 'sync-session-token-legacy';

async function legacyFetchSessionToken(syncToken: string): Promise<string | null> {
  try {
    const chalRes = await fetch(`${SYNC_URL}/sync/challenge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncToken }),
    });
    if (!chalRes.ok) return null;
    const { nonce } = await chalRes.json() as { nonce: string };
    const sessRes = await fetch(`${SYNC_URL}/sync/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce, syncToken }),
    });
    if (!sessRes.ok) return null;
    const { sessionToken } = await sessRes.json() as { sessionToken: string };
    return sessionToken;
  } catch { return null; }
}

export async function migrate(db: IDBPDatabase<TasksHarmonyDB>): Promise<void> {
  const creds = await getCredentials(db);
  if (!creds || !isLegacyCredentials(creds)) return;

  // Step 1: Best-effort final pull with legacy credentials
  if (SYNC_URL) {
    try {
      const syncToken = await deriveSyncToken(creds.cryptoKey);
      const sessionToken = await legacyFetchSessionToken(syncToken);
      if (sessionToken) {
        const res = await fetch(`${SYNC_URL}/sync/${syncToken}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (res.ok) {
          const blob = new Uint8Array(await res.arrayBuffer());
          const serverState = await decryptState(creds.cryptoKey, blob);
          const validation = validateAppState(serverState);
          if (validation.valid) {
            const localSyncState = await getSyncState(db);
            const localTs = localSyncState?.lastSyncedAt ?? '';
            const serverTs = serverState.syncState.lastSyncedAt ?? '';
            if (serverTs > localTs) {
              await importAppState(db, serverState);
            }
          }
        }
      }
    } catch { /* skip final pull on any error */ }
  }

  // Step 2: Generate new PQ key bundle and store it
  const pqCreds = await generatePQCredentials();
  await putCredentials(db, pqCreds);

  // Step 3: Push with new credentials (best-effort)
  try {
    await push(db);
  } catch { /* push failed; dirty flag will be set by push internals */ }

  // Clean up legacy session token
  localStorage.removeItem(LEGACY_SESSION_KEY);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/sync/migrate.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/migrate.ts src/sync/migrate.test.ts
git commit -m "feat(pq-auth): add migrate.ts to orchestrate legacy-to-PQ credential migration"
```

---

### Task 11: Migration Modal

**Files:**
- Create: `src/components/sync/MigrationModal.tsx`

- [ ] **Step 1: Create the migration modal component**

```typescript
// src/components/sync/MigrationModal.tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { migrate } from '@/sync/migrate';
import { exportKeyFile } from '@/sync/credentials';
import { getCredentials } from '@/db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Phase = 'migrating' | 'export-prompt' | 'done';

interface Props {
  open: boolean;
  onComplete: () => void;
}

export function MigrationModal({ open, onComplete }: Props) {
  const db = useAppStore((s) => s.db);
  const [phase, setPhase] = useState<Phase>('migrating');
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !db) return;
    setPhase('migrating');
    migrate(db).then(() => setPhase('export-prompt'));
  }, [open, db]);

  async function handleExport() {
    if (!db) return;
    try {
      const creds = await getCredentials(db);
      if (!creds) return;
      const json = await exportKeyFile(creds);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tasks-harmony-sync-key-v2.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Export failed. Please try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {phase === 'migrating' && (
          <>
            <DialogHeader>
              <DialogTitle>Upgrading sync encryption</DialogTitle>
              <DialogDescription>
                Your sync credentials are being upgraded to post-quantum encryption.
                This may take a moment…
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          </>
        )}

        {phase === 'export-prompt' && (
          <>
            <DialogHeader>
              <DialogTitle>Upgrade complete</DialogTitle>
              <DialogDescription>
                Your sync key has been upgraded. If you use multiple devices, export
                your new key and import it on your other devices — they will not be
                able to sync until you do.
              </DialogDescription>
            </DialogHeader>
            {exportError && (
              <p className="text-sm text-destructive">{exportError}</p>
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={onComplete}>
                Skip for now
              </Button>
              <Button onClick={handleExport}>
                Export new key
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
bun run typecheck
```

Expected: no errors. If `db` is not on the store, check `useAppStore` for the correct selector (it may be `s.db` or accessed differently — adapt accordingly).

- [ ] **Step 3: Commit**

```bash
git add src/components/sync/MigrationModal.tsx
git commit -m "feat(pq-auth): add MigrationModal component"
```

---

### Task 12: Wire Migration into App Startup

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add migration check and modal to `App.tsx`**

Add the import at the top of `src/App.tsx`:

```typescript
import { MigrationModal } from '@/components/sync/MigrationModal';
import { isLegacyCredentials } from '@/sync/credentials';
import { getCredentials } from '@/db';
```

Inside the `App` component, add state and an effect that checks for legacy credentials on mount. Insert after the existing `useSync()` call:

```typescript
const [needsMigration, setNeedsMigration] = useState(false);
const db = useAppStore((s) => s.db);

useEffect(() => {
  if (!db) return;
  getCredentials(db).then((creds) => {
    if (creds && isLegacyCredentials(creds)) setNeedsMigration(true);
  });
}, [db]);
```

Add the `MigrationModal` to the JSX, just before the closing `</div>` or alongside the existing `UpdateModal`:

```typescript
<MigrationModal
  open={needsMigration}
  onComplete={() => setNeedsMigration(false)}
/>
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
bun run test
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Final commit**

```bash
git add src/App.tsx
git commit -m "feat(pq-auth): wire migration check and modal into app startup"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by task |
|---|---|
| Key bundle (PQSyncCredentials union, isLegacyCredentials) | Task 2 |
| generatePQCredentials, deriveSyncId | Task 3 |
| exportKeyFile/importKeyFile v2 | Task 4 |
| encryptStatePQ/decryptStatePQ | Task 5 |
| Deprecation markers | Task 6 |
| Server challenge version dispatch | Task 7 |
| Server session ML-DSA verification | Task 8 |
| Client auth flow (ML-DSA signing) | Task 9 |
| push/pull/deleteRemote PQ update | Task 9 |
| migrate.ts orchestration | Task 10 |
| Migration UI (spinner + export prompt) | Task 11 |
| App startup migration gate | Task 12 |
| @noble/post-quantum install | Task 1 |

No gaps identified.

**Placeholder scan:** No TBDs, no "implement later", no vague steps. All code blocks are complete.

**Type consistency check:**
- `PQSyncCredentials` defined in Task 2, used in Tasks 3, 4, 5, 8, 9, 10, 11 ✓
- `isLegacyCredentials` defined in Task 2, used in Tasks 9, 10, 12 ✓
- `generatePQCredentials` defined in Task 3, used in Tasks 4 (test), 10 ✓
- `deriveSyncId` defined in Task 3, used in Task 9 ✓
- `exportKeyFile(creds: SyncCredentials)` defined in Task 4, used in Task 11 ✓
- `encryptStatePQ` / `decryptStatePQ` defined in Task 5, used in Tasks 9, 10 (test mock) ✓
- `migrate` defined in Task 10, used in Task 11 ✓
- `deleteRemote` signature updated in Task 9 (no longer takes `key` param) ✓
