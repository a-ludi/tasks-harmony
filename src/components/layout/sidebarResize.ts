export const SIDEBAR_MIN = 200;
export const SIDEBAR_DEFAULT = 240; // 60 * 4 = w-60

export function computeSidebarMax(viewportWidth: number): number {
  return Math.max(200, Math.floor(viewportWidth * 0.5));
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(computeSidebarMax(viewportWidth), width));
}

export function readStoredWidth(viewportWidth: number): number {
  const stored = localStorage.getItem('sidebarWidth');
  if (!stored) return SIDEBAR_DEFAULT;
  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed, viewportWidth) : SIDEBAR_DEFAULT;
}

export function writeStoredWidth(width: number, viewportWidth: number): void {
  localStorage.setItem('sidebarWidth', String(clampSidebarWidth(width, viewportWidth)));
}
