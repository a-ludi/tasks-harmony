import type { Pack } from '@/types';

export type PackRowElement = 'sync' | 'xp';

export function packRowOrder(pack: Pack, packXP: number): PackRowElement[] {
  const items: PackRowElement[] = [];
  if (pack.sourceUrl) items.push('sync');
  if (packXP > 0) items.push('xp');
  return items;
}
