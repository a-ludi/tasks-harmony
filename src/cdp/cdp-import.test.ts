import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { XPSize, Question } from '@/types';
import { parseChoreQuestions } from './cdp-import';

const mockFetch = mock(async (_url: string) => new Response('{}', { status: 200 }));
global.fetch = mockFetch as unknown as typeof fetch;

const { fetchCDP, fetchCDPManifestOnly } = await import('./cdp-import');

const PACK_YAML = `title: "Morning Routines"\nauthor: "Alice"\nlicense: "MIT"\ndescription: "Morning habit pack"\nchores:\n  - make-bed.yaml\n  - brush-teeth.yaml`;
const MAKE_BED_YAML = `title: "Make Bed"\ndescription: "Straighten sheets and fluff pillow"\nxpSize: XS\nfrequency: daily\ninterval: 1`;
const BRUSH_TEETH_YAML = `title: "Brush Teeth"\nxpSize: XXS\nfrequency: daily\ninterval: 1\nwindowStartTime: "22:00"\nrepeatable: false`;

function setupFetchResponses(responses: Record<string, string>) {
  mockFetch.mockImplementation(async (url: string) => {
    const body = responses[url];
    if (body === undefined) return new Response('Not found', { status: 404 });
    return new Response(body, { status: 200 });
  });
}

describe('parseChoreQuestions', () => {
  it('returns an empty array when questions field is absent', () => {
    expect(parseChoreQuestions(undefined, 'pack-a/clean')).toEqual([]);
  });

  it('returns an empty array when questions is an empty list', () => {
    expect(parseChoreQuestions([], 'pack-a/clean')).toEqual([]);
  });

  it('injects choreKey into each question and preserves all fields', () => {
    const raw = [{ id: 'q-1', type: 'TEXT', prompt: 'How?', required: true, order: 0 }];
    const result = parseChoreQuestions(raw, 'pack-a/clean');
    expect(result).toHaveLength(1);
    expect(result[0].choreKey).toBe('pack-a/clean');
    expect(result[0].type).toBe('TEXT');
  });

  it('handles ENUM questions with choices', () => {
    const raw = [{
      id: 'q-2', type: 'ENUM', prompt: 'Effort?', required: true, order: 0,
      choices: [{ id: 'c-1', label: 'Low', order: 0 }],
    }];
    const result = parseChoreQuestions(raw, 'pack-a/clean') as Question[];
    const q = result[0];
    if (q.type !== 'ENUM') throw new Error('Expected ENUM');
    expect(q.choices?.[0].label).toBe('Low');
  });

  it('assigns order by array index when order field is absent', () => {
    const raw = [
      { id: 'q-first', type: 'TEXT', prompt: 'First?', required: false },
      { id: 'q-second', type: 'TEXT', prompt: 'Second?', required: false },
    ];
    const result = parseChoreQuestions(raw, 'pack-a/clean');
    expect(result[0].order).toBe(0);
    expect(result[1].order).toBe(1);
  });
});

describe('fetchCDP', () => {
  const BASE = 'https://raw.githubusercontent.com/alice/packs/main/morning';

  beforeEach(() => { mockFetch.mockReset(); });

  it('fetches and parses pack manifest and all chore files', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: PACK_YAML, [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML, [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML });
    const { pack, chores } = await fetchCDP(BASE);
    expect(pack.manifest.title).toBe('Morning Routines');
    expect(pack.manifest.author).toBe('Alice');
    expect(pack.manifest.license).toBe('MIT');
    expect(pack.manifest.description).toBe('Morning habit pack');
    expect(pack.sourceUrl).toBe(BASE);
    expect(chores).toHaveLength(2);
  });

  it('derives packId from last URL path segment', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: PACK_YAML, [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML, [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML });
    const { pack } = await fetchCDP(BASE);
    expect(pack.id).toBe('morning');
  });

  it('builds chore keys as packId/choreId', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: PACK_YAML, [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML, [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML });
    const { chores } = await fetchCDP(BASE);
    const keys = chores.map((c) => c.key).sort();
    expect(keys).toEqual(['morning/brush-teeth', 'morning/make-bed']);
  });

  it('strips .yaml from filename to form choreId', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: PACK_YAML, [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML, [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML });
    const { chores } = await fetchCDP(BASE);
    const makeBed = chores.find((c) => c.choreId === 'make-bed');
    expect(makeBed).toBeDefined();
    expect(makeBed!.title).toBe('Make Bed');
    expect(makeBed!.xpSize).toBe('XS' as XPSize);
  });

  it('defaults recurrence.startDate to today when missing from YAML', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: PACK_YAML, [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML, [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML });
    const { chores } = await fetchCDP(BASE);
    const brushTeeth = chores.find((c) => c.choreId === 'brush-teeth');
    expect(brushTeeth).toBeDefined();
    const today = new Date().toISOString().substring(0, 10);
    expect(brushTeeth!.recurrence.startDate).toBe(today);
  });

  it('throws when pack manifest is missing title', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: 'chores:\n  - make-bed.yaml', [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML });
    await expect(fetchCDP(BASE)).rejects.toThrow('title');
  });

  it('throws when pack manifest is missing chores list', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: 'title: Test Pack' });
    await expect(fetchCDP(BASE)).rejects.toThrow('chores');
  });

  it('throws when __pack__.yaml fetch fails with 404', async () => {
    setupFetchResponses({});
    await expect(fetchCDP(BASE)).rejects.toThrow('404');
  });

  it('throws when a chore YAML fetch fails', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: PACK_YAML, [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML });
    await expect(fetchCDP(BASE)).rejects.toThrow('brush-teeth.yaml');
  });
});

describe('fetchCDP — sprint fields', () => {
  const BASE = 'https://example.com/packs/sprint';
  const CHORE_URL = `${BASE}/run.yaml`;

  const SPRINT_PACK_YAML = `title: "Sprint Pack"\nchores:\n  - run.yaml\nstreak: false\nxpTarget: 500\ntargetDate: "2026-12-31"\nallowShiftOnImport: true`;
  const RUN_YAML = `title: "Run"\nxpSize: S\nfrequency: daily\ninterval: 1\nduePeriod:\n  value: 2\n  unit: days`;
  const RUN_NO_DUE_PERIOD_YAML = `title: "Run"\nxpSize: S\nfrequency: daily\ninterval: 1`;

  beforeEach(() => { mockFetch.mockReset(); });

  it('imports streak: false from pack YAML', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: SPRINT_PACK_YAML, [CHORE_URL]: RUN_YAML });
    const { pack } = await fetchCDP(BASE);
    expect(pack.manifest.streak).toBe(false);
  });

  it('imports xpTarget from pack YAML', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: SPRINT_PACK_YAML, [CHORE_URL]: RUN_YAML });
    const { pack } = await fetchCDP(BASE);
    expect(pack.manifest.xpTarget).toBe(500);
  });

  it('imports targetDate from pack YAML', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: SPRINT_PACK_YAML, [CHORE_URL]: RUN_YAML });
    const { pack } = await fetchCDP(BASE);
    expect(pack.manifest.targetDate).toBe('2026-12-31');
  });

  it('imports allowShiftOnImport from pack YAML', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: SPRINT_PACK_YAML, [CHORE_URL]: RUN_YAML });
    const { pack } = await fetchCDP(BASE);
    expect(pack.manifest.allowShiftOnImport).toBe(true);
  });

  it('imports duePeriod from chore YAML', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: SPRINT_PACK_YAML, [CHORE_URL]: RUN_YAML });
    const { chores } = await fetchCDP(BASE);
    const chore = chores[0];
    expect(chore.duePeriod?.value).toBe(2);
    expect(chore.duePeriod?.unit).toBe('days');
  });

  it('omits duePeriod when not in chore YAML', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: SPRINT_PACK_YAML, [CHORE_URL]: RUN_NO_DUE_PERIOD_YAML });
    const { chores } = await fetchCDP(BASE);
    const chore = chores[0];
    expect(chore.duePeriod).toBeUndefined();
  });

  it('startDateOffsetDays shifts chore startDate by N days', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: PACK_YAML, [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML, [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML });
    const { chores } = await fetchCDP(BASE, 7);
    const d = new Date(); d.setDate(d.getDate() + 7);
    const expected = d.toISOString().substring(0, 10);
    for (const chore of chores) {
      expect(chore.recurrence.startDate).toBe(expected);
    }
  });

  it('startDateOffsetDays shifts targetDate by same delta', async () => {
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: SPRINT_PACK_YAML, [CHORE_URL]: RUN_YAML });
    const { pack } = await fetchCDP(BASE, 7);
    expect(pack.manifest.targetDate).toBe('2027-01-07');
  });
});

describe('fetchCDPManifestOnly', () => {
  const BASE = 'https://example.com/packs/sprint';

  beforeEach(() => { mockFetch.mockReset(); });

  it('returns targetDate and allowShiftOnImport', async () => {
    const yaml = `title: "Sprint Pack"\nchores:\n  - run.yaml\ntargetDate: "2026-10-01"\nallowShiftOnImport: true`;
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: yaml });
    const result = await fetchCDPManifestOnly(BASE);
    expect(result.targetDate).toBe('2026-10-01');
    expect(result.allowShiftOnImport).toBe(true);
  });

  it('returns undefined for absent fields', async () => {
    const yaml = `title: X\nchores:\n  - a.yaml`;
    setupFetchResponses({ [`${BASE}/__pack__.yaml`]: yaml });
    const result = await fetchCDPManifestOnly(BASE);
    expect(result.targetDate).toBeUndefined();
    expect(result.allowShiftOnImport).toBeUndefined();
  });

  it('throws when fetch fails', async () => {
    setupFetchResponses({});
    await expect(fetchCDPManifestOnly(BASE)).rejects.toThrow();
  });
});
