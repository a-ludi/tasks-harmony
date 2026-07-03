import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { AppState, Pack, Completion } from '@/types';

const STATE_FILENAME = 'state.json';
const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MB

export function buildBackupFilename(dateStr: string): string {
  return `tasks-harmony-backup-${dateStr}.zip`;
}

export function wrapStateInZip(state: AppState): Uint8Array {
  const json = JSON.stringify(state, null, 2);
  return zipSync({ [STATE_FILENAME]: strToU8(json) });
}

export function unwrapStateFromZip(zipBytes: Uint8Array): AppState {
  const files = unzipSync(zipBytes, {
    filter(file) {
      if (file.originalSize > MAX_UNCOMPRESSED_BYTES)
        throw new Error(`Backup entry "${file.name}" is too large to decompress safely`);
      return true;
    },
  });
  const stateBytes = files[STATE_FILENAME];
  if (!stateBytes) throw new Error(`ZIP does not contain ${STATE_FILENAME}`);
  return JSON.parse(strFromU8(stateBytes)) as AppState;
}

export function isAppStatePristine(packs: Pack[], completions: Completion[]): boolean {
  return packs.length === 0 && completions.length === 0;
}
