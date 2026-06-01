import { slugify } from 'transliteration';

const PRE_REPLACE: [RegExp, string][] = [
  [/ä/gi, 'ae'],
  [/ö/gi, 'oe'],
  [/ü/gi, 'ue'],
  [/ß/g,  'ss'],
];

export function titleToFilename(title: string): string {
  let s = title;
  for (const [pattern, replacement] of PRE_REPLACE) {
    s = s.replace(pattern, replacement);
  }
  return slugify(s, {
    lowercase: true,
    separator: '-',
    allowedChars: 'a-zA-Z0-9',
  });
}
