# Replace AES-based sync auth with post-quantum ML-KEM + ML-DSA

The symmetric-key authentication model (where `syncToken = SHA-256(aesKey)` acts as a long-term bearer credential) is replaced with a proper challenge-response scheme using ML-DSA-87 signatures and ML-KEM-1024 hybrid encryption.

## Why replace the AES scheme

The original scheme had two structural problems:

1. **Bearer credential leakage.** The `syncToken` was derived from the AES key and sent in every request. A compromised log or network observer could permanently decrypt all blobs.

2. **Shared-secret auth.** The HMAC challenge-response (client and server share `VITE_SYNC_APP_SECRET`) meant the server secret was baked into every bundle. A bundle dump reveals it.

In addition, the raw AES key was extractable from IndexedDB — exported via `crypto.subtle.exportKey('raw', key)` on every push/pull — giving an XSS payload a direct path to permanent decryption of all backups.

## New scheme

### Key bundle

Each installation generates a four-key bundle using `@noble/post-quantum`:

- **ML-KEM-1024** (1568-byte public key, 3168-byte private key) — for blob encryption
- **ML-DSA-87** (2592-byte public key, 4896-byte private key) — for challenge-response signatures

Keys are stored as raw `Uint8Array` in IndexedDB. WebCrypto does not support these algorithms.

### Blob identity

```
syncId = hex(SHA-256(mlkemPublicKey || mldsaPublicKey))
```

Binding both public keys before hashing prevents a client from claiming a `syncId` derived from one key pair while signing with a different one. The 64-char hex fits the existing URL pattern without server routing changes.

### Blob format

```
[ 0x02 (1 byte) | kemCiphertext (1568 bytes) | iv (12 bytes) | AES-GCM ciphertext ]
```

Encryption:
1. `mlkem1024.encapsulate(mlkemPublicKey)` → `(kemCiphertext, sharedSecret)`
2. Import `sharedSecret` as a WebCrypto AES-GCM key
3. AES-GCM encrypt with fresh IV
4. Prepend `0x02` version byte and `kemCiphertext`

Any device holding the same `mlkemPrivateKey` can call `decapsulate(kemCiphertext, privateKey)` to recover the `sharedSecret` and decrypt — multi-device works without re-encrypting on push.

### Authentication

```
POST /sync/challenge  { syncId }      →  { nonce }
POST /sync/session    { nonce, mldsaPublicKey, mlkemPublicKey, signature }  →  { sessionToken }
```

The signature covers `UTF-8(nonce + syncId)` — ASCII concatenation of two 64-char hex strings. The server verifies by:
1. Looking up the nonce in Redis (delete on read — single-use)
2. Checking `hex(SHA-256(mlkemPkBytes || mldsaPkBytes)) === syncId`
3. Verifying the ML-DSA-87 signature

Session tokens are stored in Redis under `session:{token} → syncId` with a 24-hour TTL.

### Migration

Existing installations have `LegacySyncCredentials` (a single `CryptoKey`). On first startup after upgrade:

1. A migration modal shows an indeterminate spinner.
2. A best-effort final pull using the legacy auth protocol imports any newer server state.
3. New PQ key bundle is generated.
4. Current local state is encrypted and pushed to the new blob path.
5. New credentials are stored in IndexedDB; the old AES key is discarded.
6. The old blob remains on the server (orphan cleanup tracked in issue #65).
7. An export prompt tells multi-device users to export and import the new key file before migrating other devices.

The legacy challenge-response path (`{ syncToken }` / `{ nonce, hmac }`) remains active on the server during the migration window.

## What this does not fix

XSS exfiltration of private keys remains possible — ML-KEM and ML-DSA private keys are stored as raw `Uint8Array` in IndexedDB, readable by any script with IndexedDB access. The mechanism changes (no `exportKey` call needed) but the exposure is equivalent to the previous AES scheme. This is tracked separately (issue #25).

## Considered alternatives

**Hybrid classical+PQ double-hedging (X25519 + ML-KEM):** Increases blob size and complexity. Deferred — can be added when the wider ecosystem matures.

**WebAuthn for auth:** Would solve the bearer-credential problem but ties authentication to a device credential, complicating multi-device setup. The PQ scheme uses a portable key bundle instead.
