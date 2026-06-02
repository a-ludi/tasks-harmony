import { isSafeRegex } from '@/questions/validation';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

/**
 * Validates regex patterns on all active (non-deleted) question drafts.
 * Returns an error message string if any draft has an invalid or unsafe regex,
 * or null if all patterns are valid.
 */
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
