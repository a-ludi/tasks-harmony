# Post-Quantum Sync Authentication Design

**Date:** 2026-07-05
**Status:** Approved
**Related issue:** #65 (abandoned blob cleanup)

## Background

The current sync system uses a single AES-256 symmetric key for both blob encryption and authentication. The `syncToken` (SHA-256 of the raw AES key) is the long-term bearer credential used to identify and authenticate blob access. SEC-000028 addressed log exposure of this token; this design replaces the underlying architecture with a post-quantum asymmetric scheme that eliminates the bearer-credential model entirely.

## Goals

- Replace the symmetric-key authentication model with a proper challenge-response scheme using ML-DSA signatures
- Replace AES-GCM with a KEM-based hybrid encryption scheme using ML-KEM-1024
- Ensure the scheme is post-quantum secure
- Support multi-device usage via key bundle export/import
- Provide a migration path for existing users without data loss

## Non-Goals

- Hybrid classical+PQ double-hedging (can be added later)
- Server-side blob-to-user registry or account management
- Automated cross-device key propagation

## Related Security Issues

**SEC-000025** — *Sync AES-256 master key stored in IndexedDB is exportable, enabling XSS to exfiltrate it and permanently decrypt all backups* (status: REVIEW)

This design partially changes the SEC-000025 landscape:

- **`deriveSyncToken` blocker removed.** SEC-000025's Fix Plan identified `deriveSyncToken` as a blocker for making the key non-extractable, because it calls `crypto.subtle.exportKey('raw', key)` on every push/pull. In the PQ design, `syncId` is derived from the *public* ML-KEM key — no private key export needed at runtime. This blocker no longer applies.

- **`exportKeyFile` semantics change.** SEC-000025 Option B ("rotate on export") closely resembles the migration flow in this design: generate a new key bundle, re-encrypt current state, push to the new blob path, abandon the old blob. The PQ migration is the de-facto implementation of that rotation model.

- **XSS exfiltration concern is NOT closed.** ML-KEM and ML-DSA private keys are stored as raw `Uint8Array` in IndexedDB. An XSS payload can read them just as directly as the old `CryptoKey` — the mechanism shifts from `crypto.subtle.exportKey('raw', key)` to a plain IndexedDB read, but the exposure is equivalent. SEC-000025 remains open and must be addressed independently (e.g., wrapping private key bytes with a user-derived secret at rest).

## Library

`@noble/post-quantum` (pure TypeScript, no WASM, browser and Bun compatible).

- Client: key generation, ML-KEM encapsulation/decapsulation, ML-DSA signing
- Server: ML-DSA signature verification only

---

## Key Bundle

The existing `SyncCredentials` (a single `CryptoKey`) is replaced with a four-array bundle stored as raw bytes in IndexedDB. WebCrypto does not support ML-KEM or ML-DSA, so `CryptoKey` objects are not available for these algorithms.

```typescript
export interface LegacySyncCredentials {
  id: 'main';
  cryptoKey: CryptoKey;
}

export interface PQSyncCredentials {
  id: 'main';
  version: 2;
  mlkemPublicKey: Uint8Array;   // ML-KEM-1024  — 1568 bytes
  mlkemPrivateKey: Uint8Array;  //               — 3168 bytes
  mldsaPublicKey: Uint8Array;   // ML-DSA-87     — 2592 bytes
  mldsaPrivateKey: Uint8Array;  //               — 4896 bytes
}

export type SyncCredentials = LegacySyncCredentials | PQSyncCredentials;
```

A type guard `isLegacyCredentials(c): c is LegacySyncCredentials` detects old records by checking `'cryptoKey' in c`.

---

## Blob Identity

```
syncId = hex(SHA-256(mlkemPublicKey || mldsaPublicKey))   →   64-char hex string
```

Concatenating both public keys before hashing binds them together: a client cannot present a valid ML-DSA signature from one key pair while claiming a `syncId` derived from a different ML-KEM key pair. The 64-char hex fits the existing URL pattern `/sync/[a-f0-9]{64}` and blob filename `${syncId}.enc` with no server routing changes.

---

## Blob Format

**Current (v1):** `[ iv(12) | AES-GCM-ciphertext ]`

**New (v2):** `[ 0x02(1) | kemCiphertext(1568) | iv(12) | AES-GCM-ciphertext ]`

The `0x02` version byte distinguishes new blobs from legacy blobs. After migration, all blobs pushed by any device are in v2 format; the version byte is defensive future-proofing.

### Encryption (push)

1. `mlkem1024.encapsulate(mlkemPublicKey)` → `(kemCiphertext: Uint8Array[1568], sharedSecret: Uint8Array[32])`
2. Import `sharedSecret` as a WebCrypto AES-GCM key
3. `AES-GCM.encrypt(sharedKey, iv, plaintext)` → `ciphertext`
4. Output: `[0x02 || kemCiphertext || iv || ciphertext]`

### Decryption (pull)

1. Assert `blob[0] === 0x02`
2. `kemCiphertext = blob.slice(1, 1569)`
3. `iv = blob.slice(1569, 1581)`
4. `ciphertext = blob.slice(1581)`
5. `mlkem1024.decapsulate(kemCiphertext, mlkemPrivateKey)` → `sharedSecret`
6. Import `sharedSecret` as AES-GCM key, decrypt

### Multi-device correctness

The `kemCiphertext` is stored alongside the blob. Any device holding the same `mlkemPrivateKey` can call `decapsulate(kemCiphertext, privateKey)` to recover the `sharedSecret` used by whichever device produced that blob. The scheme is fully reversible for all holders of the key bundle.

---

## Authentication Protocol

### Challenge

```
POST /sync/challenge
Body: { syncId: string }          // 64-char hex

Response: { nonce: string }       // 32 random bytes, hex-encoded
```

Server stores `nonce:{nonce} → syncId` in Redis with a 60-second TTL.

### Session

```
POST /sync/session
Body: {
  nonce: string,                  // hex
  mldsaPublicKey: string,         // base64url, 2592 bytes
  mlkemPublicKey: string,         // base64url, 1568 bytes
  signature: string               // base64url, 4627 bytes
}

Response: { sessionToken: string }
```

Server verifies in order:

1. Retrieve `syncId` from `nonce:{nonce}` in Redis (delete on read)
2. Decode `mlkemPublicKey` (must be exactly 1568 bytes) and `mldsaPublicKey` (exactly 2592 bytes) — 400 on size mismatch
3. `hex(SHA-256(mlkemPublicKeyBytes || mldsaPublicKeyBytes)) === syncId` — 401 on mismatch
4. `mlDsa87.verify(mldsaPublicKeyBytes, signatureBytes, UTF8(nonce + syncId))` — 401 on failure
5. Issue `sessionToken`, store `session:{sessionToken} → syncId` in Redis

**Sign payload:** `UTF-8(nonce + syncId)` — ASCII concatenation of the two 64-char hex strings (128 bytes total). This binds the signature to both the challenge nonce and the claimed identity.

### Blob requests

Unchanged: `Authorization: Bearer {sessionToken}` header. `blob.ts` reads `session:{sessionToken}` from Redis and compares to the URL `syncId`. No changes to `blob.ts`.

### Legacy auth (migration window)

The old `{ syncToken }` challenge path and `{ nonce, syncToken }` session path remain active on the server alongside the new PQ paths for the duration of the migration window. Dispatch is by presence of `syncId` vs `syncToken` in the request body.

---

## Key File Format

Consistent with the current v1 shape:

```json
{
  "version": 2,
  "mlkem": {
    "pk": "<base64url, 1568 bytes>",
    "sk": "<base64url, 3168 bytes>"
  },
  "mldsa": {
    "pk": "<base64url, 2592 bytes>",
    "sk": "<base64url, 4896 bytes>"
  }
}
```

Total file size: ~16 KB. `importKeyFile` version-dispatches: a v1 file produces `LegacySyncCredentials` (which triggers migration on next sync); a v2 file produces `PQSyncCredentials`.

---

## Migration Flow

### Trigger

On every app startup and before any sync operation: read `SyncCredentials` from IndexedDB. If `isLegacyCredentials(creds)` is true, begin migration. All sync operations are blocked until migration completes.

### Steps

1. **Show migration modal** — indeterminate spinner, "Upgrading your sync credentials to post-quantum encryption…"

2. **Best-effort final pull** — using the legacy auth protocol (syncToken-based challenge/session) and the legacy `decryptState` (including the gzip decompression branch). If the server blob is newer than local state, import it. If the server is unreachable, returns 404, or auth fails, skip silently — local state is used as-is.

3. **Generate new key bundle** — `mlkem1024.keygen()` + `mldsa87.keygen()`

4. **Push with new credentials** — encrypt current local state with `encryptStatePQ`, push to `/sync/{newSyncId}` using new ML-DSA auth. If the push fails (server unreachable), set the dirty flag and continue — sync will retry.

5. **Store new credentials** — write `PQSyncCredentials` to IndexedDB, discarding the old AES key. The old blob at `/${oldSyncToken}.enc` is left on the server (see issue #65 for cleanup).

6. **Export prompt** — migration modal advances to a non-blocking export screen. Single-device users can dismiss; multi-device users are warned that other devices cannot sync until the new key file is imported.

### Multi-device implications

If Device A migrates before Device B, Device B can still do its final pull from the old blob path (the old blob is not deleted). However, Device B will generate its own PQ key bundle during migration — different from Device A's. The two devices will then have different `syncId` values and diverge. Reconciliation requires Device A to export its key file and Device B to import it before migrating. This is why the export prompt is prominent.

---

## Code Changes

### New files

| File | Purpose |
|---|---|
| `src/sync/migrate.ts` | Orchestrates the five migration steps; the only file that imports both legacy and PQ sync functions |

### Modified files

| File | Changes |
|---|---|
| `src/db/schema.ts` | `SyncCredentials` becomes `LegacySyncCredentials \| PQSyncCredentials` discriminated union |
| `src/sync/credentials.ts` | Add `generatePQCredentials`, `deriveSyncId`; `exportKeyFile` signature changes from `(key: CryptoKey)` to `(creds: SyncCredentials)` and version-dispatches; `importKeyFile` version-dispatches returning `SyncCredentials`; legacy exports marked `@deprecated` |
| `src/sync/encrypt.ts` | Add `encryptStatePQ`, `decryptStatePQ`; legacy `encryptState`/`decryptState` marked `@deprecated` |
| `src/sync/server.ts` | `fetchNewSessionToken` signs with ML-DSA; `push`/`pull`/`deleteRemote` call `getCredentials(db)` and assert `!isLegacyCredentials` (migration guarantees PQ credentials before any sync runs), then use `deriveSyncId` and `encryptStatePQ`/`decryptStatePQ` |
| `sync-server/handlers/challenge.ts` | Version-dispatch on `syncId` vs `syncToken` in request body |
| `sync-server/handlers/session.ts` | New PQ verification path; add `@noble/post-quantum` dependency |
| `sync-server/package.json` | Add `@noble/post-quantum` |

### Deprecation policy

The following functions in `src/sync/credentials.ts` and `src/sync/encrypt.ts` are marked `@deprecated Use the PQ equivalents. Only called from migrate.ts.` and must not be used outside `migrate.ts`:

- `encryptState`, `decryptState`
- `deriveSyncToken`, `getOrCreateSyncKey`
- `exportKeyFile` (v1), `importKeyFile` (v1 path)

These are candidates for deletion once the migration window closes and no v1 blobs or key files remain in the wild.

---

## Testing

### `src/sync/credentials.test.ts`
- `generatePQCredentials` produces keys of the correct byte lengths
- `deriveSyncId` returns a 64-char hex string and is deterministic
- `exportKeyFile` / `importKeyFile` round-trip for both v1 and v2
- `importKeyFile` on a v2 file produces `PQSyncCredentials`; on a v1 file produces `LegacySyncCredentials`

### `src/sync/encrypt.test.ts`
- `encryptStatePQ` output starts with `0x02` and has correct minimum length
- `decryptStatePQ` round-trips correctly
- `decryptStatePQ` throws on wrong version byte
- `decryptStatePQ` throws on tampered KEM ciphertext
- Legacy `encryptState` / `decryptState` tests unchanged

### `src/sync/migrate.test.ts`
- Migration is a no-op when credentials are already `PQSyncCredentials`
- Migration replaces `LegacySyncCredentials` with `PQSyncCredentials` in IndexedDB
- Migration imports server state when server blob is newer (final pull path)
- Migration completes when server is unreachable (pull skipped, push skipped, dirty flag set)

### `sync-server/handlers/challenge.test.ts`
- `{ syncId }` body accepted, returns nonce
- `{ syncToken }` body accepted (legacy path)
- Invalid format returns 400

### `sync-server/handlers/session.test.ts`
- Valid ML-KEM + ML-DSA key pair with correct signature returns `sessionToken`
- Wrong key size returns 400
- `SHA-256(mlkemPk || mldsaPk) !== syncId` returns 401
- Tampered signature returns 401
- Legacy `{ nonce, syncToken }` path continues to work
