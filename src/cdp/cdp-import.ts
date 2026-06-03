import jsYaml from 'js-yaml';
import type { Pack, Chore, Question, XPSize, RecurrenceFrequency } from '@/types';
import { validatePackManifest, validateChoreDefinition } from '@/schemas/validate';

interface PackYaml {
  title: string;
  author?: string;
  license?: string;
  description?: string;
  chores: string[];
}

interface ChoreYaml {
  title: string;
  description?: string;
  xpSize: XPSize;
  frequency: RecurrenceFrequency;
  interval: number;
  windowStartTime?: string;
  repeatable?: boolean;
  questions?: unknown[];
}

export function parseChoreQuestions(
  raw: unknown[] | undefined,
  choreKey: string,
): Question[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((q) => ({ ...(q as object), choreKey })) as Question[];
}

export async function fetchCDP(
  baseUrl: string,
): Promise<{ pack: Pack; chores: Chore[]; questions: Question[] }> {
  const manifestUrl = `${baseUrl}/__pack__.yaml`;
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok)
    throw new Error(`Failed to fetch pack manifest from ${manifestUrl}: ${manifestRes.status}`);
  const manifestRaw = jsYaml.load(await manifestRes.text()) as PackYaml;

  const manifestValidation = validatePackManifest(manifestRaw);
  if (!manifestValidation.valid)
    throw new Error(`CDP manifest is invalid: ${manifestValidation.errors.join('; ')}`);
  if (!manifestRaw.title) throw new Error('CDP manifest is missing required field: title');
  if (!Array.isArray(manifestRaw.chores) || manifestRaw.chores.length === 0)
    throw new Error('CDP manifest is missing required field: chores (must be a non-empty list)');

  const urlPath = baseUrl.replace(/\/$/, '');
  const packId = urlPath.substring(urlPath.lastIndexOf('/') + 1);
  const today = new Date().toISOString().substring(0, 10);
  const now = new Date().toISOString();

  const allQuestions: Question[] = [];

  const chores: Chore[] = await Promise.all(
    manifestRaw.chores.map(async (filename: string) => {
      const choreUrl = `${baseUrl}/${filename}`;
      const choreRes = await fetch(choreUrl);
      if (!choreRes.ok)
        throw new Error(`Failed to fetch chore file ${filename} from ${choreUrl}: ${choreRes.status}`);
      const choreRaw = jsYaml.load(await choreRes.text()) as ChoreYaml;

      const choreValidation = validateChoreDefinition(choreRaw);
      if (!choreValidation.valid)
        throw new Error(`Chore file ${filename} is invalid: ${choreValidation.errors.join('; ')}`);

      const choreId = filename.replace(/\.yaml$/, '');
      const choreKey = `${packId}/${choreId}`;

      allQuestions.push(...parseChoreQuestions(choreRaw.questions, choreKey));

      return {
        key: choreKey, choreId, packId,
        title: choreRaw.title,
        description: choreRaw.description,
        xpSize: choreRaw.xpSize,
        recurrence: {
          frequency: choreRaw.frequency,
          interval: choreRaw.interval,
          startDate: today,
          windowStartTime: choreRaw.windowStartTime ?? '00:00',
        },
        repeatable: choreRaw.repeatable ?? false,
        active: true,
        createdAt: now,
      } satisfies Chore;
    }),
  );

  const pack: Pack = {
    id: packId,
    manifest: {
      title: manifestRaw.title,
      author: manifestRaw.author,
      license: manifestRaw.license,
      description: manifestRaw.description,
    },
    isPersonal: false,
    importedAt: now,
    updatedAt: now,
    sourceUrl: baseUrl,
  };

  return { pack, chores, questions: allQuestions };
}
