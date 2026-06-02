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

  if (question.type === 'MULTIPLIER') {
    if (typeof value !== 'number' || value <= 0) {
      return 'Answer must be a positive number';
    }
  }

  return null;
}
