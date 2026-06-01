import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(
  join(import.meta.dir, 'CompletionModal.tsx'),
  'utf-8',
);

describe('CompletionModal layout', () => {
  it('has max-h and overflow-y-auto on the inner container so it scrolls on small screens', () => {
    // The inner container div (the white card) must carry both classes.
    // We look for them co-located on the same className string.
    const classNameStrings = source.match(/className="[^"]*"/g) ?? [];
    const scrollableContainer = classNameStrings.find(
      (cls) => cls.includes('max-h-') && cls.includes('overflow-y-auto'),
    );
    expect(scrollableContainer).toBeDefined();
  });
});
