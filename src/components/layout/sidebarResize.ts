export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 400;
export const SIDEBAR_DEFAULT = 192; // 48 * 4 = w-48

export function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, width));
}

export function readStoredWidth(): number {
  const stored = localStorage.getItem('sidebarWidth');
  if (!stored) return SIDEBAR_DEFAULT;
  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT;
}

export function writeStoredWidth(width: number): void {
  localStorage.setItem('sidebarWidth', String(width));
}
