# Replace WebDAV sync with end-to-end encrypted server sync

Sync switches from a user-configured WebDAV endpoint (manual, plaintext) to a purpose-built app server (automatic, end-to-end encrypted). The server stores opaque ciphertext — it never sees plaintext app data.

## Why replace WebDAV

WebDAV required the user to supply and maintain their own server URL, making it inaccessible to most users. ETag-based concurrency provided no protection against a compromised or curious server operator. Sync was manual — the user had to remember to trigger it.

## Architecture

A small Bun HTTP server sits behind nginx (via Unix socket). Redis stores nonces and session tokens. Docker Compose orchestrates the sync container and Redis with no exposed ports; nginx is the only entry point. Encrypted blobs are stored as flat files on the server.

### Transport protocol

```
GET  /sync/challenge           →  { nonce }
POST /sync/session             →  { sessionToken }
GET  /sync/:token              →  blob bytes (404 if absent)
PUT  /sync/:token              →  (overwrites blob)
```

Session tokens are issued via challenge-response and stored in Redis with a 24-hour TTL. The `Authorization: Bearer` header carries the session token on blob requests. No ETag — last-write-wins, with conflict detection done client-side using `lastSyncedAt` timestamps after decryption.

### Encryption

Each push generates a fresh 12-byte IV. The blob is: `iv (12 bytes) || AES-256-GCM ciphertext`. The AES key is derived from the sync credentials (see ADR-0003 for the current PQ scheme; the initial AES-only scheme used the raw AES key directly).

### Auto-sync triggers

- **Startup pull** — compare server `lastSyncedAt` against local; import if server is newer, otherwise push.
- **Write debounce** — every store write calls `markDirty()`; a debounced push fires after 10 seconds.
- **Page unload** — if dirty, push synchronously on `pagehide`.
- **Failure backoff** — after 3 consecutive failures, the debounce cycle stops and a persistent banner surfaces the error with a manual retry.

### Sync key derivation (initial scheme — superseded)

The initial scheme used AES-256-GCM with the raw key for both encryption and authentication. `syncToken = SHA-256(rawKey)` served as the blob path and bearer credential. This scheme was superseded by the PQ scheme (ADR-0003).

## Considered alternatives

**Keep WebDAV, fix UX:** Would still require users to provision their own server and share credentials with the client app, which rules out a shared hosted deployment and leaves plaintext exposure in place.

**Use a third-party sync service (e.g. CRDTs over Liveblocks/PartyKit):** Introduces an external dependency and makes E2E encryption harder to reason about; the single-blob model is simpler.
