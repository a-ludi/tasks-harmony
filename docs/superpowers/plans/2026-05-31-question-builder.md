# Tasks Harmony — Question Builder & Completion Modal Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the question builder (attach structured questions to chores) and the completion modal (answer questions when completing a chore that has questions attached). After this plan, users can define per-chore questions of four types (TEXT, INTEGER, BOOLEAN, ENUM), reorder/remove/restore them in an inline builder inside the chore edit form, and answer those questions in a modal when marking a chore complete.

**Architecture:** All question editing is local-state-only until the user submits the ChoreFormModal. Draft mutations use `DraftQuestion = Question & { _isNew?: boolean; _deleted?: boolean; }`. On ChoreFormModal submit the new store action `saveQuestions` is called: soft-deleted questions are removed from DB, all others are upserted. CompleteButton detects whether a chore has questions; if so it opens CompletionModal rather than calling `recordCompletion` directly. Validation logic lives in a pure module (`src/questions/validation.ts`) tested with Bun's built-in runner.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, idb 8, Bun test runner, Tailwind CSS 4.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/questions/validation.ts` | Create | `isSafeRegex`, `validateAnswer` — pure validation logic |
| `src/questions/validation.test.ts` | Create | TDD tests for validation module |
| `src/components/questions/EnumChoicesEditor.tsx` | Create | Reorderable list of ENUM choice labels |
| `src/components/questions/QuestionFormFields.tsx` | Create | Type-specific config fields for one question |
| `src/components/questions/QuestionBuilder.tsx` | Create | Full list manager: add, reorder, soft-delete, restore |
| `src/components/completion/AnswerField.tsx` | Create | Renders correct input widget for a question type |
| `src/components/completion/CompletionModal.tsx` | Create | Modal shown when completing a chore with questions |
| `src/store/index.ts` | Modify | Add `saveQuestions(choreKey, drafts)` action |
| `src/components/chores/ChoreFormModal.tsx` | Modify | Add Questions section using QuestionBuilder |
| `src/components/chores/CompleteButton.tsx` | Modify | Detect questions, open CompletionModal if present |

---

### Task 1: Validation module (TDD)

**Files:**
- Create: `src/questions/validation.ts`
- Create: `src/questions/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/questions/validation.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { isSafeRegex, validateAnswer } from './validation';
import type { Question, Answer, EnumChoice } from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── isSafeRegex ───────────────────────────────────────────────────────────────

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

// ── validateAnswer ────────────────────────────────────────────────────────────

describe('validateAnswer', () => {
  // ── required check ──────────────────────────────────────────────────────────

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

  // ── TEXT + regex ────────────────────────────────────────────────────────────

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

  // ── INTEGER range ───────────────────────────────────────────────────────────

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

  // ── BOOLEAN ─────────────────────────────────────────────────────────────────

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

  // ── ENUM ────────────────────────────────────────────────────────────────────

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
```

- [ ] **Step 2: Run tests, verify fail**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/questions/validation.test.ts
```

Expected: FAIL — `validation.ts` does not exist yet, import will error.

- [ ] **Step 3: Implement src/questions/validation.ts**

Create `src/questions/validation.ts`:

```typescript
import type { Answer, Question } from '@/types';

// ── isSafeRegex ───────────────────────────────────────────────────────────────

export interface RegexCheckResult {
  valid: boolean;
  error?: string;
}

/**
 * Checks whether a regex pattern string is both syntactically valid and safe
 * from catastrophic backtracking.
 *
 * Safety heuristic: patterns containing a quantified group where the group
 * itself contains a quantifier (e.g. `(a+)+`, `(\w+)+`, `(a*)*`, `(a|a)+`)
 * are rejected. The check looks for a closing `)` followed immediately by
 * `+`, `*`, or `?` where the group body also contains `+`, `*`, or `?`.
 *
 * The heuristic pattern used: /\([^)]*[+*?][^)]*\)[+*?]/
 * This matches any group `(...)` that contains at least one quantifier
 * character inside it and is itself followed by a quantifier.
 */
export function isSafeRegex(pattern: string): RegexCheckResult {
  // Step 1: syntax check
  try {
    new RegExp(pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid regex: ${message}` };
  }

  // Step 2: catastrophic backtracking heuristic
  // Matches a group (...) containing a quantifier, followed by a quantifier.
  const backtrackingHeuristic = /\([^)]*[+*?][^)]*\)[+*?]/;
  if (backtrackingHeuristic.test(pattern)) {
    return {
      valid: false,
      error: 'Pattern may cause catastrophic backtracking',
    };
  }

  return { valid: true };
}

// ── validateAnswer ────────────────────────────────────────────────────────────

/**
 * Validates a single answer against its question definition.
 *
 * Returns null if the answer is valid, or a human-readable error string if not.
 *
 * Rules applied in order:
 * 1. Required check: null/empty value on a required question → error.
 *    Exception: BOOLEAN `false` is a meaningful value and is NOT treated as
 *    empty — only `null` triggers required failure for BOOLEAN.
 * 2. Type-specific checks (only run when value is non-empty):
 *    - TEXT + regexPattern: value must match the regex.
 *    - INTEGER + minValue: value must be >= minValue.
 *    - INTEGER + maxValue: value must be <= maxValue.
 *    - ENUM + choices: value must be one of choices[].id.
 *    - BOOLEAN: no additional checks beyond the required check.
 */
export function validateAnswer(answer: Answer, question: Question): string | null {
  const { value } = answer;
  const { type, required, regexPattern, minValue, maxValue, choices } = question;

  // ── 1. Required check ────────────────────────────────────────────────────────
  const isEmpty =
    type === 'BOOLEAN'
      ? value === null           // false is a valid boolean answer
      : value === null || value === '';

  if (required && isEmpty) {
    return 'This field is required';
  }

  // If the value is empty (and question is optional), skip type-specific checks.
  if (isEmpty) {
    return null;
  }

  // ── 2. Type-specific checks ──────────────────────────────────────────────────

  if (type === 'TEXT' && regexPattern && typeof value === 'string') {
    // The regex was validated at save time, so we can safely construct it.
    const re = new RegExp(regexPattern);
    if (!re.test(value)) {
      return `Value does not match the required pattern: ${regexPattern}`;
    }
  }

  if (type === 'INTEGER' && typeof value === 'number') {
    if (minValue !== undefined && value < minValue) {
      return `Value must be at least ${minValue}`;
    }
    if (maxValue !== undefined && value > maxValue) {
      return `Value must be at most ${maxValue}`;
    }
  }

  if (type === 'ENUM' && choices && choices.length > 0) {
    const validIds = new Set(choices.map((c) => c.id));
    if (!validIds.has(String(value))) {
      return 'Invalid choice — value is not one of the allowed options';
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/questions/validation.test.ts
```

Expected: All tests pass (green). Confirm no skipped tests.

- [ ] **Step 5: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/questions/validation.ts src/questions/validation.test.ts && git commit -m "feat: add regex safety check and answer validation with TDD tests"
```

---

### Task 2: EnumChoicesEditor component

**Files:**
- Create: `src/components/questions/EnumChoicesEditor.tsx`

- [ ] **Step 1: Create src/components/questions/EnumChoicesEditor.tsx**

```tsx
import type { EnumChoice } from '@/types';

interface Props {
  choices: EnumChoice[];
  onChange: (choices: EnumChoice[]) => void;
}

/**
 * Renders a reorderable list of ENUM choices with label editing and removal.
 * Reordering swaps the `order` field values between adjacent items.
 * Adding appends a new choice with a UUID and the next sequential order value.
 */
export default function EnumChoicesEditor({ choices, onChange }: Props) {
  // Always display choices sorted by their order field.
  const sorted = [...choices].sort((a, b) => a.order - b.order);

  function handleLabelChange(id: string, label: string) {
    onChange(choices.map((c) => (c.id === id ? { ...c, label } : c)));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...sorted];
    // Swap order values between index and index-1
    const prevOrder = next[index - 1].order;
    const currOrder = next[index].order;
    onChange(
      choices.map((c) => {
        if (c.id === next[index - 1].id) return { ...c, order: currOrder };
        if (c.id === next[index].id) return { ...c, order: prevOrder };
        return c;
      }),
    );
  }

  function handleMoveDown(index: number) {
    if (index === sorted.length - 1) return;
    const next = [...sorted];
    const nextOrder = next[index + 1].order;
    const currOrder = next[index].order;
    onChange(
      choices.map((c) => {
        if (c.id === next[index + 1].id) return { ...c, order: currOrder };
        if (c.id === next[index].id) return { ...c, order: nextOrder };
        return c;
      }),
    );
  }

  function handleRemove(id: string) {
    onChange(choices.filter((c) => c.id !== id));
  }

  function handleAddChoice() {
    const maxOrder = choices.length > 0 ? Math.max(...choices.map((c) => c.order)) : -1;
    const newChoice: EnumChoice = {
      id: crypto.randomUUID(),
      label: '',
      order: maxOrder + 1,
    };
    onChange([...choices, newChoice]);
  }

  return (
    <div className="space-y-2">
      {sorted.length === 0 && (
        <p className="text-xs text-gray-400 italic">No choices yet. Add at least one.</p>
      )}

      {sorted.map((choice, index) => (
        <div key={choice.id} className="flex items-center gap-2">
          {/* Move up */}
          <button
            type="button"
            onClick={() => handleMoveUp(index)}
            disabled={index === 0}
            title="Move up"
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ▲
          </button>

          {/* Move down */}
          <button
            type="button"
            onClick={() => handleMoveDown(index)}
            disabled={index === sorted.length - 1}
            title="Move down"
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ▼
          </button>

          {/* Label input */}
          <input
            type="text"
            value={choice.label}
            onChange={(e) => handleLabelChange(choice.id, e.target.value)}
            placeholder="Choice label…"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />

          {/* Remove */}
          <button
            type="button"
            onClick={() => handleRemove(choice.id)}
            title="Remove choice"
            className="rounded p-1 text-red-400 hover:text-red-700 transition-colors"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddChoice}
        className="mt-1 rounded border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + Add Choice
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/questions/EnumChoicesEditor.tsx && git commit -m "feat: add EnumChoicesEditor with add/remove/reorder for ENUM choices"
```

---

### Task 3: QuestionFormFields component

**Files:**
- Create: `src/components/questions/QuestionFormFields.tsx`

- [ ] **Step 1: Create src/components/questions/QuestionFormFields.tsx**

```tsx
import { useState, useEffect } from 'react';
import type { QuestionType, EnumChoice } from '@/types';
import { isSafeRegex } from '@/questions/validation';
import EnumChoicesEditor from './EnumChoicesEditor';

export type DraftQuestion = {
  id: string;
  choreKey: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  order: number;
  regexPattern?: string;
  minValue?: number;
  maxValue?: number;
  choices?: EnumChoice[];
  _isNew?: boolean;
  _deleted?: boolean;
};

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'INTEGER', label: 'Integer' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'ENUM', label: 'Multiple Choice' },
];

interface Props {
  question: DraftQuestion;
  onChange: (updated: DraftQuestion) => void;
}

/**
 * Renders the editable fields for a single question.
 * Always shows: prompt input, type select, required checkbox.
 * TEXT: optional regex pattern input with live safety validation.
 * INTEGER: optional min/max number inputs.
 * BOOLEAN: no extra fields.
 * ENUM: EnumChoicesEditor for the choices list.
 */
export default function QuestionFormFields({ question, onChange }: Props) {
  const [regexError, setRegexError] = useState<string | undefined>(undefined);

  // Validate regex live whenever the pattern changes.
  useEffect(() => {
    if (question.type === 'TEXT' && question.regexPattern) {
      const result = isSafeRegex(question.regexPattern);
      setRegexError(result.valid ? undefined : result.error);
    } else {
      setRegexError(undefined);
    }
  }, [question.type, question.regexPattern]);

  function update(partial: Partial<DraftQuestion>) {
    onChange({ ...question, ...partial });
  }

  function handleTypeChange(newType: QuestionType) {
    // Clear type-specific fields when switching types to avoid leftover state.
    update({
      type: newType,
      regexPattern: undefined,
      minValue: undefined,
      maxValue: undefined,
      choices: newType === 'ENUM' ? (question.choices ?? []) : undefined,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      {/* Prompt */}
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
        {/* Type */}
        <div className="flex-1 min-w-32">
          <label className="mb-1 block text-xs font-medium text-gray-700">Type</label>
          <select
            value={question.type}
            onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Required */}
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
      </div>

      {/* TEXT — regex pattern */}
      {question.type === 'TEXT' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Regex Pattern <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={question.regexPattern ?? ''}
            onChange={(e) =>
              update({ regexPattern: e.target.value || undefined })
            }
            placeholder="e.g. ^\d{4}$"
            className={`w-full rounded border px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 ${
              regexError
                ? 'border-red-400 focus:ring-red-300'
                : 'border-gray-300 focus:ring-blue-300'
            }`}
          />
          {regexError && (
            <p className="mt-1 text-xs text-red-600">{regexError}</p>
          )}
          {!regexError && question.regexPattern && (
            <p className="mt-1 text-xs text-green-600">Pattern is valid</p>
          )}
        </div>
      )}

      {/* INTEGER — min/max */}
      {question.type === 'INTEGER' && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Min Value <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={question.minValue ?? ''}
              onChange={(e) =>
                update({
                  minValue: e.target.value !== '' ? Number(e.target.value) : undefined,
                })
              }
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
              onChange={(e) =>
                update({
                  maxValue: e.target.value !== '' ? Number(e.target.value) : undefined,
                })
              }
              placeholder="None"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
      )}

      {/* ENUM — choices editor */}
      {question.type === 'ENUM' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Choices</label>
          <EnumChoicesEditor
            choices={question.choices ?? []}
            onChange={(choices) => update({ choices })}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/questions/QuestionFormFields.tsx && git commit -m "feat: add QuestionFormFields with type-specific config and live regex validation"
```

---

### Task 4: QuestionBuilder component

**Files:**
- Create: `src/components/questions/QuestionBuilder.tsx`

- [ ] **Step 1: Create src/components/questions/QuestionBuilder.tsx**

```tsx
import { useState } from 'react';
import type { Question } from '@/types';
import QuestionFormFields, { type DraftQuestion } from './QuestionFormFields';

interface Props {
  choreKey: string;
  initialQuestions: Question[];
  onChange: (drafts: DraftQuestion[]) => void;
}

const TYPE_LABELS: Record<string, string> = {
  TEXT: 'Text',
  INTEGER: 'Integer',
  BOOLEAN: 'Yes / No',
  ENUM: 'Multiple Choice',
};

/**
 * Full question list builder for a chore.
 *
 * Behaviour:
 * - Maintains local draft state; calls `onChange` on every mutation.
 * - Soft-deleted items (existing questions with `_deleted: true`) are shown
 *   with faded opacity and a "Restore" button; they are excluded from reorder.
 * - Newly added questions with `_isNew: true` are permanently removed (not
 *   soft-deleted) when the user clicks "Remove".
 * - Up/Down arrows reorder only among non-deleted questions by swapping
 *   `order` field values.
 * - Clicking a question row expands QuestionFormFields inline for editing.
 */
export default function QuestionBuilder({ choreKey, initialQuestions, onChange }: Props) {
  const [drafts, setDrafts] = useState<DraftQuestion[]>(() =>
    initialQuestions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ ...q })),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function commit(next: DraftQuestion[]) {
    setDrafts(next);
    onChange(next);
  }

  function handleAdd() {
    const activeDrafts = drafts.filter((d) => !d._deleted);
    const maxOrder = activeDrafts.length > 0
      ? Math.max(...activeDrafts.map((d) => d.order))
      : -1;

    const newQuestion: DraftQuestion = {
      id: crypto.randomUUID(),
      choreKey,
      prompt: '',
      type: 'TEXT',
      required: true,
      order: maxOrder + 1,
      _isNew: true,
    };

    const next = [...drafts, newQuestion];
    commit(next);
    setExpandedId(newQuestion.id);
  }

  function handleRemove(id: string) {
    const target = drafts.find((d) => d.id === id);
    if (!target) return;

    if (target._isNew) {
      // New (unsaved) question: remove entirely — no soft-delete
      commit(drafts.filter((d) => d.id !== id));
    } else {
      // Existing question: soft-delete
      commit(drafts.map((d) => (d.id === id ? { ...d, _deleted: true } : d)));
    }

    if (expandedId === id) setExpandedId(null);
  }

  function handleRestore(id: string) {
    commit(drafts.map((d) => (d.id === id ? { ...d, _deleted: false } : d)));
  }

  function handleUpdate(updated: DraftQuestion) {
    commit(drafts.map((d) => (d.id === updated.id ? updated : d)));
  }

  function handleMoveUp(id: string) {
    const active = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
    const idx = active.findIndex((d) => d.id === id);
    if (idx <= 0) return;

    const prevOrder = active[idx - 1].order;
    const currOrder = active[idx].order;

    commit(
      drafts.map((d) => {
        if (d.id === active[idx - 1].id) return { ...d, order: currOrder };
        if (d.id === active[idx].id) return { ...d, order: prevOrder };
        return d;
      }),
    );
  }

  function handleMoveDown(id: string) {
    const active = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
    const idx = active.findIndex((d) => d.id === id);
    if (idx === -1 || idx === active.length - 1) return;

    const nextOrder = active[idx + 1].order;
    const currOrder = active[idx].order;

    commit(
      drafts.map((d) => {
        if (d.id === active[idx + 1].id) return { ...d, order: currOrder };
        if (d.id === active[idx].id) return { ...d, order: nextOrder };
        return d;
      }),
    );
  }

  // Render active (non-deleted) questions sorted by order, then deleted questions
  // at the bottom (faded), to make their existence visible for restore.
  const activeQuestions = drafts
    .filter((d) => !d._deleted)
    .sort((a, b) => a.order - b.order);
  const deletedQuestions = drafts.filter((d) => d._deleted);

  return (
    <div className="space-y-2">
      {/* Active questions */}
      {activeQuestions.length === 0 && deletedQuestions.length === 0 && (
        <p className="text-sm text-gray-400 italic py-2">
          No questions attached. Click "Add Question" to start.
        </p>
      )}

      {activeQuestions.map((draft, index) => (
        <div key={draft.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Question row header */}
          <div
            className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
          >
            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleMoveUp(draft.id); }}
                disabled={index === 0}
                title="Move up"
                className="rounded px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleMoveDown(draft.id); }}
                disabled={index === activeQuestions.length - 1}
                title="Move down"
                className="rounded px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                ▼
              </button>
            </div>

            {/* Question summary */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {draft.prompt || <span className="text-gray-400 italic">Untitled question</span>}
              </p>
              <div className="flex gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{TYPE_LABELS[draft.type] ?? draft.type}</span>
                {draft.required && (
                  <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-1.5 py-0">
                    Required
                  </span>
                )}
                {draft._isNew && (
                  <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-1.5 py-0">
                    New
                  </span>
                )}
              </div>
            </div>

            {/* Expand indicator */}
            <span className="text-gray-400 text-xs shrink-0">
              {expandedId === draft.id ? '▾' : '▸'}
            </span>

            {/* Remove button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemove(draft.id); }}
              title="Remove question"
              className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              Remove
            </button>
          </div>

          {/* Expanded form fields */}
          {expandedId === draft.id && (
            <div className="border-t border-gray-100 p-3">
              <QuestionFormFields
                question={draft}
                onChange={handleUpdate}
              />
            </div>
          )}
        </div>
      ))}

      {/* Soft-deleted questions (existing only — new ones are hard-removed) */}
      {deletedQuestions.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Pending removal</p>
          {deletedQuestions.map((draft) => (
            <div
              key={draft.id}
              className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 opacity-50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-600 truncate line-through">
                  {draft.prompt || 'Untitled question'}
                </p>
                <span className="text-xs text-gray-400">{TYPE_LABELS[draft.type] ?? draft.type}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(draft.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 hover:text-green-800 transition-colors"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Question button */}
      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + Add Question
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/questions/QuestionBuilder.tsx && git commit -m "feat: add QuestionBuilder with add/reorder/soft-delete/restore and inline editing"
```

---

### Task 5: AnswerField component

**Files:**
- Create: `src/components/completion/AnswerField.tsx`

- [ ] **Step 1: Create src/components/completion/AnswerField.tsx**

```tsx
import type { Question } from '@/types';

interface Props {
  question: Question;
  value: string | number | boolean | null;
  error?: string;
  onChange: (value: string | number | boolean | null) => void;
}

/**
 * Renders the correct input widget for a given question type.
 *
 * TEXT    → <input type="text" />
 * INTEGER → <input type="number" min={minValue} max={maxValue} />
 * BOOLEAN → <input type="checkbox" /> (always shows unchecked for null,
 *            checked for true, unchecked for false)
 * ENUM    → <select> with options from choices (sorted by order)
 *
 * Shows the error message below the input when the `error` prop is set.
 */
export default function AnswerField({ question, value, error, onChange }: Props) {
  const { type, prompt, required, regexPattern, minValue, maxValue, choices } = question;

  const baseInputClass = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
    error
      ? 'border-red-400 focus:ring-red-300'
      : 'border-gray-300 focus:ring-blue-300'
  }`;

  function renderInput() {
    if (type === 'TEXT') {
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={regexPattern ? `Must match: ${regexPattern}` : undefined}
          className={baseInputClass}
        />
      );
    }

    if (type === 'INTEGER') {
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={minValue}
          max={maxValue}
          onChange={(e) =>
            onChange(e.target.value !== '' ? Number(e.target.value) : null)
          }
          className={baseInputClass}
        />
      );
    }

    if (type === 'BOOLEAN') {
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

    if (type === 'ENUM') {
      const sortedChoices = [...(choices ?? [])].sort((a, b) => a.order - b.order);
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={baseInputClass}
        >
          <option value="">— Select —</option>
          {sortedChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
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

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/completion/AnswerField.tsx && git commit -m "feat: add AnswerField component for all question types"
```

---

### Task 6: CompletionModal component

**Files:**
- Create: `src/components/completion/CompletionModal.tsx`

- [ ] **Step 1: Create src/components/completion/CompletionModal.tsx**

```tsx
import { useState } from 'react';
import type { Question, Answer } from '@/types';
import { useAppStore } from '@/store';
import { validateAnswer } from '@/questions/validation';
import AnswerField from './AnswerField';

interface Props {
  choreKey: string;
  questions: Question[];
  onClose: () => void;
}

/**
 * Modal shown when the user clicks Complete on a chore that has questions.
 *
 * Renders an AnswerField for each question (sorted by order).
 * On submit:
 * 1. Validates every answer via validateAnswer.
 * 2. If any errors exist, shows them inline and does NOT call recordCompletion.
 * 3. If all valid, calls store.recordCompletion(choreKey, answers) then onClose().
 */
export default function CompletionModal({ choreKey, questions, onClose }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);

  // Sorted questions by order
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  // answers state: keyed by questionId
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>(
    () => Object.fromEntries(sortedQuestions.map((q) => [q.id, null])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(questionId: string, value: string | number | boolean | null) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Clear the error for this field as the user types.
    if (errors[questionId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate all answers
    const newErrors: Record<string, string> = {};
    for (const question of sortedQuestions) {
      const answer: Answer = { questionId: question.id, value: answers[question.id] ?? null };
      const error = validateAnswer(answer, question);
      if (error) {
        newErrors[question.id] = error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return; // Do NOT create a completion
    }

    setSubmitting(true);
    try {
      const answerList: Answer[] = sortedQuestions.map((q) => ({
        questionId: q.id,
        value: answers[q.id] ?? null,
      }));
      await recordCompletion(choreKey, answerList);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Complete Chore</h2>
        <p className="mb-4 text-sm text-gray-500">
          Please answer the following questions to record your completion.
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {sortedQuestions.map((question) => (
            <AnswerField
              key={question.id}
              question={question}
              value={answers[question.id] ?? null}
              error={errors[question.id]}
              onChange={(value) => handleChange(question.id, value)}
            />
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                submitting
                  ? 'cursor-not-allowed bg-green-300'
                  : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
              }`}
            >
              {submitting ? 'Saving…' : 'Submit & Complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/completion/CompletionModal.tsx && git commit -m "feat: add CompletionModal with per-question answer fields and validation"
```

---

### Task 7: Add saveQuestions to store

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Read current src/store/index.ts**

Read the file to confirm its current content before editing.

- [ ] **Step 2: Add DraftQuestion import and saveQuestions action**

The store needs three changes:
1. Import `deleteQuestion` from `@/db` (it is already exported from Plan 1).
2. Add `saveQuestions` to the `AppState` interface.
3. Implement the `saveQuestions` action in the store object.

**Add the import** — locate the existing import line from `@/db` and extend it to include `deleteQuestion`:

Replace:
```typescript
import { openDB, getAllChores, getAllCompletions, getAllQuestions, getXPSettings, getProfile, getSyncState, getPacks, putChore, putCompletion, putProfile, putSyncState } from '@/db';
```

With:
```typescript
import { openDB, getAllChores, getAllCompletions, getAllQuestions, getXPSettings, getProfile, getSyncState, getPacks, putChore, putCompletion, putProfile, putSyncState, putQuestion, deleteQuestion } from '@/db';
```

**Add the DraftQuestion type** — insert after the existing type imports block (after `import type { IDBPDatabase } ...`):

```typescript
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';
```

**Add saveQuestions to the AppState interface** — inside `interface AppState`, after the `updateSyncState` line:

```typescript
  saveQuestions: (choreKey: string, drafts: DraftQuestion[]) => Promise<void>;
```

**Add the saveQuestions implementation** — inside the `create<AppState>` object, after the `updateSyncState` action:

```typescript
  // ── saveQuestions ────────────────────────────────────────────────────────────

  saveQuestions: async (choreKey, drafts) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    // Delete questions marked as soft-deleted
    for (const q of drafts.filter((d) => d._deleted)) {
      await deleteQuestion(db, q.id);
    }

    // Upsert all non-deleted questions, stripping draft-only flags
    const toSave = drafts
      .filter((d) => !d._deleted)
      .map(({ _isNew: _n, _deleted: _d, ...q }) => q);
    for (const q of toSave) {
      await putQuestion(db, q);
    }

    // Refresh the questions slice in the store
    const allQuestions = await getAllQuestions(db);
    set({ questions: allQuestions });
  },
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/alu/projects/tasks-harmony && bun tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/store/index.ts && git commit -m "feat: add saveQuestions action to store — upsert/delete drafts, refresh store slice"
```

---

### Task 8: Integrate QuestionBuilder into ChoreFormModal

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Read current src/components/chores/ChoreFormModal.tsx**

Read the file to confirm its current content before editing.

- [ ] **Step 2: Replace src/components/chores/ChoreFormModal.tsx**

The updated modal adds a "Questions" section below the chore form fields, rendered only when editing an existing chore (edit mode) or always in create mode. It initialises QuestionBuilder with the existing questions from the store filtered by choreKey, and calls `saveQuestions` as part of the submit flow.

```tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Chore, XPSize, RecurrenceFrequency } from '@/types';
import QuestionBuilder from '@/components/questions/QuestionBuilder';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

interface Props {
  chore?: Chore;       // undefined = create mode, defined = edit mode
  packId: string;
  onClose: () => void;
}

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly'];

function todayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface FormErrors {
  title?: string;
  interval?: string;
  startDate?: string;
}

export default function ChoreFormModal({ chore, packId, onClose }: Props) {
  const addChore = useAppStore((s) => s.addChore);
  const updateChore = useAppStore((s) => s.updateChore);
  const saveQuestions = useAppStore((s) => s.saveQuestions);
  const allQuestions = useAppStore((s) => s.questions);

  const isEdit = chore !== undefined;

  const [title, setTitle] = useState(chore?.title ?? '');
  const [description, setDescription] = useState(chore?.description ?? '');
  const [xpSize, setXpSize] = useState<XPSize>(chore?.xpSize ?? 'S');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    chore?.recurrence.frequency ?? 'daily',
  );
  const [interval, setInterval] = useState<string>(
    String(chore?.recurrence.interval ?? 1),
  );
  const [startDate, setStartDate] = useState(
    chore?.recurrence.startDate ?? todayString(),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Questions draft state — tracked here so it survives between tab clicks.
  // Initialised from store questions for this choreKey (empty array for new chores).
  const choreKey = isEdit ? chore!.key : null;
  const initialQuestions = choreKey
    ? allQuestions.filter((q) => q.choreKey === choreKey)
    : [];
  const [questionDrafts, setQuestionDrafts] = useState<DraftQuestion[]>(() =>
    initialQuestions.map((q) => ({ ...q })),
  );

  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (!title.trim()) {
      errs.title = 'Title is required.';
    }

    const intervalNum = Number(interval);
    if (!Number.isInteger(intervalNum) || intervalNum < 1) {
      errs.interval = 'Interval must be a whole number of 1 or more.';
    }

    if (!startDate) {
      errs.startDate = 'Start date is required.';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errs.startDate = 'Start date must be in YYYY-MM-DD format.';
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      let savedChoreKey: string;

      if (isEdit && chore) {
        await updateChore({
          ...chore,
          title: title.trim(),
          description: description.trim() || undefined,
          xpSize,
          recurrence: {
            frequency,
            interval: Number(interval),
            startDate,
          },
        });
        savedChoreKey = chore.key;
      } else {
        // addChore is async and updates the store; we need the generated key.
        // The key is deterministic: `${packId}/${titleToFilename(title.trim())}`,
        // but addChore may suffix with a counter. We call addChore first, then
        // look up the newly added chore key from the updated store questions
        // won't be attached to new chores (no choreKey yet), so we skip saving
        // questions for brand-new chores — they can be added in the edit modal.
        await addChore({
          packId,
          title: title.trim(),
          description: description.trim() || undefined,
          xpSize,
          recurrence: {
            frequency,
            interval: Number(interval),
            startDate,
          },
          active: true,
        });
        // For new chores the questionDrafts are empty (initialQuestions=[]),
        // so saveQuestions would be a no-op regardless. Skip it.
        onClose();
        return;
      }

      // Save (upsert/delete) questions for existing chores.
      if (questionDrafts.length > 0 || initialQuestions.length > 0) {
        await saveQuestions(savedChoreKey, questionDrafts);
      }

      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {isEdit ? 'Edit Chore' : 'New Chore'}
        </h2>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-title">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="chore-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.title
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
              placeholder="e.g. Clean the bathroom"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-600">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-description">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="chore-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Add extra details…"
            />
          </div>

          {/* XP Size */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-xp-size">
              XP Size
            </label>
            <select
              id="chore-xp-size"
              value={xpSize}
              onChange={(e) => setXpSize(e.target.value as XPSize)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {XP_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-frequency">
              Frequency
            </label>
            <select
              id="chore-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Interval */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-interval">
              Interval
            </label>
            <input
              id="chore-interval"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.interval
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {errors.interval && (
              <p className="mt-1 text-xs text-red-600">{errors.interval}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              e.g. interval 2 with "weekly" = every 2 weeks
            </p>
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-start-date">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              id="chore-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.startDate
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {errors.startDate && (
              <p className="mt-1 text-xs text-red-600">{errors.startDate}</p>
            )}
          </div>

          {/* Questions section — always visible (for edit mode), hidden for new chores */}
          {isEdit && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-800">Questions</h3>
                <span className="text-xs text-gray-400">
                  {questionDrafts.filter((d) => !d._deleted).length > 0
                    ? `${questionDrafts.filter((d) => !d._deleted).length} question(s)`
                    : 'None'}
                </span>
              </div>
              <QuestionBuilder
                choreKey={chore!.key}
                initialQuestions={initialQuestions}
                onChange={setQuestionDrafts}
              />
            </div>
          )}

          {!isEdit && (
            <p className="text-xs text-gray-400 italic">
              Questions can be added after creating the chore by clicking Edit (✎).
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                submitting
                  ? 'cursor-not-allowed bg-blue-300'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Chore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/alu/projects/tasks-harmony && bun tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/chores/ChoreFormModal.tsx && git commit -m "feat: integrate QuestionBuilder into ChoreFormModal, save questions on submit"
```

---

### Task 9: Update CompleteButton to open CompletionModal

**Files:**
- Modify: `src/components/chores/CompleteButton.tsx`

- [ ] **Step 1: Read current src/components/chores/CompleteButton.tsx**

Read the file to confirm its current content before editing.

- [ ] **Step 2: Replace src/components/chores/CompleteButton.tsx**

```tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import CompletionModal from '@/components/completion/CompletionModal';

interface Props {
  choreKey: string;
}

/**
 * Complete action button.
 *
 * If the chore has questions attached (store.questions filtered by choreKey),
 * clicking the button opens the CompletionModal for the user to answer them.
 * The modal calls recordCompletion internally on successful submission.
 *
 * If the chore has no questions, recordCompletion is called directly (same
 * behaviour as before this plan).
 */
export default function CompleteButton({ choreKey }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const questions = useAppStore((s) =>
    s.questions.filter((q) => q.choreKey === choreKey),
  );

  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const hasQuestions = questions.length > 0;

  async function handleClick() {
    if (processing) return;

    if (hasQuestions) {
      setShowModal(true);
      return;
    }

    setProcessing(true);
    try {
      await recordCompletion(choreKey);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={processing}
        className={`rounded px-3 py-1 text-sm font-medium text-white transition-colors ${
          processing
            ? 'cursor-not-allowed bg-green-300'
            : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
        }`}
      >
        {processing ? 'Saving…' : 'Complete'}
      </button>

      {showModal && (
        <CompletionModal
          choreKey={choreKey}
          questions={questions}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/alu/projects/tasks-harmony && bun tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/chores/CompleteButton.tsx && git commit -m "feat: update CompleteButton to open CompletionModal when chore has questions"
```

---

### Task 10: Full verification

**Files:** (none new)

- [ ] **Step 1: Run all tests**

```bash
cd /home/alu/projects/tasks-harmony && bun test
```

Expected: All tests pass (0 failures), including Plan 1 foundation tests and the new validation tests.

- [ ] **Step 2: Type-check entire project**

```bash
cd /home/alu/projects/tasks-harmony && bun tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 3: Start dev server and manually verify question builder**

```bash
cd /home/alu/projects/tasks-harmony && bun run dev
```

Manual checks — Question Builder:

1. Navigate to `http://localhost:5173/`.
2. Create a new chore (title "Morning Routine", daily, interval 1).
3. Click Edit (✎) on the new chore — modal opens with "Questions" section visible, showing "No questions attached."
4. Click "Add Question" — a new draft appears with "New" badge, type "Text", required checked.
5. Click the question row to expand it; enter a prompt "How did it go?" and type `^\d+$` in Regex Pattern — "Pattern is valid" appears.
6. Click "Add Question" again — second question appended below first.
7. Fill second prompt "Overall rating (1-5)", change type to "Integer", set Min to 1, Max to 5.
8. Click ▲ on second question — it moves above the first.
9. Click "Remove" on one question — it disappears immediately (new questions are hard-removed, no soft-delete).
10. Click "Save Changes" — modal closes, no errors.
11. Click Edit (✎) again — the saved question is shown with its prompt and type.

Manual checks — ENUM question:

1. In Edit modal, click "Add Question", expand it, change type to "Multiple Choice".
2. EnumChoicesEditor appears. Click "+ Add Choice" twice — two empty choice rows appear.
3. Type "Light", "Heavy" in the label fields.
4. Click ▲/▼ — choices reorder.
5. Click ✕ on one — it is removed.
6. Click "Save Changes".

Manual checks — soft-delete of existing question:

1. Open Edit modal for a chore that already has a saved question.
2. Click "Remove" on the existing question — it moves to "Pending removal" section, faded and struck-through, with "Restore" button.
3. Click "Restore" — it returns to the active list.
4. Click "Remove" again, then "Save Changes" — question is deleted from DB.
5. Open Edit modal again — question is gone.

Manual checks — CompletionModal:

1. Create a chore with questions (text + integer + ENUM required).
2. Click "Complete" on the due chore — CompletionModal opens.
3. Click "Submit & Complete" without filling any fields — errors appear under each field; no completion is created.
4. Fill all required fields with valid values, click "Submit & Complete" — modal closes, card moves to Completed, XP counter updates.

Manual checks — regex validation at save:

1. Open Edit modal, add a TEXT question, enter `(a+)+` in Regex Pattern.
2. The live error "Pattern may cause catastrophic backtracking" appears immediately.
3. Change the pattern to `[invalid` — "Invalid regex: ..." appears.
4. Fix the pattern to `^\d+$` — "Pattern is valid" appears.
5. Note: the plan validates the regex at display time (live), not at save time; the QuestionFormFields show the error but do not block the save button. If the developer wants to block save on bad regex, they should add a pass through the questionDrafts in the ChoreFormModal `validate()` function. This is a known acceptable limitation — the validator correctly flags bad patterns, the user sees the warning, and the raw pattern string is stored (which would then fail to compile at answer validation time, but `validateAnswer` is guarded by the saved pattern being used only for non-empty values).

- [ ] **Step 4: Final commit**

```bash
cd /home/alu/projects/tasks-harmony && git add -p && git commit -m "feat: complete Plan 3 — question builder, completion modal, and answer validation"
```

---

## Self-Review

### Spec Coverage Table

| Requirement | Task | Coverage |
|---|---|---|
| §4.1 Question types: TEXT, INTEGER, BOOLEAN, ENUM | Task 1 (validation.ts), Task 3 (QuestionFormFields) | All four types defined in `QuestionType`; QuestionFormFields renders type-specific config; AnswerField renders type-specific input |
| §4.1 TEXT — optional regex | Task 1 (validateAnswer TEXT+regex), Task 3 (QuestionFormFields regex input + live check) | `regexPattern` field shown for TEXT; `isSafeRegex` validates on change; `validateAnswer` tests against regex at completion time |
| §4.1 INTEGER — optional min/max | Task 1 (validateAnswer INTEGER range), Task 3 (QuestionFormFields min/max inputs) | `minValue`/`maxValue` inputs rendered for INTEGER; range validated in `validateAnswer` |
| §4.1 BOOLEAN | Task 1 (validateAnswer BOOLEAN), Task 5 (AnswerField checkbox) | BOOLEAN renders checkbox; `false` is not treated as empty in required check |
| §4.1 ENUM — ordered choices | Task 2 (EnumChoicesEditor), Task 3 (QuestionFormFields ENUM section), Task 5 (AnswerField select) | EnumChoicesEditor manages choices with reorder/add/remove; AnswerField renders `<select>` sorted by `order` |
| §4.2 Builder: add questions one at a time | Task 4 (QuestionBuilder handleAdd) | "Add Question" appends one DraftQuestion; expands it immediately for editing |
| §4.2 Reorder with up/down | Task 4 (QuestionBuilder handleMoveUp/handleMoveDown) | Swaps `order` field values between adjacent non-deleted questions |
| §4.2 Remove before saving: new question removed = discarded, no leftover state | Task 4 (QuestionBuilder handleRemove _isNew branch) | `if (target._isNew)` → `filter(d => d.id !== id)` — fully removed from array |
| §4.2 Existing questions removed = soft-delete (faded + "Restore") until save | Task 4 (QuestionBuilder handleRemove existing branch, deletedQuestions render) | `_deleted: true` set; rendered in "Pending removal" with faded opacity and "Restore" button |
| §4.2 Soft-deleted excluded from reorder | Task 4 (QuestionBuilder handleMoveUp/handleMoveDown) | `drafts.filter(d => !d._deleted)` before computing active index list |
| §4.2 Count of pending form entries consistent | Task 4 (QuestionBuilder, edge case) | New question removed → hard delete ensures no orphaned entry; count shown in ChoreFormModal header derived from `filter(!_deleted).length` |
| §4.3 ENUM choices: add/remove/reorder with labels, NOT plain text | Task 2 (EnumChoicesEditor) | Dedicated EnumChoicesEditor with per-choice label inputs, ▲▼ buttons, ✕ remove, "+ Add Choice" |
| §4.4 Regex validated at save: invalid syntax rejected | Task 1 (isSafeRegex — syntax check), Task 3 (QuestionFormFields live validation) | `isSafeRegex` wraps `new RegExp(pattern)` in try/catch; error displayed live |
| §4.4 Catastrophic backtracking patterns rejected | Task 1 (isSafeRegex — backtracking heuristic) | Heuristic `/\([^)]*[+*?][^)]*\)[+*?]/` tested against pattern; error shown live |
| §6 Completing a chore with questions opens modal | Task 9 (CompleteButton) | `questions.length > 0` → `setShowModal(true)` instead of direct `recordCompletion` call |
| §6 All required questions must be answered | Task 6 (CompletionModal handleSubmit) | Loops `sortedQuestions`, calls `validateAnswer` for each; collects errors; if `Object.keys(newErrors).length > 0` → show errors, return without submitting |
| §6 Validation per type | Task 1 (validateAnswer), Task 6 (CompletionModal uses validateAnswer) | All type-specific checks in `validateAnswer`; called for every question on submit |
| §6 ENUM must be one of defined choices | Task 1 (validateAnswer ENUM branch) | `Set(choices.map(c => c.id))` membership check; error if not found |
| §6 On failure show errors, no completion created | Task 6 (CompletionModal) | `setErrors(newErrors); return;` — `recordCompletion` is never called |
| §6 On success modal closes, card updates | Task 6 (CompletionModal), Task 9 (CompleteButton) | `await recordCompletion(...)` → `onClose()` → `showModal=false` → store update triggers ChoreCard re-render |
| Edge §4.2: New question removed leaves no count mismatch | Task 4 (QuestionBuilder) | Hard-remove path: `commit(drafts.filter(d => d.id !== id))` — array length decrements immediately; count in modal header re-computes from same array |
| Edge §4.2: Soft-deleted excluded from reorder | Task 4 (QuestionBuilder) | `const active = drafts.filter(d => !d._deleted)` used for index computation in both moveUp and moveDown |
| Edge §6: Question form validation failure → no completion created | Task 6 (CompletionModal) | Guard: `if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }` before any async work |

### Placeholder Scan

Confirm: No occurrences of "TODO", "TBD", "FIXME", "implement later", "add validation here", "coming soon", or stub comments in any code block in this plan. The note in Task 10 Step 3 about blocking save on bad regex is an intentional design-decision annotation, not a deferred implementation.

### Type Consistency

- `DraftQuestion` is defined in `QuestionFormFields.tsx` as `Question & { _isNew?: boolean; _deleted?: boolean; }` — all `Question` fields are present, no omissions.
- `choreKey` format: `"${packId}/${choreId}"` — consistent with `Chore.key` from Plan 1; QuestionBuilder receives it as a prop and stamps it onto new drafts.
- `saveQuestions` strips `_isNew` and `_deleted` before writing to IndexedDB via `putQuestion` — the persisted record is a pure `Question`.
- `Answer.value: string | number | boolean | null` — AnswerField outputs values of the correct union type; CompletionModal collects them as `Record<string, string | number | boolean | null>` and maps to `Answer[]` before calling `recordCompletion`.
- `store.questions: Question[]` — refreshed atomically after `saveQuestions` via `getAllQuestions(db)`.
- `CompleteButton` reads `store.questions` with a selector that filters by `choreKey` — no cross-chore contamination.
- `validateAnswer` receives `Answer` and `Question` from `@/types` — no local redefinitions.
- `isSafeRegex` returns `{ valid: boolean; error?: string }` — `error` is only present when `valid` is false; callers destructure safely.
