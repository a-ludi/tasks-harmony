import { readFileSync, writeFileSync } from 'fs';
import { generateChangelogMd, type ChangelogEntry } from '../src/changelog/format';

const entries: ChangelogEntry[] = JSON.parse(readFileSync('public/changelog.json', 'utf-8'));
writeFileSync('CHANGELOG.md', generateChangelogMd(entries));
console.log('CHANGELOG.md regenerated from public/changelog.json');
