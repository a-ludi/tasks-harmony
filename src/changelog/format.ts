export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
  sections: Record<string, string[]>;
}

const REPO_URL = 'https://github.com/a-ludi/tasks-harmony';

export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const c = parse(candidate);
  const cur = parse(current);
  for (let i = 0; i < Math.max(c.length, cur.length); i++) {
    const a = c[i] ?? 0;
    const b = cur[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function buildFullChangelog(
  entries: ChangelogEntry[],
  currentVersion: string,
): Array<{ version: string; sections: Record<string, string[]> }> {
  return entries
    .filter((e) => isNewer(e.version, currentVersion))
    .map(({ version, sections }) => ({ version, sections }));
}

function formatEntry(entry: ChangelogEntry): string {
  const lines: string[] = [`## [${entry.version}] — ${entry.date}`, ''];
  for (const [section, items] of Object.entries(entry.sections)) {
    if (items.length === 0) continue;
    lines.push(`### ${section}`, '');
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function generateChangelogMd(entries: ChangelogEntry[]): string {
  const header = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n## [Unreleased]\n\n`;
  const body = entries.map(formatEntry).join('\n');
  const linkDefs = entries
    .map((e) => `[${e.version}]: ${REPO_URL}/releases/tag/v${e.version}`)
    .join('\n');
  return header + body + '\n' + linkDefs + '\n';
}
