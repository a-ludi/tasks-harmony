import { createClient } from 'webdav';
import type { AppState } from '@/types';

export type PushResult =
  | { success: true; newEtag: string }
  | { success: false; conflict: true; serverEtag: string };

function clientForUrl(fileUrl: string) {
  const url = new URL(fileUrl);
  const pathParts = url.pathname.split('/');
  pathParts.pop();
  const baseUrl = `${url.protocol}//${url.host}${pathParts.join('/')}`;
  const filename = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  return { client: createClient(baseUrl), filename };
}

export async function getServerEtag(url: string): Promise<string | null> {
  const { client, filename } = clientForUrl(url);
  try {
    const info = await client.stat(filename);
    const etag = (info as { etag?: string }).etag;
    return etag ?? null;
  } catch {
    return null;
  }
}

export async function pushState(
  url: string, state: AppState, expectedEtag: string | undefined,
): Promise<PushResult> {
  const { client, filename } = clientForUrl(url);
  const body = JSON.stringify(state, null, 2);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (expectedEtag !== undefined) headers['If-Match'] = expectedEtag;

  try {
    const response = await client.putFileContents(filename, body, { headers, returnRaw: true });
    const rawEtag = typeof response === 'object' && response !== null
      ? (response as { headers?: Record<string, string> }).headers?.etag
      : undefined;
    if (rawEtag) return { success: true, newEtag: rawEtag };
    const freshEtag = await getServerEtag(url);
    return { success: true, newEtag: freshEtag ?? '' };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 412) {
      const serverEtag = (await getServerEtag(url)) ?? '';
      return { success: false, conflict: true, serverEtag };
    }
    throw err;
  }
}

export async function pullState(url: string): Promise<AppState | null> {
  const { client, filename } = clientForUrl(url);
  try {
    const content = await client.getFileContents(filename, { format: 'text' });
    const parsed: unknown = JSON.parse(content as string);
    const { validateAppState } = await import('@/schemas/validate');
    const result = validateAppState(parsed);
    if (!result.valid) throw new Error(`Remote state.json failed validation: ${result.errors.join('; ')}`);
    return parsed as AppState;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}

export async function pushConflictCopy(url: string, state: AppState, conflictSuffix: string): Promise<void> {
  const conflictUrl = url.replace(/\.json$/, `${conflictSuffix}.json`);
  const { client, filename: conflictFilename } = clientForUrl(conflictUrl);
  const body = JSON.stringify(state, null, 2);
  await client.putFileContents(conflictFilename, body, {
    headers: { 'Content-Type': 'application/json' },
    overwrite: true,
  });
}
