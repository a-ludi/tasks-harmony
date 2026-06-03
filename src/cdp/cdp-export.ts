import { zipSync, strToU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore, Question, UserProfile } from '@/types';

export function buildCDPZip(
  pack: Pack,
  chores: Chore[],
  questions: Question[],
  profile: UserProfile,
): Uint8Array {
  const active = chores.filter((c) => c.active);
  const choreFilenames = active.map((c) => `${c.choreId}.yaml`);

  const files: Record<string, Uint8Array> = {
    [`${pack.id}/__pack__.yaml`]: strToU8(buildPackYaml(pack, choreFilenames, profile)),
  };
  for (const chore of active) {
    const choreQuestions = questions.filter((q) => q.choreKey === chore.key);
    files[`${pack.id}/${chore.choreId}.yaml`] = strToU8(buildChoreYaml(chore, choreQuestions));
  }

  return zipSync(files);
}

function buildAuthor(profile: UserProfile): string | undefined {
  const name = profile.displayName.trim();
  const email = profile.email.trim();
  if (name && email) return `${name} <${email}>`;
  if (name) return name;
  if (email) return `<${email}>`;
  return undefined;
}

function buildPackYaml(pack: Pack, choreFilenames: string[], profile: UserProfile): string {
  const data: Record<string, unknown> = { title: pack.manifest.title };
  const author = buildAuthor(profile);
  if (author) data.author = author;
  if (pack.manifest.license) data.license = pack.manifest.license;
  if (pack.manifest.description) data.description = pack.manifest.description;
  data.createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  data.chores = choreFilenames;
  return jsYaml.dump(data);
}

function buildChoreYaml(chore: Chore, questions: Question[]): string {
  const data: Record<string, unknown> = {
    title: chore.title,
    xpSize: chore.xpSize,
    frequency: chore.recurrence.frequency,
    interval: chore.recurrence.interval,
    windowStartTime: chore.recurrence.windowStartTime,
    repeatable: chore.repeatable,
  };
  if (chore.description) data.description = chore.description;
  if (questions.length > 0) {
    data.questions = questions.map((q) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { choreKey: _ck, ...rest } = q as Question & { choreKey: string };
      return rest;
    });
  }
  return jsYaml.dump(data);
}
