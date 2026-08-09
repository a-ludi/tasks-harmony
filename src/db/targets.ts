import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';
import type { Target } from '@/types';

export const getAllTargets = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Target[]> =>
  db.getAll('targets');

export const getTargetsByChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  choreKey: string,
): Promise<Target[]> =>
  db.getAllFromIndex('targets', 'by-chore', choreKey);

export const putTarget = (
  db: IDBPDatabase<TasksHarmonyDB>,
  target: Target,
): Promise<string> =>
  db.put('targets', target);

export const deleteTarget = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('targets', id);
