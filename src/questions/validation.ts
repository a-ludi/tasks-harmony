import type { Answer, Question } from '@/types';

export interface RegexCheckResult {
  valid: boolean;
  error?: string;
}

export function isSafeRegex(pattern: string): RegexCheckResult {
  try {
    new RegExp(pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid regex: ${message}` };
  }

  // Detect nested quantifiers like (a+)+, (a*)*, (a|a)+
  const backtrackingHeuristic = /\([^)]*(?:[+*?]|[^)]*\|[^)]*)[^)]*\)[+*?]/;
  if (backtrackingHeuristic.test(pattern)) {
    return {
      valid: false,
      error: 'Pattern may cause catastrophic backtracking',
    };
  }

  return { valid: true };
}

export function validateAnswer(answer: Answer, question: Question): string | null {
  const { value } = answer;
  const { type, required, regexPattern, minValue, maxValue, choices } = question;

  const isEmpty =
    type === 'BOOLEAN'
      ? value === null
      : value === null || value === '';

  if (required && isEmpty) {
    return 'This field is required';
  }

  if (isEmpty) {
    return null;
  }

  if (type === 'TEXT' && regexPattern && typeof value === 'string') {
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
