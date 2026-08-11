import { describe, it, expect, mock, beforeEach } from 'bun:test';

// We test the client by intercepting fetch. Set env vars before importing.
process.env.COUCHDB_URL = 'http://couchdb:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'password';

const { couchGet, couchPut, couchDel, couchFind } = await import('./couch');

describe('couchGet', () => {
  it('returns null for 404', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 404 })));
    const result = await couchGet('push-subscriptions', 'sub-abc');
    expect(result).toBeNull();
  });

  it('returns parsed doc for 200', async () => {
    const doc = { _id: 'sub-abc', syncId: 'xyz' };
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(doc), { status: 200 })));
    const result = await couchGet('push-subscriptions', 'sub-abc');
    expect(result).toEqual(doc);
  });
});

describe('couchFind', () => {
  it('returns docs array', async () => {
    const docs = [{ _id: 'a' }, { _id: 'b' }];
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ docs }), { status: 200 })),
    );
    const result = await couchFind('push-schedules', { syncId: 'xyz' });
    expect(result).toEqual(docs);
  });
});
