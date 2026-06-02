import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateAnswer } from '@/questions/validation';
import type { MultiplierQuestion } from '@/types';

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

describe('AnswerField MULTIPLIER validation integration', () => {
  const q: MultiplierQuestion = {
    id: 'q-1',
    choreKey: 'personal/chore',
    prompt: 'Reps',
    type: 'MULTIPLIER',
    required: true,
    order: 0,
    xpPerUnit: 0.5,
    multiplierAnswerType: 'float',
  };

  it('rejects zero', () => {
    expect(validateAnswer({ questionId: q.id, value: 0 }, q)).toMatch(/positive/i);
  });

  it('accepts a positive float', () => {
    expect(validateAnswer({ questionId: q.id, value: 1.5 }, q)).toBeNull();
  });
});
