import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { encryptedExport, exportAppState } from '@/sync/export';
import { wrapStateInZip, buildBackupFilename } from '@/backup/backup';

export async function doExport(db: IDBPDatabase<TasksHarmonyDB>): Promise<void> {
  const format = localStorage.getItem('backup-export-format') ?? 'encrypted';
  const date = new Date().toISOString().substring(0, 10);

  let file: Blob;
  let filename: string;

  if (format === 'encrypted') {
    const blob = await encryptedExport(db);
    file = new Blob([blob.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    filename = `tasks-harmony-backup-${date}.enc`;
  } else {
    const state = await exportAppState(db);
    const zipBytes = wrapStateInZip(state);
    file = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    filename = buildBackupFilename(date);
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
