import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { XPSize } from '@/types';

const mockFetch = mock(async (_url: string) => new Response('{}', { status: 200 }));
global.fetch = mockFetch as unknown as typeof fetch;

const { fetchCDP } = await import('./cdp-import');

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
