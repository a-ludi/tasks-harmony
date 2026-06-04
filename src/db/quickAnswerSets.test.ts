import 'fake-indexeddb/auto';
import { describe, it, expect } from 'bun:test';
import { openDB } from './index';
import type { QuickAnswerSet } from '@/types';

describe('quickAnswerSets store (DB v2)', () => {
  it('can put and retrieve a QuickAnswerSet', async () => {
    const db = await openDB(`test-qas-${crypto.randomUUID()}`);
    const qas: QuickAnswerSet = {
      id: 'qas-1', choreKey: 'pack/chore', label: 'Default',
      answers: [{ questionId: 'q-1', value: 'yes' }],
    };
    await db.put('quickAnswerSets', qas);
    const result = await db.get('quickAnswerSets', 'qas-1');
    expect(result?.label).toBe('Default');
    db.close();
  });

  it('can query by choreKey via by-chore index', async () => {
    const db = await openDB(`test-qas-idx-${crypto.randomUUID()}`);
    const qas: QuickAnswerSet = {
      id: 'qas-2', choreKey: 'pack/chore-x', label: 'Fast',
      answers: [],
    };
    await db.put('quickAnswerSets', qas);
    const results = await db.getAllFromIndex('quickAnswerSets', 'by-chore', 'pack/chore-x');
    expect(results).toHaveLength(1);
    db.close();
  });
});
