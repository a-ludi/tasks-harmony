import { describe, it, expect } from 'bun:test';
import { isSafeRegex, validateAnswer } from './validation';
import type { Question, Answer, EnumChoice } from '@/types';

function makeTextQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-text',
    choreKey: 'personal/test-chore',
    prompt: 'What did you notice?',
    type: 'TEXT',
    required: true,
    order: 0,
    ...overrides,
  };
}

function makeIntegerQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-int',
    choreKey: 'personal/test-chore',
    prompt: 'How many?',
    type: 'INTEGER',
    required: true,
    order: 1,
    ...overrides,
  };
}

function makeBooleanQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-bool',
    choreKey: 'personal/test-chore',
    prompt: 'Was it done well?',
    type: 'BOOLEAN',
    required: true,
    order: 2,
    ...overrides,
  };
}

function makeEnumQuestion(choices: EnumChoice[], overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-enum',
    choreKey: 'personal/test-chore',
    prompt: 'Which level?',
    type: 'ENUM',
    required: true,
    order: 3,
    choices,
    ...overrides,
  };
}

function makeAnswer(questionId: string, value: string | number | boolean | null): Answer {
  return { questionId, value };
}

describe('isSafeRegex', () => {
  it('returns valid=true for a simple digit pattern', () => {
    const result = isSafeRegex('\\d+');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid=true for an anchored pattern with char class', () => {
    const result = isSafeRegex('^[A-Z]{3}-\\d{4}$');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid=false with syntax error message for unclosed bracket', () => {
    const result = isSafeRegex('[invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid regex/i);
  });

  it('returns valid=false with syntax error message for unmatched paren', () => {
    const result = isSafeRegex('(unclosed');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid regex/i);
  });

  it('returns valid=false with backtracking message for (a+)+ pattern', () => {
    const result = isSafeRegex('(a+)+');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/catastrophic backtracking/i);
  });

  it('returns valid=false with backtracking message for (\\w+)+ pattern', () => {
    const result = isSafeRegex('(\\w+)+');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/catastrophic backtracking/i);
  });

  it('returns valid=false with backtracking message for (a*)* pattern', () => {
    const result = isSafeRegex('(a*)*');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/catastrophic backtracking/i);
  });

  it('returns valid=false with backtracking message for (a|a)+ pattern', () => {
    const result = isSafeRegex('(a|a)+');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/catastrophic backtracking/i);
  });
});

describe('validateAnswer', () => {
  it('returns error when required TEXT question has null value', () => {
    const q = makeTextQuestion({ required: true });
    const a = makeAnswer(q.id, null);
    expect(validateAnswer(a, q)).toBe('This field is required');
  });

  it('returns error when required TEXT question has empty string value', () => {
    const q = makeTextQuestion({ required: true });
    const a = makeAnswer(q.id, '');
    expect(validateAnswer(a, q)).toBe('This field is required');
  });

  it('returns null when optional TEXT question has null value', () => {
    const q = makeTextQuestion({ required: false });
    const a = makeAnswer(q.id, null);
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns null when optional TEXT question has empty string value', () => {
    const q = makeTextQuestion({ required: false });
    const a = makeAnswer(q.id, '');
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns null when TEXT answer matches regexPattern', () => {
    const q = makeTextQuestion({ required: true, regexPattern: '^\\d{4}$' });
    const a = makeAnswer(q.id, '1234');
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns error when TEXT answer does not match regexPattern', () => {
    const q = makeTextQuestion({ required: true, regexPattern: '^\\d{4}$' });
    const a = makeAnswer(q.id, 'abcd');
    const result = validateAnswer(a, q);
    expect(result).not.toBeNull();
    expect(result).toMatch(/pattern/i);
  });

  it('skips regex check when TEXT value is empty and question is optional', () => {
    const q = makeTextQuestion({ required: false, regexPattern: '^\\d{4}$' });
    const a = makeAnswer(q.id, '');
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns null when INTEGER answer is within range', () => {
    const q = makeIntegerQuestion({ required: true, minValue: 1, maxValue: 10 });
    const a = makeAnswer(q.id, 5);
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns error when INTEGER answer is below minValue', () => {
    const q = makeIntegerQuestion({ required: true, minValue: 1 });
    const a = makeAnswer(q.id, 0);
    const result = validateAnswer(a, q);
    expect(result).not.toBeNull();
    expect(result).toMatch(/at least 1/i);
  });

  it('returns error when INTEGER answer is above maxValue', () => {
    const q = makeIntegerQuestion({ required: true, maxValue: 10 });
    const a = makeAnswer(q.id, 11);
    const result = validateAnswer(a, q);
    expect(result).not.toBeNull();
    expect(result).toMatch(/at most 10/i);
  });

  it('returns null when INTEGER has no range constraints and value is in range', () => {
    const q = makeIntegerQuestion({ required: true });
    const a = makeAnswer(q.id, 999);
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns error when required INTEGER answer is null', () => {
    const q = makeIntegerQuestion({ required: true });
    const a = makeAnswer(q.id, null);
    expect(validateAnswer(a, q)).toBe('This field is required');
  });

  it('returns null for BOOLEAN question with true value', () => {
    const q = makeBooleanQuestion({ required: true });
    const a = makeAnswer(q.id, true);
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns null for BOOLEAN question with false value (not treated as empty)', () => {
    const q = makeBooleanQuestion({ required: true });
    const a = makeAnswer(q.id, false);
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns error when required BOOLEAN question has null value', () => {
    const q = makeBooleanQuestion({ required: true });
    const a = makeAnswer(q.id, null);
    expect(validateAnswer(a, q)).toBe('This field is required');
  });

  it('returns null when ENUM answer matches a valid choice id', () => {
    const choices: EnumChoice[] = [
      { id: 'choice-a', label: 'A', order: 0 },
      { id: 'choice-b', label: 'B', order: 1 },
    ];
    const q = makeEnumQuestion(choices, { required: true });
    const a = makeAnswer(q.id, 'choice-a');
    expect(validateAnswer(a, q)).toBeNull();
  });

  it('returns error when ENUM answer is not one of the defined choice ids', () => {
    const choices: EnumChoice[] = [
      { id: 'choice-a', label: 'A', order: 0 },
      { id: 'choice-b', label: 'B', order: 1 },
    ];
    const q = makeEnumQuestion(choices, { required: true });
    const a = makeAnswer(q.id, 'choice-x');
    const result = validateAnswer(a, q);
    expect(result).not.toBeNull();
    expect(result).toMatch(/invalid choice/i);
  });

  it('returns error when required ENUM answer is null', () => {
    const choices: EnumChoice[] = [{ id: 'choice-a', label: 'A', order: 0 }];
    const q = makeEnumQuestion(choices, { required: true });
    const a = makeAnswer(q.id, null);
    expect(validateAnswer(a, q)).toBe('This field is required');
  });
});
