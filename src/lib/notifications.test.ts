import { describe, it, expect } from 'bun:test';
import { resolveNotificationsEnabled } from './notifications';
import type { Chore, Pack, UserProfile } from '@/types';

const baseProfile: UserProfile = {
  id: 'me', displayName: 'Test', email: 'test@example.com', activeXPSettingsId: 'default',
};
const basePack: Pack = {
  id: 'my-pack', manifest: { title: 'My Pack' }, isPersonal: true,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const baseChore: Chore = {
  key: 'my-pack/take-out-trash', choreId: 'take-out-trash', packId: 'my-pack',
  title: 'Take out trash', xpSize: 'S',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
  repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
};

describe('resolveNotificationsEnabled', () => {
  it('returns false when all defaults and global is absent (defaults to off)', () => {
    expect(resolveNotificationsEnabled(baseChore, basePack, baseProfile)).toBe(false);
  });

  it('returns true when global is on and no overrides', () => {
    const profile = { ...baseProfile, defaultNotifications: 'on' as const };
    expect(resolveNotificationsEnabled(baseChore, basePack, profile)).toBe(true);
  });

  it('pack off overrides global on', () => {
    const profile = { ...baseProfile, defaultNotifications: 'on' as const };
    const pack = { ...basePack, manifest: { ...basePack.manifest, defaultNotifications: 'off' as const } };
    expect(resolveNotificationsEnabled(baseChore, pack, profile)).toBe(false);
  });

  it('chore on overrides pack off', () => {
    const pack = { ...basePack, manifest: { ...basePack.manifest, defaultNotifications: 'off' as const } };
    const chore = { ...baseChore, notifications: { enabled: 'on' as const, trigger: 'at-due-time' as const } };
    expect(resolveNotificationsEnabled(chore, pack, baseProfile)).toBe(true);
  });

  it('chore default falls through to pack', () => {
    const pack = { ...basePack, manifest: { ...basePack.manifest, defaultNotifications: 'on' as const } };
    const chore = { ...baseChore, notifications: { enabled: 'default' as const, trigger: 'at-due-time' as const } };
    expect(resolveNotificationsEnabled(chore, pack, baseProfile)).toBe(true);
  });

  it('chore off overrides global on with no pack override', () => {
    const profile = { ...baseProfile, defaultNotifications: 'on' as const };
    const chore = { ...baseChore, notifications: { enabled: 'off' as const, trigger: 'at-due-time' as const } };
    expect(resolveNotificationsEnabled(chore, basePack, profile)).toBe(false);
  });
});
