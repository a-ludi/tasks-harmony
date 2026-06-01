/**
 * Validates a completion timestamp and throws if it is more than 1 second in
 * the future (defensive guard — the UI always passes `new Date()`, but the
 * store layer should remain correct regardless of the caller).
 *
 * Returns the validated timestamp to ensure the guard controls the value used
 * in the caller.
 */
export function recordCompletionWithTimestamp(timestamp: Date): Date {
  const toleranceMs = 1000;
  if (timestamp.getTime() > Date.now() + toleranceMs) {
    throw new Error('Completion timestamp is in the future');
  }
  return timestamp;
}
