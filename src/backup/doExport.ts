import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { encryptedExport, exportAppState } from '@/sync/export';
import { wrapStateInZip, buildBackupFilename } from '@/backup/backup';
import { KEYS } from '@/hooks/useBackupReminder';

export async function doExport(db: IDBPDatabase<TasksHarmonyDB>): Promise<void> {
  const format = localStorage.getItem(KEYS.exportFormat) ?? 'encrypted';
  const date = new Date().toISOString().substring(0, 10);

  let file: Blob;
  let filename: string;

  if (format !== 'plain') {
    // treat any non-plain value (including 'encrypted' default) as encrypted
    const blob = await encryptedExport(db);
    file = new Blob([blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer], { type: 'application/octet-stream' });
    filename = `tasks-harmony-backup-${date}.enc`;
  } else {
    const state = await exportAppState(db);
    const zipBytes = wrapStateInZip(state);
    file = new Blob([zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer], { type: 'application/zip' });
    filename = buildBackupFilename(date);
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
