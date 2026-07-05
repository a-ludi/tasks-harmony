import type { AppState } from '@/types';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import type { PQSyncCredentials } from '@/db/schema';

async function compress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

const MAX_DECOMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MB

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_DECOMPRESSED_BYTES) {
      throw new Error(
        `Decompressed size exceeds limit of ${MAX_DECOMPRESSED_BYTES} bytes`
      );
    }
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

export async function encryptState(key: CryptoKey, state: AppState): Promise<Uint8Array> {
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new Uint8Array(plaintext.buffer as ArrayBuffer, plaintext.byteOffset, plaintext.byteLength));
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result;
}

export async function decryptState(key: CryptoKey, blob: Uint8Array): Promise<AppState> {
  const iv = blob.slice(0, 12);
  const ciphertext = blob.slice(12);
  const payload = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));

  // Check for gzip magic bytes (0x1f 0x8b) for backward compatibility with legacy compressed blobs
  let plaintext: Uint8Array;
  if (payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b) {
    // Legacy compressed blob: decompress first
    plaintext = await decompress(payload);
  } else {
    // New uncompressed blob: use directly
    plaintext = payload;
  }

  return JSON.parse(new TextDecoder().decode(plaintext)) as AppState;
}

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
  if (blob[0] !== 0x02) throw new Error(`Unsupported blob version byte: 0x${blob[0]!.toString(16).padStart(2, '0')}`);

  const ctBytes = ml_kem1024.lengths.cipherText!;
  const kemCiphertext = blob.slice(1, 1 + ctBytes);
  const iv = blob.slice(1 + ctBytes, 1 + ctBytes + 12);
  const ciphertext = blob.slice(1 + ctBytes + 12);

  const sharedSecret = ml_kem1024.decapsulate(kemCiphertext, creds.mlkemPrivateKey);
  const aesKey = await crypto.subtle.importKey(
    'raw', sharedSecret, { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as AppState;
}
