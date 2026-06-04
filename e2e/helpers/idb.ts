import type { Page } from '@playwright/test';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function seedDatabase(
  page: Page,
  data: Record<string, unknown[]>,
): Promise<void> {
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      // No version — always opens at whatever version the app set up via page.goto()
      const req = indexedDB.open('tasks-harmony');
      req.onsuccess = () => {
        const db = req.result;
        const storeNames = Object.keys(data);
        if (storeNames.length === 0) { resolve(); return; }
        const tx = (db as IDBDatabase).transaction(storeNames, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject((tx as IDBTransaction).error);
        for (const [name, records] of Object.entries(data)) {
          const store = tx.objectStore(name);
          for (const record of records as object[]) {
            store.put(record);
          }
        }
      };
      req.onerror = () => reject(req.error);
    });
  }, data as Record<string, object[]>);
}

export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector('nav', { state: 'visible', timeout: 15_000 });
}

export async function seedAndReload(
  page: Page,
  data: Record<string, unknown[]>,
): Promise<void> {
  await seedDatabase(page, data);
  await page.reload();
  await waitForApp(page);
}

export function makeChore(overrides: Record<string, unknown>): Record<string, unknown> {
  const merged = {
    choreId: 'default-chore',
    packId: 'personal',
    title: 'Untitled',
    xpSize: 'S',
    recurrence: { frequency: 'daily', interval: 1, startDate: today(), windowStartTime: '00:00' },
    repeatable: false,
    active: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  return {
    ...merged,
    key: overrides.key ?? `${merged.packId}/${merged.choreId}`,
  };
}

export function makeCompletion(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    xpEarned: 5,
    streak: 1,
    answers: [],
    ...overrides,
  };
}
