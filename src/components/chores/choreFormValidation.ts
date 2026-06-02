import { isSafeRegex } from '@/questions/validation';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

/**
 * Validates regex patterns on all active (non-deleted) question drafts.
 * Returns an error message string if any draft has an invalid or unsafe regex,
 * or null if all patterns are valid.
 */
export function validateQuestionDrafts(drafts: DraftQuestion[]): string | null {
  for (const draft of drafts) {
    if (draft._deleted) continue;
    if (draft.type !== 'TEXT') continue;
    if (!draft.regexPattern) continue;

    const result = isSafeRegex(draft.regexPattern);
    if (!result.valid) {
      return result.error ?? 'A question has an invalid regex pattern';
    }
  }
  return null;
}
