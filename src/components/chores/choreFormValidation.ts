import { isSafeRegex } from '@/questions/validation';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

/**
 * Validates all active (non-deleted) question drafts:
 * - Enforces at most one MULTIPLIER question per chore.
 * - Validates that xpPerUnit > 0 for MULTIPLIER questions.
 * - Validates regex patterns on TEXT questions.
 * Returns an error message string if any rule is violated, or null if all drafts are valid.
 */
export function validateQuestionDrafts(drafts: DraftQuestion[]): string | null {
  const active = drafts.filter((d) => !d._deleted);

  const multipliers = active.filter((d) => d.type === 'MULTIPLIER');
  if (multipliers.length > 1) {
    return 'Only one score multiplier question is allowed per chore';
  }

  for (const draft of active) {
    if (draft.type === 'MULTIPLIER') {
      if (!Number.isFinite(draft.xpPerUnit) || draft.xpPerUnit <= 0) {
        return 'Repetition factor must be a whole number of 1 or more';
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
