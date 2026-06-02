import { zipSync, strToU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore } from '@/types';

export function buildCDPZip(pack: Pack, chores: Chore[]): Uint8Array {
  const active = chores.filter((c) => c.active);
  const choreFilenames = active.map((c) => `${c.choreId}.yaml`);

  const files: Record<string, Uint8Array> = {
    [`${pack.id}/__pack__.yaml`]: strToU8(buildPackYaml(pack, choreFilenames)),
  };
  for (const chore of active) {
    files[`${pack.id}/${chore.choreId}.yaml`] = strToU8(buildChoreYaml(chore));
  }

  return zipSync(files);
}

function buildPackYaml(pack: Pack, choreFilenames: string[]): string {
  const data: Record<string, unknown> = { title: pack.manifest.title };
  if (pack.manifest.author) data.author = pack.manifest.author;
  if (pack.manifest.license) data.license = pack.manifest.license;
  if (pack.manifest.description) data.description = pack.manifest.description;
  data.chores = choreFilenames;
  return jsYaml.dump(data);
}

function buildChoreYaml(chore: Chore): string {
  const data: Record<string, unknown> = {
    title: chore.title,
    xpSize: chore.xpSize,
    frequency: chore.recurrence.frequency,
    interval: chore.recurrence.interval,
    windowStartTime: chore.recurrence.windowStartTime,
    repeatable: chore.repeatable,
  };
  if (chore.description) data.description = chore.description;
  return jsYaml.dump(data);
}
