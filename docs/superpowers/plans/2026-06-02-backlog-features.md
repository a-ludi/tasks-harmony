# Backlog Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement seven backlog features: MULTIPLIER question type (with XP formula), delete pack, CDP export metadata, completions history page, questions in create mode, XP in mobile header, and XP size labels in the chore form.

**Architecture:** The foundational change is a TypeScript discriminated union for `Question` (Task 1), which every subsequent task depends on. Store actions are extended for the multiplier formula and pack deletion. New components: `CompletionsPage`. Modified components: `AnswerField`, `QuestionFormFields`, `QuestionBuilder`, `ChoreFormModal`, `PackDashboard`, `ChoreCard`, `App`.

**Tech Stack:** React 19, Zustand 5, React Router v7, `fflate`, `js-yaml`, Tailwind CSS v4, Bun test runner

---

### Task 1: Question discriminated union — types + compiler fixups

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/questions/validation.ts`
- Modify: `src/questions/validation.test.ts`
- Modify: `src/components/completion/AnswerField.tsx`
- Modify: `src/components/questions/QuestionFormFields.tsx`
- Modify: `src/components/chores/choreFormValidation.ts`
- Modify: `src/components/chores/ChoreFormModal.test.ts`

- [ ] **Step 1: Replace the flat Question interface in src/types/index.ts**

Replace from `export type QuestionType` through the closing brace of `export interface Question` (and the old `choices?: EnumChoice[]` field) with:

```ts
export interface TextQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'TEXT';
  regexPattern?: string;
}
export interface IntegerQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'INTEGER';
  minValue?: number;
  maxValue?: number;
}
export interface BooleanQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'BOOLEAN';
}
export interface EnumQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'ENUM';
  choices?: EnumChoice[];
}
export interface MultiplierQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'MULTIPLIER';
  xpPerUnit: number;
  multiplierAnswerType: 'integer' | 'float';
}
export type Question = TextQuestion | IntegerQuestion | BooleanQuestion | EnumQuestion | MultiplierQuestion;
export type QuestionType = Question['type'];
```

- [ ] **Step 2: Run typecheck to surface all errors**

```bash
bun run typecheck
```

Expected: multiple errors across several files (validation.ts, AnswerField.tsx, QuestionFormFields.tsx, etc.)

- [ ] **Step 3: Fix src/questions/validation.ts**

Replace the entire `validateAnswer` function body (keep `isSafeRegex` unchanged):

```ts
export function validateAnswer(answer: Answer, question: Question): string | null {
  const { value } = answer;
  const { type, required } = question;

  const isEmpty =
    type === 'BOOLEAN'
      ? value === null
      : value === null || value === '';

  if (required && isEmpty) return 'This field is required';
  if (isEmpty) return null;

  if (question.type === 'TEXT' && question.regexPattern && typeof value === 'string') {
    const re = new RegExp(question.regexPattern);
    if (!re.test(value)) {
      return `Value does not match the required pattern: ${question.regexPattern}`;
    }
  }

  if (question.type === 'INTEGER' && typeof value === 'number') {
    if (question.minValue !== undefined && value < question.minValue)
      return `Value must be at least ${question.minValue}`;
    if (question.maxValue !== undefined && value > question.maxValue)
      return `Value must be at most ${question.maxValue}`;
  }

  if (question.type === 'ENUM' && question.choices && question.choices.length > 0) {
    const validIds = new Set(question.choices.map((c) => c.id));
    if (!validIds.has(String(value)))
      return 'Invalid choice — value is not one of the allowed options';
  }

  return null;
}
```

- [ ] **Step 4: Fix factory functions in src/questions/validation.test.ts**

Replace the four factory functions (keep all `describe` blocks unchanged):

```ts
import type { TextQuestion, IntegerQuestion, BooleanQuestion, EnumQuestion, Answer, EnumChoice } from '@/types';

function makeTextQuestion(overrides: Partial<TextQuestion> = {}): TextQuestion {
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

function makeIntegerQuestion(overrides: Partial<IntegerQuestion> = {}): IntegerQuestion {
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

function makeBooleanQuestion(overrides: Partial<BooleanQuestion> = {}): BooleanQuestion {
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

function makeEnumQuestion(choices: EnumChoice[], overrides: Partial<EnumQuestion> = {}): EnumQuestion {
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
```

- [ ] **Step 5: Fix src/components/completion/AnswerField.tsx — remove flat destructuring, use type narrowing**

Replace the entire file:

```tsx
import type { Question } from '@/types';

interface Props {
  question: Question;
  value: string | number | boolean | null;
  error?: string;
  onChange: (value: string | number | boolean | null) => void;
}

export default function AnswerField({ question, value, error, onChange }: Props) {
  const { prompt, required } = question;

  const baseInputClass = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
    error ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
  }`;

  function renderInput() {
    if (question.type === 'TEXT') {
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.regexPattern ? `Must match: ${question.regexPattern}` : undefined}
          className={baseInputClass}
        />
      );
    }

    if (question.type === 'INTEGER') {
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={question.minValue}
          max={question.maxValue}
          onChange={(e) => onChange(e.target.value !== '' ? Number(e.target.value) : null)}
          className={baseInputClass}
        />
      );
    }

    if (question.type === 'BOOLEAN') {
      return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-blue-600"
          />
          <span className="text-sm text-gray-700">Yes</span>
        </label>
      );
    }

    if (question.type === 'ENUM') {
      const sortedChoices = [...(question.choices ?? [])].sort((a, b) => a.order - b.order);
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={baseInputClass}
        >
          <option value="">— Select —</option>
          {sortedChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>{choice.label}</option>
          ))}
        </select>
      );
    }

    return null;
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {prompt}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {renderInput()}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Fix src/components/questions/QuestionFormFields.tsx — DraftQuestion union + handleTypeChange**

Replace the entire file:

```tsx
import { useState, useEffect } from 'react';
import type {
  QuestionType,
  TextQuestion, IntegerQuestion, BooleanQuestion, EnumQuestion, MultiplierQuestion,
  EnumChoice,
} from '@/types';
import { isSafeRegex } from '@/questions/validation';
import EnumChoicesEditor from './EnumChoicesEditor';

export type DraftQuestion =
  | (TextQuestion     & { _isNew?: boolean; _deleted?: boolean })
  | (IntegerQuestion  & { _isNew?: boolean; _deleted?: boolean })
  | (BooleanQuestion  & { _isNew?: boolean; _deleted?: boolean })
  | (EnumQuestion     & { _isNew?: boolean; _deleted?: boolean })
  | (MultiplierQuestion & { _isNew?: boolean; _deleted?: boolean });

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'INTEGER', label: 'Integer' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'ENUM', label: 'Multiple Choice' },
];

interface Props {
  question: DraftQuestion;
  onChange: (updated: DraftQuestion) => void;
  hasOtherMultiplier?: boolean;
}

export default function QuestionFormFields({ question, onChange, hasOtherMultiplier = false }: Props) {
  const [regexError, setRegexError] = useState<string | undefined>(undefined);

  const regexPattern = question.type === 'TEXT' ? question.regexPattern : undefined;

  useEffect(() => {
    if (question.type === 'TEXT' && regexPattern) {
      const result = isSafeRegex(regexPattern);
      setRegexError(result.valid ? undefined : result.error);
    } else {
      setRegexError(undefined);
    }
  }, [question.type, regexPattern]);

  function update(partial: Partial<DraftQuestion>) {
    onChange({ ...question, ...partial } as DraftQuestion);
  }

  function handleTypeChange(newType: QuestionType) {
    const base = {
      id: question.id,
      choreKey: question.choreKey,
      prompt: question.prompt,
      required: question.required,
      order: question.order,
      _isNew: question._isNew,
      _deleted: question._deleted,
    };
    if (newType === 'TEXT') onChange({ ...base, type: 'TEXT' });
    else if (newType === 'INTEGER') onChange({ ...base, type: 'INTEGER' });
    else if (newType === 'BOOLEAN') onChange({ ...base, type: 'BOOLEAN' });
    else if (newType === 'ENUM') {
      const existingChoices = question.type === 'ENUM' ? question.choices : [];
      onChange({ ...base, type: 'ENUM', choices: existingChoices });
    } else if (newType === 'MULTIPLIER') {
      onChange({ ...base, type: 'MULTIPLIER', xpPerUnit: 1, multiplierAnswerType: 'integer', required: true });
    }
  }

  const allTypes = [
    ...QUESTION_TYPES,
    { value: 'MULTIPLIER' as QuestionType, label: 'Score Multiplier' },
  ];

  const isMultiplierDisabled = hasOtherMultiplier && question.type !== 'MULTIPLIER';

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Question Prompt <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={question.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="e.g. How many minutes did it take?"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-32">
          <label className="mb-1 block text-xs font-medium text-gray-700">Type</label>
          <select
            value={question.type}
            onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {allTypes.map((t) => (
              <option
                key={t.value}
                value={t.value}
                disabled={t.value === 'MULTIPLIER' && isMultiplierDisabled}
                title={t.value === 'MULTIPLIER' && isMultiplierDisabled ? 'Only one multiplier per chore' : undefined}
              >
                {t.label}
                {t.value === 'MULTIPLIER' && isMultiplierDisabled ? ' (already set)' : ''}
              </option>
            ))}
          </select>
        </div>

        {question.type !== 'MULTIPLIER' && (
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => update({ required: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 accent-blue-600"
              />
              Required
            </label>
          </div>
        )}
      </div>

      {question.type === 'TEXT' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Regex Pattern <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={question.regexPattern ?? ''}
            onChange={(e) => update({ regexPattern: e.target.value || undefined } as Partial<DraftQuestion>)}
            placeholder="e.g. ^\d{4}$"
            className={`w-full rounded border px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 ${
              regexError ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
            }`}
          />
          {regexError && <p className="mt-1 text-xs text-red-600">{regexError}</p>}
          {!regexError && question.regexPattern && (
            <p className="mt-1 text-xs text-green-600">Pattern is valid</p>
          )}
        </div>
      )}

      {question.type === 'INTEGER' && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Min Value <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={question.minValue ?? ''}
              onChange={(e) => update({ minValue: e.target.value !== '' ? Number(e.target.value) : undefined } as Partial<DraftQuestion>)}
              placeholder="None"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Max Value <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={question.maxValue ?? ''}
              onChange={(e) => update({ maxValue: e.target.value !== '' ? Number(e.target.value) : undefined } as Partial<DraftQuestion>)}
              placeholder="None"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
      )}

      {question.type === 'ENUM' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Choices</label>
          <EnumChoicesEditor
            choices={question.choices ?? []}
            onChange={(choices: EnumChoice[]) => update({ choices } as Partial<DraftQuestion>)}
          />
        </div>
      )}

      {question.type === 'MULTIPLIER' && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Weight <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={question.xpPerUnit}
              min="0.0001"
              step="any"
              onChange={(e) => update({ xpPerUnit: Number(e.target.value) } as Partial<DraftQuestion>)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Answer type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name={`multiplier-type-${question.id}`}
                  value="integer"
                  checked={question.multiplierAnswerType === 'integer'}
                  onChange={() => update({ multiplierAnswerType: 'integer' } as Partial<DraftQuestion>)}
                  className="accent-blue-600"
                />
                Integer
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name={`multiplier-type-${question.id}`}
                  value="float"
                  checked={question.multiplierAnswerType === 'float'}
                  onChange={() => update({ multiplierAnswerType: 'float' } as Partial<DraftQuestion>)}
                  className="accent-blue-600"
                />
                Float
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Fix src/components/questions/QuestionBuilder.tsx — add MULTIPLIER to TYPE_LABELS and pass hasOtherMultiplier**

Replace the `TYPE_LABELS` constant:
```ts
const TYPE_LABELS: Record<string, string> = {
  TEXT: 'Text',
  INTEGER: 'Integer',
  BOOLEAN: 'Yes / No',
  ENUM: 'Multiple Choice',
  MULTIPLIER: 'Score Multiplier',
};
```

In the `return (...)` JSX, find the `<QuestionFormFields question={draft} onChange={handleUpdate} />` line and replace it with:
```tsx
<QuestionFormFields
  question={draft}
  onChange={handleUpdate}
  hasOtherMultiplier={drafts.some((d) => !d._deleted && d.type === 'MULTIPLIER' && d.id !== draft.id)}
/>
```

- [ ] **Step 8: Fix src/components/chores/choreFormValidation.ts — split OR condition for type narrowing**

Replace the inner loop body:

```ts
for (const draft of drafts) {
  if (draft._deleted) continue;
  if (draft.type !== 'TEXT') continue;
  if (!draft.regexPattern) continue;

  const result = isSafeRegex(draft.regexPattern);
  if (!result.valid) {
    return result.error ?? 'A question has an invalid regex pattern';
  }
}
```

- [ ] **Step 9: Fix src/components/chores/ChoreFormModal.test.ts — cast makeDraft return**

Replace:
```ts
function makeDraft(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    id: 'q-1',
    choreKey: 'personal/test',
    prompt: 'How many?',
    type: 'TEXT',
    required: true,
    order: 0,
    ...overrides,
  };
}
```

With:
```ts
function makeDraft(overrides: Record<string, unknown> = {}): DraftQuestion {
  return {
    id: 'q-1',
    choreKey: 'personal/test',
    prompt: 'How many?',
    type: 'TEXT',
    required: true,
    order: 0,
    ...overrides,
  } as DraftQuestion;
}
```

- [ ] **Step 10: Fix src/store/index.ts — add type cast in saveQuestions**

In `saveQuestions`, find:
```ts
const toSave = drafts
  .filter((d) => !d._deleted)
  .map(({ _isNew: _n, _deleted: _d, ...q }) => q);
```

Replace with:
```ts
const toSave = drafts
  .filter((d) => !d._deleted)
  .map(({ _isNew: _n, _deleted: _d, ...q }) => q as Question);
```

Also add `Question` to the imports in this file if not already present (it is already imported).

- [ ] **Step 11: Run typecheck — expect clean**

```bash
bun run typecheck
```

Expected: exit 0, no errors

- [ ] **Step 12: Run full test suite**

```bash
bun test --isolate src/
```

Expected: all tests pass

- [ ] **Step 13: Commit**

```bash
git add src/types/index.ts src/questions/validation.ts src/questions/validation.test.ts src/components/completion/AnswerField.tsx src/components/questions/QuestionFormFields.tsx src/components/questions/QuestionBuilder.tsx src/components/chores/choreFormValidation.ts src/components/chores/ChoreFormModal.test.ts src/store/index.ts
git commit -m "refactor: replace flat Question interface with discriminated union"
```

---

### Task 2: MULTIPLIER validation

**Files:**
- Modify: `src/questions/validation.ts`
- Modify: `src/questions/validation.test.ts`
- Modify: `src/components/chores/choreFormValidation.ts`
- Modify: `src/components/chores/ChoreFormModal.test.ts`

- [ ] **Step 1: Write failing tests for MULTIPLIER answer validation in src/questions/validation.test.ts**

Add after the last `describe('validateAnswer', ...)` block:

```ts
import type { MultiplierQuestion } from '@/types';

function makeMultiplierQuestion(overrides: Partial<MultiplierQuestion> = {}): MultiplierQuestion {
  return {
    id: 'q-mult',
    choreKey: 'personal/test-chore',
    prompt: 'How many reps?',
    type: 'MULTIPLIER',
    required: true,
    order: 4,
    xpPerUnit: 0.5,
    multiplierAnswerType: 'integer',
    ...overrides,
  };
}

describe('validateAnswer — MULTIPLIER', () => {
  it('returns null when answer is a positive integer', () => {
    const q = makeMultiplierQuestion();
    expect(validateAnswer({ questionId: q.id, value: 5 }, q)).toBeNull();
  });

  it('returns null when answer is a positive float and answerType is float', () => {
    const q = makeMultiplierQuestion({ multiplierAnswerType: 'float' });
    expect(validateAnswer({ questionId: q.id, value: 1.5 }, q)).toBeNull();
  });

  it('returns error when answer is zero', () => {
    const q = makeMultiplierQuestion();
    const result = validateAnswer({ questionId: q.id, value: 0 }, q);
    expect(result).not.toBeNull();
    expect(result).toMatch(/positive/i);
  });

  it('returns error when answer is negative', () => {
    const q = makeMultiplierQuestion();
    const result = validateAnswer({ questionId: q.id, value: -1 }, q);
    expect(result).not.toBeNull();
    expect(result).toMatch(/positive/i);
  });

  it('returns error when required and value is null', () => {
    const q = makeMultiplierQuestion({ required: true });
    expect(validateAnswer({ questionId: q.id, value: null }, q)).toBe('This field is required');
  });
});
```

Also add failing tests for at-most-one constraint in `src/components/chores/ChoreFormModal.test.ts`:

```ts
import type { MultiplierQuestion } from '@/types';

function makeMultiplierDraft(overrides: Record<string, unknown> = {}): DraftQuestion {
  return {
    id: 'q-mult',
    choreKey: 'personal/test',
    prompt: 'How many?',
    type: 'MULTIPLIER',
    required: true,
    order: 0,
    xpPerUnit: 1,
    multiplierAnswerType: 'integer',
    ...overrides,
  } as DraftQuestion;
}

describe('validateQuestionDrafts — MULTIPLIER constraint', () => {
  it('returns null when there is exactly one MULTIPLIER question', () => {
    expect(validateQuestionDrafts([makeMultiplierDraft()])).toBeNull();
  });

  it('returns error when there are two active MULTIPLIER questions', () => {
    const drafts = [
      makeMultiplierDraft({ id: 'q-1' }),
      makeMultiplierDraft({ id: 'q-2', order: 1 }),
    ];
    const result = validateQuestionDrafts(drafts);
    expect(result).not.toBeNull();
    expect(result).toMatch(/multiplier/i);
  });

  it('ignores deleted MULTIPLIER when counting', () => {
    const drafts = [
      makeMultiplierDraft({ id: 'q-1' }),
      makeMultiplierDraft({ id: 'q-2', order: 1, _deleted: true }),
    ];
    expect(validateQuestionDrafts(drafts)).toBeNull();
  });

  it('returns error when xpPerUnit is zero', () => {
    const result = validateQuestionDrafts([makeMultiplierDraft({ xpPerUnit: 0 })]);
    expect(result).not.toBeNull();
    expect(result).toMatch(/weight/i);
  });

  it('returns error when xpPerUnit is negative', () => {
    const result = validateQuestionDrafts([makeMultiplierDraft({ xpPerUnit: -1 })]);
    expect(result).not.toBeNull();
    expect(result).toMatch(/weight/i);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
bun test --isolate src/questions/validation.test.ts src/components/chores/ChoreFormModal.test.ts
```

Expected: FAIL — MULTIPLIER validation not implemented yet

- [ ] **Step 3: Add MULTIPLIER case to validateAnswer in src/questions/validation.ts**

Add before the final `return null;`:

```ts
  if (question.type === 'MULTIPLIER') {
    if (typeof value !== 'number' || value <= 0) {
      return 'Answer must be a positive number';
    }
  }
```

- [ ] **Step 4: Add MULTIPLIER constraint to validateQuestionDrafts in src/components/chores/choreFormValidation.ts**

Replace the entire function body:

```ts
export function validateQuestionDrafts(drafts: DraftQuestion[]): string | null {
  const active = drafts.filter((d) => !d._deleted);

  const multipliers = active.filter((d) => d.type === 'MULTIPLIER');
  if (multipliers.length > 1) {
    return 'Only one score multiplier question is allowed per chore';
  }

  for (const draft of active) {
    if (draft.type === 'MULTIPLIER') {
      if (draft.xpPerUnit <= 0) {
        return 'Score multiplier weight must be greater than 0';
      }
      continue;
    }
    if (draft.type !== 'TEXT') continue;
    if (!draft.regexPattern) continue;

    const result = isSafeRegex(draft.regexPattern);
    if (!result.valid) {
      return result.error ?? 'A question has an invalid regex pattern';
    }
  }
  return null;
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
bun test --isolate src/questions/validation.test.ts src/components/chores/ChoreFormModal.test.ts
```

Expected: all tests pass

- [ ] **Step 6: Run full suite**

```bash
bun test --isolate src/
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/questions/validation.ts src/questions/validation.test.ts src/components/chores/choreFormValidation.ts src/components/chores/ChoreFormModal.test.ts
git commit -m "feat: add MULTIPLIER question validation (positive answer, at-most-one, weight > 0)"
```

---

### Task 3: DB helpers for pack deletion

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1: Add deleteCompletion and deletePack helpers to src/db/index.ts**

After the existing `deleteQuestion` function, add:

```ts
export const deleteCompletion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('completions', id);

export const deletePack = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('packs', id);
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
bun run typecheck
```

Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/db/index.ts
git commit -m "feat: add deleteCompletion and deletePack IDB helpers"
```

---

### Task 4: Store changes — addChore return type, recordCompletion multiplier, deletePack action

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/store/packActions.test.ts`

- [ ] **Step 1: Write failing test for deletePack in src/store/packActions.test.ts**

Add this import at the top of the file:
```ts
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';
```

Add after the existing `describe('renamePack', ...)` block:

```ts
describe('deletePack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  it('removes the pack and all its chores, questions, and completions', async () => {
    const packId = await useAppStore.getState().addPack('Pack To Delete');
    const choreKey = await useAppStore.getState().addChore({
      packId,
      title: 'Chore In Pack',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    await useAppStore.getState().saveQuestions(choreKey, [{
      id: crypto.randomUUID(),
      choreKey,
      prompt: 'Test?',
      type: 'TEXT',
      required: false,
      order: 0,
      _isNew: true,
    } as DraftQuestion]);

    await useAppStore.getState().deletePack(packId);

    const state = useAppStore.getState();
    expect(state.packs.find((p) => p.id === packId)).toBeUndefined();
    expect(state.chores.find((c) => c.packId === packId)).toBeUndefined();
    expect(state.questions.find((q) => q.choreKey === choreKey)).toBeUndefined();
  });

  it('throws when attempting to delete the personal pack', async () => {
    await expect(useAppStore.getState().deletePack('personal')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Write failing test for recordCompletion with multiplier**

Add a new file `src/store/recordCompletion.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('recordCompletion — MULTIPLIER question', () => {
  let choreKey: string;
  let multiplierQuestionId: string;

  beforeAll(async () => {
    await useAppStore.getState().init();
    // addChore now returns Promise<string> with the new choreKey
    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Multiplier Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    multiplierQuestionId = crypto.randomUUID();
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: multiplierQuestionId,
      choreKey,
      prompt: 'How many reps?',
      type: 'MULTIPLIER',
      required: true,
      order: 0,
      xpPerUnit: 2,
      multiplierAnswerType: 'integer',
      _isNew: true,
    } as DraftQuestion]);
  });

  test('xpEarned is multiplied by xpPerUnit × answer', async () => {
    await useAppStore.getState().recordCompletion(choreKey, [
      { questionId: multiplierQuestionId, value: 3 },
    ]);

    const completions = useAppStore.getState().completions.filter((c) => c.choreKey === choreKey);
    expect(completions).toHaveLength(1);
    // base XP for S + streak 1 + 0 totalCompletions ≈ 5 (from XP_BASE)
    // actual XP = base × 2 × 3 — just verify it is different from bare base XP
    expect(completions[0].xpEarned).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 3: Run failing tests**

```bash
bun test --isolate src/store/packActions.test.ts src/store/recordCompletion.test.ts
```

Expected: FAIL — `deletePack is not a function` and `addChore` still returns void

- [ ] **Step 4: Update AppState interface in src/store/index.ts**

Find the `AppState` interface. Make these changes:

1. Change `addChore` return type:
```ts
addChore: (data: Omit<Chore, 'key' | 'choreId' | 'createdAt'>) => Promise<string>;
```

2. Add `deletePack` after `renamePack`:
```ts
deletePack: (packId: string) => Promise<void>;
```

Extend the existing `from '@/db'` import at the top of the file to include the new helpers — merge these into the existing import line (do not create a duplicate import):
```ts
import { openDB, getAllChores, getAllCompletions, getAllQuestions, getXPSettings, getProfile, getSyncState, getPacks, putChore, putCompletion, putProfile, putSyncState, putQuestion, deleteQuestion, deleteChore, putPack, deleteCompletion, deletePack as dbDeletePack, getChoresByPack, getQuestions, getCompletionsByChore } from '@/db';
```

Add `MultiplierQuestion` to the existing `import type { ... } from '@/types'` block:
```ts
  MultiplierQuestion,
```

- [ ] **Step 5: Change addChore to return the choreKey**

Find the `addChore` implementation. Change the last two lines from:
```ts
    await putChore(db, newChore);
    set((state) => ({ chores: [...state.chores, newChore] }));
  },
```

To:
```ts
    await putChore(db, newChore);
    set((state) => ({ chores: [...state.chores, newChore] }));
    return newChore.key;
  },
```

- [ ] **Step 6: Add multiplier logic to recordCompletion**

Find in `recordCompletion`:
```ts
    const xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);
```

Replace with:
```ts
    const { questions } = get();
    let xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);
    const multiplierQ = questions.find(
      (q): q is MultiplierQuestion => q.choreKey === choreKey && q.type === 'MULTIPLIER',
    );
    if (multiplierQ) {
      const mulAnswer = answers.find((a) => a.questionId === multiplierQ.id);
      if (mulAnswer && typeof mulAnswer.value === 'number' && mulAnswer.value > 0) {
        xpEarned = Math.round(xpEarned * multiplierQ.xpPerUnit * mulAnswer.value);
      }
    }
```

- [ ] **Step 7: Add deletePack action**

Add after the `renamePack` action implementation (before `addPack` or wherever renamePack ends):

```ts
  deletePack: async (packId) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    const pack = get().packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    if (pack.isPersonal) throw new Error('Cannot delete the personal pack');

    const packChores = await getChoresByPack(db, packId);
    for (const chore of packChores) {
      const choreCompletions = await getCompletionsByChore(db, chore.key);
      for (const c of choreCompletions) await deleteCompletion(db, c.id);

      const choreQuestions = await getQuestions(db, chore.key);
      for (const q of choreQuestions) await deleteQuestion(db, q.id);

      await deleteChore(db, chore.key);
    }
    await dbDeletePack(db, packId);

    const packChoreKeys = new Set(packChores.map((c) => c.key));
    set((state) => ({
      packs: state.packs.filter((p) => p.id !== packId),
      chores: state.chores.filter((c) => c.packId !== packId),
      questions: state.questions.filter((q) => !packChoreKeys.has(q.choreKey)),
      completions: state.completions.filter((c) => !packChoreKeys.has(c.choreKey)),
    }));
  },
```

Also add `deleteChore` to the db imports if not already present: it's already imported as `deleteChore` in the existing imports.

- [ ] **Step 8: Run tests — expect pass**

```bash
bun test --isolate src/store/packActions.test.ts src/store/recordCompletion.test.ts
```

Expected: all tests pass

- [ ] **Step 9: Run full suite + typecheck**

```bash
bun run typecheck && bun test --isolate src/
```

Expected: exit 0, all tests pass

- [ ] **Step 10: Commit**

```bash
git add src/store/index.ts src/store/packActions.test.ts src/store/recordCompletion.test.ts
git commit -m "feat: addChore returns choreKey, recordCompletion applies MULTIPLIER, add deletePack store action"
```

---

### Task 5: CompletionModal — MULTIPLIER answer field

**Files:**
- Modify: `src/components/completion/AnswerField.tsx`

- [ ] **Step 1: Write failing test in src/components/completion/CompletionModal.test.ts**

The existing test file is at `src/components/chores/CompletionModal.test.ts` — check if it exists:

```bash
ls src/components/completion/
```

If `CompletionModal.test.ts` does not exist, create `src/components/completion/CompletionModal.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { validateAnswer } from '@/questions/validation';
import type { MultiplierQuestion } from '@/types';

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
```

- [ ] **Step 2: Run to verify pass (these are validation tests, already implemented)**

```bash
bun test --isolate src/components/completion/CompletionModal.test.ts
```

Expected: pass

- [ ] **Step 3: Add MULTIPLIER case to AnswerField.tsx**

In `src/components/completion/AnswerField.tsx`, add a MULTIPLIER branch inside `renderInput()`, before the final `return null`:

```tsx
    if (question.type === 'MULTIPLIER') {
      const isFloat = question.multiplierAnswerType === 'float';
      return (
        <div>
          <input
            type="number"
            value={typeof value === 'number' ? value : ''}
            min={isFloat ? '0.0001' : '1'}
            step={isFloat ? 'any' : '1'}
            onChange={(e) => onChange(e.target.value !== '' ? Number(e.target.value) : null)}
            className={baseInputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            × {String(question.xpPerUnit).replace(/\.?0+$/, '')}
          </p>
        </div>
      );
    }
```

- [ ] **Step 4: Verify typecheck**

```bash
bun run typecheck
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/components/completion/AnswerField.tsx src/components/completion/CompletionModal.test.ts
git commit -m "feat: render MULTIPLIER answer input with weight hint in CompletionModal"
```

---

### Task 6: ChoreFormModal — questions in create mode + XP size labels

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Add XP_BASE import**

At the top of `src/components/chores/ChoreFormModal.tsx`, add to the existing imports:

```ts
import { XP_BASE } from '@/xp/calculator';
```

- [ ] **Step 2: Update XP size select options to show base XP**

Find in the JSX:
```tsx
{XP_SIZES.map((size) => (
  <option key={size} value={size}>{size}</option>
))}
```

Replace with:
```tsx
{XP_SIZES.map((size) => (
  <option key={size} value={size}>{size} ({XP_BASE[size]} XP)</option>
))}
```

- [ ] **Step 3: Enable QuestionBuilder in create mode**

Find and remove the `{isEdit && (...)}` block wrapping the Questions section AND the `{!isEdit && (...)}` note block. Replace both with a single unconditional block:

```tsx
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800">Questions</h3>
              <span className="text-xs text-gray-400">
                {questionDrafts.filter((d) => !d._deleted).length > 0
                  ? `${questionDrafts.filter((d) => !d._deleted).length} question(s)`
                  : 'None'}
              </span>
            </div>
            {errors.questions && (
              <p className="mb-2 text-xs text-red-600">{errors.questions}</p>
            )}
            <QuestionBuilder
              choreKey={isEdit ? chore!.key : ''}
              initialQuestions={isEdit ? initialQuestions : []}
              onChange={setQuestionDrafts}
            />
          </div>
```

- [ ] **Step 4: Save questions after addChore in create mode**

In `handleSubmit`, find the `else` branch (create mode):
```ts
      } else {
        await addChore({
          packId: selectedPackId,
          ...
        });
      }
```

Replace with:
```ts
      } else {
        const newChoreKey = await addChore({
          packId: selectedPackId,
          title: title.trim(),
          description: description.trim() || undefined,
          xpSize,
          recurrence: { frequency, interval: Number(interval), startDate, windowStartTime },
          repeatable,
          active: true,
        });
        if (questionDrafts.some((d) => !d._deleted)) {
          const withKey = questionDrafts.map((d) => ({ ...d, choreKey: newChoreKey }));
          await saveQuestions(newChoreKey, withKey);
        }
      }
```

Note: remove the duplicate `addChore({...})` call if it was already complete — this step replaces it entirely.

- [ ] **Step 5: Verify typecheck**

```bash
bun run typecheck
```

Expected: exit 0

- [ ] **Step 6: Run tests**

```bash
bun test --isolate src/components/chores/
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: show XP base values in size picker, enable questions in chore create mode"
```

---

### Task 7: XP in mobile title bar

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add totalXP selector to App.tsx**

In `src/App.tsx`, find the existing store selectors at the top of the `App` component. After the `const db = useAppStore((s) => s.db);` line, add:

```ts
  const completions = useAppStore((s) => s.completions);
  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);
```

- [ ] **Step 2: Add XP pill to the mobile header**

Find the mobile header JSX:
```tsx
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <button ... >☰</button>
          <Link to="/" className="font-bold text-gray-900">
            Tasks Harmony
          </Link>
        </header>
```

Replace with:
```tsx
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xl text-gray-600"
            aria-label="Open menu"
          >
            ☰
          </button>
          <Link to="/" className="font-bold text-gray-900">
            Tasks Harmony
          </Link>
          <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            {totalXP.toLocaleString()} XP
          </span>
        </header>
```

- [ ] **Step 3: Verify typecheck**

```bash
bun run typecheck
```

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: show XP counter in mobile title bar"
```

---

### Task 8: CDP export metadata

**Files:**
- Modify: `src/cdp/cdp-export.ts`
- Modify: `src/cdp/cdp-export.test.ts`

- [ ] **Step 1: Write failing tests in src/cdp/cdp-export.test.ts**

Add after the existing `describe('buildCDPZip', ...)` block:

```ts
import type { UserProfile } from '@/types';

const PROFILE: UserProfile = {
  id: 'me',
  displayName: 'Alice',
  email: 'alice@example.com',
  activeXPSettingsId: 'default',
};

describe('buildCDPZip — metadata', () => {
  test('includes author as "Name <email>" when both are set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('Alice <alice@example.com>');
  });

  test('includes only name when email is empty', () => {
    const noEmail = { ...PROFILE, email: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], noEmail));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('Alice');
  });

  test('includes only email in angle brackets when name is empty', () => {
    const noName = { ...PROFILE, displayName: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], noName));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('<alice@example.com>');
  });

  test('omits author when both name and email are empty', () => {
    const noIdentity = { ...PROFILE, displayName: '', email: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], noIdentity));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBeUndefined();
  });

  test('includes createdAt as an ISO string', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(typeof manifest.createdAt).toBe('string');
    expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

Also update all existing `buildCDPZip(PACK, ...)` calls in the existing tests to pass `PROFILE` as the third argument:

```ts
// Find every occurrence of:
buildCDPZip(PACK, [ACTIVE_CHORE])
buildCDPZip(PACK, [ACTIVE_CHORE, INACTIVE_CHORE])
buildCDPZip(packWithExtras, [ACTIVE_CHORE])
// and add , PROFILE as the third argument to each
```

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test --isolate src/cdp/cdp-export.test.ts
```

Expected: FAIL — wrong number of arguments to `buildCDPZip`

- [ ] **Step 3: Update buildCDPZip signature in src/cdp/cdp-export.ts**

Add `UserProfile` to the import:
```ts
import type { Pack, Chore, UserProfile } from '@/types';
```

Change the function signature:
```ts
export function buildCDPZip(pack: Pack, chores: Chore[], profile: UserProfile): Uint8Array {
```

- [ ] **Step 4: Add author and createdAt to buildPackYaml**

Change `buildPackYaml` to accept profile:

```ts
function buildPackYaml(pack: Pack, choreFilenames: string[], profile: UserProfile): string {
  const data: Record<string, unknown> = { title: pack.manifest.title };

  const author = buildAuthor(profile);
  if (author) data.author = author;
  if (pack.manifest.license) data.license = pack.manifest.license;
  if (pack.manifest.description) data.description = pack.manifest.description;
  data.createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  data.chores = choreFilenames;
  return jsYaml.dump(data);
}

function buildAuthor(profile: UserProfile): string | undefined {
  const name = profile.displayName.trim();
  const email = profile.email.trim();
  if (name && email) return `${name} <${email}>`;
  if (name) return name;
  if (email) return `<${email}>`;
  return undefined;
}
```

Update the call inside `buildCDPZip`:
```ts
  const files: Record<string, Uint8Array> = {
    [`${pack.id}/__pack__.yaml`]: strToU8(buildPackYaml(pack, choreFilenames, profile)),
  };
```

- [ ] **Step 5: Run tests — expect pass**

```bash
bun test --isolate src/cdp/cdp-export.test.ts
```

Expected: all tests pass

- [ ] **Step 6: Run typecheck**

```bash
bun run typecheck
```

Expected: exit 0 (PackDashboard.tsx will have a type error — fix in next task)

- [ ] **Step 7: Commit**

```bash
git add src/cdp/cdp-export.ts src/cdp/cdp-export.test.ts
git commit -m "feat: include author and createdAt in CDP export metadata"
```

---

### Task 9: PackDashboard — delete pack + pass profile to CDP

**Files:**
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Replace the entire PackDashboard.tsx**

```tsx
import { useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import Dashboard from '@/components/dashboard/Dashboard';
import { buildCDPZip } from '@/cdp/cdp-export';

export default function PackDashboard() {
  const { packId } = useParams<{ packId: string }>();
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const renamePack = useAppStore((s) => s.renamePack);
  const deletePack = useAppStore((s) => s.deletePack);
  const profile = useAppStore((s) => s.profile);
  const navigate = useNavigate();

  const pack = packs.find((p) => p.id === packId);
  const packChores = chores.filter((c) => c.packId === packId);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  if (!pack) return <Navigate to="/" replace />;

  async function handleRename() {
    if (!renameValue.trim() || !pack) return;
    await renamePack(pack.id, renameValue.trim());
    setIsRenaming(false);
  }

  function handleExport() {
    if (!pack || !profile) return;
    const zipBytes = buildCDPZip(pack, packChores, profile);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.id}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function handleDelete() {
    if (!pack) return;
    const confirmed = window.confirm(
      `Delete "${pack.manifest.title}" and all its chores? This cannot be undone.`
    );
    if (!confirmed) return;
    await deletePack(pack.id);
    navigate('/');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-2 pt-4">
        {isRenaming ? (
          <>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={handleRename}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{pack.manifest.title}</h1>
            <button
              onClick={() => { setRenameValue(pack.manifest.title); setIsRenaming(true); }}
              title="Rename pack"
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              ✏️
            </button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleExport}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Download as CDP
          </button>
          {!pack.isPersonal && (
            <button
              onClick={handleDelete}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Delete Pack
            </button>
          )}
        </div>
      </div>

      <Dashboard chores={packChores} currentPackId={pack.id} />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: exit 0

- [ ] **Step 3: Run tests**

```bash
bun test --isolate src/
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add src/components/packs/PackDashboard.tsx
git commit -m "feat: add delete pack button and pass profile to CDP export in PackDashboard"
```

---

### Task 10: CompletionsPage + route

**Files:**
- Create: `src/components/completion/CompletionsPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/components/completion/CompletionsPage.tsx**

```tsx
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';

export default function CompletionsPage() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  const navigate = useNavigate();

  const choreKey = encodedChoreKey ? decodeURIComponent(encodedChoreKey) : '';
  const chores = useAppStore((s) => s.chores);
  const allCompletions = useAppStore((s) => s.completions);
  const questions = useAppStore((s) => s.questions);

  const chore = chores.find((c) => c.key === choreKey);
  if (!chore) return <Navigate to="/" replace />;

  const choreQuestions = questions
    .filter((q) => q.choreKey === choreKey)
    .sort((a, b) => a.order - b.order);

  const completions = allCompletions
    .filter((c) => c.choreKey === choreKey)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  function getAnswerValue(completionAnswers: { questionId: string; value: string | number | boolean | null }[], questionId: string): string {
    const ans = completionAnswers.find((a) => a.questionId === questionId);
    if (!ans || ans.value === null || ans.value === '') return '';
    return String(ans.value);
  }

  return (
    <div className="py-4">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-blue-600 hover:underline"
      >
        ← Back
      </button>

      <h1 className="mb-4 text-2xl font-bold text-gray-900">{chore.title}</h1>

      {completions.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No completions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Completed at</th>
                {choreQuestions.map((q) => (
                  <th key={q.id} className="py-2 pr-4 font-medium text-gray-700">{q.prompt}</th>
                ))}
                <th className="py-2 font-medium text-gray-700 text-right">XP earned</th>
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{formatDate(c.completedAt)}</td>
                  {choreQuestions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-gray-600">
                      {getAnswerValue(c.answers, q.id)}
                    </td>
                  ))}
                  <td className="py-2 text-gray-700 font-medium text-right">{c.xpEarned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route in src/App.tsx**

Add the import:
```ts
import CompletionsPage from '@/components/completion/CompletionsPage';
```

Inside `<Routes>`, add after the `/packs/:packId` route:
```tsx
<Route path="/chores/:encodedChoreKey/completions" element={<CompletionsPage />} />
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/components/completion/CompletionsPage.tsx src/App.tsx
git commit -m "feat: add CompletionsPage showing chore completion history as table"
```

---

### Task 11: ChoreCard completions link

**Files:**
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Add Link import and completions link to ChoreCard**

Add `Link` to the router import at the top of `src/components/dashboard/ChoreCard.tsx`:

```ts
import { Link } from 'react-router-dom';
```

In the card JSX, find the button group `<div className="flex gap-1">` and add the Completions link before the edit button:

```tsx
            <div className="flex gap-1 items-center">
              <Link
                to={`/chores/${encodeURIComponent(chore.key)}/completions`}
                className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="View completions"
              >
                Completions
              </Link>
              <button
                onClick={() => setShowEditModal(true)}
                title="Edit chore"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                ✎
              </button>
              <button
                onClick={handleDeactivate}
                title="Archive chore"
                className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                Archive
              </button>
            </div>
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: exit 0

- [ ] **Step 3: Run tests**

```bash
bun test --isolate src/
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ChoreCard.tsx
git commit -m "feat: add Completions link to ChoreCard"
```
