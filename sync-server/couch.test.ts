import { describe, it, expect, mock, beforeEach } from 'bun:test';

// We test the client by intercepting fetch. Set env vars before importing.
process.env.COUCHDB_URL = 'http://couchdb:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'password';

const { couchGet, couchPut, couchDel, couchFind, couchChanges, ensureIndex } = await import('./couch');

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

  it('throws on 500', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 })));
    await expect(couchGet('push-subscriptions', 'sub-abc')).rejects.toThrow('CouchDB GET failed: 500');
  });

  it('throws on 400', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 400 })));
    await expect(couchGet('push-subscriptions', 'sub-abc')).rejects.toThrow('CouchDB GET failed: 400');
  });
});

describe('couchDel error handling', () => {
  it('throws on non-2xx response', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        // First call: couchGet for existing doc
        return Promise.resolve(new Response(JSON.stringify({ _id: 'doc-1', _rev: 'rev-1' }), { status: 200 }));
      }
      // Second call: DELETE request fails
      return Promise.resolve(new Response(null, { status: 500 }));
    });
    await expect(couchDel('test-db', 'doc-1')).rejects.toThrow('CouchDB DELETE failed: 500');
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

  it('throws on 400', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 })));
    await expect(couchFind('push-schedules', {})).rejects.toThrow('CouchDB _find failed: 400');
  });

  it('throws on 500', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 })));
    await expect(couchFind('push-schedules', {})).rejects.toThrow('CouchDB _find failed: 500');
  });
});

describe('couchChanges error handling', () => {
  it('throws on non-2xx response', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 })));
    const controller = new AbortController();
    await expect(couchChanges('test-db', '0', controller.signal)).rejects.toThrow('CouchDB _changes failed: 500');
  });
});

describe('ensureIndex error handling', () => {
  it('throws on non-2xx response', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 })));
    await expect(ensureIndex('test-db', ['syncId'])).rejects.toThrow('CouchDB ensureIndex failed: 500');
  });
});
