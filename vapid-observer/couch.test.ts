import { describe, it, expect, mock } from 'bun:test';

process.env.COUCHDB_URL = 'http://couch:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'pw';

const { ensureDb, couchGet, couchFind } = await import('./couch');

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

describe('ensureDb', () => {
  it('accepts 201 (created)', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 201 })));
    await ensureDb('test-db');
  });

  it('accepts 412 (already exists)', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 412 })));
    await ensureDb('test-db');
  });

  it('throws on 500', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 })));
    await expect(ensureDb('test-db')).rejects.toThrow('CouchDB ensureDb failed: 500');
  });
});
