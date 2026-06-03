# Bugfix: ENUM answers display as UUIDs in completions history

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan.

**Goal:** ENUM answers in `CompletionsPage` currently show the stored choice UUID. They must show the human-readable label instead (spec §8).

**Root cause:** `getAnswerValue()` at `CompletionsPage.tsx:28–32` calls `String(ans.value)` for all question types. ENUM answers store the `choice.id` (a UUID); the label lookup is missing.

**Fix:** Extend `getAnswerValue` to accept the full `Question` object. When the question type is `ENUM`, find the matching choice by ID and return its label; fall back to the raw value if the choice is not found.

---

### Task 1: Fix ENUM label resolution in CompletionsPage

**Files:**
- Modify: `src/components/completion/CompletionsPage.tsx`

- [ ] **Step 1: Write a failing test**

Create `src/components/completion/CompletionsPage.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import type { EnumQuestion, Answer, EnumChoice } from '@/types';

function resolveAnswerDisplay(
  answers: Answer[],
  question: EnumQuestion,
): string {
  const ans = answers.find((a) => a.questionId === question.id);
  if (!ans || ans.value === null || ans.value === '') return '';
  if (question.type === 'ENUM') {
    const choice = (question.choices ?? []).find((c) => c.id === ans.value);
    return choice?.label ?? String(ans.value);
  }
  return String(ans.value);
}

const choice: EnumChoice = { id: 'uuid-1', label: 'High', order: 0 };
const q: EnumQuestion = {
  id: 'q-1',
  choreKey: 'personal/test',
  prompt: 'Effort?',
  type: 'ENUM',
  required: true,
  order: 0,
  choices: [choice],
};

describe('ENUM answer display in CompletionsPage', () => {
  it('shows label when the stored UUID matches a choice', () => {
    const answers: Answer[] = [{ questionId: 'q-1', value: 'uuid-1' }];
    expect(resolveAnswerDisplay(answers, q)).toBe('High');
  });

  it('falls back to raw value when UUID has no matching choice', () => {
    const answers: Answer[] = [{ questionId: 'q-1', value: 'unknown-uuid' }];
    expect(resolveAnswerDisplay(answers, q)).toBe('unknown-uuid');
  });

  it('returns empty string when answer is absent', () => {
    expect(resolveAnswerDisplay([], q)).toBe('');
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
bun test --isolate src/components/completion/CompletionsPage.test.ts
```

Expected: FAIL — `resolveAnswerDisplay` is not yet in the component

- [ ] **Step 3: Update CompletionsPage.tsx**

Replace `getAnswerValue` and its call site:

```tsx
import type { Question, Answer } from '@/types';

function getAnswerDisplay(answers: Answer[], question: Question): string {
  const ans = answers.find((a) => a.questionId === question.id);
  if (!ans || ans.value === null || ans.value === '') return '';
  if (question.type === 'ENUM') {
    const choice = (question.choices ?? []).find((c) => c.id === ans.value);
    return choice?.label ?? String(ans.value);
  }
  return String(ans.value);
}
```

Update the call site from:
```tsx
{getAnswerValue(c.answers, q.id)}
```
to:
```tsx
{getAnswerDisplay(c.answers, q)}
```

Remove the old `getAnswerValue` function.

- [ ] **Step 4: Run test — expect pass**

```bash
bun test --isolate src/components/completion/CompletionsPage.test.ts
```

Expected: all 3 tests pass

- [ ] **Step 5: Typecheck + full suite**

```bash
bun run typecheck && bun test --isolate src/
```

Expected: exit 0, all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/completion/CompletionsPage.tsx src/components/completion/CompletionsPage.test.ts
git commit -m "fix: resolve ENUM choice label in completions history instead of displaying UUID"
```
