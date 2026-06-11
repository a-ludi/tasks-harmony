import { describe, it, expect } from 'bun:test';
import { isNewer, buildFullChangelog, generateChangelogMd, type ChangelogEntry } from './format';

const ENTRIES: ChangelogEntry[] = [
  { version: '0.4.0', date: '2026-06-09', highlights: ['h1'], sections: { Added: ['a1', 'a2'], Changed: ['c1'] } },
  { version: '0.3.0', date: '2026-06-01', highlights: [], sections: { Fixed: ['f1'] } },
  { version: '0.2.0', date: '2026-05-01', highlights: [], sections: { Added: ['a3'] } },
];

describe('isNewer', () => {
  it('returns true for higher patch', () => expect(isNewer('0.4.1', '0.4.0')).toBe(true));
  it('returns false for same version', () => expect(isNewer('0.4.0', '0.4.0')).toBe(false));
  it('returns false for older version', () => expect(isNewer('0.3.9', '0.4.0')).toBe(false));
  it('handles minor bumps', () => expect(isNewer('0.5.0', '0.4.9')).toBe(true));
  it('handles major bumps', () => expect(isNewer('1.0.0', '0.9.9')).toBe(true));
});

describe('buildFullChangelog', () => {
  it('returns all entries newer than current version', () => {
    const result = buildFullChangelog(ENTRIES, '0.2.0');
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe('0.4.0');
    expect(result[1].version).toBe('0.3.0');
  });
  it('returns empty array when already on latest', () => {
    expect(buildFullChangelog(ENTRIES, '0.4.0')).toHaveLength(0);
  });
  it('excludes current version from result', () => {
    const result = buildFullChangelog(ENTRIES, '0.3.0');
    expect(result.map((e) => e.version)).toEqual(['0.4.0']);
  });
});

describe('generateChangelogMd', () => {
  it('includes version header for each entry', () => {
    const md = generateChangelogMd(ENTRIES);
    expect(md).toContain('## [0.4.0] — 2026-06-09');
    expect(md).toContain('## [0.3.0] — 2026-06-01');
  });
  it('includes section items', () => {
    const md = generateChangelogMd(ENTRIES);
    expect(md).toContain('### Added');
    expect(md).toContain('- a1');
  });
  it('omits empty sections', () => {
    const md = generateChangelogMd([{ version: '1.0.0', date: '2026-01-01', highlights: [], sections: { Added: [], Fixed: ['f1'] } }]);
    expect(md).not.toContain('### Added');
    expect(md).toContain('### Fixed');
  });
  it('includes link definitions at the bottom', () => {
    const md = generateChangelogMd(ENTRIES);
    expect(md).toContain('[0.4.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.4.0');
  });
});
