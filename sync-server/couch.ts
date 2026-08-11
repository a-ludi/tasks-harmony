const COUCHDB_URL = process.env.COUCHDB_URL!;
const COUCHDB_USER = process.env.COUCHDB_USER!;
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD!;

function authHeader(): string {
  return `Basic ${Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASSWORD}`).toString('base64')}`;
}

function couchHeaders() {
  return { 'Content-Type': 'application/json', Authorization: authHeader() };
}

export async function ensureDb(db: string): Promise<void> {
  await fetch(`${COUCHDB_URL}/${db}`, { method: 'PUT', headers: couchHeaders() });
  // 201 = created, 412 = already exists — both OK
}

export async function ensureIndex(db: string, fields: string[]): Promise<void> {
  await fetch(`${COUCHDB_URL}/${db}/_index`, {
    method: 'POST',
    headers: couchHeaders(),
    body: JSON.stringify({ index: { fields } }),
  });
}

export async function couchGet<T>(db: string, id: string): Promise<T | null> {
  const res = await fetch(`${COUCHDB_URL}/${db}/${encodeURIComponent(id)}`, {
    headers: couchHeaders(),
  });
  if (res.status === 404) return null;
  return res.json() as Promise<T>;
}

export async function couchPut(
  db: string,
  id: string,
  doc: Record<string, unknown>,
): Promise<void> {
  const existing = await couchGet<{ _rev: string }>(db, id);
  const body = existing ? { ...doc, _rev: existing._rev } : doc;
  const res = await fetch(`${COUCHDB_URL}/${db}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: couchHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CouchDB PUT failed: ${res.status}`);
}

export async function couchDel(db: string, id: string): Promise<void> {
  const existing = await couchGet<{ _rev: string }>(db, id);
  if (!existing) return;
  await fetch(
    `${COUCHDB_URL}/${db}/${encodeURIComponent(id)}?rev=${existing._rev}`,
    { method: 'DELETE', headers: couchHeaders() },
  );
}

export async function couchFind<T>(
  db: string,
  selector: Record<string, unknown>,
): Promise<T[]> {
  const res = await fetch(`${COUCHDB_URL}/${db}/_find`, {
    method: 'POST',
    headers: couchHeaders(),
    body: JSON.stringify({ selector }),
  });
  const { docs } = await res.json() as { docs: T[] };
  return docs;
}

export async function couchChanges(
  db: string,
  since: string,
  signal: AbortSignal,
): Promise<{ results: Array<{ id: string; seq: string }>, last_seq: string }> {
  const url = `${COUCHDB_URL}/${db}/_changes?feed=longpoll&since=${since}&timeout=60000`;
  const res = await fetch(url, { headers: couchHeaders(), signal });
  return res.json() as Promise<{ results: Array<{ id: string; seq: string }>, last_seq: string }>;
}
