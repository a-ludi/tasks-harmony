import { describe, it, expect, mock } from 'bun:test';

process.env.COUCHDB_URL = 'http://couch:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'pw';

const { couchGet, couchFind } = await import('./couch');

describe('couchGet', () => {
  it('returns null for 404', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 404 })));
    expect(await couchGet('db', 'id')).toBeNull();
  });
});

describe('couchFind', () => {
  it('returns docs', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ docs: [{ _id: 'x' }] }), { status: 200 })),
    );
    expect(await couchFind('db', {})).toEqual([{ _id: 'x' }]);
  });
});
