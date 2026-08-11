import type { Chore, Pack, UserProfile } from '@/types';

export function resolveNotificationsEnabled(
  chore: Chore,
  pack: Pack,
  profile: UserProfile,
): boolean {
  const choreLevel = chore.notifications?.enabled ?? 'default';
  if (choreLevel !== 'default') return choreLevel === 'on';
  const packLevel = pack.manifest.defaultNotifications ?? 'default';
  if (packLevel !== 'default') return packLevel === 'on';
  return (profile.defaultNotifications ?? 'off') === 'on';
}
