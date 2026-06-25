let dirty = false;
let listener: (() => void) | null = null;

export function markDirty(): void {
  dirty = true;
  listener?.();
}

export function isDirty(): boolean {
  return dirty;
}

export function clearDirty(): void {
  dirty = false;
}

export function setDirtyListener(fn: (() => void) | null): void {
  listener = fn;
}
