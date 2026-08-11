import { describe, it, expect, mock } from 'bun:test';

process.env.VAPID_PUBLIC_KEY = 'pubkey';
process.env.VAPID_PRIVATE_KEY = 'privkey';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';
process.env.COUCHDB_URL = 'http://couch:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'pw';

const mockSendNotification = mock(() => Promise.resolve({ statusCode: 201 }));
mock.module('web-push', () => ({
  default: { setVapidDetails: mock(() => {}), sendNotification: mockSendNotification },
}));

const mockCouchPut = mock(() => Promise.resolve());
const mockCouchDel = mock(() => Promise.resolve());
mock.module('./couch', () => ({ couchPut: mockCouchPut, couchDel: mockCouchDel }));

const { sendToSubscription, buildBackoff } = await import('./deliver');

const BLOCKED_UNTIL_RESET = '0001-01-01T00:00:00Z';

describe('buildBackoff', () => {
  it('increases interval exponentially', () => {
    const b1 = buildBackoff(1);
    const b2 = buildBackoff(2);
    expect(b2.failedAttempts).toBe(2);
    const diff2 = new Date(b2.blockedUntil).getTime() - Date.now();
    const diff1 = new Date(b1.blockedUntil).getTime() - Date.now();
    expect(diff2).toBeGreaterThan(diff1);
  });

  it('reset returns epoch sentinel', () => {
    const reset = buildBackoff(0);
    expect(reset.blockedUntil).toBe(BLOCKED_UNTIL_RESET);
    expect(reset.failedAttempts).toBe(0);
  });
});

describe('sendToSubscription', () => {
  it('returns ok on success', async () => {
    mockSendNotification.mockResolvedValueOnce({ statusCode: 201 });
    const result = await sendToSubscription(
      { endpoint: 'https://fcm.example.com', keys: { p256dh: 'k', auth: 'a' } },
      { title: 'Test', body: 'Body', choreKey: 'p/c' },
    );
    expect(result).toBe('ok');
  });

  it('returns gone on 410', async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 410 });
    const result = await sendToSubscription(
      { endpoint: 'https://fcm.example.com', keys: { p256dh: 'k', auth: 'a' } },
      { title: 'Test', body: 'Body', choreKey: 'p/c' },
    );
    expect(result).toBe('gone');
  });

  it('returns error on other failure', async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 500 });
    const result = await sendToSubscription(
      { endpoint: 'https://fcm.example.com', keys: { p256dh: 'k', auth: 'a' } },
      { title: 'Test', body: 'Body', choreKey: 'p/c' },
    );
    expect(result).toBe('error');
  });
});
