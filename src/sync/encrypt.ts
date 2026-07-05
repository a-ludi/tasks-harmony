import type { AppState } from '@/types';

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
