import type { Answer, Question } from '@/types';
import safeRegex from 'safe-regex';

export interface RegexCheckResult {
  valid: boolean;
  error?: string;
}

function hasAmbiguousAlternation(pattern: string): boolean {
  let parenDepth = 0;
  let inCharClass = false;
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    // Handle backslash escapes
    if (char === '\\') {
      i += 2;
      continue;
    }

    // Track character class boundaries
    if (char === '[' && !inCharClass) {
      inCharClass = true;
      i++;
      continue;
    }
    if (char === ']' && inCharClass) {
      inCharClass = false;
      i++;
      continue;
    }

    // Skip processing inside character classes
    if (inCharClass) {
      i++;
      continue;
    }

    // Track parenthesis depth
    if (char === '(') {
      parenDepth++;
      const groupStart = i + 1;

      // Skip non-capturing/lookaround markers at the start of the group
      let bodyStart = groupStart;
      if (pattern[bodyStart] === '?') {
        // Skip ?:, ?=, ?!, ?<=, ?<!, or ?<name>
        bodyStart++;
        if (bodyStart < pattern.length && (pattern[bodyStart] === ':' || pattern[bodyStart] === '=' || pattern[bodyStart] === '!')) {
          bodyStart++;
        } else if (bodyStart < pattern.length && pattern[bodyStart] === '<') {
          // Skip ?< patterns (lookbehind or named group)
          bodyStart++;
          if (bodyStart < pattern.length && pattern[bodyStart] === '!') {
            bodyStart++;
          }
          // Skip until we find the closing > for named groups
          while (bodyStart < pattern.length && pattern[bodyStart] !== '>') {
            bodyStart++;
          }
          if (bodyStart < pattern.length) {
            bodyStart++; // skip the >
          }
        }
      }

      // Find the matching closing parenthesis
      let depth = 1;
      let j = i + 1;
      let foundClose = -1;
      let tempInCharClass = false;

      while (j < pattern.length && depth > 0) {
        if (pattern[j] === '\\') {
          j += 2;
          continue;
        }
        if (pattern[j] === '[' && !tempInCharClass) {
          tempInCharClass = true;
        } else if (pattern[j] === ']' && tempInCharClass) {
          tempInCharClass = false;
        } else if (pattern[j] === '(' && !tempInCharClass) {
          depth++;
        } else if (pattern[j] === ')' && !tempInCharClass) {
          depth--;
          if (depth === 0) {
            foundClose = j;
          }
        }
        j++;
      }

      if (foundClose !== -1) {
        const groupBody = pattern.slice(bodyStart, foundClose);

        // Check if the group is followed by an unbounded quantifier
        let nextIdx = foundClose + 1;
        let hasUnboundedQuantifier = false;

        if (nextIdx < pattern.length) {
          const next = pattern[nextIdx];
          if (next === '+' || next === '*') {
            hasUnboundedQuantifier = true;
          } else if (next === '{') {
            // Check for {n,} (unbounded) quantifier
            let closeIdx = nextIdx + 1;
            let hasComma = false;
            while (closeIdx < pattern.length && pattern[closeIdx] !== '}') {
              if (pattern[closeIdx] === ',') {
                hasComma = true;
              }
              closeIdx++;
            }
            if (closeIdx < pattern.length) {
              const quantifier = pattern.slice(nextIdx, closeIdx + 1);
              // Pattern is {n,} or {n,} (unbounded upper)
              const commaPos = quantifier.indexOf(',');
              if (commaPos !== -1 && commaPos === quantifier.length - 2) {
                // {n,} format - unbounded
                hasUnboundedQuantifier = true;
              }
            }
          }
        }

        // If unbounded quantifier found, check for duplicate branches
        if (hasUnboundedQuantifier) {
          const branches = splitOnTopLevelPipe(groupBody);
          if (branches.length > 1) {
            const uniqueBranches = new Set(branches);
            if (uniqueBranches.size < branches.length) {
              return true;
            }
          }
        }

        i = foundClose + 1;
        parenDepth--;
        continue;
      }

      i++;
    } else if (char === ')') {
      parenDepth--;
      i++;
    } else {
      i++;
    }
  }

  return false;
}

function splitOnTopLevelPipe(pattern: string): string[] {
  const branches: string[] = [];
  let current = '';
  let parenDepth = 0;
  let inCharClass = false;
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    // Handle backslash escapes
    if (char === '\\') {
      current += char;
      if (i + 1 < pattern.length) {
        current += pattern[i + 1];
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Track character class boundaries
    if (char === '[' && !inCharClass) {
      inCharClass = true;
      current += char;
      i++;
      continue;
    }
    if (char === ']' && inCharClass) {
      inCharClass = false;
      current += char;
      i++;
      continue;
    }

    // Track parenthesis depth
    if (char === '(' && !inCharClass) {
      parenDepth++;
      current += char;
      i++;
      continue;
    }
    if (char === ')' && !inCharClass) {
      parenDepth--;
      current += char;
      i++;
      continue;
    }

    // Split on pipe only at depth 0
    if (char === '|' && parenDepth === 0 && !inCharClass) {
      branches.push(current);
      current = '';
      i++;
      continue;
    }

    current += char;
    i++;
  }

  if (current.length > 0) {
    branches.push(current);
  }

  return branches;
}

export function isSafeRegex(pattern: string): RegexCheckResult {
  try {
    new RegExp(pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid regex: ${message}` };
  }

  if (hasAmbiguousAlternation(pattern)) {
    return {
      valid: false,
      error: 'Pattern may cause catastrophic backtracking',
    };
  }

  if (!safeRegex(pattern)) {
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
    const safetyCheck = isSafeRegex(question.regexPattern);
    if (!safetyCheck.valid) {
      return safetyCheck.error ?? 'Invalid regex pattern';
    }
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
