import { titleToFilename } from './filename';

export function slugifyPackId(name: string, existingIds: string[]): string {
  const base = titleToFilename(name) || 'pack';
  if (!existingIds.includes(base)) return base;
  let i = 2;
  while (existingIds.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
