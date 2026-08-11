import { describe, it, expect } from 'bun:test';
import { PushSubscriptionBody, DeleteSubscriptionBody, PushScheduleBody } from './push';

describe('PushSubscriptionBody', () => {
  it('accepts valid subscription', () => {
    const result = PushSubscriptionBody.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'somekey', auth: 'someauth' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-URL endpoint', () => {
    const result = PushSubscriptionBody.safeParse({
      endpoint: 'not-a-url',
      keys: { p256dh: 'k', auth: 'a' },
    });
    expect(result.success).toBe(false);
  });
});

describe('PushScheduleBody', () => {
  it('accepts valid daily schedule', () => {
    const result = PushScheduleBody.safeParse({
      title: 'Take out trash',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'at-due-time',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown frequency', () => {
    const result = PushScheduleBody.safeParse({
      title: 'X',
      recurrence: { frequency: 'hourly', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'at-due-time',
    });
    expect(result.success).toBe(false);
  });

  it('rejects interval less than 1', () => {
    const result = PushScheduleBody.safeParse({
      title: 'X',
      recurrence: { frequency: 'daily', interval: 0, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'at-due-time',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown trigger', () => {
    const result = PushScheduleBody.safeParse({
      title: 'X',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'on-overdue',
    });
    expect(result.success).toBe(false);
  });
});
