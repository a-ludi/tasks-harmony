export function getDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  return trimmed || null;
}
